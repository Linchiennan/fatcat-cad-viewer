import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const evidence=resolve('../evidence'); await mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.otf':'font/otf','.ttf':'font/ttf','.md':'text/plain'};
async function serve(dir) {
 const root=resolve(dir);
 const server=createServer(async(req,res)=>{try{
  let url=new URL(req.url,'http://localhost').pathname;
  if(!url.startsWith('/fatcat-cad-viewer/')) {res.writeHead(404).end();return;}
  let rel=decodeURIComponent(url.slice('/fatcat-cad-viewer/'.length))||'index.html';
  if(rel.includes('..')) {res.writeHead(403).end();return;}
  const data=await readFile(resolve(root,rel));res.writeHead(200,{'Content-Type':mime[extname(rel)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); return {server,url:`http://127.0.0.1:${server.address().port}/fatcat-cad-viewer/`};
}
const prod=await serve('dist-web'); const mock=await serve('dist-mock');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--no-first-run']});
const report={production:[],mock:[],errors:[],externalIntercepted:[],exports:[],layout:[]};
async function context(options={}) {
 const c=await browser.newContext({...options});
 await c.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='127.0.0.1') return route.continue();
  report.externalIntercepted.push(u.origin+u.pathname);
  if(u.hostname==='www.googletagmanager.com') return route.fulfill({contentType:'text/javascript',body:'window.__gtagLoadedForTest=true;'});
  if(u.hostname==='firebase.googleapis.com') return route.fulfill({contentType:'application/json',body:JSON.stringify({appId:'1:506205110955:web:73066d8916c19f2b942dee',measurementId:'G-5B7L0WWV5W'})});
  return route.abort();
 });
 return c;
}
try {
 const c=await context({viewport:{width:390,height:844},serviceWorkers:'allow'}); const p=await c.newPage();
 p.on('pageerror',e=>report.errors.push({stage:'production',error:e.message}));
 await p.goto(prod.url); await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();
 assert.equal(await p.locator('.app').count(),0); assert.equal(await p.locator('.usage-frame').count(),0);
 report.production.push('real Firebase bundle: signed-out CAD not mounted; analytics frame absent (all external network blocked)');
 const sw=await p.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return {scope:r.scope,script:r.active.scriptURL};});
 assert.equal(sw.scope,prod.url); report.production.push(sw);
 const manifest=await (await c.request.get(prod.url+'manifest.webmanifest')).json();
 for(const asset of ['runtime/libredwg/libredwg-web.wasm','runtime/libarchive/libarchive.wasm','runtime/pdfjs/pdf.worker.min.mjs','fonts/NotoSansCJKtc-Regular.otf','fonts/LiberationSans-Regular.ttf',...manifest.icons.map(x=>x.src)]) assert.equal((await c.request.get(new URL(asset,prod.url).href)).status(),200,asset);
 report.production.push('subpath manifest/icons/fonts/wasm/pdf worker HTTP 200');
 await p.reload(); await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();
 await c.setOffline(true); await p.reload(); await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();
 assert.equal(await p.locator('.app').count(),0); report.production.push('cached shell offline reload never mounts CAD'); await c.close();
 for(const width of [360,390,1280]) {
  const c=await context({viewport:{width,height:900},hasTouch:width<500,serviceWorkers:'block'});const p=await c.newPage();
  p.on('pageerror',e=>report.errors.push({stage:'mock',error:e.message}));
  await p.goto(mock.url+'?debug=1&private=NEVER_SEND_THIS_FILENAME');await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();
  const auth=await p.locator('.auth-card').boundingBox(); assert.ok(auth.x>=0&&auth.x+auth.width<=width); assert.equal(await p.locator('.app').count(),0);
  await p.getByRole('button',{name:'使用 Google 登入',exact:true}).click();await p.locator('.home-library').waitFor();
  const account=await p.locator('.web-account').boundingBox(), app=await p.locator('.app').boundingBox();assert.ok(app.y>=account.y+account.height);assert.ok(app.x+app.width<=width);
  report.layout.push({width,auth,account,app,overlap:false});
  await p.locator('.usage-frame').waitFor({state:'attached'});
  await p.locator('.home-library').click();
  await p.locator('input[type=file]').first().setInputFiles('fixtures/engineering-fixture.dxf');
  await p.getByText('engineering-fixture.dxf',{exact:true}).first().waitFor();
  console.log('LIBRARY',await p.locator('body').innerText());
  await p.getByText('engineering-fixture.dxf',{exact:true}).first().click();
  await p.waitForFunction(()=>window.__fatcatDebug?.ready(),{},{timeout:60000});
  const drawing=await p.evaluate(()=>({report:window.__fatcatDebug.report(),scene:window.__fatcatDebug.sceneStats()}));assert.ok(drawing.report.entityCount>0&&drawing.scene.meshes>0);report.mock.push({drawing});
  const controls=await p.locator('.app button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {label:n.getAttribute('aria-label')||n.textContent,x:r.x,y:r.y,width:r.width,height:r.height};}));
  for(const b of controls) assert.ok(b.x>=-1 && b.x+b.width<=width+1 && b.y>=48 && b.y+b.height<=901,JSON.stringify(b));
  const overlap=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1)overlap.push([a.label,b.label]);}assert.deepEqual(overlap,[]);report.layout.at(-1).drawingControls=controls;
  await p.screenshot({path:resolve(evidence,`synthetic-drawing-${width}.png`)});
  if(width!==390){await c.close();continue;}
  await p.screenshot({path:resolve(evidence,'synthetic-drawing.png')});
  console.log('VIEWER',await p.locator('body').innerText());
  for(const format of ['PNG','PDF']) {
   await p.getByRole('button',{name:'輸出',exact:true}).click();await p.getByRole('radio',{name:format,exact:true}).click();
   await p.locator('.export-go').click();await p.waitForFunction(()=>document.querySelector('.export-note-box')?.textContent?.includes('已儲存'),{},{timeout:60000});
   report.mock.push(`real ${format} export saved in IndexedDB`);await p.getByRole('button',{name:'關閉提示',exact:true}).click();
  }
  const exports=await p.evaluate(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('fatcat-exports',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const tx=db.transaction(['exports','files']);const rq=q=>new Promise((r,j)=>{q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const meta=await rq(tx.objectStore('exports').getAll());const data=await rq(tx.objectStore('files').getAll());const out=[];for(const row of meta){const blob=data.find(x=>x.id===row.id).blob;out.push({...row,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});}db.close();return out;});
  for(const row of exports){const bytes=Buffer.from(row.bytes);assert.ok(bytes.length>100);if(row.format==='png')assert.equal(bytes.subarray(1,4).toString(),'PNG');else assert.equal(bytes.subarray(0,4).toString(),'%PDF');await writeFile(resolve(evidence,`synthetic-export.${row.format}`),bytes);report.exports.push({...row,bytes:bytes.length});}
  assert.equal(exports.length,2);
  // Read Analytics's own SDK queue in its isolated blank document; no live Google collection.
  const frame=p.frames().find(f=>f.url().includes('usage.html'));await p.waitForTimeout(1000);
  const analytics=await frame.evaluate(()=>JSON.stringify(window.dataLayer||[]));assert.ok(!analytics.includes('NEVER_SEND_THIS_FILENAME')&&!analytics.includes('Alice@example.test')&&!analytics.includes('engineering-fixture'));report.mock.push({analyticsQueue:analytics,collection:'intercepted, not live'});
  const cameraBefore = await p.evaluate(()=>window.__fatcatDebug.camera());
  await p.evaluate(()=>{window.__accessTest.setFailure('unavailable');window.dispatchEvent(new Event('offline'));});await p.getByRole('button',{name:'重新連線驗證'}).waitFor();
  console.log('LOCKED_APPS',await p.locator('.app').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,cls:n.className,parent:n.parentElement.outerHTML.slice(0,500)}))));
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.app').count(),1);assert.equal(await p.locator('.app').isVisible(),false);assert.equal(await p.locator('.usage-frame').count(),0);
  await p.evaluate(()=>{window.__accessTest.setFailure('');window.dispatchEvent(new Event('online'));});await p.locator('.web-account').waitFor();assert.equal(await p.evaluate(()=>window.__fatcatDebug.ready()),true);
  await p.waitForFunction(()=>document.querySelector('.drawing-engine canvas')?.width > 0);
  const cameraAfter = await p.evaluate(()=>window.__fatcatDebug.camera()); assert.deepEqual(cameraAfter,cameraBefore);
  report.mock.push('offline locks existing drawing and removes analytics; reconnect rechecks and preserves drawing and camera');
  await p.evaluate(()=>window.__accessTest.setRecord({exists:true,enabled:false,server:true}));await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();assert.equal(await p.locator('.app').count(),0);assert.equal(await p.locator('.usage-frame').count(),0);
  const libraryAfter = await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('fatcat-drawing-library');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const q=db.transaction('entries').objectStore('entries').getAll();const rows=await new Promise((r,j)=>{q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});db.close();return rows.map(x=>({name:x.name,kind:x.kind}));});assert.ok(libraryAfter.some(x=>x.name==='engineering-fixture.dxf'));report.mock.push({libraryPreservedAfterRevocation:libraryAfter});
  report.mock.push('server disabled watch unmounts CAD and signs out');
  await c.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
} catch(error){report.pass=false;report.failure=String(error.stack);throw error;}
finally {await writeFile(resolve(evidence,'headless-results.json'),JSON.stringify(report,null,2));await browser.close();prod.server.close();mock.server.close();}
