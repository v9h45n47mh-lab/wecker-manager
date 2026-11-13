const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright')));}
const root=path.resolve(__dirname,'..'),screens=path.join(root,'test-results');fs.mkdirSync(screens,{recursive:true});
const server=http.createServer((req,res)=>{const route=req.url.split('?')[0];if(route==='/test-music.js'){const folder=process.env.MUSIC_MANAGER_SOURCE||path.resolve(root,'../music-manager');res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(folder,'custom_components/music_manager/frontend/music-manager-card.js')));return;}const target=path.resolve(root,'.'+route);if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const url=`http://127.0.0.1:${server.address().port}/tests/fixture.html`,card=()=>page.locator('wecker-manager-card'),action=name=>card().locator(`[data-action="${name}"]`);
 await page.goto(url+'?real_music=1');await action('time').first().waitFor();
 assert.equal(await action('time').count(),3);
 assert.equal(await card().locator('#wake-day,#wake-day-card').count(),0);await card().locator('[data-wake-kind="schultag"][data-next-active="true"]').waitFor();
 const music=card().locator('music-manager-alarm-row');
 await music.getByRole('button',{name:'Auswählen',exact:true}).waitFor();
 await music.getByRole('button',{name:'Auswählen',exact:true}).click();
 await music.locator('#alarm-dialog[open]').waitFor();await music.locator('#alarm-playback-minutes').fill('9');await music.getByRole('button',{name:'Dauer übernehmen',exact:true}).click();await music.locator('#alarm-dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).playback.minutes),9);
 await music.getByRole('button',{name:'Auswählen',exact:true}).click();await music.locator('#alarm-playback-mode').selectOption('track_end');for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await music.locator('#alarm-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await music.locator('#alarm-dialog').screenshot({path:path.join(screens,`wake-music-title-end-${width}-${dark?'dark':'light'}.png`)});}await music.getByRole('button',{name:'Dauer übernehmen',exact:true}).click();await music.locator('#alarm-dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).playback.mode),'track_end');await page.keyboard.press('Escape');await page.evaluate(()=>{let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;el?.blur();});
 for(const width of [1100,500,390,320])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  assert.equal(await card().locator('.wake-symbol ha-icon').count(),8);
  assert.equal(await card().locator('#wake-header .row-text').count(),0);
  assert.equal(await card().locator('[data-wake-calendar],.wake-calendar-rule').count(),0);
  assert.equal(await card().locator('[data-wake-kind][data-next-active="true"]').count(),1);
  const symbolColours=await card().locator('[data-wake-kind]').evaluateAll(els=>els.map(el=>getComputedStyle(el).color));assert.equal(new Set(symbolColours).size,1);assert.equal(await card().locator('.wake-type.active').count(),1);assert.equal(new Set(await card().locator('.wake-type').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor))).size,2);
  const styleDifferences=await page.evaluate(async()=>{
   const ui=await import('/src/family-ui/1.4.1/family-ui.js'),host=document.createElement('div'),root=host.attachShadow({mode:'open'});
   root.innerHTML=`<style>${ui.UI_CSS}</style>${ui.row({title:'Referenz',description:'Wochentage',trailing:ui.button({label:'Ausschalten',action:'reference'})})}${ui.filterButton({label:'05:55',selected:false})}${ui.toggle({label:'Musik',checked:false,iconOnly:true})}`;document.body.append(host);
   const actual=wakeDemo.card.shadowRoot,differences=[],props=['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingBottom','color','backgroundColor'];
   for(const [target,reference] of [['.wake-row .row-text strong','.row-text strong'],['[data-action="enabled"]','[data-action="reference"]'],['.wake-presets .filter-button','.filter-button'],['[data-action="music"]','.toggle']]){
    const a=getComputedStyle(actual.querySelector(target)),b=getComputedStyle(root.querySelector(reference));for(const prop of props)if(a[prop]!==b[prop])differences.push(`${target}: ${prop} ${a[prop]} / ${b[prop]}`);
   }host.remove();return differences;
  });assert.deepEqual(styleDifferences,[],'shared components must match the unmodified UI Kit');
  const groups=await card().locator('.wake-presets').evaluateAll(groups=>groups.map(group=>({
   buttons:[...group.children].map(button=>{const box=button.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top};}),
   last:group.getBoundingClientRect().right,
  })));
  for(const group of groups){for(let i=1;i<group.buttons.length;i++){
   const previous=group.buttons[i-1],next=group.buttons[i];assert.equal(next.top,previous.top);assert(next.left-previous.right<=9);
  }assert(group.buttons.at(-1).right<=group.last);}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await card().screenshot({path:path.join(screens,`reference-layout-${width}-${dark?'dark':'light'}.png`)});
 }
 await page.setViewportSize({width:1100,height:1000});await page.evaluate(()=>document.body.classList.remove('dark'));
 await action('time').first().click();
 const time=card().locator('#wake-time-dialog'),wheel=time.locator('wecker-manager-time-wheel');
 assert(await time.isVisible());
 const hours=wheel.locator('[data-wheel="0"]'),minutes=wheel.locator('[data-wheel="1"]');
 await hours.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
 await minutes.focus();await page.keyboard.press('End');
 assert.equal(await wheel.evaluate(w=>w.value),'02:59');
 await time.getByRole('button',{name:'Übernehmen',exact:true}).click();
 await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.time==='02:59');
 assert.equal(await action('time').first().innerText(),'2:59');
 await action('time').first().click();await minutes.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await page.keyboard.press('Escape');assert.equal(await action('time').first().innerText(),'2:59');
 await action('preset').filter({hasText:'06:15'}).click();await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.time==='06:15');
 await action('enabled').first().click();const confirm=card().locator('#wake-confirm-dialog');assert(await confirm.isVisible());await page.keyboard.press('Escape');assert(await action('enabled').first().innerText()==='Ausschalten');
 await action('enabled').first().click();await confirm.locator('[data-action="confirm-disable"]').click();await confirm.waitFor({state:'hidden'});
 await page.waitForFunction(()=>!wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.enabled);assert.equal(await action('enabled').first().innerText(),'Einschalten');
 await action('enabled').first().click();await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.enabled);
 await page.evaluate(()=>{const record=wakeDemo.records.get(wakeDemo.config.alarm_id);record.settings.types.ferien.time='11:32';record.revision++;});
 await action('enabled').nth(1).click();await page.waitForFunction(()=>!wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.wochenende.enabled);
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.ferien.time),'11:32');
 await page.evaluate(()=>wakeDemo.card.setConfig(wakeDemo.config));await action('time').first().waitFor();assert.equal(await action('enabled').nth(1).innerText(),'Einschalten');
 await action('enabled').nth(1).click();await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.wochenende.enabled);
 await action('settings').click();const settings=card().locator('#wake-settings-dialog');
 const slider=settings.locator('#wake-volume');assert.equal(await slider.getAttribute('min'),'5');assert.equal(await slider.getAttribute('max'),'15');
 assert.equal(await settings.locator('select').count(),3);assert(await settings.locator('#wake-sunrise-setting').isVisible());assert.equal(await settings.locator('[data-ui-multi]').count(),0);
 assert(await settings.evaluate(el=>el.getBoundingClientRect().width<=480));assert.match(await settings.locator('.version-info').innerText(),/Wecker 1\.7\.0/);
 assert(await settings.locator('#wake-settings').evaluate(el=>el.lastElementChild.classList.contains('version-info')));
 await slider.press('End');await settings.locator('#wake-sunrise-setting').selectOption('15');
 await settings.locator('[data-action="preset-remove"][data-kind="schultag"]').first().click();
 await settings.getByRole('button',{name:'Speichern',exact:true}).click();await settings.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.volume),15);
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.sunrise_minutes),15);
 assert.equal(await page.evaluate(()=>wakeDemo.config.sunrise_minutes),5);
 await action('settings').click();await settings.locator('#wake-sunrise-setting').selectOption('0');
 await settings.getByRole('button',{name:'Abbrechen',exact:true}).click();
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.sunrise_minutes),15);
 assert.equal(await action('preset').filter({hasText:'05:55'}).count(),0);
 await page.evaluate(()=>wakeDemo.remoteChange(record=>record.settings.types.ferien.time='11:42'));
 await page.waitForFunction(()=>wakeDemo.card.shadowRoot.querySelector('[data-action="time"][data-kind="ferien"]').textContent==='11:42');
 await page.evaluate(()=>wakeDemo.fail=true);await action('preset').filter({hasText:'06:15'}).click();await card().getByRole('alert').filter({hasText:'Speichern fehlgeschlagen'}).waitFor();await page.evaluate(()=>wakeDemo.fail=false);await action('reload').click();
 for(const width of [1100,390,320])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  await page.screenshot({path:path.join(screens,`wake-${width}-${dark?'dark':'light'}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await action('settings').click();assert(await settings.isVisible());assert(await settings.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:path.join(screens,`wake-settings-${width}-${dark?'dark':'light'}.png`),fullPage:true});
  await settings.locator('.version-info').scrollIntoViewIfNeeded();assert(await settings.locator('.version-info').isVisible());await settings.screenshot({path:path.join(screens,`wake-settings-version-bottom-${width}-${dark?'dark':'light'}.png`)});await page.keyboard.press('Escape');
  await action('time').first().click();assert(await time.isVisible());assert(await time.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:path.join(screens,`wake-time-${width}-${dark?'dark':'light'}.png`),fullPage:true});await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:390,height:1000});await page.goto(url+'?editor=1&setup_only=1');const editor=page.locator('wecker-manager-card-editor');await editor.locator('[data-action="day-add"]').waitFor();
 const setupAction=(name,extra='')=>editor.locator(`[data-action="${name}"]${extra}`);
 const pick=async(kind,ids)=>{
  await setupAction('picker-open',`[data-kind="${kind}"]`).click();const picker=editor.locator('#setup-picker');await picker.waitFor();await picker.screenshot({path:path.join(screens,`setup-picker-${kind}.png`)});
  for(const id of ids)await picker.locator(`input[type=checkbox][value="${id}"]`).check();
  await picker.getByRole('button',{name:'Übernehmen',exact:true}).click();await picker.waitFor({state:'hidden'});
 };
 const captureStep=async(number)=>{
  for(const width of [1100,390,320])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await editor.screenshot({path:path.join(screens,`setup-step-${number}-${width}-${dark?'dark':'light'}.png`)});
  }
  await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>document.body.classList.remove('dark'));
 };
 assert.equal(await editor.locator('#wake-alarm-id,#wake-replace,#wake-owner').count(),0);
 assert.equal(await editor.locator('.setup-day-row').count(),0);assert(await setupAction('setup-next').isDisabled());await captureStep('empty');
 const dayDialog=editor.locator('#setup-day');
 const addDay=async(name,icon,weekdays,music='switchable',confirm='click',calendar='',mode='no_event')=>{
  await setupAction('day-add').click();assert.equal(await dayDialog.locator('#day-name').inputValue(),'');assert.equal(await dayDialog.locator('#day-weekdays input:checked').count(),0);
  await dayDialog.locator('#day-name').fill(name);await dayDialog.locator('#day-icon').selectOption(icon);for(const n of weekdays)await dayDialog.locator(`#day-weekdays input[value="${n}"]`).check();
  await dayDialog.locator('#day-music').selectOption(music);await dayDialog.locator('#day-confirm').selectOption(confirm);await dayDialog.locator('#day-calendar').selectOption(calendar);
  if(calendar){await dayDialog.locator('#day-calendar-mode').selectOption(mode);assert(await dayDialog.getByText('Nur ganztägige Termine zählen',{exact:false}).isVisible());}
  await dayDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();return page.evaluate(name=>wakeDemo.edited.days.find(d=>d.name===name).id,name);
 };
 const originalSchool=await addDay('Schultag','mdi:school',[0,1,2,3,4],'always','confirm','calendar.school','no_event');
 await editor.locator('#setup-shared-day').selectOption('day_shared_school');await setupAction('day-use').click();assert.equal(await dayDialog.locator('#day-name').inputValue(),'Schultag');
 await dayDialog.locator('#day-music').selectOption('always');await dayDialog.locator('#day-confirm').selectOption('confirm');await dayDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();
 const schoolId=await page.evaluate(()=>wakeDemo.edited.days.find(d=>d.template_id==='day_shared_school').id);
 assert.equal(schoolId,originalSchool);assert.equal(await editor.locator('.setup-day-row').count(),1);
 await addDay('Wochenende','mdi:weather-sunny',[5,6]);await addDay('Ferien / schulfrei','mdi:palm-tree',[0,1,2,3,4],'switchable','click','calendar.school','event');
 await setupAction('day-add').click();await dayDialog.locator('#day-name').fill('Frühdienst');
 await dayDialog.locator('#day-icon').selectOption('mdi:briefcase');await dayDialog.locator('#day-music').selectOption('always');await dayDialog.locator('#day-confirm').selectOption('confirm');await dayDialog.locator('#day-calendar').selectOption('calendar.work');
 await dayDialog.locator('#day-calendar-mode').selectOption('no_event');for(const n of [0,1,2,3,4])await dayDialog.locator(`#day-weekdays input[value="${n}"]`).check();
 for(const width of [390,320])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  assert(await dayDialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  const iconBox=await dayDialog.locator('#day-icon-preview').boundingBox();assert(iconBox.width<=32&&iconBox.height<=32);
  assert(await dayDialog.locator('#day-icon').evaluate(el=>el.getBoundingClientRect().right<=el.closest('dialog').getBoundingClientRect().right));
  await dayDialog.screenshot({path:path.join(screens,`setup-day-${width}-${dark?'dark':'light'}.png`)});
 }
 await dayDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();
 const customId=await page.evaluate(()=>wakeDemo.edited.days.find(d=>d.name==='Frühdienst').id);
 assert.deepEqual(await page.evaluate(()=>wakeDemo.edited.days.find(d=>d.name==='Frühdienst').weekdays),[0,1,2,3,4]);await captureStep(1);
 await setupAction('setup-next').click();assert(await setupAction('setup-next').isDisabled());
 await editor.locator('#wake-owner').selectOption('max');await setupAction('picker-open','[data-kind="speakers"]').waitFor();
 await pick('speakers',['media_player.max','media_player.dress']);await captureStep(2);
 await setupAction('setup-next').click();await pick('covers',['cover.max','cover.dress']);
 await setupAction('device-open','[data-kind="covers"][data-index="0"]').click();let device=editor.locator('#setup-device');
 await device.locator('#setup-position').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await device.screenshot({path:path.join(screens,'setup-device-cover.png')});await device.getByRole('button',{name:'Abbrechen',exact:true}).click();assert.equal(await page.evaluate(()=>wakeDemo.edited.covers[0].position),100);
 await setupAction('device-open','[data-kind="covers"][data-index="0"]').click();
 await device.locator('#setup-position').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await device.getByRole('button',{name:'Übernehmen',exact:true}).click();assert.equal(await page.evaluate(()=>wakeDemo.edited.covers[0].position),65);await captureStep(3);
 await setupAction('setup-next').click();await pick('lights',['light.max','light.dress']);
 await setupAction('device-open','[data-kind="lights"][data-index="0"]').click();await device.locator('#setup-colourmode').selectOption('temperature');
 assert(await device.locator('#setup-kelvin').count());await device.screenshot({path:path.join(screens,'setup-device-light.png')});await device.getByRole('button',{name:'Übernehmen',exact:true}).click();await captureStep(4);
 assert.equal(await editor.locator('#wake-hue-scene').count(),0);await setupAction('device-open','[data-kind="lights"][data-index="0"]').click();
 await device.locator('#setup-hue-scene').selectOption('scene.relax');assert.equal(await device.locator('#setup-brightness').count(),0);
 for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await device.evaluate(el=>el.scrollWidth<=el.clientWidth));await device.screenshot({path:path.join(screens,`setup-device-hue-${width}-${dark?'dark':'light'}.png`)});}
 await device.getByRole('button',{name:'Übernehmen',exact:true}).click();assert.equal(await setupAction('device-open','[data-kind="lights"]').count(),2);await captureStep('hue-scenes');
 await setupAction('setup-next').click();assert.equal(await page.evaluate(()=>wakeDemo.calls.filter(m=>m.action==='create').length),0);await captureStep(5);
 await setupAction('setup-back').click();assert.equal(await page.evaluate(()=>wakeDemo.edited.lights.length),2);await setupAction('setup-next').click();
 await setupAction('setup-finish').click();
 await editor.getByText('Die gesamte Karte kann bearbeitet werden.',{exact:false}).waitFor();assert.equal(await editor.locator('select:visible').count(),0);assert(await setupAction('edit-card').isVisible());
 assert.equal(await page.evaluate(()=>wakeDemo.calls.filter(m=>m.action==='create').length),1);
 const initialBinding=await page.evaluate(()=>JSON.stringify(wakeDemo.records.get('new_alarm').binding));
 await setupAction('manage-days').click();await setupAction('day-edit',`[data-kind="${customId}"]`).click();
 await dayDialog.locator('#day-name').fill('Arbeit');await dayDialog.locator('#day-display-name').fill('Arbeit');await dayDialog.locator('#day-music').selectOption('switchable');await dayDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();await setupAction('manage-days-save').click();
 await setupAction('manage-days').waitFor();
 assert.equal(await page.evaluate(()=>JSON.stringify(wakeDemo.records.get('new_alarm').binding)),initialBinding);
 assert.equal(await page.evaluate(()=>wakeDemo.records.get('new_alarm').days.find(d=>d.name==='Arbeit').music_mode),'switchable');
 await page.evaluate(()=>{document.querySelector('#editor').hidden=true;document.querySelector('#card').hidden=false;wakeDemo.card.setConfig(wakeDemo.edited);});
 await action('time').first().waitFor();assert.equal(await action('time').count(),4);
 assert.equal(await card().locator(`[data-action="music"][data-kind="${schoolId}"]`).count(),0);
 assert(await card().locator(`[data-action="music"][data-kind="${customId}"]`).isVisible());
 assert.equal(await card().locator('[data-wake-calendar],.wake-calendar-rule').count(),0);
 assert.equal(await page.evaluate(id=>wakeDemo.records.get('new_alarm').days.find(d=>d.id===id).calendar_mode,customId),'no_event');
 await card().locator(`[data-action="enabled"][data-kind="${customId}"]`).click();
 await page.waitForFunction(id=>wakeDemo.records.get('new_alarm').settings.types[id].enabled,customId);
 await card().locator(`[data-action="enabled"][data-kind="${customId}"]`).click();
 await card().locator('#wake-confirm-dialog[open]').waitFor();assert.equal(await card().locator('#wake-confirm-dialog-title').innerText(),'Arbeit ausschalten?');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(id=>wakeDemo.records.get('new_alarm').settings.types[id].enabled,customId),true);
 await card().locator(`[data-action="enabled"][data-kind="${customId}"]`).click();await card().locator('#wake-confirm-dialog [data-action="confirm-disable"]').click();
 await page.waitForFunction(id=>!wakeDemo.records.get('new_alarm').settings.types[id].enabled,customId);await card().locator('#wake-confirm-dialog').waitFor({state:'hidden'});
 for(const width of [1100,390,320])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await card().screenshot({path:path.join(screens,`custom-days-${width}-${dark?'dark':'light'}.png`)});
 }
 await page.evaluate(id=>{wakeDemo.forecast[id]=true;wakeDemo.notify('new_alarm');},customId);
 await card().locator(`[data-action="enabled"][data-kind="${customId}"]`).click();await card().locator(`[data-wake-kind="${customId}"][data-next-active="true"]`).waitFor();
 await card().screenshot({path:path.join(screens,'next-24-hours-colours.png')});
 await action('settings').click();await settings.locator('[data-action="edit-card"]').click();
 const full=card().locator('#wake-edit-dialog wecker-manager-card-editor');await full.locator('[data-action="setup-next"]').waitFor();
 await full.locator('[data-action="navigate"][data-page="music"]').click();await full.locator('#wake-name').fill('Pauls Wecker');await full.locator('#wake-owner').selectOption('paul');
 await full.locator('[data-action="picker-open"][data-kind="speakers"]').click();const fullPicker=full.locator('#setup-picker');
 await fullPicker.locator('input[value="media_player.max"]').uncheck();await fullPicker.locator('input[value="media_player.dress"]').check();await fullPicker.getByRole('button',{name:'Übernehmen',exact:true}).click();
 await full.locator('[data-action="navigate"][data-page="days"]').click();await full.locator(`[data-action="day-edit"][data-kind="${schoolId}"]`).click();
 await full.locator('#setup-day').getByText('Änderungen gelten auch auf anderen Karten',{exact:false}).waitFor();
 assert.equal(await full.locator('#day-name').inputValue(),'Schultag');await full.locator('#day-name').fill('Unterricht');await full.locator('#setup-day').getByRole('button',{name:'Übernehmen',exact:true}).click();
 for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await full.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await card().locator('#wake-edit-dialog').screenshot({path:path.join(screens,`full-edit-shared-${width}-${dark?'dark':'light'}.png`)});}
 await full.locator('[data-action="navigate"][data-page="review"]').click();const beforeTimes=await page.evaluate(()=>JSON.stringify(wakeDemo.records.get('new_alarm').settings.types));
 await full.locator('[data-action="setup-finish"]').click();await card().locator('#wake-edit-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>wakeDemo.records.get('new_alarm').binding.owner_id==='paul');assert.deepEqual(await page.evaluate(()=>wakeDemo.records.get('new_alarm').binding.speakers),['media_player.dress']);
 assert.equal(await page.evaluate(()=>wakeDemo.records.get('new_alarm').name),'Pauls Wecker');assert.equal(await page.evaluate(()=>wakeDemo.records.get('new_alarm').binding.card_id),'new_card');
 assert.equal(await page.evaluate(()=>wakeDemo.records.get('new_alarm').binding.lights[0].hue_scene),'scene.relax');assert(!await page.evaluate(()=>wakeDemo.records.get('new_alarm').binding.lights[1].hue_scene));
 const oldTimes=JSON.parse(beforeTimes),newTimes=await page.evaluate(()=>wakeDemo.records.get('new_alarm').settings.types);for(const id of Object.keys(oldTimes))assert.equal(newTimes[id].time,oldTimes[id].time);
 assert(await page.evaluate(()=>wakeDemo.records.get('new_alarm').days.some(d=>d.template_id==='day_shared_school')));
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).days.find(d=>d.id==='schultag').name),'Unterricht');
 await action('settings').click();await settings.locator('[data-action="edit-card"]').click();await full.locator('[data-action="setup-next"]').waitFor();
 await full.locator('[data-action="navigate"][data-page="music"]').click();await full.locator('#wake-name').fill('Nicht speichern');await page.keyboard.press('Escape');await card().locator('#wake-edit-dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>wakeDemo.records.get('new_alarm').name),'Pauls Wecker');
 await action('settings').click();await settings.locator('[data-action="manage-templates"]').click();
 const manager=card().locator('wecker-manager-day-manager'),managerDialog=card().locator('#wake-templates-dialog');await manager.locator('[data-action="day-add"]').waitFor();
 assert(await manager.locator('[data-action="template-delete"][data-kind="day_shared_school"]').isDisabled());
 const timesBeforeManagement=await page.evaluate(()=>JSON.stringify(wakeDemo.records.get('new_alarm').settings));
 for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await managerDialog.evaluate(el=>el.scrollWidth<=el.clientWidth));await managerDialog.screenshot({path:path.join(screens,`day-manager-${width}-${dark?'dark':'light'}.png`)});}
 await manager.locator('[data-action="day-edit"][data-kind="day_shared_school"]').click();
 const commonDialog=manager.locator('#setup-day');assert.equal(await commonDialog.locator('#day-music,#day-confirm').count(),0);assert(await commonDialog.getByText('Verwendet in:',{exact:false}).isVisible());await commonDialog.locator('#day-name').fill('Unterrichtstag');await commonDialog.locator('#day-display-name').fill('Schultag');
 for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await commonDialog.evaluate(el=>el.scrollWidth<=el.clientWidth));await commonDialog.screenshot({path:path.join(screens,`day-manager-edit-${width}-${dark?'dark':'light'}.png`)});}
 await commonDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();await commonDialog.waitFor({state:'hidden'});await manager.getByText('Unterrichtstag',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).days.find(d=>d.id==='schultag').name),'Unterrichtstag');assert.equal(await page.evaluate(()=>JSON.stringify(wakeDemo.records.get('new_alarm').settings)),timesBeforeManagement);
 await manager.locator('[data-action="day-add"]').click();await commonDialog.locator('#day-name').fill('Spätdienst');await commonDialog.locator('#day-weekdays input[value="5"]').check();await commonDialog.getByRole('button',{name:'Übernehmen',exact:true}).click();await commonDialog.waitFor({state:'hidden'});await manager.getByText('Spätdienst',{exact:true}).waitFor();
 const unused=await page.evaluate(()=>wakeDemo.catalog.shared_days.find(day=>day.name==='Spätdienst').id);await manager.locator(`[data-action="template-delete"][data-kind="${unused}"]`).click();await manager.locator('[data-action="template-confirm-delete"]').click();await manager.locator('#template-delete-confirm').waitFor({state:'hidden'});await manager.getByText('Spätdienst',{exact:true}).waitFor({state:'detached'});
 await page.keyboard.press('Escape');await managerDialog.waitFor({state:'hidden'});await card().locator('wecker-manager-day-manager').waitFor({state:'detached'});
 await page.evaluate(()=>{const pair=document.createElement('div');pair.id='status-pair';pair.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:16px auto;max-width:540px';for(const [id,name] of [[wakeDemo.config.alarm_id,'Maximilian'],['new_alarm','Paul']]){const record=wakeDemo.records.get(id),status=document.createElement('wecker-manager-status-card');status.setConfig({type:'custom:wecker-manager-status-card',alarm_id:id,card_id:record.binding.card_id,name});status.hass=wakeDemo.makeHass();pair.append(status);}document.body.append(pair);});
 const statuses=page.locator('#status-pair wecker-manager-status-card');await statuses.first().locator('.status-line').first().waitFor();assert.equal(await statuses.locator('button,music-manager-alarm-row').count(),0);
 for(const width of [1100,390,320])for(const dark of [false,true]){await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await statuses.locator('.status-line').evaluateAll(rows=>rows.every(row=>{const time=row.querySelector('time'),box=row.getBoundingClientRect(),label=time.previousElementSibling.getBoundingClientRect(),clock=time.getBoundingClientRect();return clock.right<=box.right+1&&clock.left>=label.right&&clock.top>=box.top&&clock.bottom<=box.bottom;})));await page.locator('#status-pair').screenshot({path:path.join(screens,`status-pair-${width}-${dark?'dark':'light'}.png`)});}
 await page.evaluate(()=>wakeDemo.remoteChange(record=>{record.settings.types.schultag.enabled=false;record.settings.types.schultag.time='07:23';}));await statuses.first().locator('.status-line[aria-label="Schultag · Aus · 07:23 Uhr"]').waitFor();assert.equal(await statuses.first().locator('[data-status-kind="schultag"] time').innerText(),'07:23');
 await page.evaluate(()=>document.querySelector('#status-pair').remove());
 // Reproduce the supplied YAML: account selected, empty devices and a 1.1 catalog without automations.
 await page.goto(url+'?editor=1&setup_only=1&prefilled=1&missing_optional=1');
 await setupAction('day-add').waitFor();await addDay('Schicht','mdi:briefcase',[0,2,4]);
 await setupAction('setup-next').click();await editor.locator('#wake-owner').waitFor();
 assert.equal(await editor.locator('#wake-owner').inputValue(),'max');
 assert.equal(await editor.locator('nav [data-action="navigate"]').count(),5);
 assert.equal(await editor.locator('[role="alert"]').count(),0);
 assert.equal(await page.evaluate(()=>Object.hasOwn(wakeDemo.edited,'replace_automation')),false);
 await pick('speakers',['media_player.max']);
 for(const step of ['covers','lights','review']){
  await editor.locator(`[data-action="navigate"][data-page="${step}"]`).click();
  assert.equal(await editor.locator('[role="alert"]').count(),0);
 }
 assert(await setupAction('setup-finish').isEnabled());
 await editor.screenshot({path:path.join(screens,'setup-prefilled-no-optional-devices.png')});
 assert.equal(await page.evaluate(()=>window.customCards.find(c=>c.type==='wecker-manager-card').name),'Wecker');
 await page.goto(url);await action('time').first().waitFor();
 await page.evaluate(()=>wakeDemo.switchUser('paul'));await card().getByRole('alert').waitFor();assert.equal(await action('time').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS universal wake card: wheels, settings, fixed multi-device editor, account isolation, live sync, responsive theme/layout screenshots, guided day policies, calendar polarity, per-type confirmation and single-device dialogs');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
