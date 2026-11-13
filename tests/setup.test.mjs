import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const bundle=await readFile(new URL('../dist/wecker-manager-card.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup({config={},catalog:override,manager=false,alarms=false,storedCards=[],direct=true}={}){
 const {window}=parseHTML('<!doctype html><html><body></body></html>'),{document}=window;
 window.HTMLElement.prototype.showModal=function(){this.open=true;};
 window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const context=vm.createContext({window,document,HTMLElement:window.HTMLElement,customElements:window.customElements,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,queueMicrotask,console,setTimeout,clearTimeout,URL,Promise});
 vm.runInContext(bundle,context);
 const item=(id,label,attributes={})=>({id,label,description:id,attributes});
 const catalog={accounts:[{value:'max',label:'Maximilian'},{value:'paul',label:'Paul'}],speakers:[item('media_player.max','Maximilian'),item('media_player.second','Ankleide')],covers:[item('cover.one','Rollladen',{supported_features:4})],lights:[item('light.one','Deckenlicht',{supported_color_modes:['color_temp'],min_color_temp_kelvin:3000,max_color_temp_kelvin:6500})],calendars:[item('calendar.school','Schulfrei')],shared_days:[],hue_scenes:[]};
 if(override)Object.assign(catalog,override);
 const calls=[],events=[];let created=null,prepared=null,fail=false;
 const editor=document.createElement(alarms?'wecker-manager-alarm-manager':manager?'wecker-manager-day-manager':'wecker-manager-card-editor');
 editor.directSave=direct;
 if(!alarms)editor.setConfig({type:'custom:wecker-manager-card',alarm_id:'new_alarm',card_id:'new_card',owner_id:'',speakers:[],covers:[],lights:[],calendar_entity:'',sunrise_minutes:0,...config});
 editor.addEventListener('config-changed',e=>events.push(clone(e.detail.config)));
 editor.hass={user:{id:'admin',is_admin:true},connection:{async subscribeEvents(){return ()=>{}}},states:{},async callWS(msg){calls.push(clone(msg));
  if(msg.action==='get')return clone(created||{exists:false,can_create:true});
  if(msg.action==='list_cards'){if(fail)throw Error('Dashboard konnte nicht geladen werden');return {cards:clone(storedCards),usage_checked_at:'2026-11-13T15:00:00Z'};}
  if(msg.action==='delete_card'){if(fail)throw Error('Löschen fehlgeschlagen');const index=storedCards.findIndex(card=>card.alarm_id===msg.alarm_id&&card.card_id===msg.card_id&&card.revision===msg.revision);if(index<0||!storedCards[index].can_delete)throw Error('Wecker wird verwendet');storedCards.splice(index,1);return {deleted:true};}
  if(msg.action==='setup_status')return clone(prepared||{pending:false});
  if(msg.action==='prepare_setup'){
   if(fail)throw Error('Box ist offline');const {days,name,...binding}=msg.config;
   prepared={pending:true,setup_id:'pending_setup',base_revision:created?.revision||0,config:clone(msg.config),preview:{exists:true,binding:clone(binding),days:clone(days),name,revision:(created?.revision||0)+1,settings:clone(created?.settings||{types:{}})}};return clone(prepared);
  }
  if(msg.action==='catalog'){if(fail)throw Error('Dashboard konnte nicht geladen werden');return clone(catalog);}
  if(msg.action==='save_day_template'){
   if(fail)throw Error('Speichern fehlgeschlagen');const index=catalog.shared_days.findIndex(day=>day.id===msg.day_template.id),old=catalog.shared_days[index];
   if(old&&old.revision!==msg.revision)throw {code:'conflict',message:'Auf einem anderen Gerät geändert'};
   const day={...clone(msg.day_template),revision:msg.revision+1,uses:old?.uses||0};if(index<0)catalog.shared_days.push(day);else catalog.shared_days[index]=day;return {saved:true,template:clone(day)};
  }
  if(msg.action==='delete_day_template'){catalog.shared_days=catalog.shared_days.filter(day=>day.id!==msg.template_id);return {deleted:true};}
  if(msg.action==='create'){
   if(fail)throw Error('Box ist offline');const {days,name,...binding}=msg.config;
   created={exists:true,binding:clone(binding),days:clone(days),revision:1,settings:{types:Object.fromEntries(days.map(d=>[d.id,{enabled:false,time:'06:00',music:d.music_mode==='always',presets:[]}]))}};return clone(created);
  }
  if(msg.action==='configure_days'){created.days=clone(msg.days);created.revision++;return clone(created);}
  if(msg.action==='configure'){if(fail)throw Error('Box ist offline');if(msg.revision!==created.revision)throw {code:'conflict',message:'Auf einem anderen Gerät geändert'};const {days,name,...binding}=msg.config;created={...created,binding:clone(binding),days:clone(days),name,revision:created.revision+1};return clone(created);}
 }};
 document.body.append(editor);
 const click=(action,suffix='')=>{const el=editor.shadowRoot.querySelector(`[data-action="${action}"]${suffix}`);assert(el,action+' exists');assert(!el.disabled,action+' enabled');el.click();};
 const change=(id,value)=>{const el=editor.shadowRoot.getElementById(id);assert(el,id+' exists');if(el.tagName==='SELECT'){for(const option of el.options)option.removeAttribute('selected');el.querySelector(`[value="${value}"]`).setAttribute('selected','');}else el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const pick=async(kind,values)=>{click('picker-open',`[data-kind="${kind}"]`);for(const input of editor.shadowRoot.querySelectorAll('#setup-devices input[type="checkbox"]')){input.checked=values.includes(input.value);input.toggleAttribute('checked',input.checked);input.dispatchEvent(new window.Event('change',{bubbles:true}));}click('picker-save');await flush();};
 const weekdays=values=>{for(const input of editor.shadowRoot.querySelectorAll('#day-weekdays input')){input.checked=values.includes(Number(input.value));input.toggleAttribute('checked',input.checked);input.dispatchEvent(new window.Event('change',{bubbles:true}));}};
 const addDay=(name='Frühdienst')=>{click('day-add');change('day-name',name);weekdays([0,1,2,3,4]);click('day-save');return events.at(-1).days.at(-1).id;};
 const music=async()=>{if(!editor._config.days.length)addDay();click('setup-next');change('wake-owner','max');await flush();await pick('speakers',['media_player.max']);};
 return {editor,catalog,storedCards,calls,events,click,change,pick,music,addDay,weekdays,window,get created(){return created},saveDashboard(){created=clone(prepared.preview);prepared=null;},set fail(v){fail=v}};
}
test('configuration starts empty and requires explicitly chosen names and weekdays',async()=>{
 const e=setup();await flush();
 assert.equal(e.editor.shadowRoot.querySelectorAll('.setup-day-row').length,0);
 assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Noch keine Tagestypen/);
 assert.equal(e.editor.shadowRoot.querySelector('#wake-owner'),null);
 assert.equal(e.editor.shadowRoot.querySelector('#wake-alarm-id,#wake-replace'),null);
 assert(e.editor.shadowRoot.querySelector('[data-action="setup-next"]').disabled);
 e.click('day-add');assert.equal(e.editor.shadowRoot.querySelector('#day-name').value,'');assert.equal(e.editor.shadowRoot.querySelectorAll('#day-weekdays input:checked').length,0);
 e.change('day-name','Schicht');e.click('day-save');assert.match(e.editor.shadowRoot.querySelector('#setup-day-error').textContent,/Wochentag/);
 e.weekdays([1,3]);e.click('day-save');e.click('setup-next');assert(e.editor.shadowRoot.querySelector('[data-action="setup-next"]').disabled);
 e.change('wake-owner','max');await flush();await e.pick('speakers',['media_player.max','media_player.second']);e.click('setup-next');
 assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Rollläden/);e.click('setup-back');assert.equal(e.events.at(-1).speakers.length,2);e.editor.remove();
});
test('day dialog edits icon, music, confirmation, weekdays and its own calendar; cancel discards drafts',async()=>{
 const e=setup();await flush();const id=e.addDay('Schultag');e.click('day-edit',`[data-kind="${id}"]`);e.change('day-name','Frühdienst');e.click('day-cancel');
 assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Schultag/);
 e.click('day-edit',`[data-kind="${id}"]`);e.change('day-name','Frühdienst');e.change('day-icon','mdi:briefcase');e.change('day-music','switchable');e.change('day-confirm','click');e.change('day-calendar','calendar.school');e.change('day-calendar-mode','event');
 const friday=e.editor.shadowRoot.querySelector('#day-weekdays input[value="4"]');friday.checked=false;friday.removeAttribute('checked');friday.dispatchEvent(new e.window.Event('change',{bubbles:true}));e.click('day-save');
 const day=e.events.at(-1).days[0];assert.equal(day.name,'Frühdienst');assert.equal(day.icon,'mdi:briefcase');assert.equal(day.music_mode,'switchable');assert.equal(day.confirm_disable,false);assert.equal(day.calendar_entity,'calendar.school');assert.deepEqual(day.weekdays,[0,1,2,3]);
 assert.equal(day.calendar_mode,'event');assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/gebuchten Kalendertagen/);e.editor.remove();
});
test('empty day list cannot proceed; a new custom day becomes an independent persistent type',async()=>{
 const e=setup();await flush();
 assert(e.editor.shadowRoot.querySelector('[data-action="setup-next"]').disabled);
 e.click('day-add');e.change('day-name','Arbeit');e.change('day-icon','mdi:briefcase');e.weekdays([5,6]);e.click('day-save');
 const day=e.events.at(-1).days[0];assert.match(day.id,/^day_/);assert.equal(day.name,'Arbeit');assert(!e.editor.shadowRoot.querySelector('[data-action="setup-next"]').disabled);e.editor.remove();
});
test('preselected account and missing optional device lists still open every setup step',async()=>{
 const e=setup({config:{owner_id:'max',replace_automation:'automation.old',covers:null,lights:null},catalog:{covers:undefined,lights:null,calendars:undefined}});await flush();
 assert.equal(e.editor.shadowRoot.querySelectorAll('nav [data-action="navigate"]').length,5);assert(!Object.hasOwn(e.events.at(-1),'replace_automation'));
 e.addDay();e.click('setup-next');await e.pick('speakers',['media_player.max']);e.click('setup-next');e.click('picker-open','[data-kind="covers"]');e.click('picker-cancel');e.click('setup-next');e.click('picker-open','[data-kind="lights"]');e.click('picker-cancel');e.click('setup-next');
 assert(!e.editor.shadowRoot.querySelector('[data-action="setup-finish"]').disabled);e.editor.remove();
});
test('device dialogs retain per-device drafts and cancel without changing the configuration',async()=>{
 const e=setup();await flush();await e.music();e.click('setup-next');await e.pick('covers',['cover.one']);
 e.click('device-open','[data-kind="covers"]');e.change('setup-position','65');e.click('device-cancel');assert.equal(e.events.at(-1).covers[0].position,100);
 e.click('device-open','[data-kind="covers"]');e.change('setup-position','65');e.click('device-save');assert.equal(e.events.at(-1).covers[0].position,65);
 e.click('setup-next');await e.pick('lights',['light.one']);e.click('device-open','[data-kind="lights"]');e.change('setup-colourmode','temperature');e.click('device-save');
 assert.equal(e.events.at(-1).lights[0].kelvin,3000);e.click('setup-back');e.click('setup-next');assert.equal(e.events.at(-1).lights[0].kelvin,3000);e.editor.remove();
});
test('finishing creates one card; failed creation retains devices and day policies',async()=>{
 const e=setup();await flush();await e.music();for(let i=0;i<3;i++)e.click('setup-next');
 assert.equal(e.calls.filter(c=>c.action==='create').length,0);assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Maximilian/);
 e.fail=true;e.click('setup-finish');await flush();assert.match(e.editor.shadowRoot.querySelector('.error').textContent,/offline/);
 e.fail=false;e.click('setup-finish');await flush();assert.match(e.editor.shadowRoot.querySelector('.notice').textContent,/bearbeitet/);assert.equal(e.editor.shadowRoot.querySelectorAll('select').length,0);assert(e.editor.shadowRoot.querySelector('[data-action="edit-card"]'));
 const create=e.calls.find(c=>c.action==='create');assert.equal(create.config.days.length,1);assert(!Object.hasOwn(create.config,'replace_automation'));e.editor.remove();
});
test('administrator can configure existing day policies without changing fixed devices',async()=>{
 const e=setup();await flush();await e.music();for(let i=0;i<3;i++)e.click('setup-next');e.click('setup-finish');await flush();const binding=clone(e.created.binding);
 const id=e.created.days[0].id;e.click('manage-days');e.click('day-edit',`[data-kind="${id}"]`);e.change('day-name','Freie Tage');e.click('day-save');e.click('manage-days-cancel');
 e.click('manage-days');assert.match(e.editor.shadowRoot.querySelector('#setup-page')?.textContent||e.editor.shadowRoot.querySelector('#setup-body').textContent,/Frühdienst/);
 e.click('day-edit',`[data-kind="${id}"]`);e.change('day-name','Freie Tage');e.change('day-calendar','calendar.school');e.change('day-calendar-mode','no_event');e.click('day-save');e.click('manage-days-save');await flush();
 assert.equal(e.created.days[0].name,'Freie Tage');assert.equal(e.created.days[0].calendar_mode,'no_event');assert.deepEqual(e.created.binding,binding);
 assert.equal(e.editor.shadowRoot.querySelector('#wake-header-mode'),null);assert.deepEqual(e.created.binding,binding);e.editor.remove();
});
test('full card edit can change account, speakers and device targets without replacing the alarm',async()=>{
 const e=setup();await flush();await e.music();for(let i=0;i<3;i++)e.click('setup-next');e.click('setup-finish');await flush();const id=e.created.binding.card_id,settings=clone(e.created.settings);
 e.click('edit-card');await flush();const name=e.editor.shadowRoot.querySelector('#wake-name');name.value='Pauls Wecker';name.dispatchEvent(new e.window.Event('input',{bubbles:true}));e.click('setup-next');e.change('wake-owner','paul');await flush();await e.pick('speakers',['media_player.second']);
 e.click('setup-next');await e.pick('covers',['cover.one']);e.click('device-open','[data-kind="covers"]');e.change('setup-position','45');e.click('device-save');e.click('setup-next');e.click('setup-next');
 e.fail=true;e.click('setup-finish');await flush();assert.equal(e.created.binding.owner_id,'max');e.fail=false;e.click('setup-finish');await flush();
 assert.equal(e.created.binding.owner_id,'paul');assert.deepEqual(e.created.binding.speakers,['media_player.second']);assert.equal(e.created.binding.covers[0].position,45);assert.equal(e.created.binding.card_id,id);assert.deepEqual(e.created.settings,settings);assert.equal(e.created.name,'Pauls Wecker');e.editor.remove();
});
test('an existing shared school day can be reused with independent local music controls',async()=>{
 const shared={id:'day_shared_school',name:'Schultag',icon:'mdi:school',weekdays:[0,1,2,3,4],calendar_entity:'calendar.school',calendar_mode:'no_event',revision:2,uses:1};
 const e=setup({catalog:{shared_days:[shared]}});await flush();e.change('setup-shared-day',shared.id);e.click('day-use');
 assert.match(e.editor.shadowRoot.querySelector('#setup-day-body').textContent,/anderen Karten/);e.change('day-music','always');e.change('day-confirm','confirm');e.click('day-save');
 const day=e.events.at(-1).days[0];assert.equal(day.name,'Schultag');assert.equal(day.template_id,shared.id);assert.equal(day.template_revision,2);assert.equal(day.music_mode,'always');assert.notEqual(day.id,shared.id);assert.deepEqual(day.weekdays,[0,1,2,3,4]);e.editor.remove();
});

