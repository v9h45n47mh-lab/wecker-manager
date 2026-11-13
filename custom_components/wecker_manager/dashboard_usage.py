"""Read current dashboard references without deleting saved alarm programs."""

from collections import defaultdict

from ..music_manager.access import AccessError

CARD_TYPES = {"custom:wecker-manager-card", "custom:wecker-manager-status-card"}


def card_references(config):
    """Find cards inside sections, stacks, conditional cards and subviews."""
    for card in card_configs(config):
        alarm_id, card_id = card.get("alarm_id"), card.get("card_id")
        if isinstance(alarm_id, str) and isinstance(card_id, str):
            yield alarm_id, card_id


def card_configs(config):
    """Yield the original saved configuration, never an editor preview."""
    if isinstance(config, dict):
        if isinstance(config.get("type"), str) and config["type"] in CARD_TYPES:
            yield config
        for value in config.values():
            yield from card_configs(value)
    elif isinstance(config, list):
        for value in config:
            yield from card_configs(value)


async def saved_dashboards(hass, *, force=True):
    from homeassistant.components.lovelace.const import LOVELACE_DATA, ConfigNotFound

    data = hass.data.get(LOVELACE_DATA)
    dashboards = getattr(data, "dashboards", None)
    if dashboards is None:
        raise AccessError("usage_unavailable", "Die Dashboard-Verwendung konnte nicht geprüft werden. Bitte später erneut aktualisieren.")
    result = []
    for path, dashboard in list(dashboards.items()):
        try:
            config = await dashboard.async_load(force=force)
        except ConfigNotFound as error:
            # An automatic storage dashboard has no saved cards to inspect.
            if dashboard.mode != "yaml":
                continue
            raise AccessError("usage_unavailable", "Ein YAML-Dashboard konnte nicht geladen werden. Die Verwendung wurde nicht neu bewertet.") from error
        except Exception as error:
            raise AccessError("usage_unavailable", "Ein Dashboard konnte nicht geladen werden. Die Verwendung wurde nicht neu bewertet.") from error
        title = (dashboard.config or {}).get("title") or path or "Übersicht"
        result.append((title, config))
    return result


async def current_references(hass):
    references = defaultdict(set)
    for title, config in await saved_dashboards(hass):
        for key in card_references(config):
            references[key].add(title)
    return references
