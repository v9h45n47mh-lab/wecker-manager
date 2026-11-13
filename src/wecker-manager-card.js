import {UI_CSS, navigation, row, section, button, iconButton, filterButton, toggle, dialog, confirmDialog, field, selectField, rangeControl, multiSelect, whiteTemperatureControl, colourPicker, weekdayPicker, notice, loadingState, versionInfo, bindUI, escapeHtml} from './family-ui/1.4.1/family-ui.js';

const CARD_VERSION='__WECKER_VERSION__';

const defaultDays = (calendar='') => [
  {id:'schultag',name:'Schultag',icon:'mdi:school',weekdays:[0,1,2,3,4],music_mode:'always',confirm_disable:true,calendar_entity:calendar},
  {id:'wochenende',name:'Wochenende',icon:'mdi:weather-sunny',weekdays:[5,6],music_mode:'switchable',confirm_disable:false,calendar_entity:''},
  {id:'ferien',name:'Ferien / schulfrei',icon:'mdi:palm-tree',weekdays:[0,1,2,3,4],music_mode:'switchable',confirm_disable:false,calendar_entity:calendar}
];
const DAY_SYMBOLS = [{value:'mdi:school',label:'Schule'},{value:'mdi:weather-sunny',label:'Sonne'},{value:'mdi:palm-tree',label:'Palme'},{value:'mdi:briefcase',label:'Arbeit'},{value:'mdi:home',label:'Zuhause'},{value:'mdi:calendar',label:'Kalender'},{value:'mdi:coffee',label:'Kaffee'},{value:'mdi:alarm',label:'Wecker'}];
const weekdayText = days => days.map(n=>['Mo','Di','Mi','Do','Fr','Sa','So'][n]).join(', ');
const calendarMode = day => day.calendar_mode||(day.id==='schultag'?'no_event':'event');
const calendarText = day => calendarMode(day)==='no_event'?'an freien Kalendertagen':'an gebuchten Kalendertagen';
const dayTitle = day => day.display_name||day.name;
const usageNames = uses => uses.map(use=>use.owner&&!String(use.name).toLocaleLowerCase().includes(use.owner.toLocaleLowerCase())?use.name+' ('+use.owner+')':use.name).join(', ');
const usageText = day => (list(day.used_by).length?'Verwendet in: '+usageNames(day.used_by):day.uses?'Auf '+day.uses+' Karte'+(day.uses===1?'':'n')+' verwendet':'Keine Dashboardkarte')+(list(day.unassigned).length?' · Weiterhin gespeicherte Wecker ohne Dashboardkarte: '+usageNames(day.unassigned):'');
const dayName = day => String(day.name||'').trim().toLocaleLowerCase();
const dayRule = day => JSON.stringify([dayName(day),dayTitle(day),day.icon,[...day.weekdays].sort(),day.calendar_entity||'',day.calendar_entity?calendarMode(day):'no_event']);
const existingDay = (days,day) => days.find(d=>day.template_id&&d.template_id===day.template_id)||days.find(d=>dayRule(d)===dayRule(day))||days.find(d=>dayName(d)===dayName(day));
const wakeRow = (symbol,options,kind='') => `<div class="wake-row"><span class="wake-symbol${kind?' wake-day-symbol':''}"${kind?` data-wake-kind="${escapeHtml(kind)}" role="img"`:' aria-hidden="true"'}><ha-icon icon="${escapeHtml(symbol)}"></ha-icon></span>${row(options)}</div>`;
const displayTime = time => time.replace(/^0/,'');
const WAKE_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const copy = value => JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value)?value:[];
const freshId = () => 'wake_'+(globalThis.crypto?.randomUUID?.().replaceAll('-','')||Date.now().toString(36)+Math.random().toString(36).slice(2));
const emptyConfig = () => ({type:'custom:wecker-manager-card',alarm_id:freshId(),card_id:freshId(),owner_id:'',speakers:[],covers:[],lights:[],calendar_entity:'',sunrise_minutes:0,days:[]});
const fixed = config => ({card_id:config.card_id,alarm_id:config.alarm_id,owner_id:config.owner_id||'',speakers:config.speakers||[],covers:config.covers||[],lights:config.lights||[],calendar_entity:config.calendar_entity||'',sunrise_minutes:config.sunrise_minutes||0,hue_scene:config.hue_scene||''});
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
  getCardSize(){const days=this._data?.days||(Array.isArray(this._config?.days)?this._config.days:defaultDays(this._config?.calendar_entity));return Math.ceil((100+days.reduce((height,day)=>height+130+(day.music_mode==='switchable'?48:0),0))/50);}
  getGridOptions(){return {columns:12,rows:'auto'};}
  setConfig(config){
    if(!WAKE_ID.test(config?.alarm_id||''))throw new Error('Bitte eine gültige Weckerkennung angeben.');
    if(!WAKE_ID.test(config?.card_id||''))throw new Error('Bitte die Karte über den visuellen Karteneditor neu anlegen (Kartenkennung fehlt).');
    this._config={...config,...fixed(config)};this._reset();this._ensure();this._load();
  }
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;
    this._hass=hass;if(changed){this._reset();this._ensure();this._load();}
    if(this._music)this._music.hass=hass;if(this._editor)this._editor.hass=hass;if(this._typeManager)this._typeManager.hass=hass;if(this._alarmManager)this._alarmManager.hass=hass;
    if(this._data?.exists)this._loadDay();
  }
  connectedCallback(){this._ensure();if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));if(!this._settingsChange){this._settingsChange=event=>this._changeCardField(event);this.shadowRoot.addEventListener('change',this._settingsChange);}this._load();this._scheduleDay();}
  disconnectedCallback(){clearTimeout(this._dayTimer);this._reset();this._unbind?.();this._unbind=null;this.shadowRoot.removeEventListener('change',this._settingsChange);this._settingsChange=null;}
  _reset(){this._epoch++;this._busy=false;this._loading=false;this._data=null;this._loaded=false;this._draft=null;this._draftPlayback=null;this._error='';this._disableTarget=null;this._dayInfo=null;this._dayKey=null;this._dayLoading=false;this._waitingMusic=false;this._music?.remove();this._music=null;this._editor?.remove();this._editor=null;this._typeManager?.remove();this._typeManager=null;this._alarmManager?.remove();this._alarmManager=null;this._unsubscribe?.();this._unsubscribe=null;this._subscribing=false;for(const d of this.shadowRoot.querySelectorAll('dialog[open]'))d.close();}
  _ensure(){
    if(!this._config||this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      :host{min-width:0}.wake-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start}#wake-music{min-width:0}
      .wake-type{min-width:0;border-top:1px solid var(--divider-color,#ddd)}.wake-row{display:grid;grid-template-columns:var(--fui-touch) minmax(0,1fr);gap:var(--fui-section-padding);align-items:center}
      .wake-symbol{display:grid;place-items:center;color:var(--primary-color,#03a9f4)}.wake-symbol ha-icon{display:block;width:var(--fui-icon);height:var(--fui-icon);--mdc-icon-size:var(--fui-icon)}
      .wake-day-symbol{color:var(--primary-color,#03a9f4)}.wake-type.active{background:color-mix(in srgb,var(--primary-color,#03a9f4) 6%,transparent);border-radius:8px}
      .wake-row>.setting-row{min-width:0}
      .wake-presets{display:flex;justify-content:flex-start;gap:8px;flex-wrap:wrap;padding:var(--fui-row-padding) 0 var(--fui-section-padding)}.wake-presets .filter-button{flex:0 0 auto;margin:0}.wake-presets:empty{display:none}
      @media(max-width:360px){.wake-row{grid-template-columns:var(--fui-icon) minmax(0,1fr)}}
      .wake-settings{display:grid;gap:16px}.wake-preset-line{display:flex;align-items:center;gap:8px;min-width:0}.wake-preset-line>:first-child{flex:1}
      .wake-settings .toolbar{flex-wrap:wrap}.wake-wheel-content{min-width:0}#wake-time-dialog{max-width:min(380px,calc(100vw - 24px))}
      #wake-settings-dialog{width:min(480px,calc(100vw - 24px))}#wake-edit-dialog{width:min(620px,calc(100vw - 24px))}#wake-templates-dialog,#wake-alarms-dialog{width:min(560px,calc(100vw - 24px))}
    </style><ha-card aria-label="${escapeHtml(this._config.name||'Wecker')}"><main class="wake-content"><div id="wake-status" aria-live="polite"></div><div class="wake-head"><div id="wake-music"></div><div id="wake-header"></div></div><div id="wake-types"></div><p id="wake-legend" class="hint" hidden>Blau hinterlegt: aktiv in den nächsten 24 Stunden.</p></main></ha-card>
      ${dialog({id:'wake-settings-dialog',title:'Wecker-Einstellungen',content:'<div id="wake-settings-status"></div><div class="wake-settings" id="wake-settings"></div>',actions:button({label:'Abbrechen',action:'cancel-settings'})+button({label:'Speichern',action:'save-settings',variant:'primary'})})}
      ${dialog({id:'wake-time-dialog',title:'Weckzeit einstellen',content:'<div id="wake-time-status"></div><div class="wake-wheel-content" id="wake-wheel"></div>',actions:button({label:'Abbrechen',action:'cancel-time'})+button({label:'Übernehmen',action:'save-time',variant:'primary'})})}
      ${dialog({id:'wake-edit-dialog',title:'Wecker vollständig bearbeiten',content:'<div id="wake-edit-body"></div>'})}
      ${dialog({id:'wake-templates-dialog',title:'Tagestypen verwalten',content:'<div id="wake-templates-body"></div>'})}
      ${dialog({id:'wake-alarms-dialog',title:'Wecker verwalten',content:'<div id="wake-alarms-body"></div>'})}
      ${confirmDialog({id:'wake-confirm-dialog',title:'Wecker ausschalten?',message:'Willst du diesen Wecker wirklich ausschalten?',confirmLabel:'Ausschalten',confirmAction:'confirm-disable',danger:false})}`;
    this._body=this.shadowRoot.getElementById('wake-types');
    this._alarmsDialog=this.shadowRoot.getElementById('wake-alarms-dialog');this._alarmsDialog.addEventListener('close',()=>{if(!this._alarmsDialog.open){this._alarmManager?.remove();this._alarmManager=null;this._load(true);}});
    this._templatesDialog=this.shadowRoot.getElementById('wake-templates-dialog');this._templatesDialog.addEventListener('close',()=>{if(!this._templatesDialog.open){this._typeManager?.remove();this._typeManager=null;this._load(true);}});
    this._editDialog=this.shadowRoot.getElementById('wake-edit-dialog');this._editDialog.addEventListener('close',()=>{if(!this._editDialog.open){this._editor?.remove();this._editor=null;if(this._remoteDirty){this._remoteDirty=false;this._load(true);}}});
    this._settingsDialog=this.shadowRoot.getElementById('wake-settings-dialog');this._timeDialog=this.shadowRoot.getElementById('wake-time-dialog');this._confirmDialog=this.shadowRoot.getElementById('wake-confirm-dialog');const status=document.createElement('div');status.id='wake-confirm-status';this._confirmDialog.querySelector('.modal-body').prepend(status);this._confirmDialog.addEventListener('close',()=>{if(!this._confirmDialog.open)this._disableTarget=null;});
    this._settingsDialog.addEventListener('close',()=>{this._draft=null;this._draftPlayback=null;this.shadowRoot.querySelector('[data-action="settings"]')?.focus();if(this._remoteDirty){this._remoteDirty=false;this._load(true);}});
    this._timeDialog.addEventListener('close',()=>{this._timeTarget=null;if(this._remoteDirty&&!this._draft){this._remoteDirty=false;this._load(true);}});this._render();
  }
  _request(action,extra={}){return this._hass.callWS({type:'wecker_manager/card',action,alarm_id:this._config.alarm_id,card_id:this._config.card_id,...extra});}
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||!this._config||this._loading||this._busy||this._loaded&&!force)return;
    const epoch=this._epoch;this._loading=true;this._error='';this._render();
    try{const data=await this._request('get');if(epoch!==this._epoch)return;this._accept(data);this._loaded=true;this._loadDay();await this._subscribe(epoch);}
    catch(error){if(epoch===this._epoch){this._error=message(error);if(['unauthorized','account_changed','binding_changed','card_missing','card_replaced'].includes(error?.code)){this._data=null;this._music?.remove();this._music=null;}}}
    finally{if(epoch===this._epoch){this._loading=false;this._render();}}
  }
  _accept(data){
    if(data.exists){if(!same(this._config,data.binding)){this._music?.remove();this._music=null;}this._config={...this._config,...copy(data.binding),...(data.name?{name:data.name}:{})};}
    this._data=data;this._dayKey=null;this._loadDay();
    if(data.exists&&!this._music&&!customElements.get('music-manager-alarm-row')){
      if(!this._waitingMusic){const epoch=this._epoch;this._waitingMusic=true;customElements.whenDefined('music-manager-alarm-row').then(()=>{this._waitingMusic=false;if(this.isConnected&&epoch===this._epoch&&this._data?.exists)this._accept(this._data);});}
      return;
    }
    if(data.exists&&!this._music){this._music=document.createElement('music-manager-alarm-row');this._music.setConfig({alarm_id:this._config.alarm_id,name:'Weckmusik'});this._music.hass=this._hass;this.shadowRoot.getElementById('wake-music').append(this._music);}
  }
  _scheduleDay(){clearTimeout(this._dayTimer);this._dayTimer=setTimeout(()=>{if(this.isConnected){this._loadDay();this._scheduleDay();}},60000);this._dayTimer?.unref?.();}
  async _loadDay(){
    if(!this.isConnected||!this._data?.exists||this._dayLoading)return;
    const calendars=this._days().filter(d=>d.calendar_entity).map(d=>{const state=this._hass?.states?.[d.calendar_entity];return [d.calendar_entity,state?.last_updated,state?.state];});
    const key=JSON.stringify([Math.floor(Date.now()/60000),this._data.revision,calendars]);if(key===this._dayKey)return;
    const epoch=this._epoch,revision=this._data.revision;this._dayKey=key;this._dayLoading=true;
    try{const data=await this._request('upcoming');if(epoch===this._epoch&&revision===this._data?.revision)this._dayInfo=data;}
    catch{if(epoch===this._epoch)this._dayInfo=null;}
    finally{if(epoch===this._epoch){this._dayLoading=false;this._renderDay();if(revision!==this._data?.revision){this._dayKey=null;this._loadDay();}}}
  }
  _renderDay(){if(this._body)for(const el of this._body.querySelectorAll('[data-wake-kind]')){const item=this._dayInfo?.types?.[el.dataset.wakeKind],active=Boolean(this._data?.settings.types[el.dataset.wakeKind]?.enabled&&item?.active);const group=el.closest('.wake-type,.status-line');group?.classList.toggle('active',active);el.dataset.nextActive=String(active);const label=active?'Weckt innerhalb der nächsten 24 Stunden'+(item.label?' · '+item.label:''):'Kein Wecken innerhalb der nächsten 24 Stunden';el.title=label;el.setAttribute('aria-label',label);}}
  async _subscribe(epoch){
    if(this._unsubscribe||this._subscribing||!this._hass.connection?.subscribeEvents)return;
    this._subscribing=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id!==this._config.alarm_id)return;if(this._draft||this._timeDialog?.open||this._editDialog?.open||this._templatesDialog?.open||this._alarmsDialog?.open||this._busy||this._loading){this._remoteDirty=true;return;}this._load(true);},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{if(epoch===this._epoch)this._subscribing=false;}
  }
  _days(){return this._data?.days||defaultDays(this._config?.calendar_entity||'');}
  _render(){
    if(!this._body)return;
    const busy=this._busy||this._loading,ready=this._data?.exists;
    const settingsButton=iconButton({icon:'settings',label:'Wecker-Einstellungen',action:'settings',disabled:busy||!ready});
    this.shadowRoot.getElementById('wake-header').innerHTML=settingsButton;
    this.shadowRoot.getElementById('wake-status').innerHTML=(this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'reload',disabled:busy}):'')+(this._data?.error?notice(this._data.error,{error:true}):'')+(this._loading&&!ready?loadingState('Wecker wird geladen …'):'')+(!ready&&this._data?.pending?notice('Einrichtung geprüft. Der Wecker wird nach dem Speichern der Dashboardkarte übernommen.'):!ready&&this._data?.can_create?notice('Öffne den Karteneditor und folge den Einrichtungsschritten.'): '')+(!ready&&this._data?.can_create&&this._hass?.user?.is_admin?button({label:'Wecker verwalten',action:'manage-alarms'}):'');
    this._body.innerHTML=ready?this._days().map(day=>{const kind=day.id,title=dayTitle(day);
      const settings=this._data.settings.types[kind];
      return `<section class="wake-type" aria-label="${escapeHtml(title)}">${wakeRow(day.icon,{title:`${title} · ${settings.enabled?'An':'Aus'}`,description:weekdayText(day.weekdays),trailing:button({label:settings.enabled?'Ausschalten':'Einschalten',action:'enabled',data:{kind},disabled:busy})},kind)}${wakeRow('mdi:clock-outline',{title:'Uhrzeit',trailing:button({label:displayTime(settings.time),action:'time',data:{kind},disabled:busy})})}<div class="wake-presets" role="group" aria-label="${escapeHtml(title+' · Schnellzeiten')}">${settings.presets.map(time=>filterButton({label:time,action:'preset',selected:time===settings.time,data:{kind,time}}).replace('<button ',`<button${busy?' disabled':''} `)).join('')}</div>${day.music_mode==='switchable'?wakeRow('mdi:music-note',{title:'Mit Musik wecken',trailing:toggle({label:`Musik ${title}`,action:'music',checked:settings.music,iconOnly:true,disabled:busy,data:{kind}})}):''}</section>`;
    }).join(''):'';
    this._renderDay();
    this.shadowRoot.getElementById('wake-legend').hidden=!ready;
    for(const d of [this._settingsDialog,this._timeDialog,this._confirmDialog])for(const b of d.querySelectorAll('footer button'))b.disabled=busy;
  }
  _settings(){
    const d=this._draft;if(!d)return;
    this.shadowRoot.getElementById('wake-settings-status').innerHTML='';
    const available=this._data.sunrise_available??Boolean(this._config.lights.length);
    const playback=this._draftPlayback;
    const duration=selectField({id:'wake-playback-mode',label:'Weckdauer',value:playback.mode,options:[{value:'duration',label:'Feste Dauer'},{value:'track_end',label:'Wenn Titel endet'}]})+(playback.mode==='duration'?field({id:'wake-playback-minutes',label:'Dauer in Minuten',type:'number',value:String(playback.minutes),min:1,max:1440,step:1,required:true,hint:'Ist die Dauer länger als der Titel, wird er bis zum Ablauf wiederholt.'}):notice('Der gewählte Titel wird einmal vollständig abgespielt. Für Live-Radio eine feste Dauer wählen.'));
    this.shadowRoot.getElementById('wake-settings').innerHTML=rangeControl({id:'wake-volume',label:'Musiklautstärke für alle Boxen',value:d.volume,min:5,max:15,step:1,allowKeep:false,action:'volume'})+section({id:'wake-playback',title:'Weckmusik',content:duration+'<p class="hint">Gilt für alle Tagestypen und Boxen dieser Weckerkarte.</p>'})+this._days().map(day=>{
      const kind=day.id,item=d.types[kind],sunrise=item.sunrise_minutes??(kind==='schultag'?(d.sunrise_minutes??this._config.sunrise_minutes??0):0);
      const durations=[...new Set([0,5,10,15,20,30,sunrise])].sort((a,b)=>a-b);
      const light=selectField({id:kind==='schultag'?'wake-sunrise-setting':'wake-sunrise-'+kind,label:'Sonnenaufgang',value:String(sunrise),disabled:!available&&!sunrise,options:durations.map(n=>({value:String(n),label:n?`${n} Minuten vor der Weckzeit`:'Aus'})),hint:available?'Die zugeordneten dimmbaren Lichter werden bis zur Weckzeit aufgeblendet.':'Hierfür wird eine zugeordnete dimmbare Lampe benötigt.'}).replace('<select ',`<select data-wake-sunrise="${escapeHtml(kind)}" `);
      return section({id:`presets-${kind}`,title:dayTitle(day),content:light+`<div><p class="hint">Bis zu drei Schnellzeiten</p>${item.presets.map((time,slot)=>`<div class="wake-preset-line">${button({label:time,action:'preset-edit',data:{kind,slot}})}${iconButton({icon:'trash',label:`Schnellzeit ${time} entfernen`,action:'preset-remove',data:{kind,slot}})}</div>`).join('')}${item.presets.length<3?button({label:'Zeit hinzufügen',icon:'add',action:'preset-add',data:{kind}}):''}</div>`});
    }).join('')+(this._hass?.user?.is_admin?button({label:'Gesamte Karte bearbeiten',icon:'edit',action:'edit-card'})+button({label:'Tagestypen verwalten',icon:'menu',action:'manage-templates'})+button({label:'Wecker verwalten',icon:'menu',action:'manage-alarms'}):'')+versionInfo({frontend:CARD_VERSION,backend:this._data.version,ui:'1.4.1',label:'Wecker'});
  }
  async _changeCardField(event){
    const element=event.target;
    if(this._draftPlayback&&element.id==='wake-playback-mode'){this._draftPlayback.mode=element.value;this._settings();return;}
    if(this._draftPlayback&&element.id==='wake-playback-minutes'){this._draftPlayback.minutes=Number(element.value);return;}
    if(element.dataset.wakeSunrise&&this._draft){const kind=element.dataset.wakeSunrise;this._draft.types[kind].sunrise_minutes=Number(element.value);if(kind==='schultag')this._draft.sunrise_minutes=Number(element.value);return;}
  }
  _openTime(kind,slot=null){
    this._timeTarget={kind,slot};const wheel=document.createElement('wecker-manager-time-wheel');wheel.value=slot===null?this._data.settings.types[kind].time:(this._draft.types[kind].presets[slot]||this._data.settings.types[kind].time);
    this.shadowRoot.getElementById('wake-time-status').innerHTML='';this._timeDialog.showModal();this.shadowRoot.getElementById('wake-wheel').replaceChildren(wheel);
  }
  _save(settings,extra={}){return this._persist('update',{settings,revision:this._data.revision,...extra});}
  _setEnabled(kind,enabled,confirmed=false){return this._persist('set_enabled',{kind,enabled,...(confirmed?{confirm_disable:[kind]}:{})});}
  async _persist(action,payload){
    const epoch=this._epoch;this._busy=true;this._error='';this._render();
    try{const result=await this._request(action,payload);if(epoch!==this._epoch)return false;this._accept(result);this._remoteDirty=false;return true;}
    catch(error){if(epoch===this._epoch){this._error=message(error);const id=this._timeDialog.open?'wake-time-status':this._settingsDialog.open?'wake-settings-status':this._confirmDialog.open?'wake-confirm-status':'wake-status';this.shadowRoot.getElementById(id).innerHTML=notice(this._error,{error:true})+(error?.code==='conflict'?button({label:'Neu laden und Änderungen verwerfen',action:'discard-reload'}):'');}return false;}
    finally{if(epoch===this._epoch){this._busy=false;this._render();}}
  }
  async _action({action,data,value,phase}){
    if(action==='volume'){if(this._draft)this._draft.volume=value;return;}
    if(this._busy||this._loading)return;
    if(action==='reload'){await this._load(true);return;}
    if(action==='discard-reload'){for(const modal of [this._timeDialog,this._settingsDialog,this._confirmDialog])if(modal.open)modal.close();await this._load(true);return;}
    if(action==='manage-alarms'&&this._hass?.user?.is_admin){if(this._settingsDialog.open)this._settingsDialog.close();this._alarmManager=document.createElement('wecker-manager-alarm-manager');this._alarmManager.hass=this._hass;this.shadowRoot.getElementById('wake-alarms-body').replaceChildren(this._alarmManager);this._alarmsDialog.showModal();return;}
    if(!this._data?.exists)return;
    if(action==='settings'){this._draft={...copy(this._data.settings),sunrise_minutes:this._data.settings.sunrise_minutes??this._config.sunrise_minutes??0};this._draftPlayback=copy(this._data.playback||{mode:'duration',minutes:5});this._settings();this._settingsDialog.showModal();return;}
    if(action==='cancel-settings'){this._settingsDialog.close();return;}
    if(action==='manage-templates'&&this._hass?.user?.is_admin){this._settingsDialog.close();this._typeManager=document.createElement('wecker-manager-day-manager');this._typeManager.hass=this._hass;this.shadowRoot.getElementById('wake-templates-body').replaceChildren(this._typeManager);this._templatesDialog.showModal();return;}
    if(action==='edit-card'&&this._hass?.user?.is_admin){this._settingsDialog.close();const editor=document.createElement('wecker-manager-card-editor');editor.autoEdit=true;editor.directSave=true;editor.setConfig({...this._config,days:copy(this._days())});editor.hass=this._hass;editor.addEventListener('wecker-card-cancel',()=>this._editDialog.close());editor.addEventListener('wecker-card-saved',event=>{this._config={...event.detail.config};this._editDialog.close();this._load(true);});this._editor=editor;this.shadowRoot.getElementById('wake-edit-body').replaceChildren(editor);this._editDialog.showModal();return;}
    if(action==='save-settings'){if(!Number.isInteger(this._draftPlayback.minutes)||this._draftPlayback.minutes<1||this._draftPlayback.minutes>1440){this.shadowRoot.getElementById('wake-settings-status').innerHTML=notice('Bitte eine ganze Dauer von 1 bis 1440 Minuten angeben.',{error:true});return;}if(await this._save(copy(this._draft),{playback:copy(this._draftPlayback)}))this._settingsDialog.close();return;}
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
    const settings=copy(this._data.settings);
    if(action==='confirm-disable'){
      const kind=this._disableTarget;if(!kind||!settings.types[kind])return;
      if(await this._setEnabled(kind,false,true))this._confirmDialog.close();return;
    }
    const day=this._days().find(item=>item.id===data?.kind);if(!day)return;
    if(action==='enabled'&&day.confirm_disable&&settings.types[day.id].enabled){
      this._disableTarget=day.id;this.shadowRoot.getElementById('wake-confirm-dialog-title').textContent=dayTitle(day)+' ausschalten?';
      this._confirmDialog.querySelector('.modal-body p').textContent='Willst du '+dayTitle(day)+' wirklich ausschalten?';this.shadowRoot.getElementById('wake-confirm-status').textContent='';this._confirmDialog.showModal();return;
    }
    if(action==='enabled'){await this._setEnabled(data.kind,!settings.types[data.kind].enabled);return;}
    else if(action==='music'&&day.music_mode==='switchable')settings.types[data.kind].music=!settings.types[data.kind].music;
    else if(action==='preset')settings.types[data.kind].time=data.time;
    else return;
    await this._save(settings);
  }
}

const SETUP_STEPS = [
  {id:'days',label:'Tagestypen',title:'Tagestypen anlegen',description:'Lege fest, wann und wie deine verschiedenen Wecker verwendet werden.'},
  {id:'music',label:'Musik',title:'Musikkonto und Boxen',description:'Wähle ein Musikkonto und die Boxen, auf denen dein Wecker spielen soll.'},
  {id:'covers',label:'Rollläden',title:'Rollläden',description:'Optional: Wähle Rollläden und lege für jeden seine Zielposition fest.'},
  {id:'lights',label:'Licht',title:'Licht',description:'Optional: Wähle Lichter und stelle jedes einzeln ein.'},
  {id:'review',label:'Prüfen',title:'Alles richtig?',description:'Prüfe die Tagestypen, das Musikkonto und deine Geräte.'}
];

class MusicManagerAlarmCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._epoch=0;this._step=0;this._error='';this._hint='';this._catalog=null;}
  setConfig(config){
    const first=!this._config,next={...emptyConfig(),...config};
    const legacy=Object.hasOwn(next,'replace_automation');delete next.replace_automation;
    for(const kind of ['speakers','covers','lights'])next[kind]=copy(list(next[kind]));
    next.days=copy(Array.isArray(next.days)?next.days:[]);delete next.header;
    this._config=next;this._ensure();this._render();this._load();
    if(first&&!config?.card_id||legacy)queueMicrotask(()=>this._emit());
  }
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection;
    this._hass=hass;
    if(changed){this._epoch++;this._loading=false;this._catalog=null;this._loadedKey=null;this._locked=false;this._managingDays=false;this._editingCard=false;this._dayEdit=null;this._unsubscribe?.();this._unsubscribe=null;this._subscribe();this._load();}
  }
  connectedCallback(){
    this._ensure();
    if(!this._unbind)this._unbind=bindUI(this.shadowRoot,event=>this._action(event));
    if(!this._change){this._change=event=>this._changeField(event);this.shadowRoot.addEventListener('change',this._change);}
    if(!this._textInput){this._textInput=event=>{if(this._loading||this._creating)return;if(event.target.id==='wake-name')this._config.name=event.target.value;if(event.target.id==='day-name'&&this._dayEdit)this._setDayName(event.target.value);if(event.target.id==='day-display-name'&&this._dayEdit){this._dayEdit.display_name=event.target.value;this._displayLinked=false;}};this.shadowRoot.addEventListener('input',this._textInput);}
    this._subscribe();this._load();this._render();
  }
  disconnectedCallback(){this._epoch++;this._loading=false;this._unsubscribe?.();this._unsubscribe=null;this._unbind?.();this._unbind=null;this.shadowRoot.removeEventListener('change',this._change);this._change=null;this.shadowRoot.removeEventListener('input',this._textInput);this._textInput=null;}
  _ensure(){
    if(this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}
      :host{min-width:0}.setup-flow,.setup-page,.setup-list,.setup-dialog-content{display:grid;gap:16px;min-width:0}
      .setup-steps .card-top{flex-wrap:wrap}.setup-steps nav{flex-wrap:wrap;min-width:0}
      .setup-steps nav button{flex:1 1 auto}.setup-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;bottom:0;padding-block:12px;background:var(--ha-card-background,var(--card-background-color,#fff));z-index:1}
      .setup-list .setting-row{min-width:0}.setup-list .row-text{min-width:0;overflow-wrap:anywhere}
      .setup-choices .fui-selection-list{max-height:320px;overflow-y:auto;overscroll-behavior:contain}
      .setup-day-row{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:center;min-width:0}.setup-day-row>ha-icon{color:var(--primary-color,#03a9f4);--mdc-icon-size:var(--fui-icon)}.setup-day-row>.setting-row{min-width:0}.setup-day-icon{display:flex;align-items:center;gap:12px}.setup-day-icon>.field{flex:1;min-width:0}.setup-day-icon>ha-icon{color:var(--primary-color,#03a9f4);flex:0 0 var(--fui-icon);width:var(--fui-icon);height:var(--fui-icon);--mdc-icon-size:var(--fui-icon)}
      .setup-dialog-content .field{min-width:0}.setup-dialog-content .position-control{min-width:0}
      @media(max-width:400px){.setup-footer button{flex:1}.setup-choices .fui-selection-list{max-height:50dvh}}
    </style><div class="setup-flow" id="setup-body"></div>
    ${dialog({id:'setup-picker',title:'Geräte auswählen',content:'<div class="setup-choices" id="setup-picker-body"></div>',actions:button({label:'Abbrechen',action:'picker-cancel'})+button({label:'Übernehmen',action:'picker-save',variant:'primary'})})}
    ${dialog({id:'setup-device',title:'Gerät einstellen',content:'<div class="setup-dialog-content" id="setup-device-body"></div>',actions:button({label:'Abbrechen',action:'device-cancel'})+button({label:'Übernehmen',action:'device-save',variant:'primary'})})}
    ${dialog({id:'setup-day',title:'Tagestyp einstellen',content:'<div id="setup-day-error"></div><div class="setup-dialog-content" id="setup-day-body"></div>',actions:button({label:'Abbrechen',action:'day-cancel'})+button({label:'Übernehmen',action:'day-save',variant:'primary'})})}
    ${confirmDialog({id:'setup-day-confirm',title:'Tagestyp ausschalten und entfernen?',message:'Dieser Tagestyp ist aktiv. Willst du ihn ausschalten und entfernen?',confirmLabel:'Ausschalten und entfernen',confirmAction:'day-confirm-remove'})}`;
    this._body=this.shadowRoot.getElementById('setup-body');
    this._pickerDialog=this.shadowRoot.getElementById('setup-picker');this._deviceDialog=this.shadowRoot.getElementById('setup-device');this._dayDialog=this.shadowRoot.getElementById('setup-day');this._dayConfirm=this.shadowRoot.getElementById('setup-day-confirm');
    this._dayDialog.addEventListener('close',()=>{if(!this._dayDialog.open)this._dayEdit=null;});
    this._pickerDialog.addEventListener('close',()=>{this._selection=null;});
    this._deviceDialog.addEventListener('close',()=>{this._edit=null;});
  }
  _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:copy(this._config)},bubbles:true,composed:true}));}
  async _subscribe(){
    if(!this.isConnected||this._unsubscribe||this._subscriptionPending||!this._hass?.connection?.subscribeEvents)return;
    const epoch=this._epoch;this._subscriptionPending=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.day_templates||event.data?.alarm_id===this._config?.alarm_id){if(this._loading||this._creating)this._again=true;else this._load(true);}},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{this._subscriptionPending=false;}
  }
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||!this._config||this._loading||this._creating)return;
    const key=[this._config.card_id,this._config.alarm_id,this._config.owner_id,this._config.setup_id||''].join('/');
    if(!force&&key===this._loadedKey)return;
    const epoch=this._epoch;this._loading=true;this._render();
    try{
      const prepared=this._config.setup_id&&!this.directSave?await this._hass.callWS({type:'wecker_manager/card',action:'setup_status',setup_id:this._config.setup_id}):null;
      const record=prepared?.pending?prepared.preview:await this._hass.callWS({type:'wecker_manager/card',action:'get',card_id:this._config.card_id,alarm_id:this._config.alarm_id});
      if(epoch!==this._epoch)return;
      this._pendingPrepared=Boolean(prepared?.pending);this._pendingRevision=prepared?.base_revision;if(prepared?.pending)this._preparedConfig=copy(prepared.config);
      this._locked=record.exists;this._replaces=record.replaces_card;this._record=record;
      if(record.exists&&!this._managingDays&&!this._editingCard){this._config={...this._config,...(prepared?.pending?copy(prepared.config):{...copy(record.binding),days:copy(record.days||defaultDays(record.binding.calendar_entity)),...(record.name?{name:record.name}:{})})};if(this.autoEdit&&this._hass.user.is_admin)this._startEditing();}
      if(!record.exists||this._hass.user.is_admin){
        const owner=this._config.owner_id;
        const response=await this._hass.callWS({type:'wecker_manager/card',action:'catalog',...(owner?{owner_id:owner}:{})});
        if(epoch!==this._epoch||owner!==this._config.owner_id){this._again=true;return;}
        const catalog=Object.fromEntries(['accounts','speakers','covers','lights','calendars','shared_days','hue_scenes'].map(kind=>[kind,list(response?.[kind])]));
        this._catalog=catalog;
        const c=this._config;
        if(owner&&(!record.exists||this._editingCard)){
          let removed=0;
          for(const kind of ['speakers','covers','lights']){
            const allowed=new Set((catalog[kind]||[]).map(i=>i.id));
            const kept=c[kind].filter(i=>allowed.has(kind==='speakers'?i:i.entity_id));removed+=c[kind].length-kept.length;c[kind]=kept;
          }
          if(c.calendar_entity&&!(catalog.calendars||[]).some(i=>i.id===c.calendar_entity)){c.calendar_entity='';removed++;}
          this._migrateLegacyScene();if(this._pruneScene())removed++;
          if(removed){this._hint='Geräte ohne Freigabe für dieses Musikkonto wurden aus der Auswahl entfernt.';this._emit();}
          if(!this._calendarsValid())this._hint='Ein Kalender ist für dieses Musikkonto nicht freigegeben. Bitte prüfe die Kalenderauswahl bei den Tagestypen.';
        }
      }
      this._loadedKey=key;this._error='';
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();if(this._again){this._again=false;queueMicrotask(()=>this._load(true));}}}
  }
  _label(kind,id){return this._catalog?.[kind]?.find(i=>i.id===id)?.label||this._hass?.states?.[id]?.attributes?.friendly_name||id;}
  _canDim(){return this._config.lights.some(item=>(this._catalog?.lights?.find(i=>i.id===item.entity_id)?.attributes?.supported_color_modes||[]).some(mode=>!['onoff','unknown'].includes(mode)));}
  _lightMembers(id,seen=new Set()){
    if(seen.has(id))return [];const item=this._catalog?.lights?.find(light=>light.id===id);if(!item)return [];
    const children=item.attributes?.entity_id;if(!Array.isArray(children)||!children.length)return item.attributes?.is_hue_group?[]:[id];
    const next=new Set(seen).add(id),groups=children.map(child=>this._lightMembers(child,next));return groups.every(group=>group.length)?[...new Set(groups.flat())]:[];
  }
  _matchingHueScenes(){
    const groups=this._config.lights.map(item=>this._lightMembers(item.entity_id)),selected=new Set(groups.flat());
    return list(this._catalog?.hue_scenes).filter(scene=>scene.members.length&&scene.members.every(id=>selected.has(id))&&groups.every(group=>!group.some(id=>scene.members.includes(id))||group.every(id=>scene.members.includes(id))));
  }
  _sceneCovers(id){const scene=this._matchingHueScenes().find(scene=>scene.id===this._config.hue_scene),members=this._lightMembers(id);return scene&&members.length&&members.every(member=>scene.members.includes(member));}
  _lightSceneChoices(id){return list(this._catalog?.hue_scenes).filter(scene=>list(scene.lights).includes(id));}
  _migrateLegacyScene(){if(!this._config.hue_scene)return;const covered=this._config.lights.filter(light=>this._sceneCovers(light.entity_id));if(covered.length&&covered.every(light=>this._lightSceneChoices(light.entity_id).some(scene=>scene.id===this._config.hue_scene))){for(const light of covered)light.hue_scene=this._config.hue_scene;this._config.hue_scene='';}}
  _pruneScene(){let changed=false;if(this._config.hue_scene&&!this._matchingHueScenes().some(scene=>scene.id===this._config.hue_scene)){this._config.hue_scene='';changed=true;}for(const light of this._config.lights)if(light.hue_scene&&!this._lightSceneChoices(light.entity_id).some(scene=>scene.id===light.hue_scene)){delete light.hue_scene;changed=true;}if(changed)this._hint='Eine Hue-Szene passt nicht mehr zur Lichtauswahl. Bitte die Szene im Dialog der betreffenden Lampe neu wählen.';return changed;}
  _daysValid(){const days=this._config.days;return Boolean(String(this._config.name??'Wecker').trim())&&days.length>0&&days.length<=12&&new Set(days.map(d=>d.id)).size===days.length&&new Set(days.map(dayName)).size===days.length&&days.every(d=>String(d.name||'').trim()&&Array.isArray(d.weekdays)&&d.weekdays.length&&/^mdi:[a-z0-9-]+$/.test(d.icon));}
  _calendarsValid(){return !this._config.owner_id||this._config.days.every(d=>!d.calendar_entity||this._catalog?.calendars.some(c=>c.id===d.calendar_entity));}
  _musicValid(){return Boolean(this._config.owner_id&&this._config.speakers.length&&String(this._config.name??'Wecker').trim()&&this._calendarsValid());}
  _render(){
    if(!this._body||!this._config)return;
    if(this._locked&&!this._managingDays&&!this._editingCard){for(const modal of [this._pickerDialog,this._deviceDialog,this._dayDialog])if(modal.open)modal.close();for(const id of ['setup-picker-body','setup-device-body','setup-day-body'])this.shadowRoot.getElementById(id).replaceChildren();this._body.innerHTML=notice(this._pendingPrepared?'Einrichtung geprüft. Speichere jetzt die Dashboardkarte mit „Speichern“. Erst dann wird der Wecker übernommen.':'Die gesamte Karte kann bearbeitet werden. Weckzeiten und Aktivierungen bleiben erhalten.')+(this._hass?.user?.is_admin?button({label:'Karte bearbeiten',action:'edit-card',variant:'primary'})+(!this._pendingPrepared&&this.directSave?button({label:'Tagestypen bearbeiten',action:'manage-days'}):''):'');return;}
    if(!this._catalog){this._body.innerHTML=(this._loading?loadingState('Einrichtung wird geladen …'):'')+(this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'editor-reload'}):'');return;}
    if(this._managingDays){this._body.innerHTML=row({title:'Tagestypen bearbeiten',description:'Die Geräte bleiben unverändert. Bestehende Tagestypen behalten ihre Zeiten.'})+(this._error?notice(this._error,{error:true}):'')+this._daysPage()+`<div class="setup-footer">${button({label:'Abbrechen',action:'manage-days-cancel',disabled:this._creating})}${button({label:this._creating?'Wird gespeichert …':'Tagestypen speichern',action:'manage-days-save',variant:'primary',disabled:this._creating||!this._daysValid()||!this._calendarsValid()})}</div>`;return;}
    const step=SETUP_STEPS[this._step],busy=this._loading||this._creating;
    const next=this._step===2&&!this._config.covers.length?'Ohne Rollläden weiter':this._step===3&&!this._config.lights.length?'Ohne Licht weiter':`Weiter zu ${SETUP_STEPS[this._step+1]?.label||'Prüfen'}`;
    this._body.innerHTML=`<div class="setup-steps">${navigation({label:'Einrichtungsschritte',items:SETUP_STEPS,active:step.id,settings:false,help:false})}</div>
      ${row({title:`Schritt ${this._step+1} von ${SETUP_STEPS.length} · ${step.title}`,description:step.description})}
      ${this._error?notice(this._error,{error:true}):''}${this._hint?notice(this._hint):''}${this._loading?loadingState('Geräte werden geladen …'):''}
      <div class="setup-page" id="setup-page">${this._page()}</div>
      <div class="setup-footer">${button({label:'Zurück',action:'setup-back',disabled:busy||this._step===0})}${this._editingCard?button({label:'Abbrechen',action:'edit-card-cancel',disabled:busy}):''}${this._step===SETUP_STEPS.length-1?button({label:this._creating?'Wird geprüft …':this.directSave?(this._editingCard?'Änderungen speichern':'Wecker anlegen'):'Einrichtung übernehmen',action:'setup-finish',variant:'primary',disabled:busy||!this._daysValid()||!this._musicValid()}):button({label:next,action:'setup-next',variant:'primary',disabled:busy||!this._daysValid()||this._step===1&&!this._musicValid()})}</div>`;
    for(const button of this._body.querySelectorAll('button,input,select'))if(busy)button.disabled=true;
  }
  _page(){
    const c=this._config,cat=this._catalog;
    if(this._step===0)return field({id:'wake-name',label:'Name des Weckers',value:c.name??'Wecker',maxLength:80,required:true})+this._daysPage();
    if(this._step===1&&!cat.accounts.length)return notice('Richte zuerst ein persönliches Musikkonto im Music Manager ein. Lade die Einrichtung danach erneut.')+button({label:'Erneut laden',action:'editor-reload'});
    if(this._step===1)return selectField({id:'wake-owner',label:'Musikkonto',value:c.owner_id,required:true,options:[{value:'',label:'Musikkonto auswählen'},...cat.accounts]})+
      (c.owner_id?row({title:'Musikboxen',description:c.speakers.length?`${c.speakers.length} ausgewählt`:'Wähle mindestens eine Box.',trailing:button({label:c.speakers.length?'Auswahl ändern':'Boxen auswählen',action:'picker-open',data:{kind:'speakers'}})})+this._selected('speakers'):'<p class="hint">Wähle zuerst dein Musikkonto. Danach stehen die dafür freigegebenen Boxen zur Auswahl.</p>');
    if(this._step===2)return row({title:'Gewählte Rollläden',description:c.covers.length?`${c.covers.length} ausgewählt`:'Dein Wecker funktioniert auch ohne Rollläden.',trailing:button({label:c.covers.length?'Auswahl ändern':'Rollläden auswählen',action:'picker-open',data:{kind:'covers'}})})+this._selected('covers');
    if(this._step===3)return row({title:'Gewählte Lichter',description:c.lights.length?`${c.lights.length} ausgewählt`:'Dein Wecker funktioniert auch ohne Licht.',trailing:button({label:c.lights.length?'Auswahl ändern':'Lichter auswählen',action:'picker-open',data:{kind:'lights'}})})+(c.hue_scene?notice('Die bisherige gemeinsame Hue-Szene bleibt erhalten. Zum individuellen Einstellen zuerst auf Einzelwerte wechseln.')+button({label:'Auf Einzelwerte wechseln',action:'clear-legacy-scene'}):'')+this._selected('lights');
    const account=cat.accounts.find(i=>i.value===c.owner_id)?.label||'Kein Konto';
    const summary=(title,description,step)=>row({title,description,trailing:button({label:'Ändern',action:'setup-go',data:{step}})});
    return (this._replaces?notice('Diese Neuanlage ersetzt die bisherige Karte für diesen Wecker.'): '')+
      summary('Tagestypen',`${c.days.length} eingerichtet`,0)+this._daysList(true)+
      summary('Wecker',c.name||'Wecker',0)+summary('Musikkonto',account,1)+this._selected('speakers',true)+
      summary('Rollläden',c.covers.length?`${c.covers.length} ausgewählt`:'Keine',2)+this._selected('covers',true)+
      summary('Licht',c.lights.length?`${c.lights.length} ausgewählt`+(c.hue_scene?' · Hue-Szene: '+this._label('hue_scenes',c.hue_scene):''):'Keines',3)+this._selected('lights',true);
  }
  _daysList(readOnly=false){
    return `<div class="setup-list">${this._config.days.map(day=>`<div class="setup-day-row"><ha-icon icon="${escapeHtml(day.icon)}" aria-hidden="true"></ha-icon>${row({title:day.name,description:(day.display_name&&day.display_name!==day.name?'Anzeigename: '+day.display_name+' · ':'')+weekdayText(day.weekdays)+' · '+(day.music_mode==='always'?'Musik immer an':'Musik schaltbar')+' · '+(day.confirm_disable?'Ausschalten mit Bestätigung':'Ausschalten per Klick')+(day.calendar_entity?' · '+this._label('calendars',day.calendar_entity)+' · '+calendarText(day):' · ohne Kalender'),trailing:readOnly?'':iconButton({icon:'edit',label:day.name+' einstellen',action:'day-edit',data:{kind:day.id}})+iconButton({icon:'trash',label:day.name+' entfernen',action:'day-remove',data:{kind:day.id}})})}</div>`).join('')}</div>`;
  }
  _daysPage(){const shared=[...new Map(this._catalog.shared_days.map(t=>[dayRule(t),t])).values()].filter(t=>!this._config.days.some(d=>d.template_id===t.id));return (!this._config.days.length?notice('Noch keine Tagestypen angelegt. Verwende einen vorhandenen Tagestyp oder lege einen neuen an.'):'')+this._daysList()+(shared.length?`<div class="setup-dialog-content">${selectField({id:'setup-shared-day',label:'Gemeinsamen Tagestyp verwenden',value:this._sharedChoice||'',options:[{value:'',label:'Tagestyp auswählen'},...shared.map(t=>({value:t.id,label:t.name+' · '+weekdayText(t.weekdays)}))]})}${button({label:'Tagestyp übernehmen',action:'day-use',disabled:!this._sharedChoice||this._config.days.length>=12})}</div>`:'')+button({label:'Neuen Tagestyp anlegen',icon:'add',action:'day-add',disabled:this._config.days.length>=12})+notice('Gemeinsame Tagestypen können auf mehreren Weckerkarten verwendet werden. Weckzeit, Aktivierung und Musikschalter bleiben je Karte getrennt. Nur ganztägige Termine zählen.');}
  _setDayName(value){this._dayEdit.name=value;if(this._displayLinked){this._dayEdit.display_name=value;const input=this.shadowRoot.getElementById('day-display-name');if(input)input.value=value;}}
  _openDay(kind,shared=null){
    const day=this._config.days.find(d=>d.id===kind)||(shared?existingDay(this._config.days,{...shared,template_id:shared.id}):null);
    this._dayEdit=day?{...copy(day),calendar_mode:calendarMode(day)}:{id:freshId().replace('wake_','day_'),name:'',icon:'mdi:alarm',weekdays:[],music_mode:'switchable',confirm_disable:false,calendar_entity:'',calendar_mode:'no_event'};
    if(shared)Object.assign(this._dayEdit,{name:shared.name,display_name:shared.display_name||shared.name,icon:shared.icon,weekdays:copy(shared.weekdays),calendar_entity:shared.calendar_entity,calendar_mode:shared.calendar_mode,template_id:shared.id,template_revision:shared.revision,...(!day?{music_mode:shared.music_mode||'switchable',confirm_disable:shared.confirm_disable??false}:{})});
    this._applyPolicies=false;
    this._displayLinked=!day?.display_name&&!shared?.display_name;
    const d=this._dayEdit;d.display_name=dayTitle(d)||'';
    const symbols=DAY_SYMBOLS.some(s=>s.value===d.icon)?DAY_SYMBOLS:[...DAY_SYMBOLS,{value:d.icon,label:'Bisheriges Symbol'}];
    this.shadowRoot.getElementById('setup-day-error').innerHTML='';
    this.shadowRoot.getElementById('setup-day-body').innerHTML=field({id:'day-name',label:'Name des Tagestyps',value:d.name,required:true,maxLength:60,hint:'Eindeutiger Name für Verwaltung und Auswahl.'})+field({id:'day-display-name',label:'Anzeigename auf der Weckerkarte',value:d.display_name,required:true,maxLength:60})+
      `<div class="setup-day-icon"><ha-icon id="day-icon-preview" icon="${escapeHtml(d.icon)}" aria-hidden="true"></ha-icon>${selectField({id:'day-icon',label:'Symbol',value:d.icon,options:symbols})}</div>`+
      weekdayPicker({id:'day-weekdays',label:'Gilt an diesen Wochentagen',values:d.weekdays,action:'day-weekdays'})+
      selectField({id:'day-music',label:'Musik',value:d.music_mode,options:[{value:'always',label:'Immer an'},{value:'switchable',label:'In der Karte ein-/ausschaltbar'}]})+
      selectField({id:'day-confirm',label:'Ausschalten des Weckers',value:d.confirm_disable?'confirm':'click',options:[{value:'click',label:'Mit einem Klick'},{value:'confirm',label:'Erst nach Bestätigung'}]})+
      (this.dayManager?'<p class="hint">Vorgaben für neue Übernahmen dieses Tagestyps.</p>': '')+
      selectField({id:'day-calendar',label:'Kalender prüfen (optional)',value:d.calendar_entity,options:[{value:'',label:'Ohne Kalenderprüfung'},...this._catalog.calendars.map(c=>({value:c.id,label:c.label}))]})+
      `<div id="day-calendar-condition"${d.calendar_entity?'':' hidden'}>${selectField({id:'day-calendar-mode',label:'Wecken an',value:d.calendar_mode,disabled:!d.calendar_entity,options:[{value:'no_event',label:'Freien Kalendertagen'},{value:'event',label:'Gebuchten Kalendertagen'}],hint:'Frei: kein ganztägiger Termin. Gebucht: mindestens ein ganztägiger Termin. Nur ganztägige Termine zählen; Termine mit Uhrzeit werden ignoriert.'})}</div>`+(d.template_id?notice(this.dayManager?'Name, Symbol, Wochentage und Kalenderregeln gelten auf allen Karten mit diesem Tagestyp. Persönliche Weckzeiten und Aktivierungen bleiben erhalten.':'Name, Symbol, Wochentage und Kalenderregeln werden gemeinsam verwendet. Änderungen gelten auch auf anderen Karten mit diesem Tagestyp. Musik und Ausschaltbestätigung gelten nur für diese Karte.'):'');
    const template=this._catalog.shared_days.find(item=>item.id===d.template_id);if(template)this.shadowRoot.getElementById('setup-day-body').insertAdjacentHTML('beforeend',notice(usageText(template)));
    if(this.dayManager&&(template?.stored_uses??template?.uses)>0)this.shadowRoot.getElementById('setup-day-body').insertAdjacentHTML('beforeend',row({title:'Musik und Ausschaltverhalten auf bestehende Wecker übernehmen',trailing:toggle({label:'Musik und Ausschaltverhalten auf bestehende Wecker übernehmen',action:'day-apply-policies',checked:false,iconOnly:true})})+'<p class="hint">Die beiden Vorgaben ersetzen dann die Einstellungen in den oben aufgeführten Weckern. Weckzeiten und Aktivierungen bleiben erhalten.</p>');
    this._dayDialog.showModal();
  }
  _saveDay(){
    const day=this._dayEdit;if(!day)return;
    day.name=this.shadowRoot.getElementById('day-name').value.trim();day.display_name=this.shadowRoot.getElementById('day-display-name').value.trim();
    if(!day.name||day.name.length>60||!day.display_name||day.display_name.length>60||!day.weekdays.length){this.shadowRoot.getElementById('setup-day-error').innerHTML=notice('Bitte Namen, Anzeigenamen und mindestens einen Wochentag wählen.',{error:true});return;}
    const duplicate=this._config.days.find(d=>d.id!==day.id&&dayName(d)===dayName(day));
    if(duplicate){this.shadowRoot.getElementById('setup-day-error').innerHTML=notice('Dieser Tagestyp ist bereits vorhanden. Bitte den vorhandenen Typ bearbeiten.',{error:true});return;}
    const match=this._config.days.find(d=>d.id===day.id)||(day.template_id?existingDay(this._config.days,day):null);
    const index=match?this._config.days.indexOf(match):-1;if(match)day.id=match.id;
    if(index<0)this._config.days.push(copy(day));else this._config.days[index]=copy(day);
    this._dayDialog.close();if(!this._managingDays)this._emit();this._render();
  }
  _removeDay(kind,confirmed=false){
    const day=this._config.days.find(d=>d.id===kind);if(!day)return;
    if((this._managingDays||this._editingCard)&&(this._record?.days?.find(d=>d.id===kind)?.confirm_disable??day.confirm_disable)&&this._record?.settings?.types?.[kind]?.enabled&&!confirmed){this._removeDayId=kind;this._dayConfirm.showModal();return;}
    if(confirmed){this._confirmedDays=this._confirmedDays||[];this._confirmedDays.push(kind);this._dayConfirm.close();}
    this._config.days=this._config.days.filter(d=>d.id!==kind);if(!this._managingDays)this._emit();this._render();
  }
  async _saveManagedDays(){
    if(!this._daysValid()||!this._calendarsValid())return;
    const epoch=this._epoch;this._creating=true;this._error='';this._render();
    try{
      const record=await this._hass.callWS({type:'wecker_manager/card',action:'configure_days',card_id:this._config.card_id,alarm_id:this._config.alarm_id,days:copy(this._config.days),revision:this._manageRevision,confirm_disable:this._confirmedDays||[]});
      if(epoch!==this._epoch)return;this._record=record;this._config.days=copy(record.days);this._managingDays=false;this._again=false;this._emit();
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._creating=false;this._render();}}
  }
  _description(kind,item){
    if(kind==='covers')return `Zielposition: ${item.position} % offen`;
    if(kind==='lights'){
      if(item.hue_scene)return 'Hue-Szene: '+this._label('hue_scenes',item.hue_scene);
      if(this._sceneCovers(item.entity_id))return 'Hue-Szene: '+this._label('hue_scenes',this._config.hue_scene);
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
    if(step>0&&!this._daysValid()){this._error='Lege bitte mindestens einen vollständigen Tagestyp an.';this._step=0;this._render();return;}
    if(step>1&&!this._musicValid()){this._error='Wähle bitte ein Musikkonto, mindestens eine Musikbox und einen Namen für den Wecker. Prüfe außerdem die Kalenderfreigaben.';this._step=1;this._render();return;}
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
    if(kind==='lights')this._pruneScene();
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
      const scenes=this._lightSceneChoices(item.entity_id);
      html=(scenes.length||item.hue_scene?selectField({id:'setup-hue-scene',label:'Hue-Szene für diese Lampe',value:item.hue_scene||'',disabled:Boolean(this._config.hue_scene),options:[{value:'',label:'Individuell einstellen'},...scenes.map(scene=>({value:scene.id,label:scene.label}))],hint:'Die gespeicherten Szenenwerte werden nur auf diese Lampe angewendet. Andere Lampen der Hue-Szene werden nicht mitgeschaltet.'}):'')+
        (item.hue_scene?notice('Farbe und Helligkeit werden aus der Hue-Szene übernommen.'):(modes.some(m=>!['onoff','unknown'].includes(m))?rangeControl({id:'setup-brightness',label:'Helligkeit',value:item.brightness,min:1,allowKeep:false,action:'device-brightness'}):notice('Diese Lampe wird zur Weckzeit eingeschaltet.'))+
        selectField({id:'setup-colourmode',label:'Lichtfarbe',value:item.color_mode,options:[{value:'keep',label:'Vorhandene Farbe beibehalten'},...(modes.includes('color_temp')?[{value:'temperature',label:'Farbtemperatur'}]:[]),...(modes.some(m=>['hs','xy','rgb','rgbw','rgbww'].includes(m))?[{value:'colour',label:'Farbe wählen'}]:[])]})+
        (item.color_mode==='temperature'?whiteTemperatureControl({id:'setup-kelvin',label:'Farbtemperatur',value:item.kelvin,min:attrs.min_color_temp_kelvin||2000,max:attrs.max_color_temp_kelvin||6500,action:'device-kelvin'}):item.color_mode==='colour'?colourPicker({id:'setup-rgb',label:'Farbe',value:item.rgb,action:'device-rgb'}):''));
    }
    this.shadowRoot.getElementById('setup-device-body').innerHTML=html;
  }
  _changeField(event){
    const {id,value}=event.target,c=this._config;
    if(this._loading||this._creating)return;
    if(id==='setup-shared-day'){this._sharedChoice=value;this._render();return;}
    if(this._locked&&!this._managingDays&&!this._editingCard)return;
    if(id.startsWith('day-')&&this._dayEdit){const keys={'day-name':'name','day-icon':'icon','day-music':'music_mode','day-calendar':'calendar_entity','day-calendar-mode':'calendar_mode'};if(id==='day-confirm')this._dayEdit.confirm_disable=value==='confirm';else if(id==='day-name')this._setDayName(value);else if(id==='day-display-name'){this._dayEdit.display_name=value;this._displayLinked=false;}else if(keys[id])this._dayEdit[keys[id]]=value;if(id==='day-icon')this.shadowRoot.getElementById('day-icon-preview').setAttribute('icon',value);if(id==='day-calendar'){this.shadowRoot.getElementById('day-calendar-condition').hidden=!value;this.shadowRoot.getElementById('day-calendar-mode').disabled=!value;}return;}
    if(id==='wake-name'){c.name=value;this._emit();}
    else if(id==='setup-hue-scene'&&this._edit){if(value)this._edit.value.hue_scene=value;else delete this._edit.value.hue_scene;this._renderDevice();}
    else if(id==='wake-hue-scene'){c.hue_scene=value;this._emit();this._render();}
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
  _startEditing(){this._editingCard=true;this._managingDays=false;this._editRevision=this._pendingPrepared?this._pendingRevision:this._record.revision;this._confirmedDays=[];this._step=0;if(!this._pendingPrepared)this._config={...this._config,...copy(this._record.binding),calendar_entity:'',days:copy(this._record.days||defaultDays(this._record.binding.calendar_entity)),...(this._record.name?{name:this._record.name}:{})};this._error='';}
  async _finish(){
    if(this._step!==SETUP_STEPS.length-1||!this._daysValid()||!this._musicValid()||this._creating)return;
    const epoch=this._epoch;this._creating=true;this._error='';this._render();
    try{
      const response=await this._hass.callWS({type:'wecker_manager/card',action:this.directSave?(this._editingCard?'configure':'create'):'prepare_setup',config:{...fixed(this._config),name:this._config.name||'Wecker',days:copy(this._config.days)},revision:this._editRevision??this._record?.revision??0,confirm_disable:this._confirmedDays||[]});
      if(epoch!==this._epoch)return;const record=response.pending?response.preview:response;
      if(response.pending){this._pendingPrepared=true;this._pendingRevision=response.base_revision;this._preparedConfig=copy(response.config);this._config={...this._config,...copy(response.config),setup_id:response.setup_id};}
      if(epoch!==this._epoch)return;this._record=record;if(!response.pending)this._config={...this._config,...copy(record.binding),days:copy(record.days),...(record.name?{name:record.name}:{})};this._locked=true;this._editingCard=false;this._again=false;this._emit();if(!response.pending)this.dispatchEvent(new CustomEvent('wecker-card-saved',{detail:{config:copy(this._config)},bubbles:true,composed:true}));
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._creating=false;this._render();}}
  }
  _action({action,data,value}){
    if(action==='editor-reload'){this._load(true);return;}
    if(this._loading||this._creating)return;
    if(action==='edit-card'&&this._hass?.user?.is_admin){this._startEditing();this._loadedKey=null;this._load(true);this._render();return;}
    if(action==='edit-card-cancel'){this._config={...this._config,...(this._pendingPrepared?copy(this._preparedConfig):{...copy(this._record.binding),days:copy(this._record.days),...(this._record.name?{name:this._record.name}:{})})};this._editingCard=false;this._error='';this._emit();this._render();this.dispatchEvent(new CustomEvent('wecker-card-cancel',{bubbles:true,composed:true}));return;}
    if(action==='manage-days'&&this._hass?.user?.is_admin){if(!this.directSave){this._startEditing();this._render();return;}this._managingDays=true;this._manageRevision=this._record.revision;this._confirmedDays=[];this._config.days=copy(this._record.days||this._config.days);this._render();return;}
    if(action==='manage-days-cancel'){this._config.days=copy(this._record.days||defaultDays(this._config.calendar_entity));this._managingDays=false;this._error='';this._render();return;}
    if(action==='manage-days-save'){this._saveManagedDays();return;}
    if(this._locked&&!this._managingDays&&!this._editingCard)return;
    if(action==='clear-legacy-scene'){this._config.hue_scene='';this._emit();this._render();return;}
    if(action==='day-use'){const shared=this._catalog.shared_days.find(d=>d.id===this._sharedChoice);if(shared){this._sharedChoice='';this._openDay(undefined,shared);}return;}
    if(action==='day-add'){this._openDay();return;}
    if(action==='day-edit'){this._openDay(data.kind);return;}
    if(action==='day-remove'){this._removeDay(data.kind);return;}
    if(action==='day-confirm-remove'){this._removeDay(this._removeDayId,true);return;}
    if(action==='day-cancel'){this._dayDialog.close();return;}
    if(action==='day-save'){this._saveDay();return;}
    if(action==='day-weekdays'){if(this._dayEdit)this._dayEdit.weekdays=value;return;}
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
      this._config[data.kind].splice(Number(data.index),1);if(!this._canDim())this._config.sunrise_minutes=0;if(data.kind==='lights')this._pruneScene();this._emit();this._render();return;
    }
    if(this._edit&&action.startsWith('device-')){
      const key={position:'position',brightness:'brightness',kelvin:'kelvin',rgb:'rgb'}[action.slice(7)];
      if(key)this._edit.value[key]=value;
    }
  }
}