test('adopting the same named legacy day updates its original ID instead of inserting a second alarm',async()=>{
 const shared={id:'shared',name:'Schultag',icon:'mdi:school',weekdays:[0,1,2,3,4],calendar_entity:'',calendar_mode:'no_event',revision:2,uses:1};
 const legacy={...shared,id:'school_local',music_mode:'always',confirm_disable:true};delete legacy.revision;delete legacy.uses;
 const e=setup({config:{days:[legacy]},catalog:{shared_days:[shared,{...shared,id:'duplicate',calendar_mode:'event'}]}});await flush();
 assert.equal(e.editor.shadowRoot.querySelector('#setup-shared-day').options.length,2);
 e.change('setup-shared-day','duplicate');e.click('day-use');e.click('day-save');
 assert.equal(e.events.at(-1).days.length,1);assert.equal(e.events.at(-1).days[0].id,'school_local');assert.equal(e.events.at(-1).days[0].music_mode,'always');assert.equal(e.events.at(-1).days[0].confirm_disable,true);
 assert.equal(e.editor.shadowRoot.querySelector('#setup-shared-day'),null);
 e.click('day-edit','[data-kind="school_local"]');e.click('day-save');assert.equal(e.events.at(-1).days.length,1);e.editor.remove();
});
test('central day management saves common rules only, retains failed drafts, and deletes unused types with confirmation',async()=>{
 const used={id:'shared',name:'Schultag',icon:'mdi:school',weekdays:[0,1,2,3,4],calendar_entity:'',calendar_mode:'no_event',revision:2,uses:2};
 const e=setup({manager:true,catalog:{shared_days:[used]}});await flush();
 assert.match(e.editor.shadowRoot.querySelector('#setup-body').textContent,/Auf 2 Karten verwendet/);assert(e.editor.shadowRoot.querySelector('[data-action="template-delete"]').disabled);
 assert(!e.calls.some(call=>call.action==='get'));assert(!e.calls.find(call=>call.action==='catalog').owner_id);
 e.click('day-edit','[data-kind="shared"]');assert.equal(e.editor.shadowRoot.querySelectorAll('#day-music,#day-confirm').length,2);e.change('day-name','Schule');
 e.fail=true;e.click('day-save');await flush();assert.match(e.editor.shadowRoot.querySelector('#setup-day-error').textContent,/fehlgeschlagen/);assert(e.editor._dayDialog.open);
 e.fail=false;e.click('day-save');await flush();assert.equal(e.catalog.shared_days[0].name,'Schule');
 const save=e.calls.findLast(call=>call.action==='save_day_template');assert.deepEqual(Object.keys(save.day_template).sort(),['id','name','display_name','icon','weekdays','calendar_entity','calendar_mode','music_mode','confirm_disable'].sort());assert.equal(save.revision,2);
 e.click('day-add');e.change('day-name','Spätdienst');e.weekdays([5,6]);e.click('day-save');await flush();const day=e.catalog.shared_days[1];
 e.click('template-delete',`[data-kind="${day.id}"]`);assert.equal(e.calls.filter(call=>call.action==='delete_day_template').length,0);
 e.click('template-confirm-delete');await flush();assert.equal(e.catalog.shared_days.length,1);assert.equal(e.calls.find(call=>call.action==='delete_day_template').revision,1);e.editor.remove();
});
test('Hue scenes are edited per lamp and keep other lights independent',async()=>{
 const light=(id,attributes={})=>({id,label:id,attributes:{supported_color_modes:['rgb'],...attributes}});
 const e=setup({catalog:{lights:[light('light.one'),light('light.two')],hue_scenes:[{id:'scene.one',label:'Entspannen',members:['light.one','light.unselected'],lights:['light.one']},{id:'scene.two',label:'Sonnenlicht',members:['light.two'],lights:['light.two']}]}});await flush();await e.music();e.click('setup-next');e.click('setup-next');
 await e.pick('lights',['light.one','light.two']);assert.equal(e.editor.shadowRoot.querySelector('#wake-hue-scene'),null);
 e.click('device-open','[data-kind="lights"][data-index="0"]');assert.equal(e.editor.shadowRoot.querySelector('#setup-hue-scene').options.length,2);e.change('setup-hue-scene','scene.one');e.click('device-cancel');assert(!e.events.at(-1).lights[0].hue_scene);
 e.click('device-open','[data-kind="lights"][data-index="0"]');e.change('setup-hue-scene','scene.one');e.click('device-save');assert.equal(e.events.at(-1).lights[0].hue_scene,'scene.one');assert(!e.events.at(-1).lights[1].hue_scene);assert.equal(e.editor.shadowRoot.querySelectorAll('[data-action="device-open"]').length,2);
 e.click('device-open','[data-kind="lights"][data-index="1"]');assert(!e.editor.shadowRoot.querySelector('#setup-hue-scene [value="scene.one"]'));e.change('setup-hue-scene','scene.two');e.click('device-save');e.click('setup-next');assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Entspannen/);assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Sonnenlicht/);e.editor.remove();
});
test('day names identify a template while its independent display name is preserved',async()=>{
 const e=setup();await flush();const id=e.addDay('Schultag Maximilian');e.click('day-edit',`[data-kind="${id}"]`);e.change('day-display-name','Schultag');e.click('day-save');assert.equal(e.events.at(-1).days[0].display_name,'Schultag');
 e.click('day-edit',`[data-kind="${id}"]`);e.change('day-name','Schultag Paul');e.click('day-save');assert.equal(e.events.at(-1).days[0].name,'Schultag Paul');assert.equal(e.events.at(-1).days[0].display_name,'Schultag');e.editor.remove();
});
test('refresh checks current usage and separates saved alarms without a dashboard',async()=>{
 const day={id:'shared',name:'Schultag',icon:'mdi:school',weekdays:[0],calendar_entity:'',calendar_mode:'no_event',revision:2,uses:1,used_by:[{name:'Maximilians Wecker'}]};
 const e=setup({manager:true,catalog:{shared_days:[day]}});await flush();assert(e.calls.find(call=>call.action==='catalog').refresh_usage);
 Object.assign(e.catalog.shared_days[0],{uses:0,used_by:[],stored_uses:1,unassigned:[{name:'Maximilians alter Wecker'}]});e.catalog.usage_checked_at='2026-11-13T14:00:00Z';
 e.click('refresh-usage');await flush();assert.match(e.editor._body.textContent,/Weiterhin gespeicherte Wecker ohne Dashboardkarte: Maximilians alter Wecker/);assert.match(e.editor._body.textContent,/Zuletzt geprüft/);assert(!e.editor.shadowRoot.querySelector('[data-action="template-delete"]').disabled);
 e.fail=true;e.click('refresh-usage');await flush();assert.match(e.editor._body.textContent,/Dashboard konnte nicht geladen werden/);assert.match(e.editor._body.textContent,/Maximilians alter Wecker/);e.fail=false;
 Object.assign(e.catalog.shared_days[0],{stored_uses:0,unassigned:[]});e.click('refresh-usage');await flush();assert(!e.editor.shadowRoot.querySelector('[data-action="template-delete"]').disabled);assert.equal(e.calls.filter(call=>call.action==='catalog').length,4);e.editor.remove();
});
test('dashboard editor only prepares a draft; closing it never creates an alarm',async()=>{
 const e=setup({direct:false});await flush();assert(e.editor.shadowRoot.querySelector('#wake-name'));await e.music();assert.equal(e.editor.shadowRoot.querySelector('#wake-name'),null);for(let i=0;i<3;i++)e.click('setup-next');
 e.fail=true;e.click('setup-finish');await flush();assert.equal(e.created,null);assert.match(e.editor._body.textContent,/offline/);
 e.fail=false;e.click('setup-finish');await flush();assert.equal(e.created,null);assert.equal(e.events.at(-1).setup_id,'pending_setup');assert.match(e.editor._body.textContent,/Speichere jetzt die Dashboardkarte/);assert(!e.calls.some(call=>['create','configure','configure_days'].includes(call.action)));
 e.editor.setConfig(e.events.at(-1));await flush();assert.equal(e.created,null);assert.match(e.editor._body.textContent,/Speichere jetzt die Dashboardkarte/);
 const prepared=clone(e.events.at(-1));e.click('edit-card');await flush();e.change('wake-name','Nicht speichern');e.click('edit-card-cancel');assert.deepEqual(e.events.at(-1),prepared);e.editor.remove();assert.equal(e.created,null);
});
test('deleting an unused type names and confirms the exact stored alarms without cards',async()=>{
 const day={id:'unused',name:'Unbenutzt',icon:'mdi:alarm',weekdays:[0],calendar_entity:'',calendar_mode:'no_event',revision:2,uses:0,stored_uses:1,unassigned:[{name:'Alter Entwurf',alarm_id:'old_alarm',card_id:'old_card'}]};
 const e=setup({manager:true,catalog:{shared_days:[day]}});await flush();e.click('template-delete');assert.match(e.editor._templateConfirm.textContent,/Alter Entwurf/);assert(!e.calls.some(call=>call.action==='delete_day_template'));e.editor._templateConfirm.close();assert.equal(e.catalog.shared_days.length,1);
 e.click('template-delete');e.click('template-confirm-delete');await flush();assert.deepEqual(e.calls.find(call=>call.action==='delete_day_template').remove_cards,[{alarm_id:'old_alarm',card_id:'old_card'}]);assert.equal(e.catalog.shared_days.length,0);e.editor.remove();
});
test('alarm manager filters unused records, confirms deletion, retains errors and keeps day templates',async()=>{
 const card={alarm_id:'old_alarm',card_id:'old_card',revision:7,name:'Alter Wecker',owner:'Maximilian',days:['Schultag 06:12'],speakers:['Schlafzimmer'],dashboards:[],can_delete:true,blocked_reason:''};
 const used={...card,alarm_id:'live_alarm',card_id:'live_card',name:'Aktueller Wecker',dashboards:['Kinder'],can_delete:false,blocked_reason:'Zuerst aus den Karten entfernen.'};
 const e=setup({alarms:true,storedCards:[card,used],catalog:{shared_days:[{id:'shared',name:'Schultag'}]}});await flush();
 assert.match(e.editor._body.textContent,/Alter Wecker/);assert.doesNotMatch(e.editor._body.textContent,/Aktueller Wecker/);assert.match(e.editor._body.textContent,/Zuletzt geprüft/);
 e.click('stored-filter','[data-filter="all"]');assert.match(e.editor._body.textContent,/Aktueller Wecker/);assert(e.editor.shadowRoot.querySelector('[data-action="stored-delete"][data-alarm="live_alarm"]').disabled);
 e.click('stored-delete','[data-alarm="old_alarm"]');assert.match(e.editor._confirm.textContent,/Alter Wecker/);assert.match(e.editor._confirm.textContent,/Tagestypen bleiben erhalten/);e.editor._confirm.close();assert.equal(e.storedCards.length,2);assert(!e.calls.some(call=>call.action==='delete_card'));
 e.fail=true;e.click('stored-delete','[data-alarm="old_alarm"]');e.click('stored-confirm-delete');await flush();assert.match(e.editor._body.textContent,/Löschen fehlgeschlagen/);assert.equal(e.storedCards.length,2);
 e.fail=false;e.click('stored-delete','[data-alarm="old_alarm"]');e.click('stored-confirm-delete');await flush();assert.equal(e.storedCards.length,1);assert.equal(e.catalog.shared_days.length,1);assert.deepEqual(e.calls.find(call=>call.action==='delete_card'),{type:'wecker_manager/card',action:'delete_card',alarm_id:'old_alarm',card_id:'old_card',revision:7});
 e.click('stored-filter','[data-filter="unused"]');assert.match(e.editor._body.textContent,/Keine ungenutzten Wecker/);e.editor.remove();
});
test('alarm manager refreshes usage and removes administrator data when the user changes',async()=>{
 const card={alarm_id:'old_alarm',card_id:'old_card',revision:1,name:'Privater Wecker',owner:'Manuel',days:[],speakers:[],dashboards:[],can_delete:true};
 const e=setup({alarms:true,storedCards:[card]});await flush();Object.assign(e.storedCards[0],{dashboards:['Familie'],can_delete:false});e.click('stored-refresh');await flush();assert.match(e.editor._body.textContent,/Keine ungenutzten Wecker/);e.click('stored-filter','[data-filter="all"]');assert(e.editor.shadowRoot.querySelector('[data-action="stored-delete"]').disabled);
 const before=e.calls.length;e.editor.hass={...e.editor._hass,user:{id:'paul',is_admin:false}};await flush();assert.match(e.editor._body.textContent,/nur Administratoren/);assert.doesNotMatch(e.editor._body.textContent,/Privater Wecker/);assert.equal(e.calls.length,before);assert.equal(e.editor.shadowRoot.querySelectorAll('button:not(dialog button)').length,0);e.editor.remove();
});
test('central day management saves music and confirmation defaults with explicit application scope',async()=>{
 const shared={id:'shared',name:'Schultag',display_name:'Schultag',icon:'mdi:school',weekdays:[0],calendar_entity:'',calendar_mode:'no_event',music_mode:'always',confirm_disable:true,revision:2,uses:2};
 const e=setup({manager:true,catalog:{shared_days:[shared]}});await flush();e.click('day-edit','[data-kind="shared"]');
 assert.equal(e.editor.shadowRoot.querySelector('#day-music').value,'always');assert.equal(e.editor.shadowRoot.querySelector('#day-confirm').value,'confirm');assert.equal(e.editor.shadowRoot.querySelector('[data-action="day-apply-policies"]').getAttribute('aria-checked'),'false');
 e.change('day-music','switchable');e.change('day-confirm','click');e.click('day-cancel');assert(!e.calls.some(call=>call.action==='save_day_template'));
 e.click('day-edit','[data-kind="shared"]');e.change('day-music','switchable');e.change('day-confirm','click');e.click('day-save');await flush();let saved=e.calls.findLast(call=>call.action==='save_day_template');assert.equal(saved.day_template.music_mode,'switchable');assert.equal(saved.day_template.confirm_disable,false);assert.equal(saved.apply_policies,false);
 e.click('day-edit','[data-kind="shared"]');e.change('day-music','always');e.change('day-confirm','confirm');e.click('day-apply-policies');assert.equal(e.editor.shadowRoot.querySelector('[data-action="day-apply-policies"]').getAttribute('aria-checked'),'true');e.click('day-save');await flush();saved=e.calls.findLast(call=>call.action==='save_day_template');assert.equal(saved.apply_policies,true);assert.equal(saved.day_template.music_mode,'always');assert.equal(saved.day_template.confirm_disable,true);
 e.click('day-edit','[data-kind="shared"]');assert.equal(e.editor.shadowRoot.querySelector('[data-action="day-apply-policies"]').getAttribute('aria-checked'),'false');e.editor.remove();
});
test('new adoption inherits managed defaults while reusing a local type retains its individual policy',async()=>{
 const shared={id:'shared',name:'Schultag',display_name:'Schultag',icon:'mdi:school',weekdays:[0],calendar_entity:'',calendar_mode:'no_event',music_mode:'always',confirm_disable:true,revision:2,uses:0};
 const e=setup({catalog:{shared_days:[shared]}});await flush();e.change('setup-shared-day','shared');e.click('day-use');assert.equal(e.editor.shadowRoot.querySelector('#day-music').value,'always');assert.equal(e.editor.shadowRoot.querySelector('#day-confirm').value,'confirm');e.change('day-music','switchable');e.change('day-confirm','click');e.click('day-save');const day=e.events.at(-1).days[0];assert.equal(day.music_mode,'switchable');assert.equal(day.confirm_disable,false);e.editor._openDay(undefined,shared);e.click('day-save');assert.equal(e.events.at(-1).days.length,1);assert.equal(e.events.at(-1).days[0].music_mode,'switchable');assert.equal(e.events.at(-1).days[0].confirm_disable,false);e.editor.remove();
});
