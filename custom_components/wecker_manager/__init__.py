"""Independent universal alarm integration, using the installed Music Manager."""
from homeassistant.components import websocket_api
from homeassistant.exceptions import ConfigEntryNotReady
from .const import DOMAIN, MUSIC_DOMAIN

async def async_setup(hass, config):
    from .wake_cards import websocket_wake_card
    websocket_api.async_register_command(hass, websocket_wake_card)
    return True

async def async_setup_entry(hass, entry):
    from .frontend import async_register_frontend
    from .wake_cards import async_setup_wake_cards
    if len(hass.data.get(MUSIC_DOMAIN, {})) != 1:
        raise ConfigEntryNotReady("Bitte zuerst Music Manager einrichten.")
    await async_register_frontend(hass)
    if getattr(entry, "title", None) == "Wecker Manager":
        hass.config_entries.async_update_entry(entry, title="Wecker")
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = entry
    async_setup_wake_cards(hass)
    return True

async def async_unload_entry(hass, entry):
    from .frontend import async_unregister_frontend
    from .wake_cards import async_unload_wake_cards
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    if not hass.data.get(DOMAIN):
        async_unload_wake_cards(hass)
        await async_unregister_frontend(hass)
    return True
