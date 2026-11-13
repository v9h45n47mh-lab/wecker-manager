"""Universal wake-up cards: immutable devices, persisted times, server execution."""

import asyncio
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import logging
import re
import uuid
from types import SimpleNamespace

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.core import Context
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change, async_call_later
from homeassistant.util import dt as dt_util

from ..music_manager.access import AccessError, account_for, checked_account, sonos_uid, validate_uri, value
from ..music_manager.alarms import ALARM_ID, SELECTION_KEY, alarm_owner, apple_target, selection_from
from ..music_manager.const import CONF_ACCOUNTS, CONF_ALARMS
from .const import DOMAIN, MUSIC_DOMAIN, VERSION
from .day_types import legacy_days, day_definitions, validate_days, settings_for_days, calendar_mode
from . import shared_days
from . import hue_scenes
from ..music_manager.helpers import music_assistant_client

KEY = "wake_cards"
EVENT = "wecker_manager_card_updated"
RUNTIME = f"{DOMAIN}_wake_cards"
TYPES = ("schultag", "wochenende", "ferien")
TIME = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d\Z")
_LOGGER = logging.getLogger(__name__)


def entry_for(hass):
    entries = list(hass.data.get(DOMAIN, {}).values())
    if len(entries) != 1:
        raise AccessError("not_configured", "Bitte Wecker zuerst einrichten.")
    return entries[0]


def music_entry_for(hass):
    entries = list(hass.data.get(MUSIC_DOMAIN, {}).values())
    if len(entries) != 1:
        raise AccessError("not_configured", "Bitte Music Manager mit genau einer eingerichteten Integration verbinden.")
    return entries[0]


def runtime(hass):
    return hass.data.setdefault(RUNTIME, {"lock": asyncio.Lock(), "busy": set(), "errors": {}})


def require_admin(user):
    if not user or not user.is_active or user.system_generated or not user.is_admin:
        raise AccessError("unauthorized", "Neue Weckerkarten können nur Administratoren anlegen.")


def identifier(raw):
    if not isinstance(raw, str) or not ALARM_ID.fullmatch(raw):
        raise AccessError("invalid_config", "Bitte eine gültige Karten- und Weckerkennung verwenden.")
    return raw


def integer(value_, minimum, maximum):
    if type(value_) is not int or not minimum <= value_ <= maximum:
        raise AccessError("invalid_config", f"Bitte eine ganze Zahl von {minimum} bis {maximum} angeben.")
    return value_


def playback_policy(record):
    return deepcopy(record.get("playback", {"mode": "duration", "minutes": 5}))


def validate_playback(raw):
    if not isinstance(raw, dict) or set(raw) != {"mode", "minutes"} or raw["mode"] not in ("duration", "track_end"):
        raise AccessError("invalid_config", "Bitte eine feste Dauer oder „Wenn Titel endet“ wählen.")
    return {"mode": raw["mode"], "minutes": integer(raw["minutes"], 1, 1440)}


async def set_playback(hass, caller, alarm_id, card_id, raw):
    policy = validate_playback(raw)
    async with runtime(hass)["lock"]:
        entry, record, owner = await checked_record(hass, caller, alarm_id, card_id)
        await check_playback_selection(hass, owner, alarm_id, policy)
        updated = {**record, "playback": policy, "revision": record["revision"] + 1}
        save_record(hass, entry, alarm_id, updated)
        return snapshot(hass, updated)


async def check_playback_selection(hass, owner, alarm_id, policy):
    if policy["mode"] == "track_end":
        from homeassistant.components.frontend.storage import async_user_store
        selected = selection_from(await async_user_store(hass, owner.id), alarm_id)
        if not selected or selected.get("media_type") != "track":
            raise AccessError("invalid_config", "„Wenn Titel endet“ benötigt einen einzelnen Titel. Für Radio bitte eine feste Dauer wählen.")


async def queue_repeat(mass, queue_id, mode):
    from music_assistant_models.enums import RepeatMode
    command = getattr(mass.player_queues, "queue_command_repeat", None) or getattr(mass.player_queues, "set_repeat", None)
    if not command:
        raise AccessError("repeat_unavailable", "Music Assistant unterstützt die Wiederholung nicht. Bitte Music Assistant aktualisieren.")
    await command(queue_id, RepeatMode(mode))


def schedule_music_stop(hass, alarm_id, *, retry=False):
    state = runtime(hass)
    timers = state.setdefault("stop_timers", {})
    if cancel := timers.pop(alarm_id, None):
        cancel()
    entry = entry_for(hass)
    record = entry.options.get(KEY, {}).get(alarm_id)
    if not record or not record.get("stops"):
        return
    delay = max(15 if retry else 0, min((datetime.fromisoformat(item["at"]) - dt_util.utcnow()).total_seconds() for item in record["stops"]))
    card_id = record["binding"]["card_id"]

    async def finish(_now):
        timers.pop(alarm_id, None)
        try:
            current_entry, current, owner = await checked_record(hass, None, alarm_id, card_id)
            await stop_due(hass, current_entry, alarm_id, current, owner)
        except Exception:
            state["errors"][card_id] = "Die Weckmusik konnte nicht beendet werden. Bitte Geräte und Verbindung prüfen."
            hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
        finally:
            schedule_music_stop(hass, alarm_id, retry=True)

    timers[alarm_id] = async_call_later(hass, delay, finish)


def allowed_entity(hass, owner, caller, entity_id, domain, *, control=True):
    if not isinstance(entity_id, str) or not re.fullmatch(domain + r"\.[a-z0-9_]+", entity_id):
        raise AccessError("invalid_entity", "Die gewählte Entität ist ungültig.")
    state = hass.states.get(entity_id)
    registered = er.async_get(hass).async_get(entity_id)
    if not state or registered and registered.disabled_by:
        raise AccessError("invalid_entity", "Eine gewählte Entität ist nicht mehr verfügbar.")
    policies = (POLICY_READ, POLICY_CONTROL) if control else (POLICY_READ,)
    for user in (owner, caller):
        if user and any(not user.permissions.check_entity(entity_id, policy) for policy in policies):
            raise AccessError("unauthorized", "Keine Berechtigung für eines der gewählten Geräte.")
    if domain == "media_player" and (not registered or registered.platform != "sonos" or not sonos_uid(registered.unique_id)):
        raise AccessError("wrong_player", "Bitte Sonos-Boxen aus dem Music Manager wählen.")
    return state


def binding_signature(binding):
    return {**{key: binding.get(key) for key in ("card_id", "alarm_id", "owner_id", "speakers", "covers", "lights", "calendar_entity", "sunrise_minutes")}, "hue_scene": binding.get("hue_scene", "")}


def checked_hue_scene(hass, owner, caller, scene_id, lights):
    allowed_entity(hass, owner, caller, scene_id, "scene")
    covered = hue_scenes.covered_lights(hass, lights, scene_id)
    if covered is None:
        raise AccessError("invalid_scene", "Die Hue-Szene passt nicht vollständig zu den gewählten Lampen. Bitte die Lichtauswahl prüfen.")
    for item in lights:
        allowed_entity(hass, owner, caller, item["entity_id"], "light")
    for member in hue_scenes.scene_members(hass, scene_id):
        allowed_entity(hass, owner, caller, member, "light")
    return covered


def checked_light_scene(hass, owner, caller, scene_id, light_id):
    allowed_entity(hass, owner, caller, scene_id, "scene")
    allowed_entity(hass, owner, caller, light_id, "light")
    result = hue_scenes.light_actions(hass, scene_id, light_id)
    if not result:
        raise AccessError("invalid_scene", "Die Hue-Szene enthält keine passenden Einstellungen für diese Lampe. Bitte neu auswählen.")
    for member in result[1]:
        allowed_entity(hass, owner, caller, member, "light")
    return result