class WeckerManagerDayManager extends MusicManagerAlarmCardEditor {
  constructor(){super();this.dayManager=true;this.setConfig(emptyConfig());}
  _ensure(){
    super._ensure();if(this._templateConfirm)return;
    const template=document.createElement('template');template.innerHTML=confirmDialog({id:'template-delete-confirm',title:'Gemeinsamen Tagestyp löschen?',message:'Der unbenutzte Tagestyp wird aus der gemeinsamen Auswahl entfernt.',confirmLabel:'Löschen',confirmAction:'template-confirm-delete'});this.shadowRoot.append(template.content.cloneNode(true));
    this._templateConfirm=this.shadowRoot.getElementById('template-delete-confirm');
  }
  async _load(force=false){
    if(!this.isConnected||!this._hass?.user?.id||this._loading||this._creating||this._loadedKey&&!force)return;
    if(!this._hass.user.is_admin){this._catalog=null;this._error='Die Tagestypen-Verwaltung steht nur Administratoren zur Verfügung.';this._render();return;}
    const epoch=this._epoch;this._loading=true;this._render();
    try{
      const response=await this._hass.callWS({type:'wecker_manager/card',action:'catalog',refresh_usage:true});if(epoch!==this._epoch)return;
      this._catalog={shared_days:list(response.shared_days),calendars:list(response.calendars),usage_checked_at:response.usage_checked_at};
      this._config.days=this._catalog.shared_days.map(day=>({...copy(day),template_id:day.id,template_revision:day.revision,music_mode:day.music_mode||'switchable',confirm_disable:day.confirm_disable??false}));
      this._loadedKey='templates';this._error='';
    }catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();if(this._again){this._again=false;queueMicrotask(()=>this._load(true));}}}
  }
  _render(){
    if(!this._body)return;const busy=this._creating||this._loading;
    this._body.innerHTML=notice('Tagestypen stehen allen Weckerkarten zur Verfügung. Name, Symbol, Wochentage und Kalenderregeln werden gemeinsam gepflegt. Musik und Ausschaltverhalten können als Vorgaben hinterlegt werden. Weckzeiten, Aktivierung und Musikschalter bleiben je Karte getrennt.')+
      button({label:'Aktualisieren',action:'refresh-usage',disabled:busy})+(this._catalog?.usage_checked_at?`<p class="hint">Zuletzt geprüft: ${escapeHtml(new Date(this._catalog.usage_checked_at).toLocaleString('de-DE'))}</p>`:'')+
      (this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'editor-reload',disabled:busy}):'')+
      (this._loading?loadingState('Tagestypen werden geladen …'):'')+
      (this._catalog?`<div class="setup-list">${this._catalog.shared_days.map(day=>`<div class="setup-day-row"><ha-icon icon="${escapeHtml(day.icon)}" aria-hidden="true"></ha-icon>${row({title:day.name,description:'Anzeigename: '+dayTitle(day)+' · '+weekdayText(day.weekdays)+(day.calendar_entity?' · '+this._label('calendars',day.calendar_entity)+' · '+calendarText(day):' · ohne Kalender')+' · '+usageText(day),trailing:iconButton({icon:'edit',label:day.name+' bearbeiten',action:'day-edit',data:{kind:day.id},disabled:busy})+iconButton({icon:'trash',label:day.name+' löschen',action:'template-delete',data:{kind:day.id},disabled:busy||day.uses>0})})}</div>`).join('')||notice('Noch keine gemeinsamen Tagestypen angelegt.')}</div>`+button({label:'Tagestyp anlegen',icon:'add',action:'day-add',disabled:busy})+notice('Auf Dashboard- oder Statuskarten verwendete Tagestypen sind geschützt. Beim Löschen eines ungenutzten Typs werden zugehörige Wecker ohne Karte nach Bestätigung aufgeräumt.'):'');
  }
  _dialogBusy(busy){for(const modal of [this._dayDialog,this._templateConfirm])for(const control of modal.querySelectorAll('button,input,select'))control.disabled=busy;}
  async _saveDay(){
    const day=this._dayEdit;if(!day||this._creating)return;day.name=this.shadowRoot.getElementById('day-name').value.trim();day.display_name=this.shadowRoot.getElementById('day-display-name').value.trim();
    if(!day.name||day.name.length>60||!day.display_name||day.display_name.length>60||!day.weekdays.length){this.shadowRoot.getElementById('setup-day-error').innerHTML=notice('Bitte Namen, Anzeigenamen und mindestens einen Wochentag wählen.',{error:true});return;}
    const epoch=this._epoch,raw=Object.fromEntries(['id','name','display_name','icon','weekdays','calendar_entity','calendar_mode','music_mode','confirm_disable'].map(key=>[key,copy(day[key])]));
    this._creating=true;this._dialogBusy(true);this._render();
    try{
      await this._hass.callWS({type:'wecker_manager/card',action:'save_day_template',day_template:raw,revision:day.template_revision||0,apply_policies:this._applyPolicies});if(epoch!==this._epoch)return;
      this._dayDialog.close();this._again=false;this._loadedKey=null;
    }catch(error){if(epoch===this._epoch)this.shadowRoot.getElementById('setup-day-error').innerHTML=notice(message(error),{error:true});}
    finally{if(epoch===this._epoch){this._creating=false;this._dialogBusy(false);this._render();if(!this._dayDialog.open)this._load(true);}}
  }
  async _deleteTemplate(){
    const day=this._deleteTarget;if(!day||this._creating)return;const epoch=this._epoch;this._creating=true;this._dialogBusy(true);this._render();
    try{await this._hass.callWS({type:'wecker_manager/card',action:'delete_day_template',template_id:day.id,revision:day.revision,remove_cards:list(day.unassigned).map(use=>({alarm_id:use.alarm_id,card_id:use.card_id}))});if(epoch!==this._epoch)return;this._again=false;this._loadedKey=null;}
    catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._creating=false;this._dialogBusy(false);this._templateConfirm.close();this._deleteTarget=null;this._render();if(!this._loadedKey)this._load(true);}}
  }
  _action(event){
    if(this._creating||this._loading)return;
    if(event.action==='day-apply-policies'){this._applyPolicies=Boolean(event.checked);event.element.setAttribute('aria-checked',String(this._applyPolicies));event.element.classList.toggle('on',this._applyPolicies);return;}
    if(event.action==='refresh-usage'){this._load(true);return;}
    if(event.action==='template-delete'){const day=this._catalog?.shared_days.find(day=>day.id===event.data.kind);if(day&&!day.uses){this._deleteTarget=copy(day);this._templateConfirm.querySelector('.modal-body p').textContent='„'+day.name+'“ aus der gemeinsamen Auswahl löschen?'+(list(day.unassigned).length?' Dabei werden diese gespeicherten Wecker ohne Dashboardkarte entfernt: '+usageNames(day.unassigned)+'.':'');this._templateConfirm.showModal();}return;}
    if(event.action==='template-confirm-delete'){this._deleteTemplate();return;}
    super._action(event);
  }
}

