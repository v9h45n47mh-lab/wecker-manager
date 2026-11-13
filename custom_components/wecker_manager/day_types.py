"""User-defined day policies, with backwards-compatible built-in templates."""
from copy import deepcopy
import re

from ..music_manager.access import AccessError

DAY_ID = re.compile(r"[a-z0-9][a-z0-9_]{0,63}\Z")
ICON = re.compile(r"mdi:[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def legacy_days(calendar=""):
    return [
        {"id": "schultag", "name": "Schultag", "icon": "mdi:school", "weekdays": [0, 1, 2, 3, 4], "music_mode": "always", "confirm_disable": True, "calendar_entity": calendar},
        {"id": "wochenende", "name": "Wochenende", "icon": "mdi:weather-sunny", "weekdays": [5, 6], "music_mode": "switchable", "confirm_disable": False, "calendar_entity": ""},
        {"id": "ferien", "name": "Ferien / schulfrei", "icon": "mdi:palm-tree", "weekdays": [0, 1, 2, 3, 4], "music_mode": "switchable", "confirm_disable": False, "calendar_entity": calendar},
    ]


def day_definitions(record):
    return deepcopy(record.get("days", legacy_days(record["binding"].get("calendar_entity", ""))))


def validate_days(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
        raise AccessError("invalid_config", "Bitte einen bis zwölf Tagestypen anlegen.")
    result, identifiers = [], set()
    fields = {"id", "name", "icon", "weekdays", "music_mode", "confirm_disable", "calendar_entity"}
    for item in raw:
        if not isinstance(item, dict) or set(item) != fields:
            raise AccessError("invalid_config", "Die Angaben für einen Tagestyp sind unvollständig.")
        if not isinstance(item["id"], str) or not DAY_ID.fullmatch(item["id"]) or item["id"] in identifiers:
            raise AccessError("invalid_config", "Jeder Tagestyp benötigt eine eigene Kennung.")
        if not isinstance(item["name"], str) or not 1 <= len(item["name"].strip()) <= 60:
            raise AccessError("invalid_config", "Bitte einen Namen mit höchstens 60 Zeichen vergeben.")
        if not isinstance(item["icon"], str) or len(item["icon"]) > 80 or not ICON.fullmatch(item["icon"]):
            raise AccessError("invalid_config", "Bitte ein gültiges Symbol auswählen.")
        weekdays = item["weekdays"]
        if not isinstance(weekdays, list) or not 1 <= len(weekdays) <= 7 or any(type(n) is not int or not 0 <= n <= 6 for n in weekdays) or len(set(weekdays)) != len(weekdays):
            raise AccessError("invalid_config", "Bitte mindestens einen gültigen Wochentag auswählen.")
        if item["music_mode"] not in ("always", "switchable") or type(item["confirm_disable"]) is not bool:
            raise AccessError("invalid_config", "Musik und Ausschaltbestätigung bitte vollständig festlegen.")
        calendar = item["calendar_entity"]
        if not isinstance(calendar, str) or calendar and not re.fullmatch(r"calendar\.[a-z0-9_]+", calendar):
            raise AccessError("invalid_config", "Bitte einen Kalender auswählen oder die Kalenderprüfung ausschalten.")
        identifiers.add(item["id"])
        result.append({**deepcopy(item), "name": item["name"].strip(), "weekdays": sorted(weekdays)})
    return result


def calendar_mode(kind):
    return "no_event" if kind == "schultag" else "event"


def default_type(day):
    time = "09:00" if day["weekdays"] == [5, 6] else "06:00"
    return {"time": time, "enabled": False, "music": day["music_mode"] == "always", "presets": [], "calendar_mode": calendar_mode(day["id"])}


def settings_for_days(record, days=None):
    """Keep times for unchanged IDs; new types always start disabled."""
    days = day_definitions(record) if days is None else days
    settings = deepcopy(record["settings"])
    old_types = settings["types"]
    settings["types"] = {}
    for day in days:
        item = deepcopy(old_types.get(day["id"], default_type(day)))
        item.setdefault("calendar_mode", calendar_mode(day["id"]))
        if day["music_mode"] == "always":
            item["music"] = True
        settings["types"][day["id"]] = item
    return settings