async def checked_record(hass, caller, alarm_id, card_id):
    entry = entry_for(hass)
    record = entry.options.get(KEY, {}).get(identifier(alarm_id))
    if not record or record["binding"]["card_id"] != identifier(card_id):
        raise AccessError("card_missing", "Diese Karte wurde ersetzt. Bitte eine neue Weckerkarte anlegen.")
    binding = record["binding"]
    owner = await alarm_owner(hass, {"ha_user_id": binding["owner_id"]}, caller)
    music_entry = music_entry_for(hass)
    account = account_for(music_entry.options.get(CONF_ACCOUNTS, []), owner.id)
    if account != record["account"]:
        raise AccessError("account_changed", "Das festgelegte Musikkonto wurde geändert. Bitte die Karte neu anlegen.")
    # The old music picker also resolves the owner through this exact mapping.
    alarms = [a for a in music_entry.options.get(CONF_ALARMS, []) if a.get("alarm_id") == alarm_id]
    if len(alarms) != 1 or alarms[0].get("ha_user_id") != owner.id or alarms[0].get("source_entity") != binding["speakers"][0]:
        raise AccessError("binding_changed", "Die feste Weckerzuordnung wurde geändert. Bitte die Karte neu anlegen.")
    return entry, record, owner


def snapshot(hass, record):
    settings = settings_for_days(record)
    settings["sunrise_minutes"] = sunrise_minutes(record)
    for kind, item in settings["types"].items():
        item["sunrise_minutes"] = sunrise_minutes(record, kind)
    return {"exists": True, "binding": deepcopy(record["binding"]),
            "playback": playback_policy(record),
            "settings": settings, "days": day_definitions(record), "revision": record["revision"],
            "name": record.get("name", "Wecker"), "version": VERSION,
            "sunrise_available": has_dimmable_light(hass, record["binding"]),
            "error": runtime(hass)["errors"].get(record["binding"]["card_id"], "")}


def sunrise_minutes(record, kind="schultag"):
    """Read editable settings, falling back to the original fixed card binding."""
    return record["settings"]["types"].get(kind, {}).get("sunrise_minutes", record["settings"].get("sunrise_minutes", record["binding"].get("sunrise_minutes", 0)) if kind == "schultag" else 0)


def has_dimmable_light(hass, binding):
    for item in binding["lights"]:
        state = hass.states.get(item["entity_id"])
        if state and set(state.attributes.get("supported_color_modes", [])) - {"onoff", "unknown"}:
            return True
    return False


def save_record(hass, entry, alarm_id, record, *, notify=True):
    cards = dict(entry.options.get(KEY, {}))
    cards[alarm_id] = record
    hass.config_entries.async_update_entry(entry, options={**entry.options, KEY: cards})
    if notify:
        hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})


def commit_shared(hass, entry, templates, cards, changed):
    templates_changed = templates != entry.options.get(shared_days.LIBRARY, {})
    hass.config_entries.async_update_entry(entry, options={**entry.options, shared_days.LIBRARY: templates, KEY: cards})
    for alarm_id in changed:
        hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
    if templates_changed:
        hass.bus.async_fire(EVENT, {"day_templates": True})


async def stage_shared(hass, caller, entry, alarm_id, record, days):
    templates, cards, migrated = shared_days.migrate(entry.options)
    templates, cards, changed = shared_days.apply(templates, cards, alarm_id, record, days)
    changed.update(migrated)
    for key in changed:
        validate_days(day_definitions(cards[key]))
        owner = await hass.auth.async_get_user(cards[key]["binding"]["owner_id"])
        if owner and owner.is_active:
            for day in day_definitions(cards[key]):
                if day["calendar_entity"]:
                    allowed_entity(hass, owner, caller, day["calendar_entity"], "calendar", control=False)
    return templates, cards, changed


def default_settings(hass, alarm_id):
    base = alarm_id.removesuffix("_schultag")
    school_presets = ["06:00", "06:20"] if base.startswith("p_") else ["05:55", "06:15"]
    types = {}
    for kind in TYPES:
        time_state = hass.states.get(f"input_datetime.{base}_{kind}_zeit")
        active = hass.states.get(f"input_boolean.{base}_{kind}_aktiv")
        music = hass.states.get(f"input_boolean.{base}_{kind}_musik")
        raw_time = time_state.state[:5] if time_state else ""
        types[kind] = {"time": raw_time if TIME.fullmatch(raw_time) else (school_presets[0] if kind == "schultag" else "09:00"),
                       "enabled": bool(active and active.state == "on"),
                       "music": kind == "schultag" or bool(music and music.state == "on"),
                       "presets": school_presets if kind == "schultag" else ["09:00", "10:00", "11:00"]}
    return {"volume": 15, "types": types}


def validate_settings(raw, days=None):
    days = legacy_days() if days is None else days
    day_map = {item["id"]: item for item in days}
    if not isinstance(raw, dict) or not {"volume", "types"} <= set(raw) or set(raw) - {"volume", "types", "sunrise_minutes"} or not isinstance(raw["types"], dict) or set(raw["types"]) != set(day_map):
        raise AccessError("invalid_config", "Nur Weckzeiten, Schnellzeiten, Musikschalter, Lautstärke und Sonnenaufgang sind änderbar.")
    result = {"volume": integer(raw["volume"], 5, 15), "types": {}, "sunrise_minutes": integer(raw.get("sunrise_minutes", 0), 0, 30)}
    for kind, day in day_map.items():
        item = raw["types"][kind]
        if not isinstance(item, dict) or not {"time", "enabled", "music", "presets"} <= set(item) or set(item) - {"time", "enabled", "music", "presets", "calendar_mode", "sunrise_minutes"}:
            raise AccessError("invalid_config", "Die Weckereinstellungen sind unvollständig.")
        presets = item["presets"]
        if not isinstance(item["time"], str) or not TIME.fullmatch(item["time"]) or type(item["enabled"]) is not bool or type(item["music"]) is not bool:
            raise AccessError("invalid_config", "Bitte gültige Weckzeiten im Format HH:MM verwenden.")
        if not isinstance(presets, list) or len(presets) > 3 or any(not isinstance(t, str) or not TIME.fullmatch(t) for t in presets) or len(set(presets)) != len(presets):
            raise AccessError("invalid_config", "Je Weckertyp sind bis zu drei unterschiedliche Schnellzeiten erlaubt.")
        if day["music_mode"] == "always" and not item["music"]:
            raise AccessError("invalid_config", f"{day['name']} verwendet immer Musik.")
        mode = day.get("calendar_mode", calendar_mode(kind))
        if item.get("calendar_mode", mode) not in ("event", "no_event"):
            raise AccessError("invalid_config", "Bitte Termin vorhanden oder kein ganztägiger Termin auswählen.")
        if "calendar_mode" in day and item.get("calendar_mode", day["calendar_mode"]) != day["calendar_mode"]:
            raise AccessError("invalid_config", "Freie oder gebuchte Kalendertage werden im Setup des Tagestyps festgelegt.")
        result["types"][kind] = {**deepcopy(item), "calendar_mode": item.get("calendar_mode", mode)}
        if "sunrise_minutes" in item:
            result["types"][kind]["sunrise_minutes"] = integer(item["sunrise_minutes"], 0, 30)
    return result


