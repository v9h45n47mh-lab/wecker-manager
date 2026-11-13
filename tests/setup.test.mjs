import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const bundle=await readFile(new URL('../dist/wecker-manager-card.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup({config={},catalog:override}={}){
 const {window}=parseHTML('<!doctype html><html><body></body></html>'),{document}=window;
 window.HTMLElement.prototype.showModal=function(){this.open=true;};
 window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const context=vm.createContext({window,document,HTMLElement:window.HTMLElement,customElements:window.customElements,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,queueMicrotask,console,setTimeout,clearTimeout,URL,Promise});
 vm.runInContext(bundle,context);
 const item=(id,label,attributes={})=>({id,label,description:id,attributes});
 const catalog={accounts:[{value:'max',label:'Maximilian'},{value:'paul',label:'Paul'}],speakers:[item('media_player.max','Maximilian'),item('media_player.second','Ankleide')],covers:[item('cover.one','Rollladen',{supported_features:4})],lights:[item('light.one','Deckenlicht',{supported_color_modes:['color_temp'],min_color_temp_kelvin:3000,max_color_temp_kelvin:6500})],calendars:[item('calendar.school','Schulfrei')],shared_days:[]};
 if(override)Object.assign(catalog,override);
 const calls=[],events=[];let created=null,fail=false;
 const editor=document.createElement('wecker-manager-card-editor');
 editor.setConfig({type:'custom:wecker-manager-card',alarm_id:'new_alarm',card_id:'new_card',owner_id:'',speakers:[],covers:[],lights:[],calendar_entity:'',sunrise_minutes:0,...config});
 editor.addEventListener('config-changed',e=>events.push(clone(e.detail.config)));
 editor.hass={user:{id:'admin',is_admin:true},connection:{async subscribeEvents(){return ()=>{}}},states:{},async callWS(msg){calls.push(clone(msg));
  if(msg.action==='get')return clone(created||{exists:false,can_create:true});
  if(msg.action==='catalog')return clone(catalog);
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
 return {editor,calls,events,click,change,pick,music,addDay,weekdays,window,get created(){return created},set fail(v){fail=v}};
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
 e.click('edit-card');await flush();e.click('setup-next');e.change('wake-name','Pauls Wecker');e.change('wake-owner','paul');await flush();await e.pick('speakers',['media_player.second']);
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
