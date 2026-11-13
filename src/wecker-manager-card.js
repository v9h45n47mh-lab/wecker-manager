import {UI_CSS, navigation, row, section, button, iconButton, filterButton, toggle, dialog, confirmDialog, field, selectField, rangeControl, multiSelect, whiteTemperatureControl, colourPicker, notice, loadingState, bindUI, escapeHtml} from './family-ui/1.4.1/family-ui.js';

const WAKE_TYPES = {schultag:'Schultag',wochenende:'Wochenende',ferien:'Ferien / schulfrei'};
const WAKE_ICONS = {schultag:'mdi:school',wochenende:'mdi:weather-sunny',ferien:'mdi:palm-tree'};
const wakeRow = (symbol,options) => `<div class="wake-row"><span class="wake-symbol" aria-hidden="true"><ha-icon icon="${symbol}"></ha-icon></span>${row(options)}</div>`;
const displayTime = time => time.replace(/^0/,'');
const WAKE_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const copy = value => JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value)?value:[];
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
  getCardSize(){return 11;}
  getLayoutOptions(){return {grid_columns:4,grid_rows:13,min_grid_columns:2,min_grid_rows:10};}
  setConfig(config){
    if(!WAKE_ID.test(config?.alarm_id||''))throw new Error('Bitte eine gültige Weckerkennung angeben.');
    if(!WAKE_ID.test(config?.card_id||''))throw new Error('Bitte die Karte über den visuellen Karteneditor neu anlegen (Kartenkennung fehlt).');
    this._config={...config,...fixed(config)};this._reset();this._ensure();this._load();
  }
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;
    this._hass=hass;if(changed){this._reset();this._ensure();this._load();}
    if(this._music)this._music.hass=hass;
    if(this._data?.exists)this._loadDay();
  }
  connectedCallback(){this._ensure();if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));if(!this._settingsChange){this._settingsChange=event=>{if(event.target.id==='wake-sunrise-setting'&&this._draft)this._draft.sunrise_minutes=Number(event.target.value);};this.shadowRoot.addEventListener('change',this._settingsChange);}this._load();this._scheduleDay();}
  disconnectedCallback(){clearTimeout(this._dayTimer);this._reset();this._unbind?.();this._unbind=null;this.shadowRoot.removeEventListener('change',this._settingsChange);this._settingsChange=null;}
  _reset(){this._epoch++;this._busy=false;this._loading=false;this._data=null;this._loaded=false;this._draft=null;this._error='';this._dayInfo=null;this._dayKey=null;this._dayLoading=false;this._waitingMusic=false;this._music?.remove();this._music=null;this._unsubscribe?.();this._unsubscribe=null;this._subscribing=false;for(const d of this.shadowRoot.querySelectorAll('dialog[open]'))d.close();}
  _ensure(){
    if(!this._config||this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      :host{min-width:0}#wake-day-card{margin-bottom:8px}.wake-day-line{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:52px;padding:6px 16px}.wake-day-line>strong{min-width:0;font-size:var(--fui-font-body);font-weight:600}
      .wake-content{padding:16px}.wake-type{min-width:0;border-top:1px solid var(--divider-color,#ddd)}.wake-row{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;align-items:center;min-height:48px}
      .wake-symbol{display:grid;place-items:center;color:var(--primary-color,#03a9f4)}.wake-symbol ha-icon{display:block;width:var(--fui-icon);height:var(--fui-icon);--mdc-icon-size:var(--fui-icon)}
      .wake-row>.setting-row{min-height:48px;min-width:0;border:0}.wake-row .row-text strong{font-size:var(--fui-font-body);font-weight:400}.wake-row .toolbar{flex-wrap:wrap}
      .wake-row [data-action="enabled"]{padding:6px 14px;background:color-mix(in srgb,var(--primary-color,#03a9f4) 12%,transparent)}
      .wake-row [data-action="time"]{min-width:44px;min-height:44px;padding-inline:0;display:flex;justify-content:flex-end;color:var(--primary-text-color,#212121);font-weight:400}
      .wake-presets{display:flex;justify-content:flex-start;gap:8px;flex-wrap:wrap;padding:12px 12px 20px}.wake-presets .filter-button{flex:0 0 auto;min-width:62px;margin:0;border:0;padding:7px 16px;font-size:calc(var(--fui-font-body) - 2px);font-weight:400;color:var(--primary-text-color,#212121);background:color-mix(in srgb,var(--primary-text-color,#212121) 15%,var(--ha-card-background,var(--card-background-color,#fff)))}
      .wake-presets:empty{display:none}.wake-row:last-child:has([data-action="music"]){padding-bottom:8px}
      @media(max-width:360px){.wake-row{grid-template-columns:32px minmax(0,1fr);gap:8px}.wake-content{padding:12px}.wake-presets{padding-inline:8px}}
      .wake-settings{display:grid;gap:16px}.wake-preset-line{display:flex;align-items:center;gap:8px;min-width:0}.wake-preset-line>:first-child{flex:1}
      .wake-settings .toolbar{flex-wrap:wrap}.wake-wheel-content{min-width:0}#wake-time-dialog{max-width:min(380px,calc(100vw - 24px))}
    </style><ha-card id="wake-day-card" hidden><div class="wake-day-line"><strong id="wake-day" aria-live="polite"></strong><div id="wake-header"></div></div></ha-card><ha-card aria-label="${escapeHtml(this._config.name||'Wecker')}"><div class="wake-content"><div id="wake-status" aria-live="polite"></div><div id="wake-music"></div><div id="wake-types"></div></div></ha-card>
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
    try{const data=await this._request('get');if(epoch!==this._epoch)return;this._accept(data);this._loaded=true;this._loadDay();await this._subscribe(epoch);}
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
    if(data.exists&&!this._music){this._music=document.createElement('music-manager-alarm-row');this._music.setConfig({alarm_id:this._config.alarm_id,name:'Weckmusik'});this._music.style.setProperty('--fui-touch','48px');this._music.hass=this._hass;this.shadowRoot.getElementById('wake-music').append(this._music);}
  }
  _scheduleDay(){clearTimeout(this._dayTimer);this._dayTimer=setTimeout(()=>{if(this.isConnected){this._loadDay();this._scheduleDay();}},60000);}
  async _loadDay(){
    if(!this.isConnected||!this._data?.exists||this._dayLoading)return;
    const state=this._hass?.states?.[this._config.calendar_entity];
    const key=[Math.floor(Date.now()/300000),state?.last_updated,state?.state].join('/');if(key===this._dayKey)return;
    const epoch=this._epoch;this._dayKey=key;this._dayLoading=true;
    try{const data=await this._request('day_info');if(epoch===this._epoch)this._dayInfo=data;}
    catch{if(epoch===this._epoch)this._dayInfo={label:'Morgen: Kalender nicht erreichbar'};}
    finally{if(epoch===this._epoch){this._dayLoading=false;this._renderDay();}}
  }
  _renderDay(){if(this._body)this.shadowRoot.getElementById('wake-day').textContent=this._dayInfo?.label||'Morgen wird geprüft …';}
  async _subscribe(epoch){
    if(this._unsubscribe||this._subscribing||!this._hass.connection?.subscribeEvents)return;
    this._subscribing=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id!==this._config.alarm_id)return;if(this._draft||this._timeDialog?.open||this._busy||this._loading){this._remoteDirty=true;return;}this._load(true);},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{if(epoch===this._epoch)this._subscribing=false;}
  }
  _render(){
    if(!this._body)return;
    const busy=this._busy||this._loading,ready=this._data?.exists;
    this.shadowRoot.getElementById('wake-day-card').hidden=!ready;this._renderDay();
    this.shadowRoot.getElementById('wake-header').innerHTML=iconButton({icon:'settings',label:'Wecker-Einstellungen',action:'settings',disabled:busy||!ready});
    this.shadowRoot.getElementById('wake-status').innerHTML=(this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'reload',disabled:busy}):'')+(this._data?.error?notice(this._data.error,{error:true}):'')+(this._loading&&!ready?loadingState('Wecker wird geladen …'):'')+(!ready&&this._data?.can_create?notice('Öffne den Karteneditor und folge den Einrichtungsschritten.'): '');
    this._body.innerHTML=ready?Object.entries(WAKE_TYPES).map(([kind,title])=>{
      const settings=this._data.settings.types[kind];
      return `<section class="wake-type" aria-label="${escapeHtml(title)}">${wakeRow(WAKE_ICONS[kind],{title:`${title} · ${settings.enabled?'An':'Aus'}`,trailing:button({label:settings.enabled?'Ausschalten':'Einschalten',action:'enabled',data:{kind},disabled:busy})})}${wakeRow('mdi:clock-outline',{title:'Uhrzeit',trailing:button({label:displayTime(settings.time),action:'time',data:{kind},disabled:busy})})}<div class="wake-presets" role="group" aria-label="${escapeHtml(title+' · Schnellzeiten')}">${settings.presets.map(time=>filterButton({label:time,action:'preset',selected:time===settings.time,data:{kind,time}}).replace('<button ',`<button${busy?' disabled':''} `)).join('')}</div>${kind!=='schultag'?wakeRow('mdi:music-note',{title:'Mit Musik wecken',trailing:toggle({label:`Musik ${title}`,action:'music',checked:settings.music,iconOnly:true,disabled:busy,data:{kind}})}):''}</section>`;
    }).join(''):'';
    for(const d of [this._settingsDialog,this._timeDialog,this._confirmDialog])for(const b of d.querySelectorAll('footer button'))b.disabled=busy;
  }
  _settings(){
    const d=this._draft;if(!d)return;
    this.shadowRoot.getElementById('wake-settings-status').innerHTML='';
    const sunrise=d.sunrise_minutes??this._config.sunrise_minutes??0,available=this._data.sunrise_available??Boolean(this._config.lights.length);
    const durations=[...new Set([0,5,10,15,20,30,sunrise])].sort((a,b)=>a-b);
    this.shadowRoot.getElementById('wake-settings').innerHTML=rangeControl({id:'wake-volume',label:'Musiklautstärke für alle Boxen',value:d.volume,min:5,max:15,step:1,allowKeep:false,action:'volume'})+selectField({id:'wake-sunrise-setting',label:'Sonnenaufgang am Schultag',value:String(sunrise),disabled:!available&&!sunrise,options:durations.map(n=>({value:String(n),label:n?`${n} Minuten vor der Weckzeit`:'Aus'})),hint:available?'Die fest zugeordneten dimmbaren Lichter werden bis zur Weckzeit langsam auf ihre Zielhelligkeit aufgeblendet.':'Für den Sonnenaufgang wird eine zugeordnete dimmbare Lampe benötigt.'})+Object.entries(WAKE_TYPES).map(([kind,title])=>section({id:`presets-${kind}`,title:`${title} · Schnellzeiten`,content:`<div>${d.types[kind].presets.map((time,slot)=>`<div class="wake-preset-line">${button({label:time,action:'preset-edit',data:{kind,slot}})}${iconButton({icon:'trash',label:`Schnellzeit ${time} entfernen`,action:'preset-remove',data:{kind,slot}})}</div>`).join('')}${d.types[kind].presets.length<3?button({label:'Zeit hinzufügen',icon:'add',action:'preset-add',data:{kind}}):''}</div>`})).join('');
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
    if(!this._data?.exists)return;
    if(action==='settings'){this._draft={...copy(this._data.settings),sunrise_minutes:this._data.settings.sunrise_minutes??this._config.sunrise_minutes??0};this._settings();this._settingsDialog.showModal();return;}
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

const SETUP_STEPS = [
  {id:'music',label:'Musik',title:'Musikkonto und Boxen',description:'Wähle ein Musikkonto und die Boxen, auf denen dein Wecker spielen soll.'},
  {id:'covers',label:'Rollläden',title:'Rollläden',description:'Optional: Wähle Rollläden und lege für jeden seine Zielposition fest.'},
  {id:'lights',label:'Licht',title:'Licht',description:'Optional: Wähle Lichter und stelle jedes einzeln ein.'},
  {id:'calendar',label:'Schultage',title:'Schultage und Ferien',description:'Ein Schulfrei-Kalender unterscheidet Schultage und freie Werktage.'},
  {id:'review',label:'Prüfen',title:'Alles richtig?',description:'Prüfe deine Auswahl. Nach dem Anlegen sind Musikkonto und Geräte fest zugeordnet.'}
];

class MusicManagerAlarmCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._epoch=0;this._step=0;this._error='';this._hint='';this._catalog=null;}
  setConfig(config){
    const first=!this._config,next={...emptyConfig(),...config};
    const legacy=Object.hasOwn(next,'replace_automation');delete next.replace_automation;
    for(const kind of ['speakers','covers','lights'])next[kind]=copy(list(next[kind]));
    this._config=next;this._ensure();this._render();this._load();
    if(first&&!config?.card_id||legacy)queueMicrotask(()=>this._emit());
  }
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;
    this._hass=hass;
    if(changed){this._epoch++;this._loading=false;this._catalog=null;this._loadedKey=null;this._locked=false;this._unsubscribe?.();this._unsubscribe=null;this._subscribe();this._load();}
  }
  connectedCallback(){
    this._ensure();
    if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));
    if(!this._change){this._change=event=>this._changeField(event);this.shadowRoot.addEventListener('change',this._change);}
    this._subscribe();this._load();this._render();
  }
  disconnectedCallback(){this._epoch++;this._loading=false;this._unsubscribe?.();this._unsubscribe=null;this._unbind?.();this._unbind=null;this.shadowRoot.removeEventListener('change',this._change);this._change=null;}
  _ensure(){
    if(this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      :host{min-width:0}.setup-flow,.setup-page,.setup-list,.setup-dialog-content{display:grid;gap:16px;min-width:0}
      .setup-steps .card-top{flex-wrap:wrap}.setup-steps nav{flex-wrap:wrap;min-width:0}
      .setup-steps nav button{flex:1 1 auto}.setup-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;bottom:0;padding-block:12px;background:var(--ha-card-background,var(--card-background-color,#fff));z-index:1}
      .setup-footer button{min-height:44px}.setup-list .setting-row{min-width:0}.setup-list .row-text{min-width:0;overflow-wrap:anywhere}
      .setup-choices .fui-selection-list{max-height:320px;overflow-y:auto;overscroll-behavior:contain}
      .setup-dialog-content .field{min-width:0}.setup-dialog-content .position-control{min-width:0}
      @media(max-width:400px){.setup-footer button{flex:1}.setup-choices .fui-selection-list{max-height:50dvh}}
    </style><div class="setup-flow" id="setup-body"></div>
    ${dialog({id:'setup-picker',title:'Geräte auswählen',content:'<div class="setup-choices" id="setup-picker-body"></div>',actions:button({label:'Abbrechen',action:'picker-cancel'})+button({label:'Übernehmen',action:'picker-save',variant:'primary'})})}
    ${dialog({id:'setup-device',title:'Gerät einstellen',content:'<div class="setup-dialog-content" id="setup-device-body"></div>',actions:button({label:'Abbrechen',action:'device-cancel'})+button({label:'Übernehmen',action:'device-save',variant:'primary'})})}`;
    this._body=this.shadowRoot.getElementById('setup-body');
    this._pickerDialog=this.shadowRoot.getElementById('setup-picker');this._deviceDialog=this.shadowRoot.getElementById('setup-device');
    this._pickerDialog.addEventListener('close',()=>{this._selection=null;});
    this._deviceDialog.addEventListener('close',()=>{this._edit=null;});
  }
  _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:copy(this._config)},bubbles:true,composed:true}));}
  async _subscribe(){
    if(!this.isConnected||this._unsubscribe||this._subscriptionPending||!this._hass?.connection?.subscribeEvents)return;
    const epoch=this._epoch;this._subscriptionPending=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id===this._config?.alarm_id){if(this._loading||this._creating)this._again=true;else this._load(true);}},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{this._subscriptionPending=false;}
  }
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||!this._config||this._loading||this._creating)return;
    const key=[this._config.card_id,this._config.alarm_id,this._config.owner_id].join('/');
    if(!force&&key===this._loadedKey)return;
    const epoch=this._epoch;this._loading=true;this._render();
    try{
      const record=await this._hass.callWS({type:'wecker_manager/card',action:'get',card_id:this._config.card_id,alarm_id:this._config.alarm_id});
      if(epoch!==this._epoch)return;
      this._locked=record.exists;this._replaces=record.replaces_card;
      if(!record.exists){
        const owner=this._config.owner_id;
        const response=await this._hass.callWS({type:'wecker_manager/card',action:'catalog',...(owner?{owner_id:owner}:{})});
        if(epoch!==this._epoch||owner!==this._config.owner_id){this._again=true;return;}
        const catalog=Object.fromEntries(['accounts','speakers','covers','lights','calendars'].map(kind=>[kind,list(response?.[kind])]));
        this._catalog=catalog;
        const c=this._config;
        if(owner){
          let removed=0;
          for(const kind of ['speakers','covers','lights']){
            const allowed=new Set((catalog[kind]||[]).map(i=>i.id));
            const kept=c[kind].filter(i=>allowed.has(kind==='speakers'?i:i.entity_id));removed+=c[kind].length-kept.length;c[kind]=kept;
          }
          if(c.calendar_entity&&!(catalog.calendars||[]).some(i=>i.id===c.calendar_entity)){c.calendar_entity='';removed++;}
          if(removed){this._hint='Geräte ohne Freigabe für dieses Musikkonto wurden aus der Auswahl entfernt.';this._emit();}
        }
      }
      this._loadedKey=key;this._error='';
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();if(this._again){this._again=false;queueMicrotask(()=>this._load(true));}}}
  }
  _label(kind,id){return this._catalog?.[kind]?.find(i=>i.id===id)?.label||this._hass?.states?.[id]?.attributes?.friendly_name||id;}
  _canDim(){return this._config.lights.some(item=>(this._catalog?.lights?.find(i=>i.id===item.entity_id)?.attributes?.supported_color_modes||[]).some(mode=>!['onoff','unknown'].includes(mode)));}
  _musicValid(){return Boolean(this._config.owner_id&&this._config.speakers.length&&String(this._config.name??'Wecker').trim());}
  _render(){
    if(!this._body||!this._config)return;
    if(this._locked){for(const modal of [this._pickerDialog,this._deviceDialog])if(modal.open)modal.close();this.shadowRoot.getElementById('setup-picker-body').replaceChildren();this.shadowRoot.getElementById('setup-device-body').replaceChildren();this._body.innerHTML=notice('Musikkonto, Boxen, Rollläden und Lichter sind festgelegt. Für Änderungen diese Karte entfernen und eine neue Weckerkarte anlegen.');return;}
    if(!this._catalog){this._body.innerHTML=(this._loading?loadingState('Einrichtung wird geladen …'):'')+(this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'editor-reload'}):'');return;}
    const step=SETUP_STEPS[this._step],busy=this._loading||this._creating;
    const next=this._step===1&&!this._config.covers.length?'Ohne Rollläden weiter':this._step===2&&!this._config.lights.length?'Ohne Licht weiter':`Weiter${this._step===0?' zu Rollläden':this._step===1?' zu Licht':this._step===2?' zu Schultagen':' zur Übersicht'}`;
    this._body.innerHTML=`<div class="setup-steps">${navigation({label:'Einrichtungsschritte',items:SETUP_STEPS,active:step.id,settings:false,help:false})}</div>
      ${row({title:`Schritt ${this._step+1} von ${SETUP_STEPS.length} · ${step.title}`,description:step.description})}
      ${this._error?notice(this._error,{error:true}):''}${this._hint?notice(this._hint):''}${this._loading?loadingState('Geräte werden geladen …'):''}
      <div class="setup-page" id="setup-page">${this._page()}</div>
      <div class="setup-footer">${button({label:'Zurück',action:'setup-back',disabled:busy||this._step===0})}${this._step===SETUP_STEPS.length-1?button({label:this._creating?'Wird angelegt …':'Wecker anlegen',action:'setup-finish',variant:'primary',disabled:busy||!this._musicValid()}):button({label:next,action:'setup-next',variant:'primary',disabled:busy||this._step===0&&!this._musicValid()})}</div>`;
    for(const button of this._body.querySelectorAll('button,input,select'))if(busy)button.disabled=true;
  }
  _page(){
    const c=this._config,cat=this._catalog;
    if(this._step===0&&!cat.accounts.length)return notice('Richte zuerst ein persönliches Musikkonto im Music Manager ein. Lade die Einrichtung danach erneut.')+button({label:'Erneut laden',action:'editor-reload'});
    if(this._step===0)return field({id:'wake-name',label:'Name des Weckers',value:c.name??'Wecker',maxLength:80,required:true})+
      selectField({id:'wake-owner',label:'Musikkonto',value:c.owner_id,required:true,options:[{value:'',label:'Musikkonto auswählen'},...cat.accounts]})+
      (c.owner_id?row({title:'Musikboxen',description:c.speakers.length?`${c.speakers.length} ausgewählt`:'Wähle mindestens eine Box.',trailing:button({label:c.speakers.length?'Auswahl ändern':'Boxen auswählen',action:'picker-open',data:{kind:'speakers'}})})+this._selected('speakers'):'<p class="hint">Wähle zuerst dein Musikkonto. Danach stehen die dafür freigegebenen Boxen zur Auswahl.</p>');
    if(this._step===1)return row({title:'Gewählte Rollläden',description:c.covers.length?`${c.covers.length} ausgewählt`:'Dein Wecker funktioniert auch ohne Rollläden.',trailing:button({label:c.covers.length?'Auswahl ändern':'Rollläden auswählen',action:'picker-open',data:{kind:'covers'}})})+this._selected('covers');
    if(this._step===2)return row({title:'Gewählte Lichter',description:c.lights.length?`${c.lights.length} ausgewählt`:'Dein Wecker funktioniert auch ohne Licht.',trailing:button({label:c.lights.length?'Auswahl ändern':'Lichter auswählen',action:'picker-open',data:{kind:'lights'}})})+this._selected('lights');
    if(this._step===3)return selectField({id:'wake-calendar',label:'Kalender für schulfreie Tage (optional)',value:c.calendar_entity,options:[{value:'',label:'Keinen Kalender verwenden'},...cat.calendars.map(i=>({value:i.id,label:i.label}))]})+
      notice(c.calendar_entity?'Schultag: Mo–Fr, wenn der Kalender frei ist. Ferien: Mo–Fr, wenn der Kalender einen schulfreien Tag meldet. Wochenende: Sa/So.':'Ohne Kalender gilt der Schultagswecker Mo–Fr und der Wochenendwecker Sa/So. Der Ferienwecker bleibt pausiert.');
    const account=cat.accounts.find(i=>i.value===c.owner_id)?.label||'Kein Konto';
    const summary=(title,description,step)=>row({title,description,trailing:button({label:'Ändern',action:'setup-go',data:{step}})});
    return (this._replaces?notice('Diese Neuanlage ersetzt die bisherige Karte für diesen Wecker.'): '')+
      summary(c.name||'Wecker',`Musikkonto: ${account}`,0)+this._selected('speakers',true)+
      summary('Rollläden',c.covers.length?`${c.covers.length} ausgewählt`:'Keine',1)+this._selected('covers',true)+
      summary('Licht',c.lights.length?`${c.lights.length} ausgewählt`:'Keines',2)+this._selected('lights',true)+
      summary('Schulfrei-Kalender',c.calendar_entity?this._label('calendars',c.calendar_entity):'Keiner · Schultag Mo–Fr',3);
  }
  _description(kind,item){
    if(kind==='covers')return `Zielposition: ${item.position} % offen`;
    if(kind==='lights'){
      const modes=this._catalog.lights.find(i=>i.id===item.entity_id)?.attributes?.supported_color_modes||[];
      return modes.length&&modes.every(m=>['onoff','unknown'].includes(m))?'Einschalten':`${item.brightness} % Helligkeit · ${item.color_mode==='temperature'?`${item.kelvin} K`:item.color_mode==='colour'?'gewählte Farbe':'vorhandene Lichtfarbe'}`;
    }
    return '';
  }
  _selected(kind,readOnly=false){
    return `<div class="setup-list">${this._config[kind].map((item,index)=>{
      const id=kind==='speakers'?item:item.entity_id;
      const controls=readOnly?'':(kind!=='speakers'?iconButton({icon:'edit',label:`${this._label(kind,id)} einstellen`,action:'device-open',data:{kind,index}}):'')+iconButton({icon:'trash',label:`${this._label(kind,id)} entfernen`,action:'device-remove',data:{kind,index}});
      return row({title:this._label(kind,id),description:this._description(kind,item),trailing:controls});
    }).join('')}</div>`;
  }
  _go(step){
    if(!Number.isInteger(step)||step<0||step>=SETUP_STEPS.length)return;
    if(step>0&&!this._musicValid()){this._error='Wähle bitte ein Musikkonto, mindestens eine Musikbox und einen Namen für den Wecker.';this._step=0;this._render();return;}
    this._step=step;this._error='';this._hint='';this._render();this._body.querySelector('[aria-current="page"]')?.focus();
  }
  _openPicker(kind){
    if(!['speakers','covers','lights'].includes(kind)||!this._config.owner_id)return;
    const title={speakers:'Musikboxen auswählen',covers:'Rollläden auswählen',lights:'Lichter auswählen'}[kind];
    let items=this._catalog[kind]||[];if(kind==='covers')items=items.filter(i=>Number(i.attributes?.supported_features||0)&4);
    const counts=new Map();for(const item of items)counts.set(item.label,(counts.get(item.label)||0)+1);
    items=items.map(i=>({...i,description:counts.get(i.label)>1?i.id:''}));
    const values=this._config[kind].map(i=>kind==='speakers'?i:i.entity_id);
    this._selection={kind,values};this.shadowRoot.getElementById('setup-picker-title').textContent=title;
    this.shadowRoot.getElementById('setup-picker-body').innerHTML=multiSelect({id:'setup-devices',label:title,items,values,action:'picker-selection',all:false,selectedFirst:true});
    this._pickerDialog.showModal();
  }
  _savePicker(){
    const selection=this._selection;if(!selection)return;
    const {kind,values}=selection,c=this._config;
    if(kind==='speakers')c.speakers=[...values];
    else c[kind]=values.map(entity_id=>c[kind].find(i=>i.entity_id===entity_id)||(kind==='covers'?{entity_id,position:100}:{entity_id,brightness:100,color_mode:'keep'}));
    if(!this._canDim())c.sunrise_minutes=0;
    this._pickerDialog.close();this._emit();this._render();
  }
  _openDevice(kind,index){
    if(!['covers','lights'].includes(kind)||!this._config[kind][index])return;
    this._edit={kind,index,value:copy(this._config[kind][index])};
    this.shadowRoot.getElementById('setup-device-title').textContent=this._label(kind,this._edit.value.entity_id);
    this._renderDevice();this._deviceDialog.showModal();
  }
  _renderDevice(){
    const edit=this._edit;if(!edit)return;const item=edit.value;
    let html;
    if(edit.kind==='covers')html=rangeControl({id:'setup-position',label:'Zielposition',value:item.position,allowKeep:false,action:'device-position'})+'<p class="hint">0 % = geschlossen · 100 % = ganz geöffnet</p>';
    else{
      const attrs=this._catalog.lights.find(i=>i.id===item.entity_id)?.attributes||{},modes=attrs.supported_color_modes||[];
      html=(modes.some(m=>!['onoff','unknown'].includes(m))?rangeControl({id:'setup-brightness',label:'Helligkeit',value:item.brightness,min:1,allowKeep:false,action:'device-brightness'}):notice('Diese Lampe wird zur Weckzeit eingeschaltet.'))+
        selectField({id:'setup-colourmode',label:'Lichtfarbe',value:item.color_mode,options:[{value:'keep',label:'Vorhandene Farbe beibehalten'},...(modes.includes('color_temp')?[{value:'temperature',label:'Farbtemperatur'}]:[]),...(modes.some(m=>['hs','xy','rgb','rgbw','rgbww'].includes(m))?[{value:'colour',label:'Farbe wählen'}]:[])]})+
        (item.color_mode==='temperature'?whiteTemperatureControl({id:'setup-kelvin',label:'Farbtemperatur',value:item.kelvin,min:attrs.min_color_temp_kelvin||2000,max:attrs.max_color_temp_kelvin||6500,action:'device-kelvin'}):item.color_mode==='colour'?colourPicker({id:'setup-rgb',label:'Farbe',value:item.rgb,action:'device-rgb'}):'');
    }
    this.shadowRoot.getElementById('setup-device-body').innerHTML=html;
  }
  _changeField(event){
    if(this._locked||this._loading||this._creating)return;
    const {id,value}=event.target,c=this._config;
    if(id==='wake-name'){c.name=value;this._emit();this._render();}
    else if(id==='wake-owner'){
      c.owner_id=value;this._error='';this._hint='';this._emit();this._loadedKey=null;this._load(true);
    }else if(id==='wake-calendar'){c.calendar_entity=value;this._emit();this._render();}
    else if(id==='setup-colourmode'&&this._edit){
      const item=this._edit.value,attrs=this._catalog.lights.find(i=>i.id===item.entity_id)?.attributes||{};
      item.color_mode=value;delete item.kelvin;delete item.rgb;
      if(value==='temperature')item.kelvin=Math.max(attrs.min_color_temp_kelvin||2000,Math.min(attrs.max_color_temp_kelvin||6500,2700));
      if(value==='colour')item.rgb=[255,180,100];this._renderDevice();
    }
  }
  async _finish(){
    if(this._step!==SETUP_STEPS.length-1||!this._musicValid()||this._creating)return;
    const epoch=this._epoch;this._creating=true;this._error='';this._render();
    try{
      await this._hass.callWS({type:'wecker_manager/card',action:'create',config:fixed(this._config)});
      if(epoch!==this._epoch)return;this._locked=true;this._again=false;this._emit();
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._creating=false;this._render();}}
  }
  _action({action,data,value}){
    if(action==='editor-reload'){this._load(true);return;}
    if(this._locked||this._loading||this._creating)return;
    if(action==='navigate'){this._go(SETUP_STEPS.findIndex(i=>i.id===data.page));return;}
    if(action==='setup-go'){this._go(Number(data.step));return;}
    if(action==='setup-back'){this._go(this._step-1);return;}
    if(action==='setup-next'){this._go(this._step+1);return;}
    if(action==='setup-finish'){this._finish();return;}
    if(action==='picker-open'){this._openPicker(data.kind);return;}
    if(action==='picker-selection'){if(this._selection)this._selection.values=value;return;}
    if(action==='picker-cancel'){this._pickerDialog.close();return;}
    if(action==='picker-save'){this._savePicker();return;}
    if(action==='device-open'){this._openDevice(data.kind,Number(data.index));return;}
    if(action==='device-cancel'){this._deviceDialog.close();return;}
    if(action==='device-save'&&this._edit){const {kind,index,value}=this._edit;this._config[kind][index]=copy(value);this._deviceDialog.close();this._emit();this._render();return;}
    if(action==='device-remove'){
      if(!['speakers','covers','lights'].includes(data.kind))return;
      this._config[data.kind].splice(Number(data.index),1);if(!this._canDim())this._config.sunrise_minutes=0;this._emit();this._render();return;
    }
    if(this._edit&&action.startsWith('device-')){
      const key={position:'position',brightness:'brightness',kelvin:'kelvin',rgb:'rgb'}[action.slice(7)];
      if(key)this._edit.value[key]=value;
    }
  }
}

for(const [name,element] of [['wecker-manager-time-wheel',MusicManagerTimeWheel],['wecker-manager-card',MusicManagerAlarmCard],['wecker-manager-card-editor',MusicManagerAlarmCardEditor]])if(!customElements.get(name))customElements.define(name,element);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='wecker-manager-card'))window.customCards.push({type:'wecker-manager-card',name:'Wecker',description:'Drei Weckertypen, Drehräder, Schnellzeiten und mehrere fest zugeordnete Geräte.',preview:true});