class WeckerManagerAlarmManager extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._epoch=0;this._filter='unused';this._error='';}
  set hass(hass){
    const changed=this._hass?.user?.id!==hass?.user?.id||this._hass?.connection!==hass?.connection||this._isAdmin!==Boolean(hass?.user?.is_admin);this._hass=hass;this._isAdmin=Boolean(hass?.user?.is_admin);
    if(changed){this._epoch++;this._data=null;this._loading=false;this._deleting=false;this._again=false;this._error='';this._target=null;this._unsubscribe?.();this._unsubscribe=null;this._subscribing=false;if(this._confirm?.open)this._confirm.close();if(this._confirm)this._confirm.querySelector('.modal-body p').textContent='';this._ensure();this._render();this._load();this._subscribe();}
  }
  connectedCallback(){this._ensure();this._unbind=bindUI(this.shadowRoot,event=>this._action(event));this._load();this._subscribe();}
  disconnectedCallback(){this._epoch++;this._loading=false;this._deleting=false;this._again=false;this._subscribing=false;this._unsubscribe?.();this._unsubscribe=null;this._unbind?.();this._unbind=null;}
  _ensure(){
    if(this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}:host{min-width:0}.row-text{overflow-wrap:anywhere}</style><div id="alarm-manager-body"></div>${confirmDialog({id:'stored-alarm-delete',title:'Ungenutzten Wecker löschen?',message:'',confirmLabel:'Wecker löschen',confirmAction:'stored-confirm-delete'})}`;
    this._body=this.shadowRoot.getElementById('alarm-manager-body');this._confirm=this.shadowRoot.getElementById('stored-alarm-delete');this._confirm.addEventListener('close',()=>{if(!this._deleting)this._target=null;});this._render();
  }
  async _subscribe(){
    if(!this.isConnected||!this._hass?.user?.is_admin||this._unsubscribe||this._subscribing||!this._hass.connection?.subscribeEvents)return;
    const epoch=this._epoch;this._subscribing=true;
    try{const unsubscribe=await this._hass.connection.subscribeEvents(event=>{if(event.data?.alarm_id||event.data?.day_templates)this._load();},'wecker_manager_card_updated');if(epoch!==this._epoch)unsubscribe();else this._unsubscribe=unsubscribe;}
    catch{}finally{if(epoch===this._epoch)this._subscribing=false;}
  }
  async _load(){
    if(!this.isConnected||!this._hass?.user?.is_admin)return;
    if(this._loading||this._deleting){this._again=true;return;}
    const epoch=this._epoch;this._loading=true;this._render();
    try{const data=await this._hass.callWS({type:'wecker_manager/card',action:'list_cards'});if(epoch!==this._epoch)return;this._data={cards:list(data.cards),usage_checked_at:data.usage_checked_at};this._error='';}
    catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._loading=false;this._render();if(this._again){this._again=false;queueMicrotask(()=>this._load());}}}
  }
  _render(){
    if(!this._body)return;
    if(!this._hass?.user?.is_admin){this._body.innerHTML=notice('Die Weckerverwaltung steht nur Administratoren zur Verfügung.');return;}
    const busy=this._loading||this._deleting,cards=list(this._data?.cards).filter(card=>this._filter==='all'||!list(card.dashboards).length);
    this._body.innerHTML=`<div class="toolbar">${filterButton({label:'Ungenutzte',action:'stored-filter',selected:this._filter==='unused',data:{filter:'unused'}})}${filterButton({label:'Alle',action:'stored-filter',selected:this._filter==='all',data:{filter:'all'}})}${button({label:'Aktualisieren',action:'stored-refresh',disabled:busy})}</div>`+
      (this._data?.usage_checked_at?`<p class="hint">Zuletzt geprüft: ${escapeHtml(new Date(this._data.usage_checked_at).toLocaleString('de-DE'))}</p>`:'')+
      (this._error?notice(this._error,{error:true}):'')+(this._loading?loadingState('Wecker werden geprüft …'):'')+
      (this._data?cards.map(card=>row({title:card.name,description:[card.owner,list(card.days).join(', '),'Boxen: '+list(card.speakers).join(', '),list(card.dashboards).length?'Verwendet auf: '+card.dashboards.join(', '):'Keine Dashboard- oder Statuskarte',card.blocked_reason].filter(Boolean).join(' · '),trailing:iconButton({icon:'trash',label:card.name+' löschen',action:'stored-delete',data:{alarm:card.alarm_id},disabled:busy||!card.can_delete})})).join('')||notice(this._filter==='unused'?'Keine ungenutzten Wecker vorhanden.':'Keine gespeicherten Wecker vorhanden.'):'')+
      notice('Löschen entfernt den gewählten Wecker und seine Musikzuordnung. Gemeinsame Tagestypen bleiben erhalten.');
    for(const control of this._body.querySelectorAll('button'))if(busy)control.disabled=true;
    for(const control of this._confirm.querySelectorAll('button'))control.disabled=Boolean(this._deleting);
  }
  async _delete(){
    const target=this._target;if(!target||this._deleting)return;const epoch=this._epoch;this._deleting=true;this._error='';this._render();let saved=false;
    try{await this._hass.callWS({type:'wecker_manager/card',action:'delete_card',alarm_id:target.alarm_id,card_id:target.card_id,revision:target.revision});if(epoch!==this._epoch)return;saved=true;}
    catch(error){if(epoch===this._epoch)this._error=message(error);}
    finally{if(epoch===this._epoch){this._deleting=false;this._confirm.close();this._target=null;this._render();const again=this._again;this._again=false;if(saved||again)this._load();}}
  }
  _action({action,data}){
    if(this._loading||this._deleting||!this._hass?.user?.is_admin)return;
    if(action==='stored-filter'){this._filter=data.filter==='all'?'all':'unused';this._render();return;}
    if(action==='stored-refresh'){this._load();return;}
    if(action==='stored-delete'){const card=this._data?.cards.find(card=>card.alarm_id===data.alarm);if(!card?.can_delete)return;this._target=copy(card);this._confirm.querySelector('.modal-body p').textContent='„'+card.name+'“ ('+card.owner+') dauerhaft löschen? Seine Weckzeiten und Musikzuordnung werden entfernt. Gemeinsame Tagestypen bleiben erhalten.';this._confirm.showModal();return;}
    if(action==='stored-confirm-delete')this._delete();
  }
}

class WeckerManagerStatusEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.addEventListener('change',event=>{if(!this._config)return;const key=event.target.dataset.config;if(!key)return;this._config[key]=event.target.value.trim();this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:copy(this._config)},bubbles:true,composed:true}));});}
  setConfig(config){this._config={...config};this.shadowRoot.innerHTML=`<style>${UI_CSS}.status-fields{display:grid;gap:16px}</style>${notice('Alarm-ID und Karten-ID aus der YAML-Konfiguration der zugehörigen Weckerkarte kopieren. Diese Übersicht zeigt deren aktuellen Zustand und ändert keine Einstellungen.')}<div class="status-fields">${['name','alarm_id','card_id'].map((key,index)=>field({id:'status-'+key,label:['Überschrift','Alarm-ID','Karten-ID'][index],value:config[key]||'',required:index>0}).replace('<input ',`<input data-config="${key}" `)).join('')}</div>`;}
  set hass(value){this._hass=value;}
}

class WeckerManagerStatusCard extends MusicManagerAlarmCard {
  static getConfigElement(){return document.createElement('wecker-manager-status-editor');}
  static getStubConfig(){return {type:'custom:wecker-manager-status-card',name:'Wecker',alarm_id:'',card_id:''};}
  getCardSize(){return Math.ceil((48+(this._data?.days?.length||3)*40)/50);}
  _ensure(){
    if(!this._config||this._body)return;
    this.shadowRoot.innerHTML=`<style>${UI_CSS}.status-title{padding:16px 16px 8px}.status-content{padding:0 16px 12px}.status-line{display:grid;grid-template-columns:var(--fui-icon) 12px minmax(0,1fr) auto;align-items:center;gap:4px;min-height:var(--fui-touch)}.status-time{text-align:end;white-space:nowrap;font-variant-numeric:tabular-nums}.wake-symbol{display:grid;place-items:center;color:var(--primary-color,#03a9f4)}.status-line.active{background:color-mix(in srgb,var(--primary-color,#03a9f4) 6%,transparent);border-radius:8px}.wake-symbol ha-icon{display:block;width:var(--fui-icon);height:var(--fui-icon);--mdc-icon-size:var(--fui-icon)}.status-dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--secondary-text-color,#727272)}.status-dot.on{background:var(--primary-color,#03a9f4)}</style><ha-card><h3 class="status-title" id="status-title"></h3><div class="status-content"><div id="status-error" aria-live="polite"></div><div id="status-types"></div></div></ha-card>`;
    this._body=this.shadowRoot.getElementById('status-types');this._render();
  }
  _accept(data){if(data.exists)this._config={...this._config,...copy(data.binding)};this._data=data;this._dayKey=null;this._loadDay();}
  _render(){
    if(!this._body)return;this.shadowRoot.getElementById('status-title').textContent=this._config.name||this._data?.name||'Wecker';
    this.shadowRoot.getElementById('status-error').innerHTML=this._error?notice(this._error,{error:true})+button({label:'Erneut laden',action:'reload'}):this._loading&&!this._data?.exists?loadingState('Wird geladen …'):!this._data?.exists&&this._data?notice('Die zugehörige Weckerkarte wurde nicht gefunden. Bitte Alarm-ID und Karten-ID prüfen.'):'';
    this._body.innerHTML=this._data?.exists?this._days().map(day=>{const item=this._data.settings.types[day.id],on=item?.enabled,time=item?.time;return `<div class="status-line" data-status-kind="${escapeHtml(day.id)}" aria-label="${escapeHtml(dayTitle(day)+' · '+(on?'An':'Aus')+(time?' · '+time+' Uhr':''))}"><span class="wake-symbol" data-wake-kind="${escapeHtml(day.id)}" role="img"><ha-icon icon="${escapeHtml(day.icon)}"></ha-icon></span><span class="status-dot${on?' on':''}" aria-hidden="true"></span><span>${on?'An':'Aus'}</span><time class="status-time"${time?` datetime="${escapeHtml(time)}"`:''}>${escapeHtml(time||'–')}</time></div>`;}).join(''):'';this._renderDay();
  }
  _action({action}){if(action==='reload')this._load(true);}
}

for(const [name,element] of [['wecker-manager-time-wheel',MusicManagerTimeWheel],['wecker-manager-card',MusicManagerAlarmCard],['wecker-manager-card-editor',MusicManagerAlarmCardEditor],['wecker-manager-day-manager',WeckerManagerDayManager],['wecker-manager-alarm-manager',WeckerManagerAlarmManager],['wecker-manager-status-card',WeckerManagerStatusCard],['wecker-manager-status-editor',WeckerManagerStatusEditor]])if(!customElements.get(name))customElements.define(name,element);
window.customCards=window.customCards||[];
if(!window.customCards.some(card=>card.type==='wecker-manager-card'))window.customCards.push({type:'wecker-manager-card',name:'Wecker',description:'Gemeinsame Tagestypen, 24-Stunden-Status und vollständig bearbeitbare Weckerkarten.',preview:true});
if(!window.customCards.some(card=>card.type==='wecker-manager-status-card'))window.customCards.push({type:'wecker-manager-status-card',name:'Wecker-Status',description:'Kompakte Statusübersicht eines vorhandenen Weckers mit Symbol, An/Aus und Weckzeit je Tagestyp.',preview:false});
