"""Shared calendar/day definitions; alarm times and controls stay per card."""
from copy import deepcopy
import hashlib
import json
import uuid

from ..music_manager.access import AccessError
from .day_types import day_definitions, settings_for_days

LIBRARY = "day_templates"
COMMON = ("name", "icon", "weekdays", "calendar_entity", "calendar_mode")


def common(day):
    return {key: deepcopy(day[key]) for key in COMMON}


def template_id(day):
    value = json.dumps(common(day), sort_keys=True, ensure_ascii=False)
    return "day_" + hashlib.sha256(value.encode()).hexdigest()[:24]


def migrate(options):
    """Link existing definitions without changing local IDs, times or policies."""
    templates = deepcopy(options.get(LIBRARY, {}))
    cards = deepcopy(options.get("wake_cards", {}))
    changed = []
    for alarm_id, record in cards.items():
        days = day_definitions(record)
        modified = False
        for day in days:
            key = day.get("template_id")
            if not key:
                key = template_id(day)
                if key in templates and common(templates[key]) != common(day):
                    key = "day_" + uuid.uuid4().hex
                day["template_id"] = key
                modified = True
            if key not in templates:
                templates[key] = {"id": key, **common(day), "revision": 1}
            day["template_revision"] = templates[key]["revision"]
        if modified:
            # Keep a legacy holiday without a calendar paused on first migration.
            settings = settings_for_days(record, days)
            if "days" not in record and not record["binding"].get("calendar_entity") and "ferien" in settings["types"]:
                settings["types"]["ferien"]["enabled"] = False
            record.update(days=days, settings=settings, revision=record["revision"] + 1)
            changed.append(alarm_id)
    return templates, cards, changed


def apply(templates, cards, alarm_id, record, days):
    """Stage shared edits and every linked card as one configuration write."""
    templates, cards, days = deepcopy(templates), deepcopy(cards), deepcopy(days)
    edits = {}
    for day in days:
        key = day.get("template_id") or template_id(day)
        previous = templates.get(key)
        if previous and common(previous) != common(day):
            if not day.get("template_id"):
                key = "day_" + uuid.uuid4().hex
                previous = None
            elif day.get("template_revision") != previous["revision"]:
                raise AccessError("conflict", "Dieser gemeinsame Tagestyp wurde auf einer anderen Karte geändert. Bitte erneut laden.")
        if key in edits and common(edits[key]) != common(day):
            raise AccessError("invalid_config", "Derselbe gemeinsame Tagestyp besitzt widersprüchliche Regeln.")
        revision = previous["revision"] if previous else 0
        if not previous or common(previous) != common(day):
            revision += 1
        edits[key] = {"id": key, **common(day), "revision": revision}
        day.update(template_id=key, template_revision=revision)
    templates.update(edits)
    cards[alarm_id] = {**deepcopy(record), "days": days, "settings": settings_for_days(record, days)}
    changed = {alarm_id}
    for other_id, other in cards.items():
        if other_id == alarm_id:
            continue
        other_days = day_definitions(other)
        modified = False
        for day in other_days:
            shared = edits.get(day.get("template_id"))
            if shared and (common(day) != common(shared) or day.get("template_revision") != shared["revision"]):
                day.update(common(shared), template_revision=shared["revision"])
                modified = True
        if modified:
            other.update(days=other_days, settings=settings_for_days(other, other_days), revision=other["revision"] + 1)
            changed.add(other_id)
    return templates, cards, changed
