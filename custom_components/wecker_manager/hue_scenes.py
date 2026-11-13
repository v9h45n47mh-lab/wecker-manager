"""Resolve Hue scene scope from HA groups or the Hue integration's cached API."""
from homeassistant.helpers import entity_registry as er


def light_members(hass, entity_id, seen=None):
    seen = set() if seen is None else set(seen)
    if entity_id in seen or not isinstance(entity_id, str) or not entity_id.startswith("light."):
        return set()
    seen.add(entity_id)
    state = hass.states.get(entity_id)
    if not state:
        return set()
    children = state.attributes.get("entity_id")
    if isinstance(children, (list, tuple, set)) and children:
        result = set()
        for child in children:
            members = light_members(hass, child, seen)
            if not members:
                return set()
            result.update(members)
        return result
    return {entity_id} if not state.attributes.get("is_hue_group") else set()


def scene_members(hass, entity_id):
    registry = er.async_get(hass)
    entry = registry.async_get(entity_id)
    state = hass.states.get(entity_id)
    if not entry or entry.platform != "hue" or entry.disabled_by or not state or state.state == "unavailable" or "is_active" in state.attributes:
        return set()
    direct = state.attributes.get("entity_id")
    if isinstance(direct, (list, tuple, set)) and direct:
        return set(direct) if all(isinstance(item, str) and item.startswith("light.") for item in direct) else set()
    for group in hass.states.async_all():
        if not group.entity_id.startswith("light.") or not group.attributes.get("is_hue_group"):
            continue
        group_entry = registry.async_get(group.entity_id)
        if group_entry and getattr(entry, "device_id", None) and getattr(group_entry, "device_id", None) == entry.device_id and getattr(group_entry, "config_entry_id", None) == entry.config_entry_id:
            return light_members(hass, group.entity_id)
    # Hue grouped lights are disabled by default. Their cached bridge resources
    # still expose full membership, even when no HA group state is available.
    try:
        config = hass.config_entries.async_get_entry(entry.config_entry_id)
        api = config.runtime_data.api
        group = api.scenes.get_group(entry.unique_id)
        service = next(item for item in group.services if getattr(item.rtype, "value", item.rtype) == "grouped_light")
        resources = api.groups.grouped_light.get_lights(service.rid)
        result = set()
        for light in resources:
            member = registry.async_get_entity_id("light", "hue", light.id)
            if not member:
                return set()
            result.add(member)
        return result
    except (AttributeError, KeyError, StopIteration, TypeError):
        return set()


def covered_lights(hass, lights, scene_id):
    members = scene_members(hass, scene_id)
    selected = {item["entity_id"]: light_members(hass, item["entity_id"]) for item in lights}
    expanded = set().union(*selected.values()) if selected else set()
    if not members or not members <= expanded:
        return None
    if any(group & members and not group <= members for group in selected.values()):
        return None
    return {entity_id for entity_id, group in selected.items() if group and group <= members}