async def catalog(hass, caller, owner_id=None, *, refresh_usage=False):
    require_admin(caller)
    if refresh_usage:
        from .card_setups import synchronize_saved_setups
        await synchronize_saved_setups(hass, force=True)
    entry = entry_for(hass)
    accounts = []
    for account in music_entry_for(hass).options.get(CONF_ACCOUNTS, []):
        owner = await hass.auth.async_get_user(account.get("ha_user_id"))
        if owner and owner.is_active and not owner.system_generated:
            accounts.append({"value": owner.id, "label": owner.name or owner.id})
    owner = await hass.auth.async_get_user(owner_id) if owner_id else caller
    if not owner or not owner.is_active or owner.system_generated:
        raise AccessError("unauthorized", "Bitte ein aktives Musikkonto wählen.")
    devices = {kind: [] for kind in ("speakers", "covers", "lights", "calendars")}
    domains = {"media_player": "speakers", "cover": "covers", "light": "lights", "calendar": "calendars"}
    for state in hass.states.async_all():
        domain = state.entity_id.partition(".")[0]
        if domain not in domains:
            continue
        try:
            allowed_entity(hass, owner, caller, state.entity_id, domain, control=domain != "calendar")
        except AccessError:
            continue
        devices[domains[domain]].append({"id": state.entity_id, "label": state.attributes.get("friendly_name", state.entity_id),
                                       "description": state.entity_id, "attributes": {k: list(state.attributes[k]) if isinstance(state.attributes[k], set) else state.attributes[k] for k in ("supported_color_modes", "min_color_temp_kelvin", "max_color_temp_kelvin", "supported_features", "entity_id", "is_hue_group") if k in state.attributes}})
    for items in devices.values():
        items.sort(key=lambda item: item["label"].casefold())
    templates, cards, changed = shared_days.migrate(entry.options)
    if changed or templates != entry.options.get(shared_days.LIBRARY, {}):
        # Upgrade is also run at integration startup; this covers old imports.
        async with runtime(hass)["lock"]:
            templates, cards, changed = shared_days.migrate(entry.options)
            if changed or templates != entry.options.get(shared_days.LIBRARY, {}):
                commit_shared(hass, entry, templates, cards, changed)
    calendars = {item["id"] for item in devices["calendars"]}
    owner_names = {account["value"]: account["label"] for account in accounts}
    available_days = [{**deepcopy(item), "uses": sum(any(d.get("template_id") == item["id"] for d in day_definitions(record)) for record in cards.values()),
                       "used_by": [{"name": record.get("name", "Wecker"), "owner": owner_names.get(record["binding"]["owner_id"], "")} for record in cards.values() if any(d.get("template_id") == item["id"] for d in day_definitions(record))]}
                      for item in templates.values() if not item["calendar_entity"] or item["calendar_entity"] in calendars]
    available_days.sort(key=lambda item: item["name"].casefold())
    usage_checked_at = None
    if refresh_usage:
        from .dashboard_usage import current_references
        references = await current_references(hass)
        for item in available_days:
            uses = [record for record in cards.values() if any(day.get("template_id") == item["id"] for day in day_definitions(record))]
            item["stored_uses"] = len(uses)
            item["used_by"], item["unassigned"] = [], []
            for record in uses:
                binding = record["binding"]
                use = {"name": record.get("name", "Wecker"), "owner": owner_names.get(binding["owner_id"], ""), "alarm_id": binding["alarm_id"], "card_id": binding["card_id"]}
                dashboards = references.get((binding["alarm_id"], binding["card_id"]))
                if dashboards:
                    item["used_by"].append({**use, "dashboards": sorted(dashboards)})
                else:
                    item["unassigned"].append(use)
            item["uses"] = len(item["used_by"])
        usage_checked_at = dt_util.utcnow().isoformat()
    allowed_lights = set().union(*(hue_scenes.light_members(hass, item["id"]) for item in devices["lights"])) if devices["lights"] else set()
    scenes = []
    for state in hass.states.async_all():
        if not state.entity_id.startswith("scene."):
            continue
        members = hue_scenes.scene_members(hass, state.entity_id)
        per_light = []
        try:
            allowed_entity(hass, owner, caller, state.entity_id, "scene")
        except AccessError:
            continue
        for light in devices["lights"]:
            try:
                checked_light_scene(hass, owner, caller, state.entity_id, light["id"])
                per_light.append(light["id"])
            except AccessError:
                pass
        if not per_light and (not members or not members <= allowed_lights):
            continue
        if not per_light:
            try:
                for member in members:
                    allowed_entity(hass, owner, caller, member, "light")
            except AccessError:
                continue
        scenes.append({"id": state.entity_id, "label": state.attributes.get("friendly_name", state.entity_id), "members": sorted(members), "lights": per_light})
    scenes.sort(key=lambda item: item["label"].casefold())
    return {"accounts": accounts, "shared_days": available_days, "hue_scenes": scenes, **devices, **({"usage_checked_at": usage_checked_at} if refresh_usage else {})}


async def save_day_template(hass, caller, raw, revision):
    require_admin(caller)
    fields = {"id", "name", "icon", "weekdays", "calendar_entity", "calendar_mode"}
    if not isinstance(raw, dict) or not fields <= set(raw) or set(raw) - fields - {"display_name"} or type(revision) is not int or revision < 0:
        raise AccessError("invalid_config", "Der gemeinsame Tagestyp ist unvollständig.")
    day = validate_days([{**raw, "music_mode": "switchable", "confirm_disable": False}])[0]
    entry = entry_for(hass)
    async with runtime(hass)["lock"]:
        templates, cards, migrated = shared_days.migrate(entry.options)
        previous = templates.get(day["id"])
        if (previous and revision != previous["revision"]) or (not previous and revision != 0):
            raise AccessError("conflict", "Der Tagestyp wurde zwischenzeitlich geändert. Bitte erneut laden.")
        if day["calendar_entity"]:
            allowed_entity(hass, caller, caller, day["calendar_entity"], "calendar", control=False)
        matching = next((item for item in templates.values() if shared_days.signature(item) == shared_days.signature(day)), None)
        if not previous and matching:
            if migrated or templates != entry.options.get(shared_days.LIBRARY, {}):
                commit_shared(hass, entry, templates, cards, migrated)
            return {"saved": True, "template": deepcopy(matching), "already_exists": True}
        if any(key != day["id"] and item["name"].casefold() == day["name"].casefold() for key, item in templates.items()):
            raise AccessError("name_in_use", "Dieser Name ist bereits vergeben. Bitte einen eindeutigen Namen wählen; der Anzeigename darf gleich sein.")
        template = {"id": day["id"], **shared_days.common(day), "revision": revision + 1}
        templates[day["id"]] = template
        changed = set(migrated)
        for alarm_id, record in cards.items():
            days = day_definitions(record)
            affected = False
            for item in days:
                if item.get("template_id") == day["id"]:
                    item.update(shared_days.common(template), template_revision=template["revision"])
                    affected = True
            if affected:
                validate_days(days)
                owner = await hass.auth.async_get_user(record["binding"]["owner_id"])
                if owner and owner.is_active and day["calendar_entity"]:
                    allowed_entity(hass, owner, caller, day["calendar_entity"], "calendar", control=False)
                record.update(days=days, settings=settings_for_days(record, days), revision=record["revision"] + 1)
                changed.add(alarm_id)
        # An edited template can now equal another one; merge references, not alarms.
        templates, cards, merged = shared_days.migrate({shared_days.LIBRARY: templates, KEY: cards})
        changed.update(merged)
        result = next(item for item in templates.values() if shared_days.signature(item) == shared_days.signature(template))
        commit_shared(hass, entry, templates, cards, changed)
        return {"saved": True, "template": deepcopy(result)}


async def delete_day_template(hass, caller, template_id, revision, remove_cards=None):
    require_admin(caller)
    identifier(template_id)
    entry = entry_for(hass)
    async with runtime(hass)["lock"]:
        templates, cards, migrated = shared_days.migrate(entry.options)
        item = templates.get(template_id)
        if not item or type(revision) is not int or item["revision"] != revision:
            raise AccessError("conflict", "Der Tagestyp wurde zwischenzeitlich geändert. Bitte erneut laden.")
        linked = {key: record for key, record in cards.items() if any(day.get("template_id") == template_id for day in day_definitions(record))}
        if linked:
            from .dashboard_usage import current_references
            references = await current_references(hass)
            if any((key, record["binding"]["card_id"]) in references for key, record in linked.items()):
                raise AccessError("template_in_use", "Dieser Tagestyp wird noch auf einer Dashboard- oder Statuskarte verwendet. Bitte zuerst dort entfernen.")
            expected = [{"alarm_id": key, "card_id": record["binding"]["card_id"]} for key, record in linked.items()]
            if not isinstance(remove_cards, list) or sorted(remove_cards, key=str) != sorted(expected, key=str):
                raise AccessError("cleanup_confirmation_required", "Bitte die Verwendung aktualisieren und das Entfernen der aufgeführten Wecker ohne Dashboardkarte bestätigen.")
            if any(record.get("stops") or record["binding"]["card_id"] in runtime(hass)["busy"] for record in linked.values()):
                raise AccessError("wake_in_progress", "Ein betroffener Wecker läuft noch. Bitte nach dem Ende der Weckmusik erneut löschen.")
        for key, record in linked.items():
            del cards[key]
            if cancel := runtime(hass).setdefault("stop_timers", {}).pop(key, None):
                cancel()
            runtime(hass)["errors"].pop(record["binding"]["card_id"], None)
        if linked:
            music_entry = music_entry_for(hass)
            def removed_binding(alarm):
                record = linked.get(alarm.get("alarm_id"))
                return record and alarm.get("ha_user_id") == record["binding"]["owner_id"] and alarm.get("source_entity") == record["binding"]["speakers"][0]
            alarms = [alarm for alarm in music_entry.options.get(CONF_ALARMS, []) if not removed_binding(alarm)]
            hass.config_entries.async_update_entry(music_entry, options={**music_entry.options, CONF_ALARMS: alarms})
        del templates[template_id]
        commit_shared(hass, entry, templates, cards, set(migrated) | set(linked))
        return {"deleted": True, "removed_cards": len(linked)}


