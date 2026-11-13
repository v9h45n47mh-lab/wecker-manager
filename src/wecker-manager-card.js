import {UI_CSS, row, section, button, iconButton, filterButton, toggle, dialog, confirmDialog, field, selectField, rangeControl, multiSelect, whiteTemperatureControl, colourPicker, notice, loadingState, bindUI, escapeHtml} from './family-ui/1.4.1/family-ui.js';

const WAKE_TYPES = {schultag:'Schultag',wochenende:'Wochenende',ferien:'Ferien / schulfrei'};
const WAKE_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const copy = value => JSON.parse(JSON.stringify(value));
const freshId = () => 'wake_'+(globalThis.crypto?.randomUUID?.().replaceAll('-','')||Date.now().toString(36)+Math.random().toString(36).slice(2));
const emptyConfig = () => ({type:'custom:wecker-manager-card',alarm_id:freshId(),card_id:freshId(),owner_id:'',speakers:[],covers:[],lights:[],calendar_entity:'',sunrise_minutes:0});
const fixed = config => ({card_id:config.card_id,alarm_id:config.alarm_id,owner_id:config.owner_id||'',speakers:config.speakers||[],covers:config.covers||[],lights:config.lights||[],calendar_entity:config.calendar_entity||'',sunrise_minutes:config.sunrise_minutes||0});
const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same = (a,b) => JSON.stringify(canonical(fixed(a)))===JSON.stringify(canonical(fixed(b)));
const message = error => String(error?.message||error?.code||error);

