"""Describe failed actions without exposing upstream exception bodies."""
from homeassistant.util import dt as dt_util

from ..music_manager.access import AccessError
from .day_types import day_definitions


def action_failure(hass, entity_id, action, error):
    state = hass.states.get(entity_id)
    name = state.attributes.get("friendly_name") if state else None
    error_type = type(error).__name__
    if isinstance(error, AccessError):
        # This exception explicitly carries a message intended for the user.
        code, message = error.code, str(error)
    elif isinstance(error, PermissionError) or error_type in ("Unauthorized", "UnauthorizedError"):
        code, message = "unauthorized", "Der Gerätebefehl ist für diesen Benutzer nicht erlaubt."
    elif state and state.state == "unavailable":
        code, message = "unavailable", "Das Gerät ist nicht erreichbar. Verbindung und Integration prüfen."
    elif isinstance(error, TimeoutError):
        code, message = "timeout", "Das Gerät hat nicht rechtzeitig geantwortet."
    elif isinstance(error, (ConnectionError, OSError)):
        code, message = "connection_error", "Die Verbindung zum Gerät ist fehlgeschlagen."
    elif error_type == "ServiceNotFound":
        code, message = "service_unavailable", "Der benötigte Gerätebefehl ist nicht verfügbar."
    elif error_type == "ServiceValidationError":
        code, message = "invalid_service_data", "Die Geräteintegration hat die Befehlsparameter abgelehnt."
    else:
        code, message = "device_error", "Die Geräteintegration hat den Befehl nicht ausgeführt. Details im Home-Assistant-Protokoll prüfen."
    return {"entity_id": entity_id, "name": str(name or entity_id)[:160],
            "action": action, "code": code, "message": message,
            "error_type": error_type}


def failure_report(record, kind, phase, failures):
    day = next((day for day in day_definitions(record) if day["id"] == kind), {})
    count = len(failures)
    return {"at": dt_util.utcnow().isoformat(), "kind": kind, "phase": phase,
            "day_name": day.get("display_name") or day.get("name", kind),
            "summary": f"{count} Weckaktion{'en' if count != 1 else ''} fehlgeschlagen.",
            "failures": failures}
