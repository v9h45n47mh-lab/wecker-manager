"""Serve and register the card installed with the integration."""

import asyncio
from pathlib import Path
from urllib.parse import urlsplit

from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace import LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceStorageCollection

from .const import DOMAIN, VERSION

URL_BASE = "/wecker_manager/frontend"
CARD_PATH = f"{URL_BASE}/wecker-manager-card.js"
CARD_URL = f"{CARD_PATH}?v={VERSION}"
FRONTEND_DIR = Path(__file__).parent / "frontend"
DATA_FRONTEND = f"{DOMAIN}_frontend"
LEGACY_PATHS = {
    "/hacsfiles/wecker-manager/wecker-manager-card.js",
    "/local/community/wecker-manager/wecker-manager-card.js",
    "/local/wecker-manager/wecker-manager-card.js",
}


def resource_path(url):
    """Only recognize this integration's exact local resource paths."""
    if not isinstance(url, str):
        return None
    try:
        parts = urlsplit(url)
    except (TypeError, ValueError):
        return None
    if parts.scheme or parts.netloc:
        return None
    return parts.path if parts.path in LEGACY_PATHS | {CARD_PATH} else None


async def async_register_frontend(hass):
    """Install/update the resource without changing cards or user favorites."""
    state = hass.data.setdefault(DATA_FRONTEND, {"lock": asyncio.Lock()})
    async with state["lock"]:
        if not state.get("static_registered"):
            await hass.http.async_register_static_paths([
                StaticPathConfig(URL_BASE, str(FRONTEND_DIR), cache_headers=True)
            ])
            state["static_registered"] = True

        collection = hass.data[LOVELACE_DATA].resources
        if isinstance(collection, ResourceStorageCollection):
            # Public HA API loads resources and marks the collection as loaded.
            await collection.async_get_info()
            matching = [item for item in collection.async_items() if resource_path(item.get("url", ""))]
            if matching:
                primary = next((item for item in matching if resource_path(item["url"]) == CARD_PATH), matching[0])
                if primary["url"] != CARD_URL or primary.get("type") != "module":
                    await collection.async_update_item(primary["id"], {"url": CARD_URL, "res_type": "module"})
                # The replacement is usable before redundant old entries go away.
                for item in matching:
                    if item["id"] != primary["id"]:
                        await collection.async_delete_item(item["id"])
            else:
                await collection.async_create_item({"url": CARD_URL, "res_type": "module"})
        else:
            # Normalize old YAML resources in memory. The user's YAML file is
            # never rewritten; repeat this after every HA start.
            if state.get("yaml_collection") is not collection:
                state["yaml_collection"] = collection
                state["yaml_original"] = collection.async_items()
            collection.data = [
                {**item, "url": CARD_URL, "type": "module"}
                if resource_path(item.get("url", "")) else item
                for item in collection.async_items()
            ]

        previous = state.get("url")
        if previous and previous != CARD_URL:
            try:
                remove_extra_js_url(hass, previous)
            except KeyError:
                pass
        # Same URL in the frontend and dashboard resource lists is one ES module
        # in the browser. Loading it early also makes the visual editor available.
        add_extra_js_url(hass, CARD_URL)
        state["url"] = CARD_URL



async def async_unregister_frontend(hass):
    """Remove managed registrations when the integration is unloaded."""
    state = hass.data.get(DATA_FRONTEND)
    if not state:
        return
    async with state["lock"]:
        if url := state.pop("url", None):
            try:
                remove_extra_js_url(hass, url)
            except KeyError:
                pass
        collection = hass.data[LOVELACE_DATA].resources
        if isinstance(collection, ResourceStorageCollection):
            await collection.async_get_info()
            for item in list(collection.async_items()):
                if resource_path(item.get("url", "")) == CARD_PATH:
                    await collection.async_delete_item(item["id"])
        elif state.get("yaml_collection") is collection:
            collection.data = state.pop("yaml_original", collection.data)
            state.pop("yaml_collection", None)
