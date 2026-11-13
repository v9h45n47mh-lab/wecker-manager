"""Universal wake-up cards: immutable devices, persisted times, server execution."""

import asyncio
from copy import deepcopy
from datetime import date, datetime, timedelta
import logging
import re
from types import SimpleNamespace

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.core import Context
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from ..music_manager.access import AccessError, account_for, checked_account, sonos_uid, validate_uri, value
from ..music_manager.alarms import ALARM_ID, alarm_owner, apple_target, selection_from
from ..music_manager.const import CONF_ACCOUNTS, CONF_ALARMS
from .const import DOMAIN, MUSIC_DOMAIN
from .day_types import legacy_days, day_definitions, validate_days, settings_for_days, calendar_mode
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
    return {key: binding.get(key) for key in ("card_id", "alarm_id", "owner_id", "speakers", "covers", "lights", "calendar_entity", "sunrise_minutes")}


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
            "settings": settings, "days": day_definitions(record), "revision": record["revision"],
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
        if item.get("calendar_mode", calendar_mode(kind)) not in ("event", "no_event"):
            raise AccessError("invalid_config", "Bitte Termin vorhanden oder kein ganztägiger Termin auswählen.")
        result["types"][kind] = {**deepcopy(item), "calendar_mode": item.get("calendar_mode", calendar_mode(kind))}
        if "sunrise_minutes" in item:
            result["types"][kind]["sunrise_minutes"] = integer(item["sunrise_minutes"], 0, 30)
    return result


async def catalog(hass, caller, owner_id=None):
    require_admin(caller)
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
                                       "description": state.entity_id, "attributes": {k: state.attributes[k] for k in ("supported_color_modes", "min_color_temp_kelvin", "max_color_temp_kelvin", "supported_features") if k in state.attributes}})
    for items in devices.values():
        items.sort(key=lambda item: item["label"].casefold())
    return {"accounts": accounts, **devices}


async def create_card(hass, caller, config):
    require_admin(caller)
    if not isinstance(config, dict) or set(config) - {"card_id", "alarm_id", "owner_id", "speakers", "covers", "lights", "calendar_entity", "sunrise_minutes", "replace_automation", "days"}:
        raise AccessError("invalid_config", "Die Kartenkonfiguration ist ungültig.")
    card_id, alarm_id = identifier(config.get("card_id")), identifier(config.get("alarm_id"))
    entry = entry_for(hass)
    async with runtime(hass)["lock"]:
        existing = entry.options.get(KEY, {}).get(alarm_id)
        if existing and card_id in existing.get("retired_card_ids", []):
            raise AccessError("card_replaced", "Diese Karte wurde ersetzt. Bitte eine neue Weckerkarte anlegen.")
        if any(key != alarm_id and item["binding"]["card_id"] == card_id for key, item in entry.options.get(KEY, {}).items()):
            raise AccessError("invalid_config", "Diese Kartenkennung wird bereits verwendet. Bitte eine neue Karte anlegen.")
        if existing and existing["binding"]["card_id"] == card_id:
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
            if not isinstance(item, dict) or set(item) - {"entity_id", "brightness", "color_mode", "kelvin", "rgb"}:
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
        # A recreated card replaces the old card for this alarm ID, so only one executes.
        settings = deepcopy(existing["settings"]) if existing else default_settings(hass, alarm_id)
        settings["sunrise_minutes"] = (sunrise_minutes(existing) if existing else sunrise) if checked_lights else 0
        days = validate_days(config.get("days", day_definitions(existing) if existing else legacy_days(calendar)))
        for day in days:
            if day["calendar_entity"]:
                allowed_entity(hass, owner, caller, day["calendar_entity"], "calendar", control=False)
        settings = settings_for_days({"binding": binding, "settings": settings}, days)
        if not has_dimmable_light(hass, binding):
            settings["sunrise_minutes"] = 0
            for item in settings["types"].values():
                item["sunrise_minutes"] = 0
        retired = list(existing.get("retired_card_ids", [])) + [existing["binding"]["card_id"]] if existing else []
        record = {"binding": binding, "account": deepcopy(account), "days": days, "settings": settings, "revision": 1,
                  "runs": deepcopy(existing.get("runs", {})) if existing else {}, "retired_card_ids": retired,
                  "stops": deepcopy(existing.get("stops", [])) if existing else []}
        alarms = [a for a in music_entry.options.get(CONF_ALARMS, []) if a.get("alarm_id") != alarm_id]
        alarms.append({"alarm_id": alarm_id, "ha_user_id": owner.id, "source_entity": speakers[0]})
        cards = dict(entry.options.get(KEY, {}))
        cards[alarm_id] = record
        hass.config_entries.async_update_entry(music_entry, options={**music_entry.options, CONF_ALARMS: alarms})
        hass.config_entries.async_update_entry(entry, options={**entry.options, KEY: cards})
        hass.bus.async_fire(EVENT, {"alarm_id": alarm_id})
        return snapshot(hass, record)