/** Native scroll snapping supplies touch inertia; keyboard and pointer share one value. */
class MusicManagerTimeWheel extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._value='06:00';this._timers=[];}
  set value(value){if(/^([01]\d|2[0-3]):[0-5]\d$/.test(value)){this._value=value;if(this.isConnected)this._render();}}
  get value(){
    const wheels=[...this.shadowRoot.querySelectorAll('[data-wheel]')];
    return wheels.length?wheels.map(w=>String(Math.max(0,Math.min(Number(w.dataset.max),Math.round(w.scrollTop/40)))).padStart(2,'0')).join(':'):this._value;
  }
  connectedCallback(){this._render();}
  disconnectedCallback(){this._timers.forEach(clearTimeout);}
  _render(){
    this._timers.forEach(clearTimeout);this._timers=[];
    const values=this._value.split(':').map(Number);
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      .wheels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;max-width:320px;margin:auto}
      .column{min-width:0;text-align:center}.wheel{height:200px;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior:contain;padding-block:80px;scrollbar-width:none;position:relative;border:1px solid var(--divider-color,#ddd);border-radius:12px;touch-action:pan-y}
      .wheel::-webkit-scrollbar{display:none}.wheel-option{height:40px;display:grid;place-items:center;scroll-snap-align:center;cursor:pointer;color:var(--secondary-text-color,#727272)}
      .wheel-option[aria-selected="true"]{color:var(--primary-color,#03a9f4);background:color-mix(in srgb,var(--primary-color,#03a9f4) 12%,transparent)}
      .wheel:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}
    </style><div class="wheels" role="group" aria-label="Weckzeit einstellen">${['Stunden','Minuten'].map((label,i)=>`<div class="column"><label id="wheel-label-${i}">${label}</label><div class="wheel" tabindex="0" role="listbox" aria-labelledby="wheel-label-${i}" aria-activedescendant="wheel-${i}-${values[i]}" data-wheel="${i}" data-max="${i?59:23}">${Array.from({length:i?60:24},(_,n)=>`<div class="wheel-option" role="option" id="wheel-${i}-${n}" data-value="${n}" aria-selected="${n===values[i]}">${String(n).padStart(2,'0')}</div>`).join('')}</div></div>`).join('')}</div>`;
    for(const [i,wheel] of [...this.shadowRoot.querySelectorAll('[data-wheel]')].entries()){
      wheel.scrollTop=values[i]*40;
      const mark=()=>{const n=Math.max(0,Math.min(Number(wheel.dataset.max),Math.round(wheel.scrollTop/40)));for(const option of wheel.children)option.setAttribute('aria-selected',String(Number(option.dataset.value)===n));wheel.setAttribute('aria-activedescendant',`wheel-${i}-${n}`);};
      wheel.addEventListener('scroll',()=>{clearTimeout(this._timers[i]);this._timers[i]=setTimeout(mark,80);},{passive:true});
      wheel.addEventListener('click',event=>{const item=event.target.closest('[data-value]');if(item){wheel.scrollTop=Number(item.dataset.value)*40;mark();}});
      wheel.addEventListener('keydown',event=>{
        const current=Math.round(wheel.scrollTop/40),max=Number(wheel.dataset.max);
        const next={ArrowDown:(current+1)%(max+1),ArrowUp:(current+max)%(max+1),PageDown:Math.min(max,current+10),PageUp:Math.max(0,current-10),Home:0,End:max}[event.key];
        if(next!==undefined){event.preventDefault();wheel.scrollTop=next*40;mark();}
      });
    }
  }
}

class MusicManagerAlarmCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._epoch=0;this._error='';this._data=null;}
  static getStubConfig(){return emptyConfig();}
  static getConfigElement(){return document.createElement('wecker-manager-card-editor');}
  getCardSize(){return 8;}
  getLayoutOptions(){return {grid_columns:4,grid_rows:8,min_grid_columns:2,min_grid_rows:5};}
  setConfig(config){
    if(!WAKE_ID.test(config?.alarm_id||''))throw new Error('Bitte eine gültige Weckerkennung angeben.');
    if(!WAKE_ID.test(config?.card_id||''))throw new Error('Bitte die Karte über den visuellen Karteneditor neu anlegen (Kartenkennung fehlt).');
    this._config={...config,...fixed(config)};this._reset();this._ensure();this._load();
  }
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;
    this._hass=hass;if(changed){this._reset();this._ensure();this._load();}
    if(this._music)this._music.hass=hass;
  }
  connectedCallback(){this._ensure();if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));this._load();}
  disconnectedCallback(){this._reset();this._unbind?.();this._unbind=null;}
  _reset(){this._epoch++;this._busy=false;this._loading=false;this._data=null;this._loaded=false;this._draft=null;this._error='';this._waitingMusic=false;this._music?.remove();this._music=null;this._unsubscribe?.();this._unsubscribe=null;this._subscribing=false;for(const d of this.shadowRoot.querySelectorAll('dialog[open]'))d.close();}
  _ensure(){
    if(!this._config||this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      :host{min-width:0}.wake-content{padding:var(--fui-section-padding,10px)}.wake-type+.wake-type{border-top:1px solid var(--divider-color,#ddd);margin-top:12px;padding-top:8px}
      .wake-presets{display:flex;gap:8px;flex-wrap:wrap}.wake-type{min-width:0}.wake-type .toolbar{flex-wrap:wrap}
      .wake-settings{display:grid;gap:16px}.wake-preset-line{display:flex;align-items:center;gap:8px;min-width:0}.wake-preset-line>:first-child{flex:1}
      .wake-settings .toolbar{flex-wrap:wrap}.wake-wheel-content{min-width:0}#wake-time-dialog{max-width:min(380px,calc(100vw - 24px))}
    </style><ha-card><div class="wake-content"><div id="wake-header"></div><div id="wake-status" aria-live="polite"></div><div id="wake-music"></div><div id="wake-types"></div></div></ha-card>
      ${dialog({id:'wake-settings-dialog',title:'Wecker-Einstellungen',content:'<div id="wake-settings-status"></div><div class="wake-settings" id="wake-settings"></div>',actions:button({label:'Abbrechen',action:'cancel-settings'})+button({label:'Speichern',action:'save-settings',variant:'primary'})})}
      ${dialog({id:'wake-time-dialog',title:'Weckzeit einstellen',content:'<div id="wake-time-status"></div><div class="wake-wheel-content" id="wake-wheel"></div>',actions:button({label:'Abbrechen',action:'cancel-time'})+button({label:'Übernehmen',action:'save-time',variant:'primary'})})}
      ${confirmDialog({id:'wake-confirm-dialog',title:'Schultagswecker ausschalten?',message:'Willst du den Schultagswecker wirklich ausschalten?',confirmLabel:'Ausschalten',confirmAction:'confirm-disable',danger:false})}`;
    this._body=this.shadowRoot.getElementById('wake-types');
    this._settingsDialog=this.shadowRoot.getElementById('wake-settings-dialog');this._timeDialog=this.shadowRoot.getElementById('wake-time-dialog');this._confirmDialog=this.shadowRoot.getElementById('wake-confirm-dialog');
    this._settingsDialog.addEventListener('close',()=>{this._draft=null;this.shadowRoot.querySelector('[data-action="settings"]')?.focus();if(this._remoteDirty){this._remoteDirty=false;this._load(true);}});
    this._timeDialog.addEventListener('close',()=>{this._timeTarget=null;if(this._remoteDirty&&!this._draft){this._remoteDirty=false;this._load(true);}});this._render();
  }
  _request(action,extra={}){return this._hass.callWS({type:'wecker_manager/card',action,alarm_id:this._config.alarm_id,card_id:this._config.card_id,...extra});}
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||!this._config||this._loading||this._busy||this._loaded&&!force)return;
    const epoch=this._epoch;this._loading=true;this._error='';this._render();
    try{const data=await this._request('get');if(epoch!==this._epoch)return;this._accept(data);this._loaded=true;await this._subscribe(epoch);}
    catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();}}
  }
  _accept(data){
    if(data.exists&&!same(this._config,data.binding))throw new Error('Geräte und Musikkonto sind für diese Karte festgelegt. Bitte die Karte neu anlegen.');
    this._data=data;
    if(data.exists&&!this._music&&!customElements.get('music-manager-alarm-row')){
      if(!this._waitingMusic){const epoch=this._epoch;this._waitingMusic=true;customElements.whenDefined('music-manager-alarm-row').then(()=>{this._waitingMusic=false;if(this.isConnected&&epoch===this._epoch&&this._data?.exists)this._accept(this._data);});}
      return;
    }
    if(data.exists&&!this._music){this._music=document.createElement('music-manager-alarm-row');this._music.setConfig({alarm_id:this._config.alarm_id,name:'Weckmusik · alle drei Wecker'});this._music.hass=this._hass;this.shadowRoot.getElementById('wake-music').append(this._music);}
  }
  async _subscribe(epoch){
    if(this._unsubscribe||this._subscribing||!this._hass.connection?.subscribeEvents)return;
    this._subscribing=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id!==this._config.alarm_id)return;if(this._draft||this._timeDialog?.open||this._busy||this._loading){this._remoteDirty=true;return;}this._load(true);},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{if(epoch===this._epoch)this._subscribing=false;}
  }
  _render(){
    if(!this._body)return;
    const busy=this._busy||this._loading,ready=this._data?.exists;
    this.shadowRoot.getElementById('wake-header').innerHTML=row({title:this._config.name||'Wecker',description:ready?`${this._config.speakers.length} Musikbox${this._config.speakers.length===1?'':'en'}`:'',trailing:iconButton({icon:'settings',label:'Wecker-Einstellungen',action:'settings',disabled:busy||!ready})});
    this.shadowRoot.getElementById('wake-status').innerHTML=(this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'reload',disabled:busy}):'')+(this._data?.error?notice(this._data.error,{error:true}):'')+(this._loading&&!ready?loadingState('Wecker wird geladen …'):'')+(!ready&&this._data?.can_create?notice('Musikkonto und Geräte werden beim Anlegen festgeschrieben. Bisherige Wecker-Automationen vorher ausschalten oder im Karteneditor zur Ablösung auswählen.')+button({label:this._data.replaces_card?'Neue Karte anlegen und bisherige ersetzen':'Karte anlegen',action:'create',variant:'primary',disabled:busy||!this._config.owner_id||!this._config.speakers.length}):'');
    this._body.innerHTML=ready?Object.entries(WAKE_TYPES).map(([kind,title])=>{
      const settings=this._data.settings.types[kind];
      return `<div class="wake-type">${row({title:`${title} · ${settings.enabled?'An':'Aus'}`,trailing:button({label:settings.enabled?'Ausschalten':'Einschalten',action:'enabled',data:{kind},disabled:busy})})}${row({title:'Uhrzeit',trailing:button({label:settings.time,action:'time',data:{kind},disabled:busy})})}<div class="wake-presets">${settings.presets.map(time=>filterButton({label:time,action:'preset',selected:time===settings.time,data:{kind,time}}).replace('<button ',`<button${busy?' disabled':''} `)).join('')}</div>${kind!=='schultag'?row({title:'Mit Musik wecken',trailing:toggle({label:`Musik ${title}`,action:'music',checked:settings.music,iconOnly:true,disabled:busy,data:{kind}})}):''}</div>`;
    }).join(''):'';
    for(const d of [this._settingsDialog,this._timeDialog,this._confirmDialog])for(const b of d.querySelectorAll('footer button'))b.disabled=busy;
  }
  _settings(){
    const d=this._draft;if(!d)return;
    this.shadowRoot.getElementById('wake-settings-status').innerHTML='';
    this.shadowRoot.getElementById('wake-settings').innerHTML=rangeControl({id:'wake-volume',label:'Musiklautstärke für alle Boxen',value:d.volume,min:5,max:15,step:1,allowKeep:false,action:'volume'})+Object.entries(WAKE_TYPES).map(([kind,title])=>section({id:`presets-${kind}`,title:`${title} · Schnellzeiten`,content:`<div>${d.types[kind].presets.map((time,slot)=>`<div class="wake-preset-line">${button({label:time,action:'preset-edit',data:{kind,slot}})}${iconButton({icon:'trash',label:`Schnellzeit ${time} entfernen`,action:'preset-remove',data:{kind,slot}})}</div>`).join('')}${d.types[kind].presets.length<3?button({label:'Zeit hinzufügen',icon:'add',action:'preset-add',data:{kind}}):''}</div>`})).join('');
  }
  _openTime(kind,slot=null){
    this._timeTarget={kind,slot};const wheel=document.createElement('wecker-manager-time-wheel');wheel.value=slot===null?this._data.settings.types[kind].time:(this._draft.types[kind].presets[slot]||this._data.settings.types[kind].time);
    this.shadowRoot.getElementById('wake-time-status').innerHTML='';this._timeDialog.showModal();this.shadowRoot.getElementById('wake-wheel').replaceChildren(wheel);
  }
  async _save(settings){
    const epoch=this._epoch,revision=this._data.revision;this._busy=true;this._error='';this._render();
    try{const result=await this._request('update',{settings,revision});if(epoch!==this._epoch)return false;this._accept(result);this._remoteDirty=false;return true;}
    catch(error){if(epoch===this._epoch){this._error=message(error);const id=this._timeDialog.open?'wake-time-status':this._settingsDialog.open?'wake-settings-status':'wake-status';this.shadowRoot.getElementById(id).innerHTML=notice(this._error,{error:true})+(error?.code==='conflict'?button({label:'Neu laden und Änderungen verwerfen',action:'discard-reload'}):'');}return false;}
    finally{if(epoch===this._epoch){this._busy=false;this._render();}}
  }
  async _action({action,data,value,phase}){
    if(action==='volume'){if(this._draft)this._draft.volume=value;return;}
    if(this._busy||this._loading)return;
    if(action==='reload'){await this._load(true);return;}
    if(action==='discard-reload'){this._timeDialog.close();this._settingsDialog.close();await this._load(true);return;}
    if(action==='create'){
      const epoch=this._epoch;this._busy=true;this._error='';this._render();
      try{const result=await this._request('create',{config:{...fixed(this._config),replace_automation:this._config.replace_automation||''}});if(epoch===this._epoch){this._accept(result);this._loaded=true;this._remoteDirty=false;}}
      catch(error){if(epoch===this._epoch)this._error=message(error);}
      finally{if(epoch===this._epoch){this._busy=false;this._render();}}return;
    }
    if(!this._data?.exists)return;
    if(action==='settings'){this._draft=copy(this._data.settings);this._settings();this._settingsDialog.showModal();return;}
    if(action==='cancel-settings'){this._settingsDialog.close();return;}
    if(action==='save-settings'){if(await this._save(copy(this._draft)))this._settingsDialog.close();return;}
    if(action==='time'){this._openTime(data.kind);return;}
    if(action==='preset-edit'){this._openTime(data.kind,Number(data.slot));return;}
    if(action==='preset-add'){this._openTime(data.kind,this._draft.types[data.kind].presets.length);return;}
    if(action==='preset-remove'){this._draft.types[data.kind].presets.splice(Number(data.slot),1);this._settings();return;}
    if(action==='cancel-time'){this._timeDialog.close();return;}
    if(action==='save-time'){
      const target=this._timeTarget;if(!target)return;const time=this.shadowRoot.querySelector('wecker-manager-time-wheel').value;
      if(target.slot!==null){const presets=this._draft.types[target.kind].presets;if(presets.some((t,i)=>t===time&&i!==target.slot)){this.shadowRoot.getElementById('wake-time-status').innerHTML=notice('Diese Schnellzeit ist bereits vorhanden.',{error:true});return;}presets[target.slot]=time;this._timeDialog.close();this._settings();return;}
      const settings=copy(this._data.settings);settings.types[target.kind].time=time;if(await this._save(settings))this._timeDialog.close();return;
    }
    if(action==='enabled'&&data.kind==='schultag'&&this._data.settings.types.schultag.enabled){this._confirmDialog.showModal();return;}
    const settings=copy(this._data.settings);
    if(action==='confirm-disable'){settings.types.schultag.enabled=false;if(await this._save(settings))this._confirmDialog.close();return;}
    if(!WAKE_TYPES[data?.kind])return;
    if(action==='enabled')settings.types[data.kind].enabled=!settings.types[data.kind].enabled;
    else if(action==='music')settings.types[data.kind].music=!settings.types[data.kind].music;
    else if(action==='preset')settings.types[data.kind].time=data.time;
    else return;
    await this._save(settings);
  }
}

class MusicManagerAlarmCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._epoch=0;this._error='';this._catalog=null;}
  setConfig(config){const first=!this._config;this._config={...emptyConfig(),...config};if(first&&!config?.card_id)queueMicrotask(()=>this._emit());this._render();this._load();}
  set hass(hass){const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;this._hass=hass;if(changed){this._epoch++;this._loading=false;this._catalog=null;this._loadedKey=null;this._locked=false;this._unsubscribe?.();this._unsubscribe=null;this._subscribe();this._load();}}
  connectedCallback(){if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));if(!this._change){this._change=event=>this._changeField(event);this.shadowRoot.addEventListener('change',this._change);}this._render();this._subscribe();this._load();}
  disconnectedCallback(){this._epoch++;this._loading=false;this._unsubscribe?.();this._unsubscribe=null;this._unbind?.();this._unbind=null;this.shadowRoot.removeEventListener('change',this._change);this._change=null;}
  async _subscribe(){if(!this.isConnected||this._unsubscribe||this._subscriptionPending||!this._hass?.connection?.subscribeEvents)return;const epoch=this._epoch;this._subscriptionPending=true;try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id===this._config?.alarm_id){if(this._loading)this._again=true;else this._load(true);}},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}catch{}finally{this._subscriptionPending=false;}}
  _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:copy(this._config)},bubbles:true,composed:true}));}
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||!this._config||this._loading)return;
    const key=[this._config.card_id,this._config.alarm_id,this._config.owner_id].join('/');if(!force&&key===this._loadedKey)return;
    const epoch=this._epoch;this._loading=true;this._render();
    try{const record=await this._hass.callWS({type:'wecker_manager/card',action:'get',card_id:this._config.card_id,alarm_id:this._config.alarm_id});if(epoch!==this._epoch)return;this._locked=record.exists;
      if(!record.exists)this._catalog=await this._hass.callWS({type:'wecker_manager/card',action:'catalog',...(this._config.owner_id?{owner_id:this._config.owner_id}:{})});
      if(epoch===this._epoch){this._loadedKey=key;this._error='';}}
    catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();if(this._again){this._again=false;queueMicrotask(()=>this._load(true));}}}
  }
  _render(){
    if(!this._config)return;const c=this._config,cat=this._catalog;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}.wake-editor{display:grid;gap:16px;min-width:0}.wake-device-settings{display:grid;gap:16px}</style><div class="wake-editor">${this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'editor-reload'}):''}${this._loading?loadingState('Wecker-Konfiguration wird geladen …'):''}${this._locked?notice('Musikkonto, Boxen, Rollläden und Lichter sind festgelegt. Für Änderungen diese Karte entfernen und eine neue Weckerkarte anlegen. Die bisherige Weckerkennung kann für die neue Karte wiederverwendet werden.'):cat?notice('Wähle genau ein Musikkonto sowie die Geräte mit ihren Weckeinstellungen. Lege die Karte anschließend in der Vorschau an; danach ist die Zuordnung gesperrt.')+field({id:'wake-name',label:'Kartenname',value:c.name||'Wecker'})+field({id:'wake-alarm-id',label:'Weckerkennung',value:c.alarm_id,required:true,hint:'Zur Übernahme der Kinderwecker: m_wecker_schultag oder p_wecker_schultag.'})+selectField({id:'wake-owner',label:'Musikkonto',value:c.owner_id,required:true,options:[{value:'',label:'Ein Musikkonto wählen'},...cat.accounts]})+(c.owner_id?this._deviceEditor(cat,c):''):''}</div>`;
  }
  _deviceEditor(cat,c){
    const options=(items,empty)=>[{value:'',label:empty},...items.map(i=>({value:i.id,label:i.label}))];
    return multiSelect({id:'wake-speakers',label:'Musikboxen (ein gemeinsames Konto)',items:cat.speakers,values:c.speakers,action:'speakers',selectedFirst:true})+
      multiSelect({id:'wake-covers',label:'Rollläden',items:cat.covers.filter(i=>Number(i.attributes.supported_features||0)&4),values:c.covers.map(i=>i.entity_id),action:'covers',selectedFirst:true})+
      `<div class="wake-device-settings">${c.covers.map((cover,i)=>rangeControl({id:`wake-cover-${i}`,label:`${cat.covers.find(e=>e.id===cover.entity_id)?.label||cover.entity_id} · Zielposition (0 = zu, 100 = offen)`,value:cover.position,allowKeep:false,action:`cover-${i}`})).join('')}</div>`+
      multiSelect({id:'wake-lights',label:'Lichter',items:cat.lights,values:c.lights.map(i=>i.entity_id),action:'lights',selectedFirst:true})+
      c.lights.map((light,i)=>{
        const entity=cat.lights.find(e=>e.id===light.entity_id),modes=entity?.attributes.supported_color_modes||[],attrs=entity?.attributes||{};
        return section({id:`wake-light-${i}`,title:entity?.label||light.entity_id,content:`<div class="wake-device-settings">${modes.some(m=>!['onoff','unknown'].includes(m))?rangeControl({id:`wake-bright-${i}`,label:'Helligkeit',value:light.brightness,min:1,allowKeep:false,action:`bright-${i}`}):notice('Diese Lampe wird eingeschaltet. Sie unterstützt keine Helligkeitseinstellung.')}${selectField({id:`wake-colourmode-${i}`,label:'Lichtfarbe',value:light.color_mode,options:[{value:'keep',label:'Vorhandene Lichtfarbe beibehalten'},...(modes.includes('color_temp')?[{value:'temperature',label:'Farbtemperatur'}]:[]),...(modes.some(m=>['hs','xy','rgb','rgbw','rgbww'].includes(m))?[{value:'colour',label:'Farbe'}]:[])]})}${light.color_mode==='temperature'?whiteTemperatureControl({id:`wake-kelvin-${i}`,label:'Farbtemperatur',value:light.kelvin||2700,min:attrs.min_color_temp_kelvin||2000,max:attrs.max_color_temp_kelvin||6500,action:`kelvin-${i}`}):light.color_mode==='colour'?colourPicker({id:`wake-rgb-${i}`,label:'Farbe',value:light.rgb||[255,180,100],action:`rgb-${i}`}):''}</div>`});
      }).join('')+selectField({id:'wake-calendar',label:'Kalender für schulfrei',value:c.calendar_entity,options:options(cat.calendars,'Kein Kalender · Schultag Mo–Fr, Ferien pausiert')})+
      selectField({id:'wake-sunrise',label:'Sanftes Licht vor dem Schultagswecker',value:String(c.sunrise_minutes),options:[{value:'0',label:'Aus'},...[5,10,15,20,30].map(n=>({value:String(n),label:`${n} Minuten vorher`}))]})+
      selectField({id:'wake-replace',label:'Bisherige Wecker-Automation ablösen (optional)',value:c.replace_automation||'',options:options(cat.automations,'Keine Automation automatisch ausschalten'),hint:'Die gewählte Automation wird beim Anlegen ausgeschaltet. So laufen alter und neuer Wecker nicht gleichzeitig.'});
  }
  _changeField(event){
    if(this._locked||this._loading)return;const {id,value}=event.target,c=this._config;
    if(id==='wake-name')c.name=value;
    else if(id==='wake-alarm-id'){if(!WAKE_ID.test(value))return;c.alarm_id=value;this._loadedKey=null;this._load();}
    else if(id==='wake-owner'){c.owner_id=value;c.speakers=[];c.covers=[];c.lights=[];c.calendar_entity='';this._loadedKey=null;this._emit();this._load();return;}
    else if(id==='wake-calendar')c.calendar_entity=value;
    else if(id==='wake-sunrise')c.sunrise_minutes=Number(value);
    else if(id==='wake-replace')c.replace_automation=value;
    else if(id.startsWith('wake-colourmode-')){const light=c.lights[Number(id.slice(16))];if(!light)return;light.color_mode=value;delete light.kelvin;delete light.rgb;if(value==='temperature')light.kelvin=2700;else if(value==='colour')light.rgb=[255,180,100];this._render();}
    else return;
    this._emit();
  }
  _action({action,value,phase}){
    if(action==='editor-reload'){this._load(true);return;}
    if(this._locked||this._loading)return;const c=this._config;
    if(action==='speakers')c.speakers=value;
    else if(action==='covers')c.covers=value.map(entity_id=>c.covers.find(i=>i.entity_id===entity_id)||{entity_id,position:100});
    else if(action==='lights')c.lights=value.map(entity_id=>c.lights.find(i=>i.entity_id===entity_id)||{entity_id,brightness:100,color_mode:'keep'});
    else {const match=action.match(/^(cover|bright|kelvin|rgb)-(\d+)$/);if(!match)return;const [,type,index]=match;if(type==='cover')c.covers[index].position=value;else c.lights[index][{bright:'brightness',kelvin:'kelvin',rgb:'rgb'}[type]]=value;if(phase==='input')return;}
    this._emit();if(['speakers','covers','lights'].includes(action))this._render();
  }
}

for(const [name,element] of [['wecker-manager-time-wheel',MusicManagerTimeWheel],['wecker-manager-card',MusicManagerAlarmCard],['wecker-manager-card-editor',MusicManagerAlarmCardEditor]])if(!customElements.get(name))customElements.define(name,element);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='wecker-manager-card'))window.customCards.push({type:'wecker-manager-card',name:'Wecker Manager',description:'Drei Weckertypen, Drehräder, Schnellzeiten und mehrere fest zugeordnete Geräte.',preview:true});