async def create_card(hass, caller, config, *, reconfigure=False, revision=None, confirm_disable=None, validate_only=False, setup_id=None):
    require_admin(caller)
    if not isinstance(config, dict) or set(config) - {"card_id", "alarm_id", "owner_id", "speakers", "covers", "lights", "calendar_entity", "sunrise_minutes", "replace_automation", "days", "name", "hue_scene"}:
        raise AccessError("invalid_config", "Die Kartenkonfiguration ist ungültig.")
    card_id, alarm_id = identifier(config.get("card_id")), identifier(config.get("alarm_id"))
    entry = entry_for(hass)
    async with runtime(hass)["lock"]:
        existing = entry.options.get(KEY, {}).get(alarm_id)
        if reconfigure and (not existing or existing["binding"]["card_id"] != card_id):
            raise AccessError("card_missing", "Diese Karte wurde ersetzt. Bitte erneut laden.")
        if reconfigure and (type(revision) is not int or revision != existing["revision"]):
            raise AccessError("conflict", "Die Karte wurde auf einem anderen Gerät geändert. Bitte erneut laden.")
        if existing and card_id in existing.get("retired_card_ids", []):
            raise AccessError("card_replaced", "Diese Karte wurde ersetzt. Bitte eine neue Weckerkarte anlegen.")
        if any(key != alarm_id and item["binding"]["card_id"] == card_id for key, item in entry.options.get(KEY, {}).items()):
            raise AccessError("invalid_config", "Diese Kartenkennung wird bereits verwendet. Bitte eine neue Karte anlegen.")
        if existing and existing["binding"]["card_id"] == card_id and not reconfigure:
            if binding_signature(config) != binding_signature(existing["binding"]):
                raise AccessError("immutable_binding", "Geräte und Musikkonto sind festgelegt. Bitte eine neue Karte anlegen.")
            await checked_record(hass, caller, alarm_id, card_id)
            return snapshot(hass, existing)
        owner = await alarm_owner(hass, {"ha_user_id": config.get("owner_id")}, caller)
        music_entry = music_entry_for(hass)
        account = account_for(music_entry.options.get(CONF_ACCOUNTS, []), owner.id)
        speakers, covers, lights = config.get("speakers"), config.get("covers", []), config.get("lights", [])
        if not isinstance(speakers, list) or not 1 <= len(speakers) <= 12 or any(not isinstance(e, str) for e in speakers) or len(set(speakers)) != len(speakers):
            raise AccessError("invalid_config", "Bitte eine bis zwölf unterschiedliche Sonos-Boxen wählen.")
        if not isinstance(covers, list) or not isinstance(lights, list) or len(covers) > 24 or len(lights) > 24:
            raise AccessError("invalid_config", "Die Geräteauswahl ist zu groß oder ungültig.")
        checked_covers, checked_lights = [], []
        for source in speakers:
            allowed_entity(hass, owner, caller, source, "media_player")
            # Validate the same single account for every speaker, including MA's player filter.
            await apple_target(hass, music_entry_for(hass), {"source_entity": source}, owner)
        for item in covers:
            if not isinstance(item, dict) or set(item) != {"entity_id", "position"}:
                raise AccessError("invalid_config", "Bitte für jeden Rollladen eine Zielposition wählen.")
            state = allowed_entity(hass, owner, caller, item["entity_id"], "cover")
            position = integer(item["position"], 0, 100)
            if not int(state.attributes.get("supported_features", 0)) & 4:
                raise AccessError("invalid_entity", "Ein gewählter Rollladen unterstützt keine Zielposition.")
            checked_covers.append({"entity_id": item["entity_id"], "position": position})
        for item in lights:
            if not isinstance(item, dict) or set(item) - {"entity_id", "brightness", "color_mode", "kelvin", "rgb", "hue_scene"}:
                raise AccessError("invalid_config", "Die Lichteinstellung ist ungültig.")
            state = allowed_entity(hass, owner, caller, item.get("entity_id"), "light")
            modes = state.attributes.get("supported_color_modes", [])
            brightness = integer(item.get("brightness", 100), 1, 100)
            light = {"entity_id": item["entity_id"], "brightness": brightness, "color_mode": item.get("color_mode", "keep")}
            if light["color_mode"] == "temperature":
                if "color_temp" not in modes:
                    raise AccessError("invalid_entity", "Eine gewählte Lampe unterstützt keine Farbtemperatur.")
                light["kelvin"] = integer(item.get("kelvin"), int(state.attributes.get("min_color_temp_kelvin", 2000)), int(state.attributes.get("max_color_temp_kelvin", 6500)))
            elif light["color_mode"] == "colour":
                rgb = item.get("rgb")
                if not set(modes) & {"hs", "xy", "rgb", "rgbw", "rgbww"} or not isinstance(rgb, list) or len(rgb) != 3:
                    raise AccessError("invalid_entity", "Eine gewählte Lampe unterstützt diese Farbe nicht.")
                light["rgb"] = [integer(c, 0, 255) for c in rgb]
            elif light["color_mode"] != "keep":
                raise AccessError("invalid_config", "Die Lichtfarbe ist ungültig.")
            if item.get("hue_scene"):
                checked_light_scene(hass, owner, caller, item["hue_scene"], item["entity_id"])
                light["hue_scene"] = item["hue_scene"]
            checked_lights.append(light)
        for items in (checked_covers, checked_lights):
            if len({item["entity_id"] for item in items}) != len(items):
                raise AccessError("invalid_config", "Jedes Gerät darf nur einmal gewählt werden.")
        calendar = config.get("calendar_entity", "")
        if calendar:
            allowed_entity(hass, owner, caller, calendar, "calendar", control=False)
        sunrise = integer(config.get("sunrise_minutes", 0), 0, 30)
        binding = {"card_id": card_id, "alarm_id": alarm_id, "owner_id": owner.id, "speakers": list(speakers),
                   "covers": checked_covers, "lights": checked_lights, "calendar_entity": calendar, "sunrise_minutes": sunrise}
        scene_id = config.get("hue_scene", "")
        if not isinstance(scene_id, str):
            raise AccessError("invalid_scene", "Bitte eine gültige Hue-Szene wählen.")
        if scene_id:
            if any(item.get("hue_scene") for item in checked_lights):
                raise AccessError("invalid_scene", "Die bisherige gemeinsame Hue-Szene muss zuerst auf einzelne Lampen übernommen werden.")
            checked_hue_scene(hass, owner, caller, scene_id, checked_lights)
            binding["hue_scene"] = scene_id
        # A recreated card replaces the old card for this alarm ID, so only one executes.
        settings = deepcopy(existing["settings"]) if existing else default_settings(hass, alarm_id)
        settings["sunrise_minutes"] = (sunrise_minutes(existing) if existing else sunrise) if checked_lights else 0
        days = validate_days(config.get("days", day_definitions(existing) if existing else legacy_days(calendar)))
        for day in days:
            if day["calendar_entity"]:
                allowed_entity(hass, owner, caller, day["calendar_entity"], "calendar", control=False)
        settings = settings_for_days({"binding": binding, "settings": settings}, days)
        if existing:
            check_disable_confirmation(existing, settings["types"], confirm_disable)
        if not has_dimmable_light(hass, binding):
            settings["sunrise_minutes"] = 0
            for item in settings["types"].values():
                item["sunrise_minutes"] = 0
        name = config.get("name", existing.get("name", "Wecker") if existing else "Wecker")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise AccessError("invalid_config", "Bitte einen Namen für den Wecker vergeben.")
        retired = list(existing.get("retired_card_ids", [])) + ([existing["binding"]["card_id"]] if existing["binding"]["card_id"] != card_id else []) if existing else []
        record = {"binding": binding, "name": name.strip(), "account": deepcopy(account), "days": days, "settings": settings, "playback": playback_policy(existing) if existing else {"mode": "duration", "minutes": 5}, "revision": existing["revision"] + 1 if reconfigure else 1,
                  "runs": deepcopy(existing.get("runs", {})) if existing else {}, "retired_card_ids": retired,
                  "stops": deepcopy(existing.get("stops", [])) if existing else []}
        alarms = [a for a in music_entry.options.get(CONF_ALARMS, []) if a.get("alarm_id") != alarm_id]
        alarms.append({"alarm_id": alarm_id, "ha_user_id": owner.id, "source_entity": speakers[0]})
        templates, cards, changed = await stage_shared(hass, caller, entry, alarm_id, record, days)
        if validate_only:
            return snapshot(hass, cards[alarm_id])
        if setup_id:
            cards[alarm_id]["setup_id"] = setup_id
        hass.config_entries.async_update_entry(music_entry, options={**music_entry.options, CONF_ALARMS: alarms})
        commit_shared(hass, entry, templates, cards, changed)
        return snapshot(hass, cards[alarm_id])


