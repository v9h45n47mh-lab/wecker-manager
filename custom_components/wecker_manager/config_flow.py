"""Set up the independently installed Wecker Manager."""
import probatio as vol
from homeassistant import config_entries
from .const import DOMAIN, MUSIC_DOMAIN

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        errors = {}
        if user_input is not None:
            if len(self.hass.data.get(MUSIC_DOMAIN, {})) != 1:
                errors["base"] = "music_manager_required"
            else:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title="Wecker Manager", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}), errors=errors)
