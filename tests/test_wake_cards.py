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
    async def test_radio_wake_plays_on_all_bound_speakers_without_ma_and_retains_stop_deadline(self):
        hass, entry, owner, admin, _, config, *_ = self.fixture()
        await self.wake.create_card(hass, admin, config)
        record = entry.options['wake_cards'][config['alarm_id']]
        record['settings']['types']['schultag']['music'] = True
        hass.user_stores[owner.id].data['music_manager_alarm_music'][config['alarm_id']] = {
            'kind':'radio', 'uri':'media-source://radio_browser/swr3',
            'media_content_id':'media-source://radio_browser/swr3', 'media_type':'radio', 'title':'SWR3'}
        hass.mass.auth.get_user.reset_mock()
        hass.mass.auth.get_user.side_effect = RuntimeError('MA offline')
        hass.services.async_call.reset_mock()
        await self.wake.execute(hass, entry, record, owner, 'schultag', 'wake')
        plays = [a for a in hass.services.async_call.await_args_list if a.args[:2] == ('media_player','play_media')]
        self.assertEqual({a.args[2]['entity_id'] for a in plays}, set(config['speakers']))
        self.assertTrue(all(a.args[2]['media_content_id']=='media-source://radio_browser/swr3' and a.kwargs['context'].user_id==owner.id for a in plays))
        self.assertEqual(len(entry.options['wake_cards'][config['alarm_id']]['stops']),len(config['speakers']))
        hass.mass.auth.get_user.assert_not_awaited()
        hass.mass.player_queues.play_media.assert_not_awaited()

    async def test_radio_wake_rejects_urls_categories_and_mismatched_saved_ids_before_playback(self):
        for uri, content_id in [('https://example.com/audio','https://example.com/audio'),
                                ('media-source://radio_browser/country/DE','media-source://radio_browser/country/DE'),
                                ('media-source://radio_browser/swr3','media-source://radio_browser/other')]:
            hass, entry, owner, admin, _, config, *_ = self.fixture()
            await self.wake.create_card(hass, admin, config)
            record = entry.options['wake_cards'][config['alarm_id']]
            hass.user_stores[owner.id].data['music_manager_alarm_music'][config['alarm_id']] = {
                'kind':'radio','uri':uri,'media_content_id':content_id,'title':'Station'}
            hass.services.async_call.reset_mock()
            with self.assertRaises(self.wake.AccessError):
                await self.wake.play_speaker(hass, entry, record, owner, config['speakers'][0])
            hass.services.async_call.assert_not_awaited()

    @classmethod
    def setUpClass(cls):
        cls.gateway = load_gateway()
        core = types.ModuleType('homeassistant.core')
        core.Context = lambda **kw: NS(**kw)
        sys.modules[core.__name__] = core
        events = types.ModuleType('homeassistant.helpers.event')
        events.async_track_time_change = Mock(return_value=Mock())
        events.async_call_later = Mock(return_value=Mock())
        from enum import StrEnum
        class RepeatMode(StrEnum):
            OFF='off'
            ONE='one'
            ALL='all'
        models=types.ModuleType('music_assistant_models.enums');models.RepeatMode=RepeatMode;sys.modules[models.__name__]=models
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
        hass.bus = NS(async_fire=Mock(),async_listen=Mock(return_value=Mock()),async_listen_once=Mock(return_value=Mock()))
        hass.is_running=False
        music_entry = hass.data['music_manager']['entry']
        entry = NS(options={'accounts':music_entry.options['accounts']},data={},entry_id='wecker-entry')
        hass.data['wecker_manager']={'wecker-entry':entry}
        lovelace=types.ModuleType('homeassistant.components.lovelace.const')
        lovelace.LOVELACE_DATA='lovelace';lovelace.EVENT_LOVELACE_UPDATED='lovelace_updated';lovelace.ConfigNotFound=type('ConfigNotFound',(Exception,),{})
        sys.modules[lovelace.__name__]=lovelace
        constants=sys.modules.setdefault('homeassistant.const',types.ModuleType('homeassistant.const'))
        constants.EVENT_HOMEASSISTANT_STARTED='homeassistant_started'
        async def dashboard(force):
            return {'views':[{'cards':[{'type':'custom:wecker-manager-card',**deepcopy(record['binding'])} for record in entry.options.get('wake_cards',{}).values()]}]}
        hass.data['lovelace']=NS(dashboards={None:NS(mode='storage',config=None,async_load=AsyncMock(side_effect=dashboard))})
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
                'music_mode':'always','confirm_disable':True,'calendar_entity':'calendar.school','calendar_mode':'event',**changes}

    async def test_custom_day_calendar_polarity_ignores_timed_events_and_requires_disable_acknowledgement(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        data=await self.activate(hass,admin,config,kind='arbeit')
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-13T00:00:00+01:00','end':'2026-11-14T00:00:00+01:00'}]}}
        await self.wake.tick(hass,self.now)
        hass.mass.player_queues.play_media.assert_not_awaited()
        settings=deepcopy(data['settings']);settings['types']['arbeit']['calendar_mode']='no_event'
        with self.assertRaises(self.wake.AccessError):
            await self.wake.update_card(hass,owner,config['alarm_id'],config['card_id'],settings,data['revision'])
        data=await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],[self.custom_day(calendar_mode='no_event')],data['revision'])
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
        record['days'][0]['calendar_mode']='no_event'
        hass.services.async_call.side_effect=RuntimeError('Offline')
        await self.wake.prepare_calendars(hass,record,owner,self.now,force=True,include_disabled=True)
        with self.assertRaises(self.wake.AccessError):self.wake.day_matches(hass,record,'arbeit',self.now)

    async def test_calendar_is_refreshed_at_alarm_time_and_independent_days_continue_on_calendar_failure(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day(calendar_mode='no_event'),self.custom_day(id='ohne_kalender',name='Ohne Kalender',calendar_entity='',confirm_disable=False,calendar_mode='no_event')]
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
        for days in [[],[day,day],[{**day,'icon':'mdi:school" onclick="bad'}],[{**day,'weekdays':[]}],[{**day,'weekdays':[True]}],[{**day,'name':'   '}],[{**day,'calendar_mode':'anything'}]]:
            with self.subTest(days=days),self.assertRaises(self.wake.AccessError):self.wake.validate_days(days)

    async def test_dedicated_switch_preserves_concurrent_changes_enforces_confirmation_and_prevents_execution(self):
        hass,entry,owner,admin,other,config,_,_=self.fixture()
        data=await self.activate(hass,admin,config)
        current=deepcopy(data['settings']);current['volume']=14;current['types']['ferien']['time']='11:32'
        changed=await self.wake.update_card(hass,admin,config['alarm_id'],config['card_id'],current,data['revision'])
        with self.assertRaises(self.wake.AccessError) as error:
            await self.wake.set_enabled(hass,owner,config['alarm_id'],config['card_id'],'schultag',False)
        self.assertEqual(error.exception.code,'confirmation_required')
        with self.assertRaises(self.wake.AccessError):
            await self.wake.set_enabled(hass,other,config['alarm_id'],config['card_id'],'schultag',False,['schultag'])
        stopped=await self.wake.set_enabled(hass,owner,config['alarm_id'],config['card_id'],'schultag',False,['schultag'])
        self.assertFalse(stopped['settings']['types']['schultag']['enabled'])
        self.assertEqual(stopped['settings']['volume'],14)
        self.assertEqual(stopped['settings']['types']['ferien']['time'],'11:32')
        self.assertEqual(stopped['revision'],changed['revision']+1)
        await self.wake.tick(hass,self.now)
        hass.mass.player_queues.play_media.assert_not_awaited()
        again=await self.wake.set_enabled(hass,owner,config['alarm_id'],config['card_id'],'schultag',False)
        self.assertFalse(again['settings']['types']['schultag']['enabled'])
        for kind,enabled in [('removed',False),('schultag',0)]:
            with self.assertRaises(self.wake.AccessError):
                await self.wake.set_enabled(hass,owner,config['alarm_id'],config['card_id'],kind,enabled)

    async def test_existing_calendar_polarity_migrates_to_setup_and_changes_only_there(self):
        hass,entry,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day()]
        data=await self.wake.create_card(hass,admin,config)
        old=entry.options['wake_cards'][config['alarm_id']]
        old['days'][0].pop('calendar_mode');old['settings']['types']['arbeit']['calendar_mode']='no_event'
        data=self.wake.snapshot(hass,old)
        self.assertEqual(data['days'][0]['calendar_mode'],'no_event')
        self.assertEqual(data['settings']['types']['arbeit']['calendar_mode'],'no_event')
        days=[{**data['days'][0],'calendar_mode':'event'}]
        configured=await self.wake.configure_days(hass,admin,config['alarm_id'],config['card_id'],days,data['revision'])
        self.assertEqual(configured['settings']['types']['arbeit']['calendar_mode'],'event')
        self.assertEqual(configured['binding'],data['binding'])

    async def test_header_today_and_tomorrow_use_the_selected_local_date(self):
        hass,_,owner,admin,_,config,_,_=self.fixture()
        config['days']=[self.custom_day(calendar_mode='no_event')]
        await self.wake.create_card(hass,admin,config)
        today=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'],0)
        tomorrow=await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'],1)
        self.assertEqual(today['date'],'2026-11-13');self.assertEqual(today['label'],'Heute: Arbeit')
        self.assertEqual(tomorrow['date'],'2026-11-14');self.assertEqual(tomorrow['types'],[])
        with self.assertRaises(self.wake.AccessError):
            await self.wake.tomorrow_info(hass,owner,config['alarm_id'],config['card_id'],2)

    def add_other_account(self,hass,other):
        music=next(iter(hass.data['music_manager'].values()))
        music.options['accounts'].append(gateway_fixture.account(user=other.id,ma='ma-b',provider='apple_music--b'))
        hass.mass.auth.get_user.side_effect=lambda user_id:NS(enabled=True,role='user',provider_filter=['apple_music--b' if user_id=='ma-b' else 'apple_music--a'])

    async def test_full_card_reconfiguration_preserves_identity_times_and_updates_ownership(self):
        hass,entry,owner,admin,other,config,_,_=self.fixture()
        data=await self.activate(hass,admin,config,time='07:23')
        self.add_other_account(hass,other)
        changed={**data['binding'],'name':'Pauls Wecker','owner_id':other.id,'speakers':['media_player.second'],
                 'covers':[{'entity_id':'cover.two','position':40}],'lights':[],'days':data['days']}
        before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):
            await self.wake.create_card(hass,owner,changed,reconfigure=True,revision=data['revision'])
        with self.assertRaises(self.wake.AccessError):
            await self.wake.create_card(hass,admin,{**changed,'speakers':['media_player.missing']},reconfigure=True,revision=data['revision'])
        self.assertEqual(entry.options,before)
        result=await self.wake.create_card(hass,admin,changed,reconfigure=True,revision=data['revision'])
        self.assertEqual(result['binding']['card_id'],config['card_id']);self.assertEqual(result['name'],'Pauls Wecker')
        self.assertEqual(result['binding']['owner_id'],other.id);self.assertEqual(result['binding']['covers'][0]['position'],40)
        self.assertEqual(result['settings']['types']['schultag']['time'],'07:23');self.assertTrue(result['settings']['types']['schultag']['enabled'])
        self.assertNotIn(config['card_id'],entry.options['wake_cards'][config['alarm_id']]['retired_card_ids'])
        with self.assertRaises(self.wake.AccessError):await self.wake.checked_record(hass,owner,config['alarm_id'],config['card_id'])
        await self.wake.checked_record(hass,other,config['alarm_id'],config['card_id'])
        with self.assertRaises(self.wake.AccessError) as error:
            await self.wake.create_card(hass,admin,changed,reconfigure=True,revision=data['revision'])
        self.assertEqual(error.exception.code,'conflict')

    async def test_shared_days_reuse_and_propagate_rules_but_keep_card_times_and_policies(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture()
        c['days']=[self.custom_day(calendar_mode='no_event')]
        first=await self.activate(hass,admin,c,kind='arbeit',time='06:15')
        self.add_other_account(hass,other)
        second_day={**first['days'][0],'id':'paul_school','music_mode':'switchable','confirm_disable':False}
        pc={**c,'alarm_id':'paul_alarm','card_id':'paul_card','owner_id':other.id,'speakers':['media_player.second'],'days':[second_day]}
        second=await self.wake.create_card(hass,admin,pc)
        settings=deepcopy(second['settings']);settings['types']['paul_school'].update(time='07:45',enabled=True,music=False)
        second=await self.wake.update_card(hass,other,pc['alarm_id'],pc['card_id'],settings,second['revision'])
        catalog=await self.wake.catalog(hass,admin,other.id)
        self.assertEqual(len(catalog['shared_days']),1);self.assertEqual(catalog['shared_days'][0]['uses'],2)
        days=[{**first['days'][0],'name':'Schultag','weekdays':[0,2,4]}]
        await self.wake.configure_days(hass,admin,c['alarm_id'],c['card_id'],days,first['revision'])
        paul=entry.options['wake_cards'][pc['alarm_id']]
        self.assertEqual(paul['days'][0]['name'],'Schultag');self.assertEqual(paul['days'][0]['weekdays'],[0,2,4])
        self.assertEqual(paul['settings']['types']['paul_school']['time'],'07:45');self.assertTrue(paul['settings']['types']['paul_school']['enabled'])
        self.assertFalse(paul['settings']['types']['paul_school']['music']);self.assertFalse(paul['days'][0]['confirm_disable'])
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['settings']['types']['arbeit']['time'],'06:15')
        self.assertEqual(paul['revision'],second['revision']+1)
        stale={**c,'alarm_id':'third_alarm','card_id':'third_card','days':first['days']}
        with self.assertRaises(self.wake.AccessError) as error:await self.wake.create_card(hass,admin,stale)
        self.assertEqual(error.exception.code,'conflict')

    async def test_shared_calendar_change_requires_access_for_every_linked_owner_and_is_atomic(self):
        hass,entry,owner,admin,other,c,states,_=self.fixture()
        c['days']=[self.custom_day(calendar_entity='')]
        first=await self.wake.create_card(hass,admin,c)
        self.add_other_account(hass,other)
        pc={**c,'alarm_id':'paul_alarm','card_id':'paul_card','owner_id':other.id,'days':first['days']}
        await self.wake.create_card(hass,admin,pc)
        states['calendar.private']=NS(entity_id='calendar.private',state='off',attributes={})
        other.permissions=NS(check_entity=lambda entity_id,policy:entity_id!='calendar.private')
        before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):
            await self.wake.configure_days(hass,admin,c['alarm_id'],c['card_id'],[{**first['days'][0],'calendar_entity':'calendar.private'}],first['revision'])
        self.assertEqual(entry.options,before)

    async def test_upcoming_window_checks_enabled_weekdays_boundaries_and_completed_runs(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture()
        type(self).now=self.now.replace(hour=10)
        days=[self.custom_day(id=key,name=key,calendar_entity='',weekdays=weekdays,confirm_disable=False) for key,weekdays in [('today',list(range(7))),('tomorrow',list(range(7))),('edge',list(range(7))),('late',[5]),('off',list(range(7))),('wrong_day',[0])]]
        c['days']=days;data=await self.wake.create_card(hass,admin,c);settings=deepcopy(data['settings'])
        for key,time in [('today','11:00'),('tomorrow','09:00'),('edge','10:00'),('late','10:01'),('off','12:00'),('wrong_day','11:00')]:settings['types'][key].update(enabled=key!='off',time=time)
        await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'])
        record=entry.options['wake_cards'][c['alarm_id']];record['runs']['2026-11-13/edge/wake']=True
        result=await self.wake.upcoming_info(hass,owner,c['alarm_id'],c['card_id'])
        self.assertEqual({key:item['active'] for key,item in result['types'].items()},{'today':True,'tomorrow':True,'edge':True,'late':False,'off':False,'wrong_day':False})
        self.assertEqual(result['types']['edge']['at'],'2026-11-14T09:00:00+00:00')
        record['runs']['2026-11-13/today/wake']=True
        result=await self.wake.upcoming_info(hass,owner,c['alarm_id'],c['card_id'])
        self.assertFalse(result['types']['today']['active'])

    async def test_upcoming_uses_all_day_rules_for_the_correct_date_and_fails_closed(self):
        hass,_,owner,admin,other,c,_,_=self.fixture();type(self).now=self.now.replace(hour=23)
        c['days']=[self.custom_day(id='booked',name='Gebucht',weekdays=list(range(7)),calendar_mode='event',confirm_disable=False),self.custom_day(id='free',name='Frei',weekdays=list(range(7)),calendar_mode='no_event',confirm_disable=False)]
        data=await self.wake.create_card(hass,admin,c);settings=deepcopy(data['settings'])
        for item in settings['types'].values():item.update(enabled=True,time='08:00')
        await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'])
        hass.services.async_call.return_value={'calendar.school':{'events':[{'start':'2026-11-14','end':'2026-11-15'}]}}
        result=await self.wake.upcoming_info(hass,owner,c['alarm_id'],c['card_id'])
        self.assertTrue(result['types']['booked']['active']);self.assertFalse(result['types']['free']['active'])
        self.wake.runtime(hass)['calendar_days']={};hass.services.async_call.side_effect=RuntimeError('Unavailable')
        result=await self.wake.upcoming_info(hass,owner,c['alarm_id'],c['card_id'])
        self.assertFalse(any(item['active'] for item in result['types'].values()))
        with self.assertRaises(self.wake.AccessError):await self.wake.upcoming_info(hass,other,c['alarm_id'],c['card_id'])

    async def test_upcoming_means_24_elapsed_hours_across_both_clock_changes(self):
        for date_,times,expected in [(datetime(2026,10,24,10,tzinfo=ZoneInfo('Europe/Berlin')),['09:00','09:30'],[True,False]),(datetime(2026,3,28,10,tzinfo=ZoneInfo('Europe/Berlin')),['10:30','02:30'],[True,False])]:
            with self.subTest(date=date_):
                hass,_,owner,admin,_,c,_,_=self.fixture();type(self).now=date_
                c['days']=[self.custom_day(id='a',name='A',weekdays=[6],calendar_entity='',confirm_disable=False),self.custom_day(id='b',name='B',weekdays=[6],calendar_entity='',confirm_disable=False)]
                data=await self.wake.create_card(hass,admin,c);settings=deepcopy(data['settings'])
                for key,time in zip(['a','b'],times):settings['types'][key].update(enabled=True,time=time)
                await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'])
                result=await self.wake.upcoming_info(hass,owner,c['alarm_id'],c['card_id'])
                self.assertEqual([result['types'][key]['active'] for key in ['a','b']],expected)

    def template(self, **changes):
        return {key:value for key,value in self.custom_day(**changes).items() if key in ('id','name','icon','weekdays','calendar_entity','calendar_mode')}

    async def test_template_management_crud_propagates_shared_rules_and_preserves_local_settings(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture()
        raw=self.template(calendar_entity='',calendar_mode='no_event')
        with self.assertRaises(self.wake.AccessError):await self.wake.save_day_template(hass,owner,raw,0)
        saved=await self.wake.save_day_template(hass,admin,raw,0);template=saved['template']
        c['days']=[{**self.custom_day(calendar_entity='',calendar_mode='no_event'), 'template_id':template['id'],'template_revision':template['revision']}]
        first=await self.activate(hass,admin,c,kind='arbeit',time='07:23')
        self.add_other_account(hass,other)
        second_c={**c,'alarm_id':'paul_alarm','card_id':'paul_card','owner_id':other.id,'days':[{**first['days'][0],'music_mode':'switchable','confirm_disable':False}]}
        second=await self.activate(hass,admin,second_c,kind='arbeit',time='08:12')
        before={key:deepcopy(record['settings']) for key,record in entry.options['wake_cards'].items()}
        updated=await self.wake.save_day_template(hass,admin,{**raw,'name':'Frühdienst','weekdays':[1,3]},template['revision'])
        for record in entry.options['wake_cards'].values():
            self.assertEqual(record['days'][0]['name'],'Frühdienst');self.assertEqual(record['days'][0]['weekdays'],[1,3]);self.assertEqual(record['settings'],before[record['binding']['alarm_id']])
        self.assertFalse(entry.options['wake_cards']['paul_alarm']['days'][0]['confirm_disable'])
        with self.assertRaises(self.wake.AccessError):await self.wake.save_day_template(hass,admin,raw,template['revision'])
        with self.assertRaises(self.wake.AccessError) as error:await self.wake.delete_day_template(hass,admin,template['id'],updated['template']['revision'])
        self.assertEqual(error.exception.code,'template_in_use')
        unused=await self.wake.save_day_template(hass,admin,self.template(id='unused',name='Spätdienst',calendar_entity=''),0)
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_day_template(hass,other,'unused',1)
        await self.wake.delete_day_template(hass,admin,'unused',unused['template']['revision']);self.assertNotIn('unused',entry.options['day_templates'])

    async def test_global_manager_calendar_change_checks_every_owner_before_writing(self):
        hass,entry,owner,admin,other,c,states,_=self.fixture()
        c['days']=[self.custom_day(calendar_entity='')];first=await self.wake.create_card(hass,admin,c);day=first['days'][0]
        self.add_other_account(hass,other);await self.wake.create_card(hass,admin,{**c,'alarm_id':'paul','card_id':'paul','owner_id':other.id,'days':first['days']})
        states['calendar.private']=NS(entity_id='calendar.private',state='off',attributes={});other.permissions=NS(check_entity=lambda entity_id,policy:entity_id!='calendar.private')
        before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):await self.wake.save_day_template(hass,admin,self.template(id=day['template_id'],calendar_entity='calendar.private'),day['template_revision'])
        self.assertEqual(entry.options,before)

    async def test_reuse_after_rename_and_legacy_duplicate_migration_are_idempotent(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture()
        c['days']=[self.custom_day(calendar_entity='',calendar_mode='event')];first=await self.activate(hass,admin,c,kind='arbeit',time='07:23');day=first['days'][0]
        raw=self.template(id=day['template_id'],name='Frühdienst',calendar_entity='',calendar_mode='no_event')
        updated=await self.wake.save_day_template(hass,admin,raw,day['template_revision'])
        second=await self.wake.create_card(hass,admin,{**c,'card_id':'second','alarm_id':'second','days':[self.custom_day(id='local',name='Frühdienst',calendar_entity='',calendar_mode='event')]})
        self.assertEqual(second['days'][0]['template_id'],day['template_id']);self.assertEqual(len(entry.options['day_templates']),1)
        duplicate=await self.wake.save_day_template(hass,admin,{**raw,'id':'another_id'},0);self.assertTrue(duplicate['already_exists'])
        alias={**updated['template'],'id':'old_duplicate','calendar_mode':'event'};entry.options['day_templates']['old_duplicate']=alias
        entry.options['wake_cards']['second']['days'][0]['template_id']='old_duplicate'
        settings=deepcopy(entry.options['wake_cards']['second']['settings'])
        catalog=await self.wake.catalog(hass,admin);self.assertEqual(len(catalog['shared_days']),1);self.assertEqual(catalog['shared_days'][0]['uses'],2)
        self.assertEqual(entry.options['wake_cards']['second']['settings'],settings);self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['settings']['types']['arbeit']['time'],'07:23')
        before=deepcopy(entry.options);await self.wake.catalog(hass,admin);self.assertEqual(entry.options,before)
        invalid=[self.custom_day(id='one'),self.custom_day(id='two',name=' Arbeit ')];
        with self.assertRaises(self.wake.AccessError):self.wake.validate_days(invalid)

    def add_hue_scene(self,hass,states,scene_id='scene.relax',members=('light.one',)):
        hass.registry.entities[scene_id]=NS(platform='hue',unique_id=scene_id,disabled_by=None,device_id='room',config_entry_id='hue')
        states[scene_id]=NS(entity_id=scene_id,state='unknown',attributes={'friendly_name':'Entspannen','entity_id':list(members)})

    async def test_hue_catalog_and_binding_exclude_extra_lamps_non_hue_and_denied_scenes(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture();self.add_hue_scene(hass,states)
        self.add_hue_scene(hass,states,'scene.extra',('light.one','light.unselected'))
        states['scene.fake']=NS(entity_id='scene.fake',state='unknown',attributes={'entity_id':['light.one']})
        catalog=await self.wake.catalog(hass,admin,owner.id);self.assertEqual([scene['id'] for scene in catalog['hue_scenes']],['scene.relax'])
        with self.assertRaises(self.wake.AccessError):await self.wake.create_card(hass,admin,{**c,'hue_scene':'scene.extra'})
        self.assertNotIn('wake_cards',entry.options)
        owner.permissions=NS(check_entity=lambda entity_id,policy:entity_id!='scene.relax')
        self.assertFalse((await self.wake.catalog(hass,admin,owner.id))['hue_scenes'])
        with self.assertRaises(self.wake.AccessError):await self.wake.create_card(hass,admin,{**c,'hue_scene':'scene.relax'})

    async def test_hue_group_scope_and_disabled_group_cached_membership(self):
        hass,_,owner,admin,_,c,states,_=self.fixture();self.add_hue_scene(hass,states)
        states['light.group']=NS(entity_id='light.group',state='off',attributes={'is_hue_group':True,'entity_id':['light.one','light.two']})
        hass.registry.entities['light.group']=NS(platform='hue',device_id='room',config_entry_id='hue',disabled_by=None)
        group=[{'entity_id':'light.group'}]
        self.assertIsNone(self.wake.hue_scenes.covered_lights(hass,group,'scene.relax'))  # Partial overlap would override the scene.
        states['scene.relax'].attributes.pop('entity_id')
        self.assertEqual(self.wake.hue_scenes.covered_lights(hass,group,'scene.relax'),{'light.group'})
        states.pop('light.group')
        api=NS(scenes=NS(get_group=Mock(return_value=NS(services=[NS(rtype='grouped_light',rid='group')]))),groups=NS(grouped_light=NS(get_lights=Mock(return_value=[NS(id='one'),NS(id='two')]))))
        hass.config_entries.async_get_entry=Mock(return_value=NS(runtime_data=NS(api=api)))
        hass.registry.async_get_entity_id=lambda domain,platform,unique_id:'light.'+unique_id
        self.assertEqual(self.wake.hue_scenes.scene_members(hass,'scene.relax'),{'light.one','light.two'})
        hass.registry.async_get_entity_id=lambda *args:None
        self.assertFalse(self.wake.hue_scenes.scene_members(hass,'scene.relax'))

    async def test_hue_wake_applies_scene_once_and_preserves_individual_uncovered_lamp(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture();self.add_hue_scene(hass,states)
        await self.wake.create_card(hass,admin,{**c,'hue_scene':'scene.relax'});record=entry.options['wake_cards'][c['alarm_id']]
        await self.wake.execute(hass,entry,record,owner,'wochenende','wake')
        calls=[(call.args[0],call.args[1],call.args[2]) for call in hass.services.async_call.await_args_list]
        self.assertEqual(calls.count(('scene','turn_on',{'entity_id':'scene.relax'})),1)
        self.assertFalse(any(domain=='light' and data['entity_id']=='light.one' for domain,_,data in calls))
        self.assertIn(('light','turn_on',{'entity_id':'light.two','brightness_pct':60,'rgb_color':[250,120,30]}),calls)

    async def test_hue_sunrise_uses_scene_transition_and_changed_scene_scope_fails_closed(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture();self.add_hue_scene(hass,states)
        await self.wake.create_card(hass,admin,{**c,'hue_scene':'scene.relax'});record=entry.options['wake_cards'][c['alarm_id']];record['settings']['types']['schultag']['sunrise_minutes']=10
        with patch.object(self.wake.asyncio,'sleep',new=AsyncMock()):await self.wake.execute(hass,entry,record,owner,'schultag','sunrise')
        scene_calls=[call.args[2] for call in hass.services.async_call.await_args_list if call.args[0]=='scene'];self.assertEqual(scene_calls,[{'entity_id':'scene.relax','transition':599}])
        self.assertTrue(any(call.args[2]=={'entity_id':'light.one','brightness_pct':1} for call in hass.services.async_call.await_args_list))
        hass.services.async_call.reset_mock();states['scene.relax'].attributes['entity_id'].append('light.unselected')
        with self.assertRaises(self.wake.AccessError) as error:await self.wake.execute(hass,entry,record,owner,'wochenende','wake')
        self.assertFalse(any(call.args[0]=='scene' or call.args[2].get('entity_id')=='light.unselected' for call in hass.services.async_call.await_args_list))
        self.assertEqual({call.args[2]['entity_id'] for call in hass.services.async_call.await_args_list if call.args[0]=='light'},{'light.one','light.two'})
        self.assertIn('fehlgeschlagen',str(error.exception))

    async def test_playback_policy_is_owned_validated_and_independent_of_other_settings(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture();data=await self.wake.create_card(hass,admin,c)
        self.assertEqual(data['playback'],{'mode':'duration','minutes':5})
        original=deepcopy(data['settings'])
        for minutes in [0,1441,True,1.5]:
            with self.assertRaises(self.wake.AccessError):await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'duration','minutes':minutes})
        with self.assertRaises(self.wake.AccessError):await self.wake.set_playback(hass,other,c['alarm_id'],c['card_id'],{'mode':'duration','minutes':9})
        data=await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'duration','minutes':9})
        self.assertEqual(data['settings'],original);self.assertEqual(data['binding'],c)
        await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],original,data['revision'])
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['playback']['minutes'],9)

    async def test_settings_and_playback_save_atomically_with_revision_and_selection_validation(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture();data=await self.wake.create_card(hass,admin,c)
        stored=deepcopy(entry.options['wake_cards'][c['alarm_id']])
        settings=deepcopy(data['settings']);settings['volume']=14
        for policy in [{'mode':'duration','minutes':0},{'mode':'track_end','minutes':5}]:
            if policy['mode']=='track_end':
                hass.user_stores[owner.id].data['music_manager_alarm_music'][c['alarm_id']]={'kind':'radio','uri':'media-source://radio_browser/swr3','media_type':'radio','title':'SWR3'}
            with self.assertRaises(self.wake.AccessError):
                await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'],playback=policy)
            self.assertEqual(entry.options['wake_cards'][c['alarm_id']],stored)
        policy={'mode':'duration','minutes':9}
        with self.assertRaises(self.wake.AccessError):
            await self.wake.update_card(hass,other,c['alarm_id'],c['card_id'],settings,data['revision'],playback=policy)
        result=await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'],playback=policy)
        self.assertEqual(result['settings']['volume'],14);self.assertEqual(result['playback'],policy)
        with self.assertRaises(self.wake.AccessError):
            await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],data['settings'],data['revision'],playback={'mode':'duration','minutes':3})
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['playback'],policy)

    async def test_usage_refresh_reads_current_nested_cards_and_keeps_unassigned_programs(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();data=await self.wake.create_card(hass,admin,c)
        module=types.ModuleType('homeassistant.components.lovelace.const');module.LOVELACE_DATA='lovelace';module.ConfigNotFound=type('ConfigNotFound',(Exception,),{})
        self.enterContext(patch.dict(sys.modules,{module.__name__:module}))
        card={'type':'custom:wecker-manager-card','alarm_id':c['alarm_id'],'card_id':c['card_id']}
        loader=AsyncMock(return_value={'views':[{'sections':[{'cards':[{'type':'vertical-stack','cards':[card,card,{'type':['unrelated']}]}]}]}]})
        automatic=NS(mode='storage',config=None,async_load=AsyncMock(side_effect=module.ConfigNotFound))
        hass.data['lovelace']=NS(dashboards={None:automatic,'maximilian':NS(mode='storage',config={'title':'Maximilian'},async_load=loader)})
        before=deepcopy(entry.options)
        result=await self.wake.catalog(hass,admin,refresh_usage=True)
        self.assertIn('usage_checked_at',result);self.assertTrue(result['shared_days'])
        for day in result['shared_days']:
            self.assertEqual(day['uses'],1);self.assertEqual(day['stored_uses'],1);self.assertEqual(day['unassigned'],[])
            self.assertEqual(day['used_by'][0]['dashboards'],['Maximilian'])
        loader.assert_awaited_with(force=True)
        loader.return_value={'views':[{'cards':[{**card,'card_id':'replaced_card'}]}]}
        result=await self.wake.catalog(hass,admin,refresh_usage=True)
        for day in result['shared_days']:
            self.assertEqual(day['uses'],0);self.assertEqual(day['stored_uses'],1);self.assertTrue(day['unassigned']);self.assertEqual(day['used_by'],[])
        self.assertEqual(entry.options,before)
        loader.return_value={'views':[{'cards':[{**card,'type':'custom:wecker-manager-status-card'}]}]}
        self.assertTrue(all(day['uses']==1 for day in (await self.wake.catalog(hass,admin,refresh_usage=True))['shared_days']))
        loader.side_effect=RuntimeError('YAML broken')
        with self.assertRaises(self.wake.AccessError):await self.wake.catalog(hass,admin,refresh_usage=True)
        with self.assertRaises(self.wake.AccessError):await self.wake.catalog(hass,owner,refresh_usage=True)
        self.assertEqual(entry.options,before)

    async def test_fixed_duration_repeats_on_all_bound_queues_and_stops_at_the_actual_deadline(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();await self.activate(hass,admin,c)
        await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'duration','minutes':9})
        record=entry.options['wake_cards'][c['alarm_id']];self.events.async_call_later.reset_mock()
        await self.wake.execute(hass,entry,record,owner,'schultag','wake')
        repeats=hass.mass.player_queues.set_repeat.await_args_list
        self.assertEqual({call.args[0] for call in repeats},{'RINCON_AABBCCDDEEFF01400','RINCON_11223344556601400'});self.assertTrue(all(call.args[1]=='one' for call in repeats))
        self.assertEqual(self.events.async_call_later.call_args.args[1],540)
        self.assertTrue(all(call.kwargs['radio_mode'] is False for call in hass.mass.player_queues.play_media.await_args_list))
        type(self).now+=timedelta(minutes=9,seconds=-1);hass.services.async_call.reset_mock();await self.wake.stop_due(hass,entry,c['alarm_id'],entry.options['wake_cards'][c['alarm_id']],owner)
        hass.services.async_call.assert_not_awaited()
        callback=self.events.async_call_later.call_args.args[2];type(self).now+=timedelta(seconds=1);await callback(self.now)
        stops=[call.args[2]['entity_id'] for call in hass.services.async_call.await_args_list if call.args[1]=='media_stop'];self.assertEqual(set(stops),set(c['speakers']));self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['stops'],[])
        self.assertTrue(all(call.args[1]=='off' for call in hass.mass.player_queues.set_repeat.await_args_list[-2:]))

    async def test_title_end_uses_a_single_non_repeating_track_and_has_no_forced_cutoff(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();await self.activate(hass,admin,c)
        await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'track_end','minutes':5})
        record=entry.options['wake_cards'][c['alarm_id']];await self.wake.execute(hass,entry,record,owner,'schultag','wake')
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']]['stops'],[]);self.assertFalse(self.wake.runtime(hass)['stop_timers'])
        self.assertTrue(all(call.args[1]=='off' for call in hass.mass.player_queues.set_repeat.await_args_list))
        type(self).now+=timedelta(hours=1);hass.services.async_call.reset_mock();await self.wake.stop_due(hass,entry,c['alarm_id'],entry.options['wake_cards'][c['alarm_id']],owner);hass.services.async_call.assert_not_awaited()
        store=hass.user_stores[owner.id].data['music_manager_alarm_music'];store[c['alarm_id']]={'kind':'radio','uri':'media-source://radio_browser/swr3','media_type':'radio','title':'SWR3'}
        with self.assertRaises(self.wake.AccessError):await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'track_end','minutes':5})
        with self.assertRaises(self.wake.AccessError):await self.wake.play_speaker(hass,entry,record,owner,c['speakers'][0])

    async def test_pending_music_deadlines_are_restored_after_restart_and_failed_stops_are_retried(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();await self.activate(hass,admin,c);await self.wake.execute(hass,entry,entry.options['wake_cards'][c['alarm_id']],owner,'schultag','wake')
        hass.data.pop(self.wake.RUNTIME);type(self).now+=timedelta(minutes=6);self.events.async_call_later.reset_mock();self.wake.async_setup_wake_cards(hass)
        self.assertEqual(self.events.async_call_later.call_args.args[1],0);callback=self.events.async_call_later.call_args.args[2]
        hass.services.async_call.side_effect=RuntimeError('Offline');await callback(self.now);self.assertTrue(entry.options['wake_cards'][c['alarm_id']]['stops']);self.assertEqual(self.events.async_call_later.call_args.args[1],15)
        hass.services.async_call.side_effect=None;await self.events.async_call_later.call_args.args[2](self.now);self.assertFalse(entry.options['wake_cards'][c['alarm_id']]['stops'])
        self.wake.async_unload_wake_cards(hass);self.assertFalse(self.wake.runtime(hass).get('stop_timers'))

    async def test_day_identity_display_name_and_usage_are_independent(self):
        hass,entry,owner,admin,other,c,_,_=self.fixture();c['name']='Maximilians Wecker';c['days']=[self.custom_day(name='Schultag Kinder',display_name='Schultag',calendar_entity='')]
        first=await self.activate(hass,admin,c,kind='arbeit',time='07:23');self.add_other_account(hass,other)
        await self.wake.create_card(hass,admin,{**c,'name':'Pauls Wecker','alarm_id':'paul','card_id':'paul','owner_id':other.id,'days':first['days']})
        shared=(await self.wake.catalog(hass,admin))['shared_days'][0];self.assertEqual(shared['display_name'],'Schultag');self.assertEqual({item['name'] for item in shared['used_by']},{'Maximilians Wecker','Pauls Wecker'})
        raw={key:shared[key] for key in self.wake.shared_days.COMMON};raw.update(id=shared['id'],name='Wochentag Kinder')
        await self.wake.save_day_template(hass,admin,raw,shared['revision']);record=entry.options['wake_cards'][c['alarm_id']]
        self.assertEqual(record['days'][0]['name'],'Wochentag Kinder');self.assertEqual(record['days'][0]['display_name'],'Schultag');self.assertEqual(record['settings']['types']['arbeit']['time'],'07:23')
        with self.assertRaises(self.wake.AccessError):await self.wake.save_day_template(hass,admin,{**raw,'id':'duplicate','weekdays':[6]},0)
        await self.wake.save_day_template(hass,admin,{**raw,'id':'separate','name':'Schultag Erwachsene','weekdays':[6]},0)
        self.assertEqual(len((await self.wake.catalog(hass,admin))['shared_days']),2)

    async def test_legacy_ambiguous_names_gain_unique_identifiers_without_changing_card_labels(self):
        shared=self.wake.shared_days
        hass,entry,owner,admin,_,c,_,_=self.fixture();c['days']=[self.custom_day(calendar_entity='')];first=await self.wake.create_card(hass,admin,c)
        other=deepcopy(entry.options['wake_cards'][c['alarm_id']]);other['binding']['alarm_id']='other';other['days'][0].update(template_id='another',weekdays=[6]);other['days'][0].pop('display_name',None)
        entry.options['day_templates']['another']={**self.template(id='another',calendar_entity='',weekdays=[6]),'revision':1};entry.options['wake_cards']['other']=other
        templates,cards,_=shared.migrate(entry.options);self.assertEqual(len({item['name'].casefold() for item in templates.values()}),2);self.assertEqual(cards['other']['days'][0]['display_name'],'Arbeit')
        _,again,changed=shared.migrate({'day_templates':templates,'wake_cards':cards});self.assertEqual(again,cards);self.assertFalse(changed)

    def hue_action_bridge(self,hass,states):
        self.add_hue_scene(hass,states,'scene.room',('light.one','light.two','light.extra'))
        actions=[NS(target=NS(rid=id_),action=NS(on=NS(on=True),dimming=NS(brightness=brightness),color=None,color_temperature=None,dynamics=None)) for id_,brightness in [('one',35),('two',60),('extra',90)]]
        api=NS(scenes={'scene.room':NS(actions=actions)},lights=NS(update=AsyncMock()))
        async def request(call):await call
        bridge=NS(api=api,async_request_call=request);hass.config_entries.async_get_entry=Mock(return_value=NS(runtime_data=bridge));hass.registry.async_get_entity_id=lambda domain,platform,rid:'light.'+rid
        return bridge

    async def test_hue_scene_selection_and_execution_are_scoped_to_each_individual_light(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture();bridge=self.hue_action_bridge(hass,states)
        c['lights'][0]['hue_scene']='scene.room';data=await self.wake.create_card(hass,admin,c)
        self.assertEqual(data['binding']['lights'][0]['hue_scene'],'scene.room')
        catalog=await self.wake.catalog(hass,admin,owner.id);self.assertEqual(catalog['hue_scenes'][0]['lights'],['light.one','light.two'])
        await self.wake.execute(hass,entry,entry.options['wake_cards'][c['alarm_id']],owner,'wochenende','wake')
        bridge.api.lights.update.assert_awaited_once();call=bridge.api.lights.update.await_args;self.assertEqual(call.args[0],'one');self.assertEqual(call.args[1].dimming.brightness,35)
        self.assertTrue(any(call.args[0]=='light' and call.args[2]['entity_id']=='light.two' for call in hass.services.async_call.await_args_list));self.assertFalse(any(call.args[0]=='scene' for call in hass.services.async_call.await_args_list))
        owner.permissions=NS(check_entity=lambda entity_id,policy:entity_id!='light.one')
        with self.assertRaises(self.wake.AccessError):self.wake.checked_light_scene(hass,owner,None,'scene.room','light.one')

    async def test_per_light_hue_sunrise_uses_the_selected_scene_values_and_transition(self):
        hass,entry,owner,admin,_,c,states,_=self.fixture();bridge=self.hue_action_bridge(hass,states);c['lights'][0]['hue_scene']='scene.room';await self.wake.create_card(hass,admin,c)
        record=entry.options['wake_cards'][c['alarm_id']];record['settings']['types']['schultag']['sunrise_minutes']=10
        module=types.ModuleType('aiohue.v2.models.feature');module.DynamicsFeaturePut=lambda **kwargs:NS(**kwargs)
        with patch.dict(sys.modules,{'aiohue.v2.models.feature':module}),patch.object(self.wake.asyncio,'sleep',new=AsyncMock()):await self.wake.execute(hass,entry,record,owner,'schultag','sunrise')
        self.assertEqual(bridge.api.lights.update.await_args.args[1].dynamics.duration,599000);self.assertEqual(bridge.api.lights.update.await_args.args[0],'one')

    def saved_dashboard(self, hass, cards):
        loader=AsyncMock(return_value={'views':[{'sections':[{'cards':cards}]}]})
        hass.data['lovelace']=NS(dashboards={'family':NS(mode='storage',config={'title':'Familie'},async_load=loader)})
        return loader

    async def test_editor_draft_has_no_alarm_mapping_or_day_usage_until_dashboard_is_saved(self):
        from custom_components.wecker_manager.card_setups import prepare_setup, synchronize_saved_setups
        hass,entry,owner,admin,_,c,_,_=self.fixture();music=hass.data['music_manager']['entry'];old_music=deepcopy(music.options)
        loader=self.saved_dashboard(hass,[])
        draft=await prepare_setup(hass,admin,c)
        self.assertFalse(entry.options.get('wake_cards'));self.assertFalse(entry.options.get('day_templates'));self.assertEqual(music.options,old_music)
        await synchronize_saved_setups(hass)
        self.assertFalse(entry.options.get('wake_cards'));self.assertEqual(music.options,old_music)
        # The durable draft survives restart, but is still not executable.
        hass.data.pop(self.wake.RUNTIME,None)
        loader.return_value={'views':[{'cards':[{'type':'custom:wecker-manager-card',**draft['config'],'setup_id':draft['setup_id']}]}]}
        await synchronize_saved_setups(hass)
        record=entry.options['wake_cards'][c['alarm_id']]
        self.assertEqual(record['setup_id'],draft['setup_id']);self.assertEqual(record['binding'],c)
        self.assertFalse(entry.options['pending_setups']);self.assertEqual(len(music.options['alarms']),1)
        before=deepcopy(entry.options);await synchronize_saved_setups(hass);self.assertEqual(entry.options,before)

    async def test_prepared_edit_does_not_change_existing_alarm_and_stale_saved_edit_cannot_overwrite_it(self):
        from custom_components.wecker_manager.card_setups import prepare_setup, synchronize_saved_setups
        hass,entry,owner,admin,_,c,_,_=self.fixture();data=await self.activate(hass,admin,c)
        original=deepcopy(entry.options['wake_cards'][c['alarm_id']])
        draft=await prepare_setup(hass,admin,{**c,'name':'Entwurf'},data['revision'])
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']],original)
        settings=deepcopy(data['settings']);settings['volume']=14
        await self.wake.update_card(hass,owner,c['alarm_id'],c['card_id'],settings,data['revision'])
        self.saved_dashboard(hass,[{'type':'custom:wecker-manager-card',**draft['config'],'setup_id':draft['setup_id']}])
        await synchronize_saved_setups(hass)
        record=entry.options['wake_cards'][c['alarm_id']]
        self.assertEqual(record['name'],original['name']);self.assertEqual(record['settings']['volume'],14)
        self.assertIn(draft['setup_id'],entry.options['pending_setups']);self.assertIn('zwischenzeitlich',self.wake.runtime(hass)['errors'][c['card_id']])

    async def test_saved_prepared_edit_preserves_personal_settings_and_playback(self):
        from custom_components.wecker_manager.card_setups import prepare_setup, synchronize_saved_setups
        hass,entry,owner,admin,_,c,_,_=self.fixture();await self.activate(hass,admin,c,time='07:23')
        await self.wake.set_playback(hass,owner,c['alarm_id'],c['card_id'],{'mode':'duration','minutes':9})
        old=deepcopy(entry.options['wake_cards'][c['alarm_id']])
        draft=await prepare_setup(hass,admin,{**c,'name':'Umbenannt'},old['revision'])
        self.assertEqual(entry.options['wake_cards'][c['alarm_id']],old)
        self.saved_dashboard(hass,[{'type':'custom:wecker-manager-card',**draft['config'],'setup_id':draft['setup_id']}])
        await synchronize_saved_setups(hass)
        record=entry.options['wake_cards'][c['alarm_id']]
        self.assertEqual(record['name'],'Umbenannt');self.assertEqual(record['settings'],old['settings']);self.assertEqual(record['playback'],old['playback'])

    async def test_draft_payload_tampering_revoked_admin_and_expiry_never_create_an_alarm(self):
        from custom_components.wecker_manager.card_setups import prepare_setup, synchronize_saved_setups
        hass,entry,owner,admin,_,c,_,_=self.fixture()
        with self.assertRaises(self.wake.AccessError):await prepare_setup(hass,owner,c)
        draft=await prepare_setup(hass,admin,c)
        saved={'type':'custom:wecker-manager-card',**draft['config'],'setup_id':draft['setup_id']}
        loader=self.saved_dashboard(hass,[{**saved,'name':'Nachträglich verändert'}]);await synchronize_saved_setups(hass)
        self.assertFalse(entry.options.get('wake_cards'));self.assertIn('verändert',self.wake.runtime(hass)['errors'][c['card_id']])
        loader.return_value={'views':[{'cards':[saved]}]};admin.is_admin=False
        await synchronize_saved_setups(hass);self.assertFalse(entry.options.get('wake_cards'))
        admin.is_admin=True;type(self).now+=timedelta(days=2)
        await synchronize_saved_setups(hass);self.assertFalse(entry.options.get('wake_cards'));self.assertFalse(entry.options['pending_setups'])

    async def test_dashboard_save_listener_commits_without_a_card_or_browser_request(self):
        from custom_components.wecker_manager.card_setups import prepare_setup
        hass,entry,_,admin,_,c,_,_=self.fixture()
        draft=await prepare_setup(hass,admin,c)
        loader=self.saved_dashboard(hass,[{'type':'custom:wecker-manager-card',**draft['config'],'setup_id':draft['setup_id']}])
        self.wake.async_setup_wake_cards(hass)
        callback=hass.bus.async_listen.call_args.args[1]
        await callback(NS(data={'url_path':'family'}))
        self.assertIn(c['alarm_id'],entry.options['wake_cards'])
        loader.assert_awaited_with(force=False)
        self.wake.async_unload_wake_cards(hass)
        hass.bus.async_listen.return_value.assert_called_once();hass.bus.async_listen_once.return_value.assert_called_once()

    async def test_pending_card_owner_waits_without_creating_an_alarm_or_exposing_other_users_drafts(self):
        from custom_components.wecker_manager.card_setups import prepare_setup
        hass,entry,owner,admin,other,c,_,_=self.fixture();await prepare_setup(hass,admin,c)
        connection=NS(user=owner,send_result=Mock(),send_error=Mock())
        message={'id':1,'action':'get','alarm_id':c['alarm_id'],'card_id':c['card_id']}
        await self.wake.websocket_wake_card(hass,connection,message)
        result=connection.send_result.call_args.args[1]
        self.assertTrue(result['pending']);self.assertFalse(result['exists']);self.assertFalse(result['can_create']);self.assertNotIn('config',result)
        connection.send_result.reset_mock();connection.user=other
        await self.wake.websocket_wake_card(hass,connection,message)
        connection.send_result.assert_not_called();connection.send_error.assert_called_once();self.assertFalse(entry.options.get('wake_cards'))

    async def test_unused_type_deletes_only_confirmed_orphans_and_their_music_bindings(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture()
        c['days']=[self.custom_day(id='old',name='Veraltet',calendar_entity='',confirm_disable=False),self.custom_day(id='spare',name='Sonstiges',calendar_entity='',confirm_disable=False)]
        old=await self.wake.create_card(hass,admin,{**c,'name':'Alter Entwurf'})
        real={**c,'alarm_id':'real_alarm','card_id':'real_card','name':'Echter Wecker','days':[self.custom_day(id='real',name='Aktuell',calendar_entity='',confirm_disable=False)]}
        await self.wake.create_card(hass,admin,real)
        self.saved_dashboard(hass,[{'type':'custom:wecker-manager-card',**real}])
        template=entry.options['day_templates'][old['days'][0]['template_id']]
        keep=deepcopy(entry.options['wake_cards']['real_alarm']);before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_day_template(hass,admin,template['id'],template['revision'])
        self.assertEqual(entry.options,before)
        remove=[{'alarm_id':c['alarm_id'],'card_id':c['card_id']}]
        result=await self.wake.delete_day_template(hass,admin,template['id'],template['revision'],remove)
        self.assertEqual(result['removed_cards'],1);self.assertNotIn(c['alarm_id'],entry.options['wake_cards']);self.assertNotIn(template['id'],entry.options['day_templates'])
        self.assertEqual(entry.options['wake_cards']['real_alarm'],keep)
        alarms=hass.data['music_manager']['entry'].options['alarms'];self.assertEqual([a['alarm_id'] for a in alarms],['real_alarm'])
        self.assertIn(old['days'][1]['template_id'],entry.options['day_templates'])
        hass.services.async_call.reset_mock();await self.wake.tick(hass,self.now);hass.services.async_call.assert_not_awaited()

    async def test_cleanup_rechecks_status_cards_read_errors_and_running_music_before_deleting(self):
        hass,entry,_,admin,_,c,_,_=self.fixture();old=await self.wake.create_card(hass,admin,c)
        template=entry.options['day_templates'][old['days'][0]['template_id']]
        remove=[{'alarm_id':c['alarm_id'],'card_id':c['card_id']}]
        loader=self.saved_dashboard(hass,[{'type':'custom:wecker-manager-status-card',**c}])
        before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_day_template(hass,admin,template['id'],template['revision'],remove)
        self.assertEqual(entry.options,before)
        loader.side_effect=RuntimeError('Unreadable dashboard')
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_day_template(hass,admin,template['id'],template['revision'],remove)
        self.assertEqual(entry.options,before)
        loader.side_effect=None;loader.return_value={'views':[]}
        entry.options['wake_cards'][c['alarm_id']]['stops']=[{'source':'media_player.sonos','at':(self.now+timedelta(minutes=9)).isoformat()}]
        before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError) as error:await self.wake.delete_day_template(hass,admin,template['id'],template['revision'],remove)
        self.assertEqual(error.exception.code,'wake_in_progress');self.assertEqual(entry.options,before)

    async def test_alarm_manager_lists_current_usage_and_running_guards_for_admins(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();await self.wake.create_card(hass,admin,{**c,'name':'Ungenutzter Wecker'})
        live={**c,'alarm_id':'live_alarm','card_id':'live_card','name':'Verwendeter Wecker'};await self.wake.create_card(hass,admin,live)
        self.saved_dashboard(hass,[{'type':'custom:wecker-manager-status-card',**live}])
        with self.assertRaises(self.wake.AccessError):await self.wake.list_cards(hass,owner)
        result=await self.wake.list_cards(hass,admin);rows={row['alarm_id']:row for row in result['cards']}
        self.assertTrue(rows[c['alarm_id']]['can_delete']);self.assertFalse(rows[c['alarm_id']]['dashboards']);self.assertTrue(rows[c['alarm_id']]['days']);self.assertEqual(rows[c['alarm_id']]['owner'],'Maximilian')
        self.assertFalse(rows['live_alarm']['can_delete']);self.assertEqual(rows['live_alarm']['dashboards'],['Familie']);self.assertIn('usage_checked_at',result)
        entry.options['wake_cards'][c['alarm_id']]['stops']=[{'at':self.now.isoformat(),'source':'media_player.sonos'}]
        row=next(row for row in (await self.wake.list_cards(hass,admin))['cards'] if row['alarm_id']==c['alarm_id'])
        self.assertFalse(row['can_delete']);self.assertIn('Musikstopp',row['blocked_reason'])

    async def test_individual_alarm_delete_keeps_all_day_types_and_other_alarms_and_cleans_its_drafts(self):
        from custom_components.wecker_manager.card_setups import prepare_setup
        hass,entry,_,admin,_,c,_,_=self.fixture();await self.wake.create_card(hass,admin,c)
        live={**c,'alarm_id':'live_alarm','card_id':'live_card','name':'Erhalten'};await self.wake.create_card(hass,admin,live)
        self.saved_dashboard(hass,[{'type':'custom:wecker-manager-card',**live}])
        old=deepcopy(entry.options['wake_cards'][c['alarm_id']]);keep=deepcopy(entry.options['wake_cards']['live_alarm']);templates=deepcopy(entry.options['day_templates'])
        pending=await prepare_setup(hass,admin,{**c,'name':'Offener Entwurf'},old['revision'])
        other=await prepare_setup(hass,admin,{**c,'alarm_id':'future_alarm','card_id':'future_card'})
        await self.wake.delete_card(hass,admin,c['alarm_id'],c['card_id'],old['revision'])
        self.assertNotIn(c['alarm_id'],entry.options['wake_cards']);self.assertEqual(entry.options['wake_cards']['live_alarm'],keep);self.assertEqual(entry.options['day_templates'],templates)
        self.assertNotIn(pending['setup_id'],entry.options['pending_setups']);self.assertIn(other['setup_id'],entry.options['pending_setups'])
        self.assertEqual([alarm['alarm_id'] for alarm in hass.data['music_manager']['entry'].options['alarms']],['live_alarm'])
        self.assertTrue(any(call.args[1].get('day_templates') for call in hass.bus.async_fire.call_args_list))

    async def test_individual_alarm_delete_rejects_stale_ids_current_cards_read_failures_and_running_stops(self):
        hass,entry,owner,admin,_,c,_,_=self.fixture();data=await self.wake.create_card(hass,admin,c)
        loader=self.saved_dashboard(hass,[]);before=deepcopy(entry.options)
        for caller,card_id,revision in [(owner,c['card_id'],data['revision']),(admin,'wrong_card',data['revision']),(admin,c['card_id'],0),(admin,c['card_id'],True)]:
            with self.assertRaises(self.wake.AccessError):await self.wake.delete_card(hass,caller,c['alarm_id'],card_id,revision)
            self.assertEqual(entry.options,before)
        loader.return_value={'views':[{'cards':[{'type':'custom:wecker-manager-status-card',**c}]}]}
        with self.assertRaises(self.wake.AccessError) as error:await self.wake.delete_card(hass,admin,c['alarm_id'],c['card_id'],data['revision'])
        self.assertEqual(error.exception.code,'card_in_use');self.assertEqual(entry.options,before)
        loader.side_effect=RuntimeError('Unavailable')
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_card(hass,admin,c['alarm_id'],c['card_id'],data['revision'])
        self.assertEqual(entry.options,before);loader.side_effect=None;loader.return_value={'views':[]}
        self.wake.runtime(hass)['busy'].add(c['card_id'])
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_card(hass,admin,c['alarm_id'],c['card_id'],data['revision'])
        self.assertEqual(entry.options,before);self.wake.runtime(hass)['busy'].clear()
        entry.options['wake_cards'][c['alarm_id']]['stops']=[{'at':self.now.isoformat(),'source':'media_player.sonos'}];before=deepcopy(entry.options)
        with self.assertRaises(self.wake.AccessError):await self.wake.delete_card(hass,admin,c['alarm_id'],c['card_id'],data['revision'])
        self.assertEqual(entry.options,before)