async def update_card(hass, caller, alarm_id, card_id, settings, revision, confirm_disable=None, playback=None):
    async with runtime(hass)["lock"]:
        entry, record, owner = await checked_record(hass, caller, alarm_id, card_id)
        if type(revision) is not int or revision != record["revision"]:
            raise AccessError("conflict", "Die Einstellungen wurden auf einem anderen Gerät geändert. Bitte erneut laden.")
        if isinstance(settings, dict) and "sunrise_minutes" not in settings:
            settings = {**settings, "sunrise_minutes": sunrise_minutes(record)}
        if isinstance(settings, dict):
            settings = deepcopy(settings)
            school = settings.get("types", {}).get("schultag")
            if isinstance(school, dict) and settings.get("sunrise_minutes", sunrise_minutes(record)) != sunrise_minutes(record) and school.get("sunrise_minutes", sunrise_minutes(record)) == sunrise_minutes(record):
                school["sunrise_minutes"] = settings["sunrise_minutes"]
        validated = validate_settings(settings, day_definitions(record))
        if "schultag" in validated["types"]:
            validated["sunrise_minutes"] = validated["types"]["schultag"].get("sunrise_minutes", validated["sunrise_minutes"])
        check_disable_confirmation(record, validated["types"], confirm_disable)
        changed_sunrise = any(item.get("sunrise_minutes", validated["sunrise_minutes"] if kind == "schultag" else 0) not in (0, sunrise_minutes(record, kind)) for kind, item in validated["types"].items())
        if changed_sunrise and not has_dimmable_light(hass, record["binding"]):
            raise AccessError("invalid_config", "Für den Sonnenaufgang ist mindestens eine fest zugeordnete dimmbare Lampe erforderlich.")
        if playback is not None:
            playback = validate_playback(playback)
            await check_playback_selection(hass, owner, alarm_id, playback)
        updated = {**record, "settings": validated, "revision": record["revision"] + 1}
        if playback is not None:
            updated["playback"] = playback
        save_record(hass, entry, alarm_id, updated)
        return snapshot(hass, updated)


async def set_enabled(hass, caller, alarm_id, card_id, kind, enabled, confirm_disable=None):
    """Persist one explicit switch intent without resubmitting stale settings."""
    if type(enabled) is not bool or not isinstance(kind, str):
        raise AccessError("invalid_config", "Bitte einen gültigen Tagestyp ein- oder ausschalten.")
    async with runtime(hass)["lock"]:
        entry, record, _ = await checked_record(hass, caller, alarm_id, card_id)
        if kind not in {day["id"] for day in day_definitions(record)}:
            raise AccessError("invalid_config", "Dieser Tagestyp ist nicht mehr vorhanden. Bitte erneut laden.")
        settings = settings_for_days(record)
        settings["types"][kind]["enabled"] = enabled
        check_disable_confirmation(record, settings["types"], confirm_disable)
        updated = {**record, "settings": settings, "revision": record["revision"] + 1}
        save_record(hass, entry, alarm_id, updated)
        return snapshot(hass, updated)


def check_disable_confirmation(record, next_types, confirmed):
    confirmed = [] if confirmed is None else confirmed
    if not isinstance(confirmed, list) or any(not isinstance(item, str) for item in confirmed):
        raise AccessError("invalid_config", "Die Ausschaltbestätigung ist ungültig.")
    for day in day_definitions(record):
        old = record["settings"]["types"].get(day["id"], {})
        if day["confirm_disable"] and old.get("enabled") and not next_types.get(day["id"], {}).get("enabled") and day["id"] not in confirmed:
            raise AccessError("confirmation_required", f"{day['name']} bitte ausdrücklich zum Ausschalten bestätigen.")


async def configure_days(hass, caller, alarm_id, card_id, raw_days, revision, confirm_disable=None):
    require_admin(caller)
    days = validate_days(raw_days)
    async with runtime(hass)["lock"]:
        entry, record, owner = await checked_record(hass, caller, alarm_id, card_id)
        if type(revision) is not int or revision != record["revision"]:
            raise AccessError("conflict", "Die Einstellungen wurden auf einem anderen Gerät geändert. Bitte erneut laden.")
        for day in days:
            if day["calendar_entity"]:
                allowed_entity(hass, owner, caller, day["calendar_entity"], "calendar", control=False)
        settings = settings_for_days(record, days)
        check_disable_confirmation(record, settings["types"], confirm_disable)
        # A legacy holiday alarm without a calendar never executed. Keep it off
        # when an administrator first adopts explicit day policies.
        if "days" not in record and not record["binding"].get("calendar_entity") and "ferien" in settings["types"]:
            settings["types"]["ferien"]["enabled"] = False
        updated = {**record, "days": days, "settings": settings, "revision": record["revision"] + 1}
        templates, cards, changed = await stage_shared(hass, caller, entry, alarm_id, updated, days)
        commit_shared(hass, entry, templates, cards, changed)
        return snapshot(hass, cards[alarm_id])


def calendar_key(owner_id, entity_id, when):
    return owner_id, entity_id, when.date().isoformat()


async def calendar_day(hass, owner, caller, entity_id, when, *, force=False):
    state = allowed_entity(hass, owner, caller, entity_id, "calendar", control=False)
    key = calendar_key(owner.id, entity_id, when)
    cache = runtime(hass).setdefault("calendar_days", {})
    now = dt_util.utcnow()
    token = str(getattr(state, "last_updated", state.state))
    old = cache.get(key)
    if state.state not in ("on", "off"):
        cache[key] = {"error": True}
        raise AccessError("calendar_unavailable", "Ein Kalender ist nicht erreichbar; die zugehörigen Tagestypen sind pausiert.")
    if not force and old and not old.get("error") and old.get("token") == token and (now - old["checked"]).total_seconds() < 300:
        return old["event"]
    start = when.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        async with asyncio.timeout(10):
            response = await hass.services.async_call("calendar", "get_events", {
                "entity_id": entity_id, "start_date_time": start.isoformat(), "end_date_time": (start + timedelta(days=1)).isoformat(),
            }, blocking=True, return_response=True, context=Context(user_id=owner.id))
        events = response[entity_id]["events"]
        if not isinstance(events, list):
            raise ValueError("Invalid calendar response")
        found = False
        for event in events:
            first, last = event.get("start"), event.get("end")
            # HA represents actual all-day events by date-only boundaries.
            # A midnight-to-midnight timed event is deliberately ignored too.
            if isinstance(first, str) and isinstance(last, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", first) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", last):
                if date.fromisoformat(first) <= when.date() < date.fromisoformat(last):
                    found = True
        cache[key] = {"event": found, "checked": now, "token": token}
        # Keep only a small range of dates; no event text is retained.
        for expired in list(cache):
            if expired[2] < (when.date() - timedelta(days=2)).isoformat():
                cache.pop(expired, None)
        return found
    except Exception as err:
        cache[key] = {"error": True}
        raise AccessError("calendar_unavailable", "Ein Kalender ist nicht erreichbar; die zugehörigen Tagestypen sind pausiert.") from err


