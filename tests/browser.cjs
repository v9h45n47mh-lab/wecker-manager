const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright')));}
const root=path.resolve(__dirname,'..'),screens=path.join(root,'test-results');fs.mkdirSync(screens,{recursive:true});
const server=http.createServer((req,res)=>{const target=path.resolve(root,'.'+req.url.split('?')[0]);if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const url=`http://127.0.0.1:${server.address().port}/tests/fixture.html`,card=()=>page.locator('wecker-manager-card'),action=name=>card().locator(`[data-action="${name}"]`);
 await page.goto(url);await action('time').first().waitFor();
 assert.equal(await action('time').count(),3);
 await action('time').first().click();
 const time=card().locator('#wake-time-dialog'),wheel=time.locator('wecker-manager-time-wheel');
 assert(await time.isVisible());
 const hours=wheel.locator('[data-wheel="0"]'),minutes=wheel.locator('[data-wheel="1"]');
 await hours.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
 await minutes.focus();await page.keyboard.press('End');
 assert.equal(await wheel.evaluate(w=>w.value),'02:59');
 await time.getByRole('button',{name:'Übernehmen',exact:true}).click();
 await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.time==='02:59');
 assert.equal(await action('time').first().innerText(),'02:59');
 await action('time').first().click();await minutes.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});await page.keyboard.press('Escape');assert.equal(await action('time').first().innerText(),'02:59');
 await action('preset').filter({hasText:'06:15'}).click();await page.waitForFunction(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.types.schultag.time==='06:15');
 await action('enabled').first().click();const confirm=card().locator('#wake-confirm-dialog');assert(await confirm.isVisible());await page.keyboard.press('Escape');assert(await action('enabled').first().innerText()==='Ausschalten');
 await action('settings').click();const settings=card().locator('#wake-settings-dialog');
 const slider=settings.locator('#wake-volume');assert.equal(await slider.getAttribute('min'),'5');assert.equal(await slider.getAttribute('max'),'15');
 assert.equal(await settings.locator('select').count(),0);assert.equal(await settings.locator('[data-ui-multi]').count(),0);
 await slider.press('End');
 await settings.locator('[data-action="preset-remove"][data-kind="schultag"]').first().click();
 await settings.getByRole('button',{name:'Speichern',exact:true}).click();await settings.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>wakeDemo.records.get(wakeDemo.config.alarm_id).settings.volume),15);
 assert.equal(await action('preset').filter({hasText:'05:55'}).count(),0);
 await page.evaluate(()=>wakeDemo.remoteChange(record=>record.settings.types.ferien.time='11:42'));
 await page.waitForFunction(()=>wakeDemo.card.shadowRoot.querySelector('[data-action="time"][data-kind="ferien"]').textContent==='11:42');
 await page.evaluate(()=>wakeDemo.fail=true);await action('preset').filter({hasText:'06:15'}).click();await card().getByRole('alert').filter({hasText:'Speichern fehlgeschlagen'}).waitFor();await page.evaluate(()=>wakeDemo.fail=false);
 for(const width of [1100,390,320])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.body.classList.toggle('dark',d),dark);
  await page.screenshot({path:path.join(screens,`wake-${width}-${dark?'dark':'light'}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await action('settings').click();assert(await settings.isVisible());assert(await settings.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:path.join(screens,`wake-settings-${width}-${dark?'dark':'light'}.png`),fullPage:true});await page.keyboard.press('Escape');
  await action('time').first().click();assert(await time.isVisible());assert(await time.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:path.join(screens,`wake-time-${width}-${dark?'dark':'light'}.png`),fullPage:true});await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:390,height:1000});await page.goto(url+'?editor=1&setup_only=1');const editor=page.locator('wecker-manager-card-editor');await editor.locator('#wake-owner').waitFor();
 const setupAction=(name,extra='')=>editor.locator(`[data-action="${name}"]${extra}`);
 const pick=async(kind,ids)=>{
  await setupAction('picker-open',`[data-kind="${kind}"]`).click();const picker=editor.locator('#setup-picker');await picker.waitFor();
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
 assert.equal(await editor.locator('#wake-alarm-id,#wake-replace').count(),0);assert(await setupAction('setup-next').isDisabled());
 await editor.locator('#wake-owner').selectOption('max');await setupAction('picker-open','[data-kind="speakers"]').waitFor();
 await pick('speakers',['media_player.max','media_player.dress']);await captureStep(1);
 await setupAction('setup-next').click();await pick('covers',['cover.max','cover.dress']);
 await setupAction('device-open','[data-kind="covers"][data-index="0"]').click();let device=editor.locator('#setup-device');
 await device.locator('#setup-position').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await device.getByRole('button',{name:'Abbrechen',exact:true}).click();assert.equal(await page.evaluate(()=>wakeDemo.edited.covers[0].position),100);
 await setupAction('device-open','[data-kind="covers"][data-index="0"]').click();
 await device.locator('#setup-position').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await device.getByRole('button',{name:'Übernehmen',exact:true}).click();assert.equal(await page.evaluate(()=>wakeDemo.edited.covers[0].position),65);await captureStep(2);
 await setupAction('setup-next').click();await pick('lights',['light.max','light.dress']);
 await setupAction('device-open','[data-kind="lights"][data-index="0"]').click();await device.locator('#setup-colourmode').selectOption('temperature');
 assert(await device.locator('#setup-kelvin').count());await device.getByRole('button',{name:'Übernehmen',exact:true}).click();await captureStep(3);
 await setupAction('setup-next').click();await editor.locator('#wake-calendar').selectOption('calendar.school');await captureStep(4);
 await setupAction('setup-back').click();assert.equal(await page.evaluate(()=>wakeDemo.edited.lights.length),2);await setupAction('setup-next').click();
 await setupAction('setup-next').click();assert.equal(await page.evaluate(()=>wakeDemo.calls.filter(m=>m.action==='create').length),0);await captureStep(5);
 assert.equal(await editor.locator('#wake-replace').count(),0);await setupAction('setup-finish').click();
 await editor.getByText('Musikkonto, Boxen, Rollläden und Lichter sind festgelegt.',{exact:false}).waitFor();assert.equal(await editor.locator('select').count(),0);
 assert.equal(await page.evaluate(()=>wakeDemo.calls.filter(m=>m.action==='create').length),1);
 assert.equal(await page.evaluate(()=>Object.hasOwn(wakeDemo.calls.find(m=>m.action==='create').config,'replace_automation')),false);
 await page.goto(url);await action('time').first().waitFor();
 await page.evaluate(()=>wakeDemo.switchUser('paul'));await card().getByRole('alert').waitFor();assert.equal(await action('time').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS universal wake card: wheels, settings, fixed multi-device editor, account isolation, live sync, 48 theme/layout screenshots, guided setup and single-device dialogs');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