async def update_card(hass, caller, alarm_id, card_id, settings, revision, confirm_disable=None):
    async with runtime(hass)["lock"]:
        entry, record, _ = await checked_record(hass, caller, alarm_id, card_id)
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
        updated = {**record, "settings": validated, "revision": record["revision"] + 1}
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
        save_record(hass, entry, alarm_id, updated)
        return snapshot(hass, updated)


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


async def tomorrow_info(hass, caller, alarm_id, card_id):
    _, record, owner = await checked_record(hass, caller, alarm_id, card_id)
    when = (dt_util.as_local(dt_util.utcnow()) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    await prepare_calendars(hass, record, owner, when, caller, include_disabled=True)
    matches, failed = [], False
    for day in day_definitions(record):
        try:
            if day_matches(hass, record, day["id"], when):
                matches.append(day)
        except AccessError:
            failed = True
    if not matches:
        label = "Morgen: Kalender nicht erreichbar" if failed else "Morgen: kein passender Tagestyp"
    elif len(matches) == 1:
        day = matches[0]
        defaults = {"schultag": "Schultag", "wochenende": "Wochenende", "ferien": "Ferien / schulfrei"}
        label = ("Morgen ist schulfrei" if day["id"] == "ferien" else "Morgen ist " + day["name"]) if day["name"] == defaults.get(day["id"]) else "Morgen: " + day["name"]
    else:
        label = "Morgen: " + ", ".join(day["name"] for day in matches)
    if matches and failed:
        label += " · Kalenderprüfung offen"
    return {"date": when.date().isoformat(), "kind": matches[0]["id"] if len(matches) == 1 else None,
            "types": [day["id"] for day in matches], "label": label}


@websocket_api.websocket_command({
    vol.Required("type"): "wecker_manager/card",
    vol.Required("action"): vol.In(["catalog", "get", "create", "update", "day_info", "configure_days"]),
    vol.Optional("alarm_id"): str,
    vol.Optional("card_id"): str,
    vol.Optional("owner_id"): str,
    vol.Optional("config"): dict,
    vol.Optional("settings"): dict,
    vol.Optional("revision"): int,
    vol.Optional("days"): list,
    vol.Optional("confirm_disable"): list,
})
@websocket_api.async_response
async def websocket_wake_card(hass, connection, msg):
    try:
        async with asyncio.timeout(45):
            action = msg["action"]
            if action == "catalog":
                result = await catalog(hass, connection.user, msg.get("owner_id"))
            elif action == "day_info":
                result = await tomorrow_info(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"))
            elif action == "configure_days":
                result = await configure_days(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("days"), msg.get("revision"), msg.get("confirm_disable"))
            elif action == "create":
                result = await create_card(hass, connection.user, msg.get("config"))
            elif action == "update":
                result = await update_card(hass, connection.user, msg.get("alarm_id"), msg.get("card_id"), msg.get("settings"), msg.get("revision"), msg.get("confirm_disable"))
            else:
                alarm_id, card_id = identifier(msg.get("alarm_id")), identifier(msg.get("card_id"))
                entry = entry_for(hass)
                record = entry.options.get(KEY, {}).get(alarm_id)
                if record and card_id in record.get("retired_card_ids", []):
                    raise AccessError("card_replaced", "Diese Karte wurde ersetzt. Bitte eine neue Weckerkarte anlegen.")
                if not record or record["binding"]["card_id"] != card_id:
                    require_admin(connection.user)
                    result = {"exists": False, "can_create": True, "replaces_card": bool(record)}
                else:
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
    settings = record["settings"]["types"][kind]
    return cached["event"] == (settings.get("calendar_mode", calendar_mode(kind)) == "event")


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
    context = Context(user_id=owner.id)
    mass = account = target = None
    if selected is not None:
        mass, account, target = await apple_target(hass, music_entry_for(hass), {"source_entity": source}, owner)
        uri = validate_uri(selected.get("uri"), account["provider_id"])
        if selected.get("media_type") not in ("track", "album", "playlist") or not uri.startswith(f"{account['provider_id']}://{selected['media_type']}/"):
            raise AccessError("invalid_favorite", "Bitte die gespeicherte Weckmusik neu auswählen.")
        player = mass.players.get(target.unique_id)
        if not player or not value(player, "available", False):
            raise AccessError("player_unavailable", "Eine Musikbox ist in Music Assistant nicht erreichbar.")
    await hass.services.async_call("media_player", "volume_set", {"entity_id": source, "volume_level": record["settings"]["volume"] / 100}, blocking=True, context=context)
    if selected is None:
        await hass.services.async_call("media_player", "media_play", {"entity_id": source}, blocking=True, context=context)
    else:
        await mass.player_queues.play_media(queue_id=target.unique_id, media=uri, option="replace", user=account["ma_user_id"])


async def execute(hass, entry, record, owner, kind, phase):
    binding = record["binding"]
    context = Context(user_id=owner.id)
    tasks = []

    async def light_action(item):
        state = allowed_entity(hass, owner, None, item["entity_id"], "light")
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

    for item in binding["lights"]:
        tasks.append(light_action(item))
    if phase == "wake":
        tasks += [cover_action(item) for item in binding["covers"]]
        if record["settings"]["types"][kind]["music"]:
            # Persist the stop deadline before starting playback. It survives a restart.
            async with runtime(hass)["lock"]:
                current = entry.options.get(KEY, {}).get(binding["alarm_id"])
                if not current or current["binding"]["card_id"] != binding["card_id"]:
                    return
                pending = [item for item in current.get("stops", []) if item["source"] not in binding["speakers"]]
                stop_at = (dt_util.utcnow() + timedelta(minutes=5)).isoformat()
                pending += [{"source": source, "at": stop_at, "owner_id": owner.id} for source in binding["speakers"]]
                save_record(hass, entry, binding["alarm_id"], {**current, "stops": pending}, notify=False)
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
    async with runtime(hass)["lock"]:
        current = entry.options.get(KEY, {}).get(alarm_id)
        if not current or current["binding"]["card_id"] != record["binding"]["card_id"]:
            return
        save_record(hass, entry, alarm_id, {**current, "stops": [item for item in current.get("stops", []) if item not in due]}, notify=False)
    for owner_id, source in dict.fromkeys((item.get("owner_id", owner.id), item["source"]) for item in due):
        stop_owner = await alarm_owner(hass, {"ha_user_id": owner_id}, None)
        allowed_entity(hass, stop_owner, None, source, "media_player")
        await hass.services.async_call("media_player", "media_stop", {"entity_id": source}, blocking=True, context=Context(user_id=stop_owner.id))


async def tick(hass, when):
    entry = entry_for(hass)
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
    if not state.get("unsubscribe"):
        async def scheduled_tick(when):
            await tick(hass, when)
        state["unsubscribe"] = async_track_time_change(hass, scheduled_tick, second=0)


def async_unload_wake_cards(hass):
    state = hass.data.get(RUNTIME, {})
    if unsubscribe := state.pop("unsubscribe", None):
        unsubscribe()