async def prepare_calendars(hass, record, owner, when, caller=None, *, force=False, include_disabled=False):
    entities = {day["calendar_entity"] for day in day_definitions(record)
                if day["calendar_entity"] and when.weekday() in day["weekdays"]
                and (include_disabled or record["settings"]["types"].get(day["id"], {}).get("enabled"))}
    async def load(entity_id):
        try:
            await calendar_day(hass, owner, caller, entity_id, when, force=force)
        except AccessError as err:
            runtime(hass).setdefault("calendar_days", {})[calendar_key(owner.id, entity_id, when)] = {"error": True}
            return err
    return [error for error in await asyncio.gather(*(load(entity) for entity in entities)) if error]


async def tomorrow_info(hass, caller, alarm_id, card_id, day_offset=1):
    if type(day_offset) is not int or day_offset not in (0, 1):
        raise AccessError("invalid_config", "Bitte heute oder morgen für die Kopfleiste auswählen.")
    _, record, owner = await checked_record(hass, caller, alarm_id, card_id)
    when = (dt_util.as_local(dt_util.utcnow()) + timedelta(days=day_offset)).replace(hour=0, minute=0, second=0, microsecond=0)
    period = "Heute" if day_offset == 0 else "Morgen"
    await prepare_calendars(hass, record, owner, when, caller, include_disabled=True)
    matches, failed = [], False
    for day in day_definitions(record):
        try:
            if day_matches(hass, record, day["id"], when):
                matches.append(day)
        except AccessError:
            failed = True
    if not matches:
        label = period + (": Kalender nicht erreichbar" if failed else ": kein passender Tagestyp")
    elif len(matches) == 1:
        day = matches[0]
        defaults = {"schultag": "Schultag", "wochenende": "Wochenende", "ferien": "Ferien / schulfrei"}
        label = (period + " ist schulfrei" if day["id"] == "ferien" else period + " ist " + day["name"]) if day["name"] == defaults.get(day["id"]) else period + ": " + day["name"]
    else:
        label = period + ": " + ", ".join(day["name"] for day in matches)
    if matches and failed:
        label += " · Kalenderprüfung offen"
    return {"date": when.date().isoformat(), "kind": matches[0]["id"] if len(matches) == 1 else None,
            "types": [day["id"] for day in matches], "label": label}


async def upcoming_info(hass, caller, alarm_id, card_id):
    """Actual upcoming wakes in 24 elapsed hours, using the scheduler's rules."""
    _, record, owner = await checked_record(hass, caller, alarm_id, card_id)
    now = dt_util.utcnow().astimezone(timezone.utc)
    until = now + timedelta(hours=24)
    local_now, local_end = dt_util.as_local(now), dt_util.as_local(until)
    cursor = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    dates = []
    while cursor.date() <= local_end.date():
        dates.append(cursor)
        cursor += timedelta(days=1)
    for when in dates:
        await prepare_calendars(hass, record, owner, when, caller)
    result = {}
    for day in day_definitions(record):
        kind = day["id"]
        settings = record["settings"]["types"][kind]
        candidates = []
        if settings.get("enabled"):
            hour, minute = map(int, settings["time"].split(":"))
            for when in dates:
                if record.get("runs", {}).get(f"{when.date().isoformat()}/{kind}/wake"):
                    continue
                for fold in (0, 1):
                    target = when.replace(hour=hour, minute=minute, fold=fold)
                    utc = target.astimezone(timezone.utc)
                    # Ignore nonexistent local times at the spring clock change.
                    if dt_util.as_local(utc).replace(tzinfo=None) != target.replace(tzinfo=None):
                        continue
                    if not now <= utc <= until:
                        continue
                    try:
                        if day_matches(hass, record, kind, target):
                            candidates.append(utc)
                    except AccessError:
                        pass
        at = min(candidates) if candidates else None
        result[kind] = {"active": at is not None, "at": at.isoformat() if at else None,
                        "label": dt_util.as_local(at).strftime("%d.%m. %H:%M") if at else ""}
    return {"generated_at": now.isoformat(), "until": until.isoformat(), "types": result}


@websocket_api.websocket_command({
    vol.Required("type"): "wecker_manager/card",
    vol.Required("action"): vol.In(["catalog", "get", "prepare_setup", "setup_status", "create", "configure", "update", "set_enabled", "set_playback", "day_info", "upcoming", "configure_days", "save_day_template", "delete_day_template"]),
    vol.Optional("alarm_id"): str,
    vol.Optional("card_id"): str,
    vol.Optional("owner_id"): str,
    vol.Optional("config"): dict,
    vol.Optional("settings"): dict,
    vol.Optional("revision"): int,
    vol.Optional("days"): list,
    vol.Optional("confirm_disable"): list,
    vol.Optional("kind"): str,
    vol.Optional("enabled"): bool,
    vol.Optional("day_offset"): int,
    vol.Optional("day_template"): dict,
    vol.Optional("template_id"): str,
    vol.Optional("playback"): dict,
    vol.Optional("refresh_usage"): bool,
    vol.Optional("setup_id"): str,
    vol.Optional("remove_cards"): list,
})
@websocket_api.async_response
async def websocket_wake_card(hass, connection, msg):
    try:
        async with asyncio.timeout(45):
            action = msg["action"]
            if action == "catalog":
                result = await catalog(hass, connection.user, msg.get("owner_id"), refresh_usage=msg.get("refresh_usage", False))
            elif action == "prepare_setup":
                from .card_setups import prepare_setup
                result = await prepare_setup(hass, connection.user, msg.get("config"), msg.get("revision"), msg.get("confirm_disable"))
            elif action == "setup_status":
                from .card_setups import setup_status
                result = setup_status(hass, connection.user, msg.get("setup_id"))
            elif action == "set_playback":
                result = await set_playback(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("playback"))
            elif action == "save_day_template":
                result = await save_day_template(hass, connection.user, msg.get("day_template"), msg.get("revision"))
            elif action == "delete_day_template":
                result = await delete_day_template(hass, connection.user, msg.get("template_id"), msg.get("revision"), msg.get("remove_cards"))
            elif action == "day_info":
                result = await tomorrow_info(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("day_offset", 1))
            elif action == "upcoming":
                result = await upcoming_info(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"))
            elif action == "configure_days":
                result = await configure_days(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("days"), msg.get("revision"), msg.get("confirm_disable"))
            elif action == "create":
                result = await create_card(hass, connection.user, msg.get("config"))
            elif action == "configure":
                result = await create_card(hass, connection.user, msg.get("config"), reconfigure=True, revision=msg.get("revision"), confirm_disable=msg.get("confirm_disable"))
            elif action == "update":
                result = await update_card(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("settings"), msg.get("revision"), msg.get("confirm_disable"), playback=msg.get("playback"))
            elif action == "set_enabled":
                result = await set_enabled(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("kind"), msg.get("enabled"), msg.get("confirm_disable"))
            else:
                alarm_id, card_id = identifier(msg.get("alarm_id")), identifier(msg.get("card_id"))
                entry = entry_for(hass)
                record = entry.options.get(KEY, {}).get(alarm_id)
                if record and card_id in record.get("retired_card_ids", []):
                    raise AccessError("card_replaced", "Diese Karte wurde ersetzt. Bitte eine neue Weckerkarte anlegen.")
                if not record or record["binding"]["card_id"] != card_id:
                    from .card_setups import drafts
                    pending = next((item for item in drafts(entry).values() if item["config"]["alarm_id"] == alarm_id and item["config"]["card_id"] == card_id), None)
                    if pending:
                        await alarm_owner(hass, {"ha_user_id": pending["config"]["owner_id"]}, connection.user)
                    else:
                        require_admin(connection.user)
                    result = {"exists": False, "can_create": connection.user.is_admin, "pending": bool(pending), "replaces_card": bool(record), "error": runtime(hass)["errors"].get(card_id, "")}
                else:
                    if not connection.user.is_admin:
                        _, record, _ = await checked_record(hass, connection.user, alarm_id, card_id)
                    result = snapshot(hass, record)
            connection.send_result(msg["id"], result)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, str(err))
    except Exception:
        connection.send_error(msg["id"], "wake_card_error", "Die Weckerkarte konnte nicht geladen oder gespeichert werden. Bitte Verbindung und Geräte prüfen.")


