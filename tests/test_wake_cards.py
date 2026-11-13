"""Immutable card provisioning, shared settings and unattended multi-device alarms."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib
import sys
import types
from types import SimpleNamespace as NS
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

import music_fixture as gateway_fixture
from music_fixture import load_gateway


class WakeCardTests(IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.gateway = load_gateway()
        core = types.ModuleType('homeassistant.core')
        core.Context = lambda **kw: NS(**kw)
        sys.modules[core.__name__] = core
        events = types.ModuleType('homeassistant.helpers.event')
        events.async_track_time_change = Mock(return_value=Mock())
        sys.modules[events.__name__] = events
        sys.modules['homeassistant.util'] = types.ModuleType('homeassistant.util')
        dt = types.ModuleType('homeassistant.util.dt')
        dt.utcnow = lambda: cls.now.astimezone(timezone.utc)
        dt.as_local = lambda value: value.astimezone(ZoneInfo('Europe/Berlin'))
        sys.modules[dt.__name__] = dt
        storage = types.ModuleType('homeassistant.components.frontend.storage')
        async def store(hass, user_id):
            return hass.user_stores[user_id]
        storage.async_user_store = store
        sys.modules[storage.__name__] = storage
        exceptions = types.ModuleType('homeassistant.exceptions')
        exceptions.HomeAssistantError = type('HomeAssistantError', (Exception,), {})
        exceptions.ConfigEntryNotReady = type('ConfigEntryNotReady', (Exception,), {})
        sys.modules[exceptions.__name__] = exceptions
        sys.modules['probatio'].Schema = lambda value: value
        from pathlib import Path
        spec=importlib.util.spec_from_file_location('custom_components.wecker_manager',Path(__file__).parents[1]/'custom_components/wecker_manager/__init__.py',submodule_search_locations=[str(Path(__file__).parents[1]/'custom_components/wecker_manager')])
        package=importlib.util.module_from_spec(spec)
        sys.modules[spec.name]=package
        spec.loader.exec_module(package)
        cls.wake = importlib.import_module('custom_components.wecker_manager.wake_cards')
        cls.events = events

    def fixture(self):
        type(self).now = datetime(2026, 11, 13, 6, 0, tzinfo=ZoneInfo('Europe/Berlin'))
        fixture = gateway_fixture.GatewayTests()
        fixture.gateway = self.gateway
        hass, conn, _, registry, permission = fixture.setup_gateway()
        owner = conn.user
        owner.name, owner.is_active, owner.system_generated, owner.is_admin = 'Maximilian', True, False, False
        admin = NS(id='admin', name='Manuel', is_active=True, system_generated=False, is_admin=True, permissions=owner.permissions)
        other = NS(id='ha-b', name='Paul', is_active=True, system_generated=False, is_admin=False, permissions=owner.permissions)
        users = {u.id:u for u in (owner, admin, other)}
        hass.auth = NS(async_get_user=AsyncMock(side_effect=users.get))
        hass.services = NS(async_call=AsyncMock(return_value={'calendar.school':{'events':[]}}))
        hass.bus = NS(async_fire=Mock())
        music_entry = hass.data['music_manager']['entry']
        entry = NS(options={'accounts':music_entry.options['accounts']},data={},entry_id='wecker-entry')
        hass.data['wecker_manager']={'wecker-entry':entry}
        def update(entry, *, options):
            entry.options = options
        hass.config_entries = NS(async_update_entry=Mock(side_effect=update))
        states = {}
        def state(entity_id, value='off', **attrs):
            states[entity_id] = NS(entity_id=entity_id, state=value, attributes={'friendly_name':entity_id, **attrs})
        state('media_player.sonos','idle')
        uid = 'RINCON_11223344556601400'
        registry['media_player.second'] = NS(entity_id='media_player.second',platform='sonos',unique_id=uid,disabled_by=None)
        registry['media_player.second_mass'] = NS(entity_id='media_player.second_mass',platform='music_assistant',unique_id=uid,config_entry_id='mass-entry',disabled_by=None)
        hass.mass.players[uid] = NS(available=True)
        state('media_player.second','idle')
        state('cover.one',supported_features=4)
        state('cover.two',supported_features=4)
        state('light.one',supported_color_modes=['color_temp'],min_color_temp_kelvin=2000,max_color_temp_kelvin=6500)
        state('light.two',supported_color_modes=['rgb'])
        state('calendar.school','off')
        state('automation.old','on')
        hass.states = NS(get=states.get,async_all=lambda:list(states.values()))
        hass.user_stores = {'ha-a':NS(data={'music_manager_alarm_music':{'m_wecker_schultag':{'uri':'apple_music--a://track/wake','media_type':'track','title':'Wake'}}})}
        config = {'card_id':'card_1','alarm_id':'m_wecker_schultag','owner_id':owner.id,
                  'speakers':['media_player.sonos','media_player.second'],
                  'covers':[{'entity_id':'cover.one','position':75},{'entity_id':'cover.two','position':100}],
                  'lights':[{'entity_id':'light.one','brightness':45,'color_mode':'temperature','kelvin':2700},
                            {'entity_id':'light.two','brightness':60,'color_mode':'colour','rgb':[250,120,30]}],
                  'calendar_entity':'calendar.school','sunrise_minutes':0}
        return hass, entry, owner, admin, other, config, states, permission

    async def activate(self,hass,admin,config,kind='schultag',time='06:00',volume=10):
        data=await self.wake.create_card(hass,admin,config)
        settings=deepcopy(data['settings'])
        settings['types'][kind].update(enabled=True,time=time,music=True)
        settings['volume']=volume
        return await self.wake.update_card(hass,admin,config['alarm_id'],config['card_id'],settings,data['revision'])

    async def test_creation_locks_all_devices_positions_colours_and_one_music_account(self):
        hass,entry,owner,admin,other,c,states,_=self.fixture()
        data=await self.wake.create_card(hass,admin,c)
        self.assertEqual(data['binding']['speakers'],c['speakers'])
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['account']['ha_user_id'],owner.id)
        self.assertEqual(data['binding']['covers'][0]['position'],75)
        for field,value in [('speakers',['media_player.second']),('owner_id',other.id),('covers',[]),('lights',[])]:
            with self.subTest(field=field),self.assertRaises(self.wake.AccessError):
                await self.wake.create_card(hass,admin,{**c,field:value})
        with self.assertRaises(self.wake.AccessError):
            await self.wake.create_card(hass,owner,c)
        with self.assertRaises(self.wake.AccessError):
            await self.wake.checked_record(hass,other,c['alarm_id'],c['card_id'])
        self.assertEqual(data['settings']['volume'],15)

    async def test_recreation_supersedes_the_old_card_and_cannot_reactivate_its_old_identity(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture()
        data=await self.activate(hass,admin,c)
        new={**c,'card_id':'card_2','covers':[{'entity_id':'cover.one','position':20}]}
        result=await self.wake.create_card(hass,admin,new)
        self.assertEqual(result['settings'],data['settings'])
        self.assertEqual(result['binding']['covers'][0]['position'],20)
        with self.assertRaises(self.wake.AccessError):
            await self.wake.checked_record(hass,owner,c['alarm_id'],c['card_id'])
        with self.assertRaises(self.wake.AccessError):
            await self.wake.create_card(hass,admin,c)

    async def test_multi_device_wake_uses_positions_light_settings_one_account_and_volume(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture()
        await self.activate(hass,admin,c,volume=5)
        await self.wake.tick(hass,self.now)
        calls=[(a.args[0],a.args[1],a.args[2]) for a in hass.services.async_call.await_args_list]
        self.assertIn(('cover','set_cover_position',{'entity_id':'cover.one','position':75}),calls)
        self.assertIn(('cover','set_cover_position',{'entity_id':'cover.two','position':100}),calls)
        self.assertIn(('light','turn_on',{'entity_id':'light.one','brightness_pct':45,'color_temp_kelvin':2700}),calls)
        self.assertIn(('light','turn_on',{'entity_id':'light.two','brightness_pct':60,'rgb_color':[250,120,30]}),calls)
        volumes=[data for domain,service,data in calls if service=='volume_set']
        self.assertEqual({v['entity_id'] for v in volumes},set(c['speakers']))
        self.assertTrue(all(v['volume_level']==0.05 for v in volumes))
        self.assertEqual(hass.mass.player_queues.play_media.await_count,2)
        self.assertTrue(all(a.kwargs['user']=='ma-a' for a in hass.mass.player_queues.play_media.await_args_list))
        # A second tick, even after integration reload, does not replay this alarm.
        hass.data.pop(self.wake.RUNTIME)
        await self.wake.tick(hass,self.now)
        self.assertEqual(hass.mass.player_queues.play_media.await_count,2)
        type(self).now+=timedelta(minutes=5)
        await self.wake.tick(hass,self.now)
        stops=[a.args[2]['entity_id'] for a in hass.services.async_call.await_args_list if a.args[1]=='media_stop']
        self.assertEqual(set(stops),set(c['speakers']))
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['stops'],[])

    async def test_settings_accept_zero_to_three_presets_enforce_volume_and_prevent_lost_updates(self):
        hass,_,owner,admin,_,c,_,_=self.fixture()
        data=await self.wake.create_card(hass,admin,c)
        original=deepcopy(data['settings'])
        for volume in [4,16,True,10.5]:
            with self.assertRaises(self.wake.AccessError):
                self.wake.validate_settings({**original,'volume':volume})
        for presets in [['01:00']*2,['25:00'],['01:00','02:00','03:00','04:00']]:
            invalid=deepcopy(original);invalid['types']['ferien']['presets']=presets
            with self.assertRaises(self.wake.AccessError): self.wake.validate_settings(invalid)
        settings=deepcopy(original);settings['types']['ferien']['presets']=[];settings['volume']=15
        self.assertEqual(self.wake.validate_settings(settings),settings)
        with self.assertRaises(self.wake.AccessError):self.wake.validate_settings({**settings,'speakers':[]})
        results=await asyncio.gather(*[self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision']) for _ in range(2)],return_exceptions=True)
        self.assertEqual(sum(isinstance(r,Exception) for r in results),1)

    async def test_school_weekend_holidays_and_unavailable_calendar_are_mutually_exclusive(self):
        hass,_,_,admin,_,c,states,_=self.fixture()
        data=await self.wake.create_card(hass,admin,c)
        record=hass.data['wecker_manager']['wecker-entry'].options['wake_cards'][c['alarm_id']]
        for kind in self.wake.TYPES:record['settings']['types'][kind].update(enabled=True,time='06:00')
        await self.wake.prepare_calendars(hass,record,(await hass.auth.async_get_user(c['owner_id'])),self.now,force=True)
        self.assertEqual(self.wake.due_phases(hass,record,self.now),[('schultag','wake','2026-11-13')])
        states['calendar.school'].state='on'
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-13','end':'2026-11-14'}]}}
        await self.wake.prepare_calendars(hass,record,(await hass.auth.async_get_user(c['owner_id'])),self.now,force=True)
        self.assertEqual(self.wake.due_phases(hass,record,self.now),[('ferien','wake','2026-11-13')])
        self.assertEqual(self.wake.due_phases(hass,record,self.now+timedelta(days=1)),[('wochenende','wake','2026-11-14')])
        states['calendar.school'].state='unavailable'
        await self.wake.prepare_calendars(hass,record,(await hass.auth.async_get_user(c['owner_id'])),self.now,force=True)
        with self.assertRaises(self.wake.AccessError):self.wake.due_phases(hass,record,self.now)

    async def test_revoked_account_or_permissions_never_play_as_another_user(self):
        hass,entry,owner,admin,_,c,states,permission=self.fixture()
        await self.activate(hass,admin,c)
        entry.options['accounts'][0]['provider_id']='apple_music--b'
        await self.wake.tick(hass,self.now)
        hass.mass.player_queues.play_media.assert_not_awaited()
        hass.services.async_call.assert_not_awaited()
        self.assertIn('Musikkonto',self.wake.runtime(hass)['errors'][c['card_id']])
        entry.options['accounts'][0]['provider_id']='apple_music--a'
        permission.allowed=False
        await self.wake.tick(hass,self.now)
        hass.services.async_call.assert_not_awaited()

    async def test_one_failed_device_does_not_prevent_the_other_wake_actions(self):
        hass,entry,_,admin,_,c,states,_=self.fixture()
        await self.activate(hass,admin,c)
        states.pop('light.one')
        await self.wake.tick(hass,self.now)
        self.assertEqual(hass.mass.player_queues.play_media.await_count,2)
        self.assertTrue(any(a.args[1]=='set_cover_position' for a in hass.services.async_call.await_args_list))
        self.assertIn('fehlgeschlagen',self.wake.runtime(hass)['errors'][c['card_id']])

    async def test_creation_checks_every_speaker_and_never_disables_existing_automations(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture()
        hass.mass.auth.get_user.return_value.player_filter=['RINCON_AABBCCDDEEFF01400']
        with self.assertRaises(self.wake.AccessError):await self.wake.create_card(hass,admin,c)
        self.assertNotIn('wake_cards',entry.options)
        hass.mass.auth.get_user.return_value.player_filter=[]
        c['replace_automation']='automation.old'
        await self.wake.create_card(hass,admin,c)
        await self.wake.create_card(hass,admin,c)
        hass.services.async_call.assert_not_awaited()
        self.assertEqual(states['automation.old'].state,'on')

    async def test_scheduler_attaches_once_and_detaches_on_unload(self):
        hass,*_=self.fixture()
        self.events.async_track_time_change.reset_mock()
        self.wake.async_setup_wake_cards(hass);self.wake.async_setup_wake_cards(hass)
        self.events.async_track_time_change.assert_called_once()
        self.assertEqual(self.events.async_track_time_change.call_args.kwargs,{'second':0})
        self.wake.async_unload_wake_cards(hass)
        self.events.async_track_time_change.return_value.assert_called_once()

    async def test_editable_sunrise_migrates_existing_cards_and_changes_execution_without_rebinding(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['sunrise_minutes']=5
        data=await self.activate(hass,admin,config)
        record=entry.options['wake_cards'][config['alarm_id']]
        record['settings'].pop('sunrise_minutes')  # Simulate a stored 1.1.x card.
        record['settings']['types']['schultag'].pop('sunrise_minutes',None)
        await self.wake.prepare_calendars(hass,record,owner,self.now,force=True,include_disabled=True)
        self.assertEqual(self.wake.snapshot(hass,record)['settings']['sunrise_minutes'],5)
        self.assertEqual(self.wake.due_phases(hass,record,self.now-timedelta(minutes=5)),[('schultag','sunrise','2026-11-13')])
        settings=deepcopy(data['settings']);settings['sunrise_minutes']=15
        updated=await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        record=entry.options['wake_cards'][config['alarm_id']]
        self.assertEqual(record['binding'],config)
        self.assertEqual(self.wake.due_phases(hass,record,self.now-timedelta(minutes=15)),[('schultag','sunrise','2026-11-13')])
        self.assertEqual(self.wake.due_phases(hass,record,self.now-timedelta(minutes=5)),[])
        with patch.object(self.wake.asyncio,'sleep',new=AsyncMock()):
            await self.wake.execute(hass,entry,record,owner,'schultag','sunrise')
        transitions=[a.args[2]['transition'] for a in hass.services.async_call.await_args_list if 'transition' in a.args[2]]
        self.assertEqual(transitions,[899,899])
        # An older client editing another setting must retain the chosen sunrise.
        settings.pop('sunrise_minutes')
        for item in settings['types'].values():item.pop('sunrise_minutes',None)
        preserved=await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,updated['revision'])
        self.assertEqual(preserved['settings']['sunrise_minutes'],15)
        settings['sunrise_minutes']=0
        await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,preserved['revision'])
        self.assertEqual(self.wake.due_phases(hass,entry.options['wake_cards'][config['alarm_id']],self.now-timedelta(minutes=15)),[])

    async def test_sunrise_requires_a_dimmable_bound_light_and_valid_duration(self):
        hass,_,owner,admin,_,config,states,_=self.fixture()
        config['lights']=[]
        data=await self.wake.create_card(hass,admin,config)
        self.assertFalse(data['sunrise_available'])
        for minutes in [5,31,-1,True]:
            settings=deepcopy(data['settings']);settings['sunrise_minutes']=minutes
            with self.assertRaises(self.wake.AccessError):
                await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])

    async def test_tomorrow_status_uses_events_for_the_next_local_day_and_exclusive_end_dates(self):
        hass,_,owner,admin,_,config,states,permission=self.fixture()
        await self.wake.create_card(hass,admin,config)
        weekend=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'])
        self.assertEqual(weekend['kind'],'wochenende');hass.services.async_call.assert_not_awaited()
        type(self).now=datetime(2026,11,15,23,30,tzinfo=ZoneInfo('Europe/Berlin'))
        states['calendar.school'].state='on'
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-15','end':'2026-11-16'}]}}
        school=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'])
        self.assertEqual(school['kind'],'schultag')
        self.assertEqual(hass.services.async_call.call_args.args[2]['start_date_time'],'2026-11-16T00:00:00+01:00')
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-16','end':'2026-11-17'}]}}
        states['calendar.school'].last_updated='updated'
        free=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'])
        self.assertEqual(free['kind'],'ferien');self.assertNotIn('events',free)
        hass.services.async_call.side_effect=RuntimeError('Offline')
        states['calendar.school'].last_updated='offline'
        unknown=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'])
        self.assertIsNone(unknown['kind'])
        hass.services.async_call.reset_mock();permission.allowed=False
        denied=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'])
        self.assertIsNone(denied['kind'])
        hass.services.async_call.assert_not_awaited()

    async def test_upgrade_renames_the_default_entry_without_changing_stored_alarms(self):
        hass,entry,_,admin,_,config,_,_=self.fixture()
        await self.activate(hass,admin,config)
        saved=deepcopy(entry.options)
        frontend=types.ModuleType('custom_components.wecker_manager.frontend')
        frontend.async_register_frontend=AsyncMock()
        def update(entry, **changes):
            for key,value in changes.items():setattr(entry,key,value)
        hass.config_entries.async_update_entry=Mock(side_effect=update)
        package=sys.modules['custom_components.wecker_manager']
        with patch.dict(sys.modules,{'custom_components.wecker_manager.frontend':frontend}),patch.object(self.wake,'async_setup_wake_cards'):
            entry.title='Wecker Manager'
            self.assertTrue(await package.async_setup_entry(hass,entry))
            self.assertEqual(entry.title,'Wecker')
            self.assertEqual(entry.options,saved)
            entry.title='Schlafzimmer'
            hass.config_entries.async_update_entry.reset_mock()
            self.assertTrue(await package.async_setup_entry(hass,entry))
            self.assertEqual(entry.title,'Schlafzimmer')
            hass.config_entries.async_update_entry.assert_not_called()

    def custom_day(self, **changes):
        return {'id':'arbeit','name':'Arbeit','icon':'mdi:briefcase','weekdays':[0,1,2,3,4],
                'music_mode':'always','confirm_disable':True,'calendar_entity':'calendar.school',**changes}

    async def test_custom_day_calendar_polarity_ignores_timed_events_and_requires_disable_acknowledgement(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        data=await self.activate(hass,admin,config,kind='arbeit')
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-13T00:00:00+01:00','end':'2026-11-14T00:00:00+01:00'}]}}
        await self.wake.tick(hass,self.now)
        hass.mass.player_queues.play_media.assert_not_awaited()
        settings=deepcopy(data['settings']);settings['types']['arbeit']['calendar_mode']='no_event'
        data=await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        await self.wake.tick(hass,self.now)
        self.assertEqual(hass.mass.player_queues.play_media.await_count,2)
        settings=deepcopy(data['settings']);settings['types']['arbeit']['enabled']=False
        with self.assertRaises(self.wake.AccessError) as error:
            await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        self.assertEqual(error.exception.code,'confirmation_required')
        stopped=await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'],['arbeit'])
        self.assertFalse(stopped['settings']['types']['arbeit']['enabled'])
        self.assertEqual(stopped['binding']['speakers'],config['speakers'])

    async def test_music_policy_and_day_configuration_are_enforced_for_all_clients(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        data=await self.wake.create_card(hass,admin,config)
        settings=deepcopy(data['settings']);settings['types']['arbeit']['music']=False
        with self.assertRaises(self.wake.AccessError):
            await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        days=[self.custom_day(name='Frühdienst',music_mode='switchable',confirm_disable=False)]
        with self.assertRaises(self.wake.AccessError):
            await self.wake.configure_days(hass,owner,config['alarm_id'],config['card_id'],days,data['revision'])
        old_binding=deepcopy(data['binding'])
        data=await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],days,data['revision'])
        self.assertEqual(data['binding'],old_binding);self.assertEqual(data['days'][0]['name'],'Frühdienst')
        settings=deepcopy(data['settings']);settings['types']['arbeit']['music']=False
        result=await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        self.assertFalse(result['settings']['types']['arbeit']['music'])

    async def test_all_day_events_have_exclusive_end_dates_and_calendar_failures_do_not_match_free_days(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        await self.wake.create_card(hass,admin,config)
        record=entry.options['wake_cards'][config['alarm_id']]
        for events,expected in [
            ([{'start':'2026-11-13T08:00:00+01:00','end':'2026-11-13T18:00:00+01:00'}],False),
            ([{'start':'2026-11-12','end':'2026-11-13'}],False),
            ([{'start':'2026-11-13','end':'2026-11-14'}],True),
            ([{'start':'2026-11-12','end':'2026-11-17'}],True),
        ]:
            with self.subTest(events=events):
                hass.services.async_call.return_value={'calendar.school':{'events':events}}
                await self.wake.prepare_calendars(hass,record,owner,self.now,force=True,include_disabled=True)
                self.assertEqual(self.wake.day_matches(hass,record,'arbeit',self.now),expected)
        record['settings']['types']['arbeit']['calendar_mode']='no_event'
        hass.services.async_call.side_effect=RuntimeError('Offline')
        await self.wake.prepare_calendars(hass,record,owner,self.now,force=True,include_disabled=True)
        with self.assertRaises(self.wake.AccessError):self.wake.day_matches(hass,record,'arbeit',self.now)

    async def test_calendar_is_refreshed_at_alarm_time_and_independent_days_continue_on_calendar_failure(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day(),self.custom_day(id='ohne_kalender',name='Ohne Kalender',calendar_entity='',confirm_disable=False)]
        data=await self.wake.create_card(hass,admin,config)
        settings=deepcopy(data['settings'])
        for item in settings['types'].values():item.update(enabled=True,time='06:00',music=True,calendar_mode='no_event')
        await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        record=entry.options['wake_cards'][config['alarm_id']]
        await self.wake.prepare_calendars(hass,record,owner,self.now)
        async def service(domain,action,data,**kwargs):
            if domain=='calendar':raise RuntimeError('Unavailable')
        hass.services.async_call.side_effect=service
        await self.wake.tick(hass,self.now)
        self.assertEqual(hass.mass.player_queues.play_media.await_count,2)
        runs=entry.options['wake_cards'][config['alarm_id']]['runs']
        self.assertIn('2026-11-13/ohne_kalender/wake',runs)
        self.assertNotIn('2026-11-13/arbeit/wake',runs)
        self.assertIn('Arbeit',self.wake.runtime(hass)['errors'][config['card_id']])

    async def test_reconfiguring_days_preserves_times_and_cannot_remove_a_protected_active_day_without_confirmation(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        data=await self.activate(hass,admin,config,kind='arbeit',time='07:23')
        replacement=[self.custom_day(id='frei',name='Frei',calendar_entity='',confirm_disable=False)]
        with self.assertRaises(self.wake.AccessError) as error:
            await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],replacement,data['revision'])
        self.assertEqual(error.exception.code,'confirmation_required')
        renamed=[self.custom_day(name='Frühdienst')]
        renamed=await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],renamed,data['revision'])
        self.assertEqual(renamed['settings']['types']['arbeit']['time'],'07:23')
        result=await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],replacement,renamed['revision'],['arbeit'])
        self.assertEqual(set(result['settings']['types']),{'frei'});self.assertFalse(result['settings']['types']['frei']['enabled'])

    async def test_custom_day_sunrise_and_legacy_migration_keep_their_existing_settings(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day(calendar_entity='')]
        data=await self.activate(hass,admin,config,kind='arbeit')
        settings=deepcopy(data['settings']);settings['types']['arbeit']['sunrise_minutes']=10
        await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        type(self).now-=timedelta(minutes=10)
        with patch.object(self.wake.asyncio,'sleep',new=AsyncMock()):await self.wake.tick(hass,self.now)
        transitions=[call.args[2]['transition'] for call in hass.services.async_call.await_args_list if 'transition' in call.args[2]]
        self.assertEqual(transitions,[599,599]);hass.mass.player_queues.play_media.assert_not_awaited()
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        data=await self.activate(hass,admin,config)
        old=entry.options['wake_cards'][config['alarm_id']];old.pop('days')
        for item in old['settings']['types'].values():item.pop('calendar_mode',None)
        migrated=self.wake.snapshot(hass,old)
        self.assertEqual([d['id'] for d in migrated['days']],['schultag','wochenende','ferien'])
        self.assertTrue(migrated['days'][0]['confirm_disable']);self.assertEqual(migrated['settings']['types']['schultag']['calendar_mode'],'no_event')
        self.assertEqual(migrated['settings']['types']['ferien']['calendar_mode'],'event')
        self.assertEqual(migrated['settings']['types']['schultag']['time'],data['settings']['types']['schultag']['time'])

    def test_day_policy_validation_rejects_duplicate_ids_invalid_icons_and_invalid_weekdays(self):
        day=self.custom_day()
        for days in [[],[day,day],[{**day,'icon':'mdi:school" onclick="bad'}],[{**day,'weekdays':[]}],[{**day,'weekdays':[True]}],[{**day,'name':'   '}]]:
            with self.subTest(days=days),self.assertRaises(self.wake.AccessError):self.wake.validate_days(days)
