import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const bundle=await readFile(new URL('../dist/wecker-manager-card.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({days,settings:override,header,status=false,admin=false,upcoming={schultag:{active:true,label:'13.11. 06:12'},wochenende:{active:false},ferien:{active:false}}}={}){
 const {window}=parseHTML('<!doctype html><html><body></body></html>'),{document}=window;
 window.HTMLElement.prototype.showModal=function(){this.open=true;};
 window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const context=vm.createContext({window,document,HTMLElement:window.HTMLElement,customElements:window.customElements,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,queueMicrotask,console,setTimeout,clearTimeout,URL,Promise});
 vm.runInContext("customElements.define('music-manager-alarm-row',class extends HTMLElement {static get supportsPlaybackSettings(){return true}setConfig(config){this.config=config}set hass(value){this._hass=value}});",context);
 vm.runInContext(bundle.replace(/^export /gm,''),context);
 const config={type:'custom:wecker-manager-card',alarm_id:'school',card_id:'card_1',owner_id:'max',speakers:['media_player.one','media_player.two'],covers:[{entity_id:'cover.one',position:60}],lights:[{entity_id:'light.one',brightness:70,color_mode:'keep'}],calendar_entity:'calendar.school',sunrise_minutes:5};
 if(header)config.header=header;
 const settings={volume:10,sunrise_minutes:5,types:{schultag:{time:'06:12',enabled:true,music:true,presets:['05:55','06:15']},wochenende:{time:'09:00',enabled:true,music:false,presets:['09:00','10:00','11:00']},ferien:{time:'10:00',enabled:true,music:false,presets:['09:00','10:00','11:00']}}};
 if(override)Object.assign(settings,clone(override));
 const record={exists:true,binding:clone(config),settings:clone(settings),revision:1,...(days?{days:clone(days)}:{})},calls=[],listeners=new Set();delete record.binding.type;
 let fail=false,user='max';
 const connection={async subscribeEvents(callback){listeners.add(callback);return ()=>listeners.delete(callback);}};
 const hass=()=>({user:{id:user,is_admin:admin},connection,states:{},async callWS(msg){calls.push(clone(msg));
  if(user!=='max'&&msg.type==='wecker_manager/card')throw {code:'unauthorized',message:'Anderer Benutzer'};
  if(msg.type==='music_manager/alarm')return {owner:'Maximilian',source:'Box',selection:{title:'TOP STRIKER'},songs:[]};
  if(msg.action==='day_info')return {date:'2026-11-14',kind:'wochenende',label:msg.day_offset===0?'Heute ist Schultag':'Morgen ist Wochenende'};
  if(msg.action==='upcoming')return {types:clone(upcoming)};
  if(msg.action==='get')return clone(record);
  if(msg.action==='catalog')return {shared_days:[],calendars:[]};
  if(msg.action==='update'){if(fail)throw {code:'save_failed',message:'Speichern fehlgeschlagen'};if(msg.revision!==record.revision)throw {code:'conflict',message:'Auf einem anderen Gerät geändert'};record.settings=clone(msg.settings);record.revision++;for(const callback of listeners)callback({data:{alarm_id:'school'}});return clone(record);}
  if(msg.action==='set_playback'){if(fail)throw {code:'save_failed',message:'Speichern fehlgeschlagen'};record.playback=clone(msg.playback);record.revision++;for(const callback of listeners)callback({data:{alarm_id:'school'}});return clone(record);}
  if(msg.action==='set_enabled'){if(fail)throw {code:'save_failed',message:'Speichern fehlgeschlagen'};record.settings.types[msg.kind].enabled=msg.enabled;record.revision++;for(const callback of listeners)callback({data:{alarm_id:'school'}});return clone(record);}
  throw Error('Unbekannte Anfrage');
 }});
 const card=document.createElement(status?'wecker-manager-status-card':'wecker-manager-card');card.setConfig({...config,...(status?{name:'Maximilian'}:{})});document.body.append(card);card.hass=hass();
 const click=(action,selector='')=>{const button=card.shadowRoot.querySelector(`[data-action="${action}"]${selector}`);assert(button,action+' exists');assert(!button.disabled);button.click();};
 return {card,config,record,window,document,calls,listeners,click,set fail(v){fail=v},switchUser(v){user=v;card.hass=hass()},remoteChange(change){change(record);record.revision++;for(const callback of listeners)callback({data:{alarm_id:'school'}});}};
}

test('wake wheel initializes at the saved time and cancel never persists',async()=>{
 const e=fixture();await flush();e.click('time','[data-kind="schultag"]');await flush();const wheel=e.card.shadowRoot.querySelector('wecker-manager-time-wheel');
 assert.equal(wheel.value,'06:12');wheel.shadowRoot.querySelector('[data-wheel="0"]').scrollTop=7*40;wheel.shadowRoot.querySelector('[data-wheel="1"]').scrollTop=23*40;
 assert.equal(wheel.value,'07:23');e.click('cancel-time');await flush();assert.equal(e.record.settings.types.schultag.time,'06:12');assert.equal(e.calls.filter(c=>c.action==='update').length,0);e.card.remove();
});
test('wake wheel commit, presets and music switches save shared settings',async()=>{
 const e=fixture();await flush();e.click('time','[data-kind="schultag"]');const wheel=e.card.shadowRoot.querySelector('wecker-manager-time-wheel');wheel.shadowRoot.querySelector('[data-wheel="0"]').scrollTop=7*40;wheel.shadowRoot.querySelector('[data-wheel="1"]').scrollTop=23*40;e.click('save-time');await flush();
 assert.equal(e.record.settings.types.schultag.time,'07:23');e.click('preset','[data-kind="schultag"][data-time="06:15"]');await flush();assert.equal(e.record.settings.types.schultag.time,'06:15');
 e.click('music','[data-kind="wochenende"]');await flush();assert.equal(e.record.settings.types.wochenende.music,true);assert.equal(e.card.shadowRoot.querySelector('[data-action="music"][data-kind="schultag"]'),null);e.card.remove();
});
test('wake settings contain volume, sunrise and at most three presets, never devices or accounts',async()=>{
 const e=fixture();await flush();e.click('settings');await flush();const dialog=e.card.shadowRoot.getElementById('wake-settings-dialog'),slider=dialog.querySelector('#wake-volume');
 assert.equal(slider.getAttribute('min'),'5');assert.equal(slider.getAttribute('max'),'15');assert.equal(dialog.querySelectorAll('select').length,3);assert(dialog.querySelector('#wake-sunrise-setting'));assert.equal(dialog.querySelectorAll('[data-ui-multi]').length,0);assert.equal(dialog.querySelector('[data-action="preset-add"][data-kind="wochenende"]'),null);
 slider.value='15';slider.dispatchEvent(new e.window.Event('input',{bubbles:true}));await flush();assert.equal(e.record.settings.volume,10);
 e.click('preset-remove','[data-kind="schultag"][data-slot="0"]');e.click('save-settings');await flush();assert.equal(e.record.settings.volume,15);assert.deepEqual(e.record.settings.types.schultag.presets,['06:15']);e.card.remove();
});
test('school disable requires confirmation and save failure retains the previous state',async()=>{
 const e=fixture();await flush();e.click('enabled','[data-kind="schultag"]');await flush();assert.equal(e.card.shadowRoot.getElementById('wake-confirm-dialog').open,true);assert.equal(e.record.settings.types.schultag.enabled,true);
 e.fail=true;e.click('confirm-disable');await flush();assert.equal(e.record.settings.types.schultag.enabled,true);assert.equal(e.card.shadowRoot.getElementById('wake-confirm-dialog').open,true);
 e.fail=false;e.click('confirm-disable');await flush();assert.equal(e.record.settings.types.schultag.enabled,false);e.card.remove();
});
test('server bindings update existing YAML copies and switching users clears old controls',async()=>{
 const e=fixture();await flush();e.card.setConfig({...e.config,speakers:['media_player.other']});await flush();assert.deepEqual(clone(e.card._config.speakers),e.record.binding.speakers);assert.equal(e.card.shadowRoot.querySelectorAll('[data-action="time"]').length,3);
 e.card.setConfig(e.config);await flush();e.switchUser('paul');await flush();assert.equal(e.card.shadowRoot.querySelectorAll('[data-action="time"]').length,0);assert.equal(e.card.shadowRoot.querySelector('music-manager-alarm-row'),null);e.card.remove();
});
test('live updates sync the card and a settings draft cannot overwrite a newer revision',async()=>{
 const e=fixture();await flush();e.remoteChange(record=>record.settings.types.ferien.time='11:42');await flush();assert.equal(e.card.shadowRoot.querySelector('[data-action="time"][data-kind="ferien"]').textContent,'11:42');
 e.click('settings');e.remoteChange(record=>record.settings.volume=14);await flush();e.click('save-settings');await flush();assert.equal(e.record.settings.volume,14);assert.match(e.card.shadowRoot.getElementById('wake-settings-status').textContent,/anderen Gerät/);
 e.card.remove();assert.equal(e.listeners.size,0);
});
test('reference layout has no day heading and keeps labelled icons and grouped presets',async()=>{
 const e=fixture();await flush();
 assert.equal(e.card.shadowRoot.querySelector('#wake-day,#wake-day-card'),null);
 assert.equal(e.card.shadowRoot.querySelectorAll('.wake-type').length,3);
 assert.equal(e.card.shadowRoot.querySelectorAll('.wake-symbol ha-icon').length,8);
 assert.equal(e.card.shadowRoot.querySelectorAll('.wake-presets[role="group"]').length,3);
 assert.equal(e.card.shadowRoot.querySelector('#wake-header .row-text'),null);
 assert.equal(e.card.shadowRoot.querySelector('music-manager-alarm-row').config.name,'Weckmusik');
 e.card.remove();
});
test('sunrise settings cancel without saving and save without changing fixed lamp bindings',async()=>{
 const e=fixture();await flush();const original=clone(e.config);e.click('settings');
 const select=e.card.shadowRoot.getElementById('wake-sunrise-setting');
 for(const option of select.options)option.toggleAttribute('selected',option.value==='15');
 select.dispatchEvent(new e.window.Event('change',{bubbles:true}));e.click('cancel-settings');
 assert.equal(e.record.settings.sunrise_minutes,5);
 e.click('settings');const updated=e.card.shadowRoot.getElementById('wake-sunrise-setting');
 for(const option of updated.options)option.toggleAttribute('selected',option.value==='15');
 updated.dispatchEvent(new e.window.Event('change',{bubbles:true}));e.click('save-settings');await flush();
 assert.equal(e.record.settings.sunrise_minutes,15);assert.deepEqual(e.config,original);
 e.card.remove();
});
test('custom day names and policies govern music switches and disable confirmation',async()=>{
 const days=[{id:'arbeit',name:'Frühdienst',icon:'mdi:briefcase',weekdays:[0,1,2,3,4],music_mode:'always',confirm_disable:false,calendar_entity:''},{id:'frei',name:'Freie Tage',icon:'mdi:coffee',weekdays:[5,6],music_mode:'switchable',confirm_disable:true,calendar_entity:''}];
 const item={time:'07:15',enabled:true,music:true,presets:['07:00'],calendar_mode:'event',sunrise_minutes:0};
 const e=fixture({days,settings:{types:{arbeit:clone(item),frei:clone(item)}}});await flush();
 assert.equal(e.card.shadowRoot.querySelectorAll('.wake-type').length,2);
 assert.match(e.card.shadowRoot.querySelector('.wake-type').textContent,/Frühdienst/);
 assert.equal(e.card.shadowRoot.querySelector('[data-action="music"][data-kind="arbeit"]'),null);
 assert(e.card.shadowRoot.querySelector('[data-action="music"][data-kind="frei"]'));
 e.click('enabled','[data-kind="arbeit"]');await flush();assert.equal(e.record.settings.types.arbeit.enabled,false);assert.equal(Boolean(e.card.shadowRoot.getElementById('wake-confirm-dialog').open),false);
 e.click('enabled','[data-kind="frei"]');assert(e.card.shadowRoot.getElementById('wake-confirm-dialog').open);
 assert.equal(e.card.shadowRoot.getElementById('wake-confirm-dialog-title').textContent,'Freie Tage ausschalten?');
 e.click('confirm-disable');await flush();assert.equal(e.record.settings.types.frei.enabled,false);
 assert.deepEqual(e.calls.filter(c=>c.action==='set_enabled').at(-1).confirm_disable,['frei']);e.card.remove();
});
test('calendar conditions are absent from the running card and weekdays remain visible',async()=>{
 const days=[{id:'arbeit',name:'Arbeit',icon:'mdi:briefcase',weekdays:[0,1,2,3,4],music_mode:'switchable',confirm_disable:false,calendar_entity:'calendar.school'}];
 const e=fixture({days,settings:{types:{arbeit:{time:'07:15',enabled:false,music:false,presets:[],calendar_mode:'event',sunrise_minutes:0}}}});await flush();
 assert.equal(e.card.shadowRoot.querySelector('[data-wake-calendar],.wake-calendar-rule'),null);
 assert.match(e.card.shadowRoot.querySelector('.wake-type .row-text small').textContent,/Mo, Di, Mi, Do, Fr/);e.card.remove();
});
test('switching one type does not resubmit unrelated settings and survives reload',async()=>{
 const e=fixture();await flush();e.record.settings.types.ferien.time='11:32';e.record.settings.volume=14;e.record.revision++;
 e.click('enabled','[data-kind="wochenende"]');await flush();
 assert.equal(e.record.settings.types.wochenende.enabled,false);assert.equal(e.record.settings.types.ferien.time,'11:32');assert.equal(e.record.settings.volume,14);
 const call=e.calls.find(c=>c.action==='set_enabled');assert.equal(call.kind,'wochenende');assert.equal(call.enabled,false);assert(!Object.hasOwn(call,'settings'));
 e.card.setConfig(e.config);await flush();assert.equal(e.card.shadowRoot.querySelector('[data-action="enabled"][data-kind="wochenende"]').textContent,'Einschalten');e.card.remove();
});
test('legacy header settings never bring back the removed heading; settings show a version',async()=>{
 for(const header of [{mode:'today'},{mode:'custom',title:'Mein Wecker'},{mode:'hidden'}]){
  const e=fixture({header});await flush();
  assert.equal(e.card.shadowRoot.querySelector('#wake-day,#wake-day-card'),null);
  assert.equal(e.calls.filter(c=>c.action==='day_info').length,0);
  assert.equal(e.card.shadowRoot.querySelectorAll('[data-action="settings"]').length,1);e.click('settings');assert(e.card.shadowRoot.getElementById('wake-settings-dialog').open);e.card.remove();
  assert.match(e.card.shadowRoot.querySelector('.version-info').textContent,/Wecker \d+\.\d+\.\d+/);
 }
});
test('next-24-hour activity highlights each whole group while symbols keep the primary colour',async()=>{
 const e=fixture();await flush();const icon=kind=>e.card.shadowRoot.querySelector(`[data-wake-kind="${kind}"]`);
 assert.equal(icon('schultag').dataset.nextActive,'true');assert.match(icon('schultag').getAttribute('aria-label'),/nächsten 24 Stunden/);
 assert.equal(icon('wochenende').dataset.nextActive,'false');assert.equal(icon('ferien').dataset.nextActive,'false');
 e.click('enabled','[data-kind="schultag"]');e.click('confirm-disable');await flush();assert.equal(icon('schultag').dataset.nextActive,'false');
 assert.equal(e.card.shadowRoot.querySelector('[data-wake-kind].today,[data-wake-kind].tomorrow'),null);e.card.remove();
});

test('compact status card follows the same alarms live and never creates a music row or write controls',async()=>{
 const e=fixture({status:true});await flush();
 assert.equal(e.card.shadowRoot.querySelector('#status-title').textContent,'Maximilian');assert.equal(e.card.shadowRoot.querySelectorAll('.status-line').length,3);
 assert.deepEqual([...e.card.shadowRoot.querySelectorAll('.status-time')].map(time=>time.textContent),['06:12','09:00','10:00']);
 assert.equal(e.card.shadowRoot.querySelectorAll('button,music-manager-alarm-row').length,0);assert(!e.calls.some(call=>call.type==='music_manager/alarm'));
 e.remoteChange(record=>{record.settings.types.schultag.enabled=false;record.settings.types.schultag.time='07:23';});await flush();assert.match(e.card.shadowRoot.querySelector('.status-line').getAttribute('aria-label'),/Schultag · Aus · 07:23 Uhr/);
 assert.equal(e.card.shadowRoot.querySelector('[data-status-kind="schultag"] time').getAttribute('datetime'),'07:23');
 assert.equal(e.card.shadowRoot.querySelector('.status-dot').classList.contains('on'),false);assert(!e.calls.some(call=>['create','update','set_enabled'].includes(call.action)));
 e.switchUser('paul');await flush();assert.equal(e.card.shadowRoot.querySelectorAll('.status-line').length,0);e.card.remove();assert.equal(e.listeners.size,0);
});

test('administrator settings render with supported UI Kit icons and open the shared day manager',async()=>{
 const e=fixture({admin:true});await flush();e.click('settings');
 assert(e.card.shadowRoot.querySelector('#wake-volume'));assert(e.card.shadowRoot.querySelector('[data-action="edit-card"]'));
 assert(e.card.shadowRoot.querySelector('#wake-settings').lastElementChild.classList.contains('version-info'));
 e.click('manage-templates');await flush();assert(e.card.shadowRoot.querySelector('#wake-templates-dialog').open);assert(e.card.shadowRoot.querySelector('wecker-manager-day-manager').shadowRoot.querySelector('[data-action="day-add"]'));
 e.card.remove();assert.equal(e.listeners.size,0);
});

test('shared music row saves playback policy without overwriting wake settings',async()=>{
 const e=fixture();await flush();const row=e.card.shadowRoot.querySelector('music-manager-alarm-row'),settings=clone(e.record.settings);assert.deepEqual(clone(row.playbackSettings.value),{mode:'duration',minutes:5});
 await row.playbackSettings.save({mode:'duration',minutes:9});await flush();assert.equal(e.record.playback.minutes,9);assert.deepEqual(e.record.settings,settings);assert(e.calls.some(call=>call.action==='set_playback'));
 e.fail=true;await assert.rejects(row.playbackSettings.save({mode:'track_end',minutes:9}));assert.equal(e.record.playback.mode,'duration');e.card.remove();
});
