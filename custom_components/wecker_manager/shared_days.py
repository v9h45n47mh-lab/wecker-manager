"""Shared calendar/day definitions; alarm times and controls stay per card."""
from copy import deepcopy
import hashlib
import json
import uuid

from ..music_manager.access import AccessError
from .day_types import day_definitions, settings_for_days

LIBRARY = "day_templates"
COMMON = ("name", "display_name", "icon", "weekdays", "calendar_entity", "calendar_mode")


def common(day):
    result = {key: deepcopy(day.get(key, day["name"]) if key == "display_name" else day[key]) for key in COMMON}
    result["name"] = result["name"].strip()
    result["display_name"] = result["display_name"].strip()
    result["weekdays"] = sorted(result["weekdays"])
    if not result["calendar_entity"]:
        result["calendar_mode"] = "no_event"
    return result


def signature(day):
    return json.dumps(common(day), sort_keys=True, ensure_ascii=False)


def template_id(day):
    value = signature(day)
    return "day_" + hashlib.sha256(value.encode()).hexdigest()[:24]


def migrate(options):
    """Link existing definitions without changing local IDs, times or policies."""
    templates = deepcopy(options.get(LIBRARY, {}))
    cards = deepcopy(options.get("wake_cards", {}))
    by_rule, aliases = {}, {}
    for key, template in list(templates.items()):
        template.update(common(template))
        rule = signature(template)
        if rule in by_rule:
            canonical = by_rule[rule]
            aliases[key] = canonical
            templates[canonical]["revision"] = max(templates[canonical]["revision"], template["revision"]) + 1
            del templates[key]
        else:
            by_rule[rule] = key
    names = set()
    for template in templates.values():
        original, count = template["name"], 1
        while template["name"].casefold() in names:
            count += 1
            template["name"] = original[:53] + f" ({count})"
        if template["name"] != original:
            template["revision"] += 1
        names.add(template["name"].casefold())
        by_rule[signature(template)] = template["id"]
    changed = []
    for alarm_id, record in cards.items():
        days = day_definitions(record)
        modified = False
        for day in days:
            old = deepcopy(day)
            key = aliases.get(day.get("template_id"), day.get("template_id"))
            if not key:
                key = by_rule.get(signature(day), template_id(day))
                if key in templates and common(templates[key]) != common(day):
                    key = "day_" + uuid.uuid4().hex
                day["template_id"] = key
                modified = True
            if key not in templates:
                templates[key] = {"id": key, **common(day), "revision": 1}
                by_rule[signature(day)] = key
                original, count = templates[key]["name"], 1
                while templates[key]["name"].casefold() in names:
                    count += 1
                    templates[key]["name"] = original[:53] + f" ({count})"
                names.add(templates[key]["name"].casefold())
                by_rule[signature(templates[key])] = key
            day.update(common(templates[key]))
            day["template_id"] = key
            day["template_revision"] = templates[key]["revision"]
            modified = modified or day != old
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
    used = set()
    for day in days:
        if not day.get("template_id") and alarm_id in cards:
            prior = next((item for item in day_definitions(cards[alarm_id]) if item["id"] == day["id"]), None)
            if prior and prior.get("template_id"):
                day.update(template_id=prior["template_id"], template_revision=prior["template_revision"])
        matching = next((key for key, item in templates.items() if signature(item) == signature(day)), None)
        key = day.get("template_id") or matching or template_id(day)
        if key not in templates and day.get("template_id"):
            if matching:
                key = matching
            else:
                raise AccessError("conflict", "Dieser gemeinsame Tagestyp wurde entfernt oder zusammengeführt. Bitte erneut laden.")
        if key in used:
            raise AccessError("invalid_config", "Ein gemeinsamer Tagestyp kann pro Karte nur einmal übernommen werden.")
        used.add(key)
        if any(other != key and item["name"].casefold() == day["name"].strip().casefold() for other, item in templates.items()):
            raise AccessError("name_in_use", "Dieser Name ist bereits vergeben. Bitte einen eindeutigen Namen wählen; der Anzeigename darf gleich sein.")
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
    templates, cards, merged = migrate({LIBRARY: templates, "wake_cards": cards})
    changed.update(merged)
    return templates, cards, changed
