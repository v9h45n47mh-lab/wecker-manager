"""Describe failed actions without exposing upstream exception bodies."""
import json
import logging
from pathlib import PurePath

from homeassistant.util import dt as dt_util

from ..music_manager.access import AccessError
from .day_types import day_definitions

_LOGGER = logging.getLogger(__name__)


def action_failure(hass, entity_id, action, error, playback=None):
    state = hass.states.get(entity_id)
    name = state.attributes.get("friendly_name") if state else None
    error_type = type(error).__name__
    if isinstance(error, AccessError):
        # This exception explicitly carries a message intended for the user.
        code, message = error.code, str(error)
    elif error_type == "MediaNotFoundError":
        code, message = "media_not_found", "Music Assistant hat die gewählte Weckmusik nicht gefunden. Bitte die Weckmusik in dieser Weckerkarte neu auswählen und testen."
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
    result = {"entity_id": entity_id, "name": str(name or entity_id)[:160],
              "action": action, "code": code, "message": message,
              "error_type": error_type}
    if playback:
        result["playback"] = dict(playback)
    return result


def log_action_failure(record, kind, phase, failure, error):
    """Log each failed action, retaining frames but never raw upstream messages."""
    trace, seen = [], set()
    while error is not None and id(error) not in seen and len(trace) < 8:
        seen.add(id(error))
        frames, tb = [], error.__traceback__
        while tb is not None:
            code = tb.tb_frame.f_code
            frames.append(f"{PurePath(code.co_filename).name}:{tb.tb_lineno} ({code.co_name})")
            tb = tb.tb_next
        trace.append({"error_type": type(error).__name__, "frames": frames[-24:]})
        error = error.__cause__ or (None if error.__suppress_context__ else error.__context__)
    binding = record["binding"]
    _LOGGER.error("Weckaktion fehlgeschlagen: %s", json.dumps({
        "alarm_id": binding["alarm_id"], "card_id": binding["card_id"],
        "day_type": kind, "phase": phase, **failure, "trace": trace,
    }, ensure_ascii=False))


def failure_report(record, kind, phase, failures):
    day = next((day for day in day_definitions(record) if day["id"] == kind), {})
    count = len(failures)
    return {"at": dt_util.utcnow().isoformat(), "kind": kind, "phase": phase,
            "day_name": day.get("display_name") or day.get("name", kind),
            "summary": f"{count} Weckaktion{'en' if count != 1 else ''} fehlgeschlagen.",
            "failures": failures}