def day_matches(hass, record, kind, when):
    day = next((item for item in day_definitions(record) if item["id"] == kind), None)
    if not day or when.weekday() not in day["weekdays"]:
        return False
    entity_id = day["calendar_entity"]
    if not entity_id:
        return not ("days" not in record and kind == "ferien")
    cached = runtime(hass).setdefault("calendar_days", {}).get(calendar_key(record["binding"]["owner_id"], entity_id, when))
    if not cached or cached.get("error"):
        raise AccessError("calendar_unavailable", f"Kalender für {day['name']} nicht erreichbar; dieser Tagestyp ist pausiert.")
    return cached["event"] == (day["calendar_mode"] == "event")


def due_phases(hass, record, when, errors=None):
    result = []
    for day in day_definitions(record):
        kind = day["id"]
        settings = record["settings"]["types"].get(kind, {})
        if not settings.get("enabled"):
            continue
        try:
            if settings["time"] == when.strftime("%H:%M") and day_matches(hass, record, kind, when):
                result.append((kind, "wake", when.date().isoformat()))
            sunrise = sunrise_minutes(record, kind)
            if record["binding"]["lights"] and sunrise:
                target = when + timedelta(minutes=sunrise)
                if target.date() == when.date() and settings["time"] == target.strftime("%H:%M") and day_matches(hass, record, kind, target):
                    result.append((kind, "sunrise", target.date().isoformat()))
        except AccessError as err:
            if errors is None:
                raise
            errors.append(str(err))
    return result


async def play_speaker(hass, entry, record, owner, source):
    binding = record["binding"]
    allowed_entity(hass, owner, None, source, "media_player")
    from homeassistant.components.frontend.storage import async_user_store
    store = await async_user_store(hass, owner.id)
    selected = selection_from(store, binding["alarm_id"])
    # Read the radio record directly as well: older supported Music Manager
    # versions retain only Apple fields in selection_from().
    choices = store.data.get(SELECTION_KEY, {})
    raw = choices.get(binding["alarm_id"]) if isinstance(choices, dict) else None
    radio = None
    if isinstance(raw, dict) and raw.get("kind") == "radio":
        uri, title = raw.get("uri"), raw.get("title")
        if (not isinstance(uri, str) or not re.fullmatch(r"media-source://radio_browser/[a-zA-Z0-9_-]{1,128}", uri)
            or raw.get("media_content_id", uri) != uri or not isinstance(title, str) or not title.strip()):
            raise AccessError("invalid_favorite", "Bitte den gespeicherten Radiosender neu auswählen.")
        radio = {"media_content_id": uri, "media_content_type": "music", "extra": {"title": title[:500]}}
    context = Context(user_id=owner.id)
    mass = account = target = None
    policy = playback_policy(record)
    if policy["mode"] == "track_end" and (radio is not None or not selected or selected.get("media_type") != "track"):
        raise AccessError("invalid_config", "Für Radio oder die letzte Wiedergabe bitte eine feste Weckmusik-Dauer wählen.")
    if selected is not None and radio is None:
        mass, account, target = await apple_target(hass, music_entry_for(hass), {"source_entity": source}, owner)
        uri = validate_uri(selected.get("uri"), account["provider_id"])
        if selected.get("media_type") not in ("track", "album", "playlist") or not uri.startswith(f"{account['provider_id']}://{selected['media_type']}/"):
            raise AccessError("invalid_favorite", "Bitte die gespeicherte Weckmusik neu auswählen.")
        player = mass.players.get(target.unique_id)
        if not player or not value(player, "available", False):
            raise AccessError("player_unavailable", "Eine Musikbox ist in Music Assistant nicht erreichbar.")
    token = uuid.uuid4().hex
    pending = {"source": source, "owner_id": owner.id, "token": token,
               "at": (dt_util.utcnow() + timedelta(minutes=policy["minutes"] if policy["mode"] == "duration" else 5)).isoformat()}
    if mass:
        queue = mass.player_queues.get(target.unique_id)
        previous = value(queue, "repeat_mode", "off") if queue else "off"
        previous = getattr(previous, "value", previous)
        pending.update(queue_id=target.unique_id, restore_repeat=previous if previous in ("off", "one", "all") else "off")
    async with runtime(hass)["lock"]:
        current = entry.options.get(KEY, {}).get(binding["alarm_id"])
        if not current or current["binding"]["card_id"] != binding["card_id"]:
            return
        old = next((item for item in current.get("stops", []) if item["source"] == source and item.get("queue_id") == pending.get("queue_id")), None)
        if old and "restore_repeat" in old:
            pending["restore_repeat"] = old["restore_repeat"]
        save_record(hass, entry, binding["alarm_id"], {**current, "stops": [item for item in current.get("stops", []) if item["source"] != source] + [pending]}, notify=False)
    schedule_music_stop(hass, binding["alarm_id"])
    attempted = False
    try:
        if mass:
            await queue_repeat(mass, target.unique_id, "one" if policy["mode"] == "duration" else "off")
        await hass.services.async_call("media_player", "volume_set", {"entity_id": source, "volume_level": record["settings"]["volume"] / 100}, blocking=True, context=context)
        attempted = True
        if radio is not None:
            await hass.services.async_call("media_player", "play_media", {"entity_id": source, **radio}, blocking=True, context=context)
        elif selected is None:
            await hass.services.async_call("media_player", "media_play", {"entity_id": source}, blocking=True, context=context)
        else:
            await mass.player_queues.play_media(queue_id=target.unique_id, media=uri, option="replace", radio_mode=False, user=account["ma_user_id"])
            await queue_repeat(mass, target.unique_id, "one" if policy["mode"] == "duration" else "off")
    except Exception:
        # Undo a partial start. Keep the deadline only if cleanup also fails.
        try:
            if attempted:
                allowed_entity(hass, owner, None, source, "media_player")
                await hass.services.async_call("media_player", "media_stop", {"entity_id": source}, blocking=True, context=context)
            if mass:
                await queue_repeat(mass, target.unique_id, pending["restore_repeat"])
            async with runtime(hass)["lock"]:
                current = entry.options.get(KEY, {}).get(binding["alarm_id"])
                if current and current["binding"]["card_id"] == binding["card_id"]:
                    save_record(hass, entry, binding["alarm_id"], {**current, "stops": [item for item in current.get("stops", []) if item.get("token") != token]}, notify=False)
            schedule_music_stop(hass, binding["alarm_id"])
        except Exception:
            pass
        raise
    async with runtime(hass)["lock"]:
        current = entry.options[KEY][binding["alarm_id"]]
        remaining = []
        for item in current.get("stops", []):
            if item.get("token") == token:
                if policy["mode"] == "track_end":
                    continue  # A single-item queue with repeat off ends natively.
                item = {**item, "at": (dt_util.utcnow() + timedelta(minutes=policy["minutes"])).isoformat()}
            remaining.append(item)
        save_record(hass, entry, binding["alarm_id"], {**current, "stops": remaining}, notify=False)
    schedule_music_stop(hass, binding["alarm_id"])


