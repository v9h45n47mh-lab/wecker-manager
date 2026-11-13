"""Test adapters for the pinned, separately installed public Music Manager."""
import importlib.util
import sys
import types
import os
from pathlib import Path
from inspect import signature
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
ROOT=Path(__file__).parents[1]
MUSIC_ROOT=Path(os.environ.get('MUSIC_MANAGER_SOURCE',str(ROOT/'.test-deps/music-manager')))
if not MUSIC_ROOT.exists(): MUSIC_ROOT=ROOT.parent/'music-manager'
PATH=MUSIC_ROOT/'custom_components/music_manager/access.py'
if not PATH.is_file(): raise RuntimeError('Pinned Music Manager test source missing; see .github/workflows/release.yml')


def account(user='ha-a', ma='ma-a', provider='apple_music--a'):
    return {'ha_user_id': user, 'ma_user_id': ma, 'provider_id': provider}

def mass_client():
    async def album_tracks(item_id, provider_instance_id_or_domain, in_library_only=False, *, limit=None, offset=None, user=None): pass
    async def playlist_tracks(item_id, provider_instance_id_or_domain, force_refresh=False, *, strict_provider_instance=False, limit=None, offset=None, user=None): pass
    albums, playlists = AsyncMock(), AsyncMock()
    albums.__signature__, playlists.__signature__ = signature(album_tracks), signature(playlist_tracks)
    return NS(server_info=NS(schema_version=101), auth=NS(get_user=AsyncMock(return_value=NS(enabled=True, role='user', provider_filter=['apple_music--a']))),
              providers=[NS(instance_id='apple_music--a', domain='apple_music', available=True),
                         NS(instance_id='apple_music--b', domain='apple_music', available=True)],
              music=NS(search=AsyncMock(), get_library_tracks=AsyncMock(),
                       get_library_albums=AsyncMock(), get_library_playlists=AsyncMock(), get_album_tracks=albums, get_playlist_tracks=playlists))

def load_gateway():
    def module(name):
        obj = types.ModuleType(name)
        sys.modules[name] = obj
        return obj
    parent = module('custom_components'); parent.__path__=[]
    for name in ('homeassistant', 'homeassistant.auth', 'homeassistant.auth.permissions',
                 'homeassistant.components', 'homeassistant.components.music_assistant', 'homeassistant.helpers'):
        module(name)
    constants = module('homeassistant.auth.permissions.const')
    constants.POLICY_READ, constants.POLICY_CONTROL = 'read', 'control'
    ws = module('homeassistant.components.websocket_api')
    def command(schema):
        def decorate(fn):
            fn.command_schema = schema
            return fn
        return decorate
    ws.websocket_command, ws.async_response = command, lambda fn: fn
    helpers = module('homeassistant.components.music_assistant.helpers')
    helpers.get_music_assistant_client = lambda hass, entry_id: hass.mass
    registry = module('homeassistant.helpers.entity_registry')
    registry.async_get = lambda hass: hass.registry
    validator = module('probatio')
    validator.Required = validator.Optional = lambda key, **kwargs: key
    validator.In = validator.Length = validator.Range = lambda *args, **kwargs: None
    validator.All = lambda *args: None
    sys.modules['voluptuous'] = validator
    folder = PATH.parent
    spec = importlib.util.spec_from_file_location('custom_components.music_manager', folder / '__init__.py', submodule_search_locations=[str(folder)])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules['custom_components.music_manager'] = pkg
    spec.loader.exec_module(pkg)
    return pkg

class GatewayTests:
    def setup_gateway(self):
            mass = mass_client()
            class Players(dict):
                pass
            mass.players = Players({'RINCON_AABBCCDDEEFF01400': NS(available=True)})
            mass.players.player_command_next_track = AsyncMock()
            mass.player_queues = NS(play_media=AsyncMock(), play_index=AsyncMock(), set_repeat=AsyncMock(), get=lambda key: None)
            entry = NS(data={'music_assistant_entry': 'mass-entry'}, options={'accounts': [account()]})
            entities = {
                'media_player.sonos': NS(entity_id='media_player.sonos', platform='sonos', unique_id='RINCON_AABBCCDDEEFF01400', disabled_by=None),
                'media_player.mass': NS(entity_id='media_player.mass', platform='music_assistant', config_entry_id='mass-entry', unique_id='RINCON_AABBCCDDEEFF01400', disabled_by=None)}
            hass = NS(data={'music_manager': {'entry': entry}}, mass=mass, registry=NS(async_get=entities.get, entities=entities))
            permission = NS(allowed=True)
            connection = NS(user=NS(id='ha-a', permissions=NS(check_entity=lambda entity_id, policy: permission.allowed)),
                            result=None, error=None)
            connection.send_result = lambda msg_id, result: setattr(connection, 'result', result)
            connection.send_error = lambda msg_id, code, message: setattr(connection, 'error', (code, message))
            msg = dict(id=7, action='play', entity_id='media_player.mass', source_entity='media_player.sonos',
                       uri='apple_music--a://track/42', query='', media_type='playlist', offset=0)
            return hass, connection, msg, entities, permission
