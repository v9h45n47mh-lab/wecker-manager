"""Validated editor drafts become alarm programs only after dashboard save."""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
import uuid

from homeassistant.util import dt as dt_util

from ..music_manager.access import AccessError
from .dashboard_usage import card_configs, saved_dashboards
from .day_types import legacy_days, validate_days

KEY = "pending_setups"
CONFIG_FIELDS = ("alarm_id", "card_id", "owner_id", "speakers", "covers", "lights", "calendar_entity", "sunrise_minutes", "hue_scene", "name", "days")


def payload(config):
    return {key: deepcopy(config[key]) for key in CONFIG_FIELDS if key in config and (key != "hue_scene" or config[key])}


def current_version(record):
    return (record["revision"], record["binding"]["card_id"]) if record else (0, "")


def drafts(entry):
    now = dt_util.utcnow()
    return {key: value for key, value in entry.options.get(KEY, {}).items() if datetime.fromisoformat(value["expires"]) > now}


async def prepare_setup(hass, caller, config, revision=None, confirm_disable=None):
    from . import wake_cards as wake
    wake.require_admin(caller)
    if not isinstance(config, dict):
        raise AccessError("invalid_config", "Bitte die Einrichtung vollständig ausfüllen.")
    entry = wake.entry_for(hass)
    old = entry.options.get(wake.KEY, {}).get(config.get("alarm_id"))
    expected = current_version(old)
    reconfigure = bool(old and old["binding"]["card_id"] == config.get("card_id"))
    preview = await wake.create_card(hass, caller, config, reconfigure=reconfigure, revision=revision, confirm_disable=confirm_disable, validate_only=True)
    normalized = {**deepcopy(preview["binding"]), "name": preview["name"], "days": validate_days(config.get("days", legacy_days(config.get("calendar_entity", ""))))}
    token = uuid.uuid4().hex
    draft = {"actor": caller.id, "config": normalized, "revision": expected[0], "previous_card": expected[1],
             "reconfigure": reconfigure, "confirm_disable": deepcopy(confirm_disable or []), "preview": preview,
             "expires": (dt_util.utcnow() + timedelta(hours=24)).isoformat()}
    async with wake.runtime(hass)["lock"]:
        if current_version(entry.options.get(wake.KEY, {}).get(config["alarm_id"])) != expected:
            raise AccessError("conflict", "Der Wecker wurde geändert. Bitte die Einrichtung erneut prüfen.")
        pending = {key: value for key, value in drafts(entry).items() if value["config"]["card_id"] != normalized["card_id"]}
        if len(pending) >= 64:
            raise AccessError("too_many_drafts", "Bitte offene Karteneinrichtungen zuerst abschließen.")
        pending[token] = draft
        hass.config_entries.async_update_entry(entry, options={**entry.options, KEY: pending})
    return {"pending": True, "setup_id": token, "config": deepcopy(normalized), "preview": preview, "base_revision": expected[0]}


def setup_status(hass, caller, setup_id):
    from . import wake_cards as wake
    wake.require_admin(caller)
    draft = drafts(wake.entry_for(hass)).get(wake.identifier(setup_id))
    if not draft:
        return {"pending": False}
    return {"pending": True, "setup_id": setup_id, "config": deepcopy(draft["config"]), "preview": deepcopy(draft["preview"]), "base_revision": draft["revision"]}


async def synchronize_saved_setups(hass, *, force=False):
    """Commit only exact configurations present in a saved dashboard."""
    from . import wake_cards as wake
    state = wake.runtime(hass)
    async with state.setdefault("setup_sync_lock", asyncio.Lock()):
        entry = wake.entry_for(hass)
        pending = drafts(entry)
        if not pending:
            if entry.options.get(KEY):
                hass.config_entries.async_update_entry(entry, options={**entry.options, KEY: {}})
            return
        # A forced YAML load emits lovelace_updated itself. Background listeners
        # use HA's modification-time check to avoid generating an event loop.
        dashboards = await saved_dashboards(hass, force=force)
        seen = set()
        for _, dashboard in dashboards:
            for config in card_configs(dashboard):
                token = config.get("setup_id")
                if config.get("type") != "custom:wecker-manager-card" or not isinstance(token, str) or token in seen:
                    continue
                seen.add(token)
                draft = pending.get(token)
                if not draft:
                    continue
                card_id = draft["config"]["card_id"]
                try:
                    if payload(config) != payload(draft["config"]):
                        raise AccessError("unfinished_setup", "Die Karte wurde nach dem Prüfen verändert. Bitte die Einrichtung erneut übernehmen und die Dashboardkarte speichern.")
                    current = entry.options.get(wake.KEY, {}).get(draft["config"]["alarm_id"])
                    if not current or current.get("setup_id") != token:
                        if current_version(current) != (draft["revision"], draft["previous_card"]):
                            raise AccessError("conflict", "Der Wecker wurde zwischenzeitlich geändert. Bitte die Karte erneut bearbeiten, prüfen und speichern.")
                        actor = await hass.auth.async_get_user(draft["actor"])
                        await wake.create_card(hass, actor, draft["config"], reconfigure=draft["reconfigure"], revision=draft["revision"], confirm_disable=draft["confirm_disable"], setup_id=token)
                    async with state["lock"]:
                        remaining = drafts(entry)
                        remaining.pop(token, None)
                        hass.config_entries.async_update_entry(entry, options={**entry.options, KEY: remaining})
                    state["errors"].pop(card_id, None)
                    hass.bus.async_fire(wake.EVENT, {"alarm_id": draft["config"]["alarm_id"]})
                except AccessError as error:
                    state["errors"][card_id] = str(error)
                    hass.bus.async_fire(wake.EVENT, {"alarm_id": draft["config"]["alarm_id"]})
                except Exception:
                    state["errors"][card_id] = "Die gespeicherte Karte konnte noch nicht übernommen werden. Bitte Geräte und Music Assistant prüfen; die Übernahme wird erneut versucht."
                    hass.bus.async_fire(wake.EVENT, {"alarm_id": draft["config"]["alarm_id"]})
                    wake._LOGGER.warning("Saved wake card setup could not be committed; check devices and Music Assistant")


def attach_dashboard_listener(hass):
    from homeassistant.components.lovelace.const import EVENT_LOVELACE_UPDATED
    from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
    from . import wake_cards as wake
    state = wake.runtime(hass)
    if state.get("dashboard_unsubscribe"):
        return

    async def synchronize(event=None):
        try:
            await synchronize_saved_setups(hass)
        except AccessError:
            # Keep drafts intact if any dashboard cannot be inspected.
            wake._LOGGER.warning("Saved wake card setups could not be synchronized; retry after checking dashboards")

    state["dashboard_unsubscribe"] = hass.bus.async_listen(EVENT_LOVELACE_UPDATED, synchronize)
    if hass.is_running:
        hass.async_create_task(synchronize())
    else:
        state["started_unsubscribe"] = hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, synchronize)