async def execute(hass, entry, record, owner, kind, phase):
    binding = record["binding"]
    context = Context(user_id=owner.id)
    tasks = []
    scene_id = binding.get("hue_scene", "")
    covered = hue_scenes.covered_lights(hass, binding["lights"], scene_id) if scene_id else set()

    async def light_action(item):
        state = allowed_entity(hass, owner, None, item["entity_id"], "light")
        if item.get("hue_scene"):
            bridge, actions = checked_light_scene(hass, owner, None, item["hue_scene"], item["entity_id"])
            if phase == "sunrise":
                for member, (_, action) in actions.items():
                    light = allowed_entity(hass, owner, None, member, "light")
                    if getattr(getattr(action, "on", None), "on", True) and set(light.attributes.get("supported_color_modes", [])) - {"onoff", "unknown"}:
                        await hass.services.async_call("light", "turn_on", {"entity_id": member, "brightness_pct": 1}, blocking=True, context=context)
                await asyncio.sleep(1)
                bridge, actions = checked_light_scene(hass, owner, None, item["hue_scene"], item["entity_id"])
            await hue_scenes.apply_light_actions(bridge, actions, sunrise_minutes(record, kind) * 60 - 1 if phase == "sunrise" else None)
            return
        modes = state.attributes.get("supported_color_modes", [])
        if phase == "sunrise" and set(modes) <= {"onoff", "unknown"}:
            return
        data = {"entity_id": item["entity_id"]}
        if set(modes) - {"onoff", "unknown"}:
            data["brightness_pct"] = 1 if phase == "sunrise" else item["brightness"]
        if item["color_mode"] == "temperature":
            data["color_temp_kelvin"] = item["kelvin"]
        elif item["color_mode"] == "colour":
            data["rgb_color"] = item["rgb"]
        await hass.services.async_call("light", "turn_on", data, blocking=True, context=context)
        if phase == "sunrise":
            await asyncio.sleep(1)
            # Recheck device permissions after the delayed second command.
            allowed_entity(hass, owner, None, item["entity_id"], "light")
            await hass.services.async_call("light", "turn_on", {**data, "brightness_pct": item["brightness"], "transition": sunrise_minutes(record, kind) * 60 - 1}, blocking=True, context=context)

    async def cover_action(item):
        allowed_entity(hass, owner, None, item["entity_id"], "cover")
        await hass.services.async_call("cover", "set_cover_position", item, blocking=True, context=context)

    async def scene_action():
        checked = checked_hue_scene(hass, owner, None, scene_id, binding["lights"])
        data = {"entity_id": scene_id}
        if phase == "sunrise":
            for item in binding["lights"]:
                if item["entity_id"] in checked:
                    state = allowed_entity(hass, owner, None, item["entity_id"], "light")
                    if set(state.attributes.get("supported_color_modes", [])) - {"onoff", "unknown"}:
                        await hass.services.async_call("light", "turn_on", {"entity_id": item["entity_id"], "brightness_pct": 1}, blocking=True, context=context)
            await asyncio.sleep(1)
            checked_hue_scene(hass, owner, None, scene_id, binding["lights"])
            data["transition"] = sunrise_minutes(record, kind) * 60 - 1
        await hass.services.async_call("scene", "turn_on", data, blocking=True, context=context)

    for item in binding["lights"]:
        if not covered or item["entity_id"] not in covered:
            tasks.append(light_action(item))
    if scene_id:
        tasks.append(scene_action())
    if phase == "wake":
        tasks += [cover_action(item) for item in binding["covers"]]
        if record["settings"]["types"][kind]["music"]:
            tasks += [play_speaker(hass, entry, record, owner, source) for source in binding["speakers"]]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    failures = [result for result in results if isinstance(result, Exception)]
    if failures:
        # Don't log upstream exceptions: provider errors can contain private data.
        raise AccessError("device_error", f"{len(failures)} Weckaktion(en) fehlgeschlagen. Geräte, Verbindung und Berechtigungen prüfen.")


async def stop_due(hass, entry, alarm_id, record, owner):
    pending = record.get("stops", [])
    now = dt_util.utcnow()
    due = [item for item in pending if datetime.fromisoformat(item["at"]) <= now]
    if not due:
        return
    for item in due:
        current = entry.options.get(KEY, {}).get(alarm_id)
        if not current or current["binding"]["card_id"] != record["binding"]["card_id"] or item not in current.get("stops", []):
            continue
        owner_id, source = item.get("owner_id", owner.id), item["source"]
        stop_owner = await alarm_owner(hass, {"ha_user_id": owner_id}, None)
        allowed_entity(hass, stop_owner, None, source, "media_player")
        if not item.get("stopped"):
            await hass.services.async_call("media_player", "media_stop", {"entity_id": source}, blocking=True, context=Context(user_id=stop_owner.id))
            stopped = {**item, "stopped": True}
            async with runtime(hass)["lock"]:
                current = entry.options[KEY][alarm_id]
                save_record(hass, entry, alarm_id, {**current, "stops": [stopped if pending == item else pending for pending in current.get("stops", [])]}, notify=False)
            item = stopped
        if item.get("queue_id"):
            mass, _, target = await apple_target(hass, music_entry_for(hass), {"source_entity": source}, stop_owner)
            if target.unique_id != item["queue_id"]:
                raise AccessError("binding_changed", "Die Wecker-Box wurde geändert.")
            await queue_repeat(mass, target.unique_id, item.get("restore_repeat", "off"))
        async with runtime(hass)["lock"]:
            current = entry.options[KEY][alarm_id]
            save_record(hass, entry, alarm_id, {**current, "stops": [pending for pending in current.get("stops", []) if pending != item]}, notify=False)
    schedule_music_stop(hass, alarm_id)


async def tick(hass, when):
    from .card_setups import KEY as SETUPS, synchronize_saved_setups
    entry = entry_for(hass)
    if entry.options.get(SETUPS):
        try:
            await synchronize_saved_setups(hass)
        except AccessError:
            pass
    when = dt_util.as_local(when)
    for alarm_id, original in list(entry.options.get(KEY, {}).items()):
        card_id = original["binding"]["card_id"]
        if card_id in runtime(hass)["busy"]:
            continue
        runtime(hass)["busy"].add(card_id)
        try:
            _, record, owner = await checked_record(hass, None, alarm_id, card_id)
            await stop_due(hass, entry, alarm_id, record, owner)
            candidates = any(item.get("enabled") and (item["time"] == when.strftime("%H:%M") or sunrise_minutes(record, kind) and item["time"] == (when + timedelta(minutes=sunrise_minutes(record, kind))).strftime("%H:%M")) for kind, item in record["settings"]["types"].items())
            if candidates:
                await prepare_calendars(hass, record, owner, when, force=True)
            calendar_errors = []
            for kind, phase, date in due_phases(hass, record, when, calendar_errors):
                run_id = f"{date}/{kind}/{phase}"
                async with runtime(hass)["lock"]:
                    _, current, owner = await checked_record(hass, None, alarm_id, card_id)
                    if run_id in current.get("runs", {}) or (kind, phase, date) not in due_phases(hass, current, when, calendar_errors):
                        continue
                    runs = {key: val for key, val in current.get("runs", {}).items() if key[:10] >= (when.date() - timedelta(days=2)).isoformat()}
                    runs[run_id] = True
                    current = {**current, "runs": runs}
                    save_record(hass, entry, alarm_id, current, notify=False)
                await execute(hass, entry, current, owner, kind, phase)
                runtime(hass)["errors"].pop(card_id, None)
                hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
            if calendar_errors:
                runtime(hass)["errors"][card_id] = " ".join(dict.fromkeys(calendar_errors))
                hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
        except AccessError as err:
            runtime(hass)["errors"][card_id] = str(err)
            hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
        except Exception:
            runtime(hass)["errors"][card_id] = "Der Wecker konnte nicht ausgeführt werden. Bitte Geräte und Verbindung prüfen."
            _LOGGER.warning("Wake-up card action failed; check device availability and permissions")
        finally:
            runtime(hass)["busy"].discard(card_id)


def async_setup_wake_cards(hass):
    """Attach once per integration load; all schedules execute without a browser."""
    state = runtime(hass)
    entry = entry_for(hass)
    templates, cards, changed = shared_days.migrate(entry.options)
    if changed or templates != entry.options.get(shared_days.LIBRARY, {}):
        commit_shared(hass, entry, templates, cards, changed)
    for alarm_id in cards:
        schedule_music_stop(hass, alarm_id)
    if not state.get("unsubscribe"):
        async def scheduled_tick(when):
            await tick(hass, when)
        state["unsubscribe"] = async_track_time_change(hass, scheduled_tick, second=0)
    from .card_setups import attach_dashboard_listener
    attach_dashboard_listener(hass)


def async_unload_wake_cards(hass):
    state = hass.data.get(RUNTIME, {})
    for cancel in state.pop("stop_timers", {}).values():
        cancel()
    if unsubscribe := state.pop("unsubscribe", None):
        unsubscribe()
    for key in ("dashboard_unsubscribe", "started_unsubscribe"):
        if unsubscribe := state.pop(key, None):
            unsubscribe()
