import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const bundle=await readFile(new URL('../dist/wecker-manager-card.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(){
 const {window}=parseHTML('<!doctype html><html><body></body></html>'),{document}=window;
 window.HTMLElement.prototype.showModal=function(){this.open=true;};
 window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const context=vm.createContext({window,document,HTMLElement:window.HTMLElement,customElements:window.customElements,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent,queueMicrotask,console,setTimeout,clearTimeout,URL,Promise});
 vm.runInContext(bundle,context);
 const item=(id,label,attributes={})=>({id,label,description:id,attributes});
 const catalog={accounts:[{value:'max',label:'Maximilian'},{value:'paul',label:'Paul'}],speakers:[item('media_player.max','Maximilian'),item('media_player.second','Ankleide')],covers:[item('cover.one','Rollladen',{supported_features:4})],lights:[item('light.one','Deckenlicht',{supported_color_modes:['color_temp'],min_color_temp_kelvin:3000,max_color_temp_kelvin:6500})],calendars:[item('calendar.school','Schulfrei')]};
 const calls=[],events=[];let created=null,fail=false;
 const editor=document.createElement('wecker-manager-card-editor');
 editor.setConfig({type:'custom:wecker-manager-card',alarm_id:'new_alarm',card_id:'new_card',owner_id:'',speakers:[],covers:[],lights:[],calendar_entity:'',sunrise_minutes:0});
 editor.addEventListener('config-changed',e=>events.push(clone(e.detail.config)));
 editor.hass={user:{id:'admin'},connection:{async subscribeEvents(){return ()=>{}}},states:{},async callWS(msg){calls.push(clone(msg));if(msg.action==='get')return created||{exists:false,can_create:true};if(msg.action==='catalog')return clone(catalog);if(msg.action==='create'){if(fail)throw Error('Box ist offline');created={exists:true,binding:clone(msg.config),revision:1};return clone(created);}}};
 document.body.append(editor);
 const click=(action,suffix='')=>{const el=editor.shadowRoot.querySelector(`[data-action="${action}"]${suffix}`);assert(el,action+' exists');assert(!el.disabled,action+' enabled');el.click();};
 const change=(id,value)=>{const el=editor.shadowRoot.getElementById(id);assert(el,id+' exists');if(el.tagName==='SELECT'){for(const option of el.options)option.removeAttribute('selected');el.querySelector(`[value="${value}"]`).setAttribute('selected','');}else el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const pick=async(kind,values)=>{click('picker-open',`[data-kind="${kind}"]`);for(const input of editor.shadowRoot.querySelectorAll('#setup-devices input[type="checkbox"]')){input.checked=values.includes(input.value);input.toggleAttribute('checked',input.checked);input.dispatchEvent(new window.Event('change',{bubbles:true}));}click('picker-save');await flush();};
 return {editor,calls,events,click,change,pick,window,set fail(v){fail=v}};
}
test('setup shows one step, hides technical IDs and validates music before continuing',async()=>{
 const e=setup();await flush();assert.equal(e.editor.shadowRoot.querySelector('[data-action="setup-next"]').disabled,true);
 assert.equal(e.editor.shadowRoot.querySelector('#wake-alarm-id'),null);assert.equal(e.editor.shadowRoot.querySelector('#wake-replace'),null);assert.equal(e.editor.shadowRoot.querySelector('#wake-calendar'),null);
 e.change('wake-owner','max');await flush();await e.pick('speakers',['media_player.max','media_player.second']);e.click('setup-next');await flush();
 assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Rollläden/);assert.equal(e.editor.shadowRoot.querySelector('#wake-owner'),null);
 e.click('setup-back');await flush();assert.equal(e.events.at(-1).speakers.length,2);e.editor.remove();
});
test('device dialogs keep per-device drafts and cancel without changing the configuration',async()=>{
 const e=setup();await flush();e.change('wake-owner','max');await flush();await e.pick('speakers',['media_player.max']);e.click('setup-next');await e.pick('covers',['cover.one']);
 e.click('device-open','[data-kind="covers"]');e.change('setup-position','65');e.click('device-cancel');assert.equal(e.events.at(-1).covers[0].position,100);
 e.click('device-open','[data-kind="covers"]');e.change('setup-position','65');e.click('device-save');assert.equal(e.events.at(-1).covers[0].position,65);
 e.click('setup-next');await e.pick('lights',['light.one']);e.click('device-open','[data-kind="lights"]');e.change('setup-colourmode','temperature');e.click('device-save');
 assert.equal(e.events.at(-1).lights[0].kelvin,3000);e.click('setup-back');e.click('setup-next');assert.equal(e.events.at(-1).lights[0].kelvin,3000);e.editor.remove();
});
test('only finishing the review creates a card, failed creation retains all selections',async()=>{
 const e=setup();await flush();e.change('wake-owner','max');await flush();await e.pick('speakers',['media_player.max']);
 for(let i=0;i<4;i++)e.click('setup-next');
 assert.equal(e.calls.filter(c=>c.action==='create').length,0);assert.match(e.editor.shadowRoot.querySelector('#setup-page').textContent,/Maximilian/);
 e.fail=true;e.click('setup-finish');await flush();assert.match(e.editor.shadowRoot.querySelector('.error').textContent,/offline/);assert(e.editor.shadowRoot.querySelector('[data-action="setup-finish"]'));
 e.fail=false;e.click('setup-finish');await flush();assert.match(e.editor.shadowRoot.querySelector('.notice').textContent,/festgelegt/);assert.equal(e.editor.shadowRoot.querySelector('select'),null);
 assert(!Object.hasOwn(e.calls.at(-1).config,'replace_automation'));e.editor.remove();
});
