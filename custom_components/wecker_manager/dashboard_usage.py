"""Read current dashboard references without deleting saved alarm programs."""

from collections import defaultdict

from ..music_manager.access import AccessError

CARD_TYPES = {"custom:wecker-manager-card", "custom:wecker-manager-status-card"}


def card_references(config):
    """Find cards inside sections, stacks, conditional cards and subviews."""
    if isinstance(config, dict):
        if isinstance(config.get("type"), str) and config["type"] in CARD_TYPES:
            alarm_id, card_id = config.get("alarm_id"), config.get("card_id")
            if isinstance(alarm_id, str) and isinstance(card_id, str):
                yield alarm_id, card_id
        for value in config.values():
            yield from card_references(value)
    elif isinstance(config, list):
        for value in config:
            yield from card_references(value)


async def current_references(hass):
    from homeassistant.components.lovelace.const import LOVELACE_DATA, ConfigNotFound

    data = hass.data.get(LOVELACE_DATA)
    dashboards = getattr(data, "dashboards", None)
    if dashboards is None:
        raise AccessError("usage_unavailable", "Die Dashboard-Verwendung konnte nicht geprüft werden. Bitte später erneut aktualisieren.")
    references = defaultdict(set)
    for path, dashboard in list(dashboards.items()):
        try:
            config = await dashboard.async_load(force=True)
        except ConfigNotFound as error:
            # An automatic storage dashboard has no saved cards to inspect.
            if dashboard.mode != "yaml":
                continue
            raise AccessError("usage_unavailable", "Ein YAML-Dashboard konnte nicht geladen werden. Die Verwendung wurde nicht neu bewertet.") from error
        except Exception as error:
            raise AccessError("usage_unavailable", "Ein Dashboard konnte nicht geladen werden. Die Verwendung wurde nicht neu bewertet.") from error
        title = (dashboard.config or {}).get("title") or path or "Übersicht"
        for key in card_references(config):
            references[key].add(title)
    return references
