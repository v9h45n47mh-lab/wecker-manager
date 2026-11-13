"""Exercise resource upgrades against the public HA collection interface."""
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace as NS
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, Mock, patch

ROOT = Path(__file__).parents[1]


class Resources:
    def __init__(self, items):
        self.data = items
        self.async_get_info = AsyncMock()

    def async_items(self):
        return list(self.data)

    async def async_update_item(self, item_id, changes):
        item = next(item for item in self.data if item['id'] == item_id)
        item.update(url=changes['url'], type=changes['res_type'])

    async def async_delete_item(self, item_id):
        self.data = [item for item in self.data if item['id'] != item_id]

    async def async_create_item(self, changes):
        self.data.append(dict(id='new', url=changes['url'], type=changes['res_type']))


class FrontendUpgradeTests(IsolatedAsyncioTestCase):
    def setUp(self):
        names = ['homeassistant', 'homeassistant.components',
                 'homeassistant.components.frontend', 'homeassistant.components.http',
                 'homeassistant.components.lovelace', 'homeassistant.components.lovelace.resources',
                 '_wake_frontend_test', '_wake_frontend_test.const']
        modules = {name: ModuleType(name) for name in names}
        modules['_wake_frontend_test'].__path__ = []
        self.frontend = modules['homeassistant.components.frontend']
        self.frontend.add_extra_js_url = Mock()
        self.frontend.remove_extra_js_url = Mock()
        modules['homeassistant.components.http'].StaticPathConfig = lambda url, path, cache_headers: NS(url_path=url, path=path)
        modules['homeassistant.components.lovelace'].LOVELACE_DATA = 'lovelace'
        modules['homeassistant.components.lovelace.resources'].ResourceStorageCollection = Resources
        constants = modules['_wake_frontend_test.const']
        constants.DOMAIN = 'wecker_manager'
        constants.VERSION = json.loads((ROOT/'package.json').read_text())['version']
        self.enterContext(patch.dict(sys.modules, modules))
        spec = importlib.util.spec_from_file_location('_wake_frontend_test.frontend', ROOT/'custom_components/wecker_manager/frontend.py')
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def hass(self, resources):
        return NS(data={'lovelace': NS(resources=resources)}, http=NS(async_register_static_paths=AsyncMock()))

    async def test_upgrade_replaces_old_editor_and_deduplicates_only_own_resources(self):
        unrelated = {'id': 'other', 'url': '/local/other-card.js', 'type': 'module'}
        resources = Resources([
            {'id': 'old', 'url': '/wecker_manager/frontend/wecker-manager-card.js?v=1.0.0', 'type': 'module'},
            {'id': 'versioned', 'url': '/wecker_manager/frontend/1.1.0/wecker-manager-card.js', 'type': 'module'},
            {'id': 'hacs', 'url': '/hacsfiles/wecker-manager/wecker-manager-card.js', 'type': 'module'},
            unrelated,
        ])
        hass = self.hass(resources)
        await self.module.async_register_frontend(hass)
        self.assertEqual(len(resources.data), 2)
        self.assertEqual(resources.data[0]['url'], self.module.CARD_URL)
        self.assertIn(unrelated, resources.data)
        self.assertIn('/'+self.module.VERSION+'/', self.module.CARD_URL)
        paths = hass.http.async_register_static_paths.call_args.args[0]
        self.assertEqual(paths[0].url_path, self.module.RELEASE_PATH)
        self.assertTrue((Path(paths[0].path)/'wecker-manager-card.js').is_file())
        await self.module.async_register_frontend(hass)
        self.assertEqual(hass.http.async_register_static_paths.call_count, 1)
        self.assertEqual(len(resources.data), 2)
        self.frontend.add_extra_js_url.assert_called_with(hass, self.module.CARD_URL)

    async def test_fresh_install_registers_current_release(self):
        resources = Resources([])
        await self.module.async_register_frontend(self.hass(resources))
        self.assertEqual(resources.data, [{'id': 'new', 'url': self.module.CARD_URL, 'type': 'module'}])

    async def test_yaml_upgrade_deduplicates_in_memory_and_unload_restores_original(self):
        original = [
            {'url': '/wecker_manager/frontend/wecker-manager-card.js?v=1.0.0', 'type': 'module'},
            {'url': '/local/wecker-manager/wecker-manager-card.js', 'type': 'module'},
            {'url': '/local/unrelated.js', 'type': 'module'},
        ]
        class YamlResources:
            data = list(original)
            def async_items(self):
                return list(self.data)
        resources = YamlResources()
        hass = self.hass(resources)
        await self.module.async_register_frontend(hass)
        self.assertEqual(len(resources.data), 2)
        self.assertEqual(resources.data[0]['url'], self.module.CARD_URL)
        await self.module.async_unregister_frontend(hass)
        self.assertEqual(resources.data, original)

    def test_external_and_similarly_named_cards_are_not_migrated(self):
        for url in ['https://example.org/wecker_manager/frontend/wecker-manager-card.js',
                    '//example.org/wecker_manager/frontend/wecker-manager-card.js',
                    '/local/other/wecker-manager-card.js',
                    '/wecker_manager/frontend/not-a-release/wecker-manager-card.js']:
            with self.subTest(url=url):
                self.assertIsNone(self.module.resource_path(url))
