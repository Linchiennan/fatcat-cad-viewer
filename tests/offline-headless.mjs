import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const evidence=resolve(process.env.OFFLINE_EVIDENCE_DIR||'evidence/offline-14days');await mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.otf':'font/otf','.ttf':'font/ttf','.md':'text/plain'};
async function serve(dir){let revision='';const root=resolve(dir);const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;assert.ok(path.startsWith('/fatcat-cad-viewer/'));const rel=decodeURIComponent(path.slice('/fatcat-cad-viewer/'.length))||'index.html';assert.ok(!rel.includes('..'));let data=await readFile(resolve(root,rel));if(rel==='sw.js'&&revision)data=Buffer.from(data.toString().replace(/const BUILD = "([^"]+)";/,(_,id)=>`const BUILD = "${id}${revision}";`));res.writeHead(200,{'Content-Type':mime[extname(rel)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return{server,setRevision:value=>{revision=value;},url:`http://127.0.0.1:${server.address().port}/fatcat-cad-viewer/`};}
const mock=await serve('dist-mock'),prod=await serve('dist-web');
const report={authBackend:'test-only mock; real production AccessController, AuthGate, CAD and SW template',errors:[],checks:[],requests:[],fixtureSHA256:createHash('sha256').update(await readFile('fixtures/engineering-fixture.dxf')).digest('hex')};
const profile=resolve(evidence,`browser-profile-${Date.now()}`);
const options={headless:true,executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',viewport:{width:1280,height:900},locale:'zh-TW',serviceWorkers:'allow',args:['--enable-unsafe-swiftshader','--no-first-run']};
let context;
async function launch(){const c=await chromium.launchPersistentContext(profile,options);await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();report.requests.push({blocked:url.origin+url.pathname});return route.abort();});await c.addInitScript(()=>{const now=Date.now;Date.now=()=>window.__offlineTestNow??now();window.__offlineEvents=[];for(const kind of ['online','offline','pageshow'])window.addEventListener(kind,()=>window.__offlineEvents.push({kind,online:navigator.onLine,wall:now()}));});return c;}
async function pageIn(c){const restored=c.pages();const p=await c.newPage();report.restoredTabsClosed??=[];for(const old of restored){report.restoredTabsClosed.push(old.url());await old.close();}p.on('pageerror',e=>report.errors.push(e.message));return p;}
async function ready(p){await p.waitForFunction(()=>window.__fatcatDebug?.ready(),{},{timeout:60000});}
async function openLibraryDrawing(p,importFile=false){if(await p.locator('.home-library').count())await p.locator('.home-library').click();if(importFile)await p.locator('input[type=file]').first().setInputFiles('fixtures/engineering-fixture.dxf');await p.getByText('engineering-fixture.dxf',{exact:true}).first().click();await ready(p);}
async function snapshot(p){return p.evaluate(()=>{const canvas=document.querySelector('.drawing-engine canvas');const r=canvas?.getBoundingClientRect();return{online:navigator.onLine,testNow:window.__offlineTestNow,backendChecks:window.__accessTest?.checks(),events:window.__offlineEvents,camera:window.__fatcatDebug?.camera(),scene:window.__fatcatDebug?.sceneStats(),report:window.__fatcatDebug?.report(),canvas:r?{x:r.x,y:r.y,width:r.width,height:r.height,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,appCount:document.querySelectorAll('.app').length,locked:document.querySelector('.web-cad')?.classList.contains('is-locked'),sameCanvas:canvas===window.__originalCanvas,lease:JSON.parse(localStorage.getItem('fatcat.offline-access.v1')||'null'),status:document.querySelector('.web-account')?.innerText};});}
async function library(p){return p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('fatcat-drawing-library');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const q=db.transaction('entries').objectStore('entries').getAll();const rows=await new Promise((r,j)=>{q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});db.close();return rows.map(x=>({name:x.name,kind:x.kind}));});}
try{
 context=await launch();let p=await pageIn(context);
 await p.goto(prod.url);await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();assert.equal(await p.locator('.app').count(),0);assert.equal(await p.locator('.usage-frame').count(),0);
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await p.reload();await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();assert.equal(await p.locator('.app').count(),0);
 report.checks.push({productionSignedOutOfflineReload:true,anonymousCADMounted:false});await context.setOffline(false);await p.close();
 p=await pageIn(context);await p.goto(mock.url+'?debug=1');await p.getByRole('button',{name:'使用 Google 登入',exact:true}).click();await p.locator('.home-library').waitFor();
 await p.waitForFunction(()=>document.querySelector('.access-summary')?.textContent.includes('網站資源已備妥'),{},{timeout:120000});
 const caches=await p.evaluate(async()=>{const result=[];for(const name of await window.caches.keys()){const cache=await window.caches.open(name);result.push({name,entries:(await cache.keys()).length});}return result;});
 await openLibraryDrawing(p,true);await p.evaluate(()=>{window.__originalCanvas=document.querySelector('.drawing-engine canvas');});const before=await snapshot(p);assert.ok(before.scene.meshes>0&&before.report.entityCount>0);assert.equal(before.appCount,1);assert.ok(before.lease.expiresAt-before.lease.issuedAt===14*86400000);
 await context.setOffline(true);await p.waitForFunction(()=>navigator.onLine===false);await p.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));});
 const offline=await snapshot(p);assert.match(offline.status,/目前離線/);assert.equal(offline.locked,false);assert.equal(offline.sameCanvas,true);assert.deepEqual(offline.canvas,before.canvas);assert.deepEqual(offline.camera,before.camera);assert.equal(offline.lease.expiresAt,before.lease.expiresAt);
 const box=await p.locator('.drawing-engine canvas').boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.wheel(0,-250);await p.waitForTimeout(200);const zoom=await snapshot(p);assert.notEqual(zoom.camera.width,offline.camera.width);
 await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+70,box.y+box.height/2+40,{steps:8});await p.mouse.up();await p.waitForTimeout(200);const pan=await snapshot(p);assert.notDeepEqual(pan.camera.center,zoom.camera.center);
 report.checks.push({cacheEntries:caches,before,offline,zoom,pan});
 // Fit then measure the fixture's known 100-mm line endpoints in world coordinates.
 const fit=p.getByRole('button',{name:/符合螢幕|縮放至全圖|全圖|Fit drawing/}).first();
 if(await fit.count())await fit.click();
 // Keep the calibrated line clear of the desktop measurement side panel.
 await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2-200,box.y+box.height/2-400,{steps:12});await p.mouse.up();
 report.measureButtons=await p.locator('.app button').evaluateAll(bs=>bs.map(b=>({label:b.getAttribute('aria-label'),text:b.textContent})));
 await p.getByRole('button',{name:'量測',exact:true}).click();
 const points=await p.evaluate(()=>{const r=document.querySelector('.drawing-engine canvas').getBoundingClientRect();const c=window.__fatcatDebug.camera();const scale=r.width/c.width;return[0,100].map(x=>({x:r.x+r.width/2+(x-c.center.x)*scale,y:r.y+r.height/2-(20-c.center.y)*scale}));});
 for(const point of points)await p.mouse.click(point.x,point.y);
 await p.waitForTimeout(200);report.measurement={points,text:await p.locator('.measure-strip, .measure-result').first().innerText()};assert.match(report.measurement.text,/100(?:\.0+)?\s*mm|10(?:\.0+)?\s*cm|0\.1(?:0+)?\s*m/);
 await p.screenshot({path:resolve(evidence,'offline-measurement.png')});
 const expiry=before.lease.expiresAt;
 // Install/activate a real new SW revision while the old CAD page remains open.
 await p.evaluate(()=>window.__accessTest.setFailure('unavailable'));await context.setOffline(false);mock.setRevision('-update');
 await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await p.getByRole('button',{name:'新版',exact:true}).waitFor();
 const updated=await snapshot(p);assert.equal(updated.sameCanvas,true);assert.equal(updated.locked,false);assert.equal(updated.lease.expiresAt,expiry);
 const versions=await p.evaluate(()=>caches.keys());assert.ok(versions.filter(k=>k.includes('-core-')).length>=2);report.checks.push({realServiceWorkerUpgrade:updated,retainedCaches:versions});
 await context.setOffline(true);
 await p.reload();await p.locator('.home-library').waitFor();await openLibraryDrawing(p);const reload=await snapshot(p);assert.equal(reload.lease.expiresAt,expiry);assert.ok(reload.scene.meshes>0);report.checks.push({offlineReload:reload});
 await context.close();context=null;
 // Real headless browser process shutdown and restart using its isolated on-disk profile.
 context=await launch();await context.setOffline(true);p=await pageIn(context);await p.goto(mock.url+'?debug=1');await p.locator('.home-library').waitFor();await openLibraryDrawing(p);const reopened=await snapshot(p);assert.equal(reopened.lease.expiresAt,expiry);assert.ok(reopened.scene.meshes>0);report.checks.push({browserClosedAndReopenedOffline:reopened});
 // Missing cache resource must change readiness, without deleting the library.
 const readiness=await p.evaluate(async()=>{let removed;for(const name of await caches.keys()){if(name.includes('runtime')&&name.endsWith('-update')){const c=await caches.open(name);const key=(await c.keys()).find(r=>r.url.endsWith('libredwg-web.wasm'));if(key){const response=await c.match(key);const bytes=await response.arrayBuffer();window.__restoreOfflineCache={name,url:key.url,bytes,headers:[...response.headers]};removed=await c.delete(key);break;}}}navigator.serviceWorker.controller.postMessage({type:'fatcat-cache-status'});return removed;});assert.equal(readiness,true);await p.waitForFunction(()=>document.querySelector('.access-summary')?.textContent.includes('離線資源尚未備妥'));
 await p.evaluate(async()=>{const x=window.__restoreOfflineCache;await(await caches.open(x.name)).put(x.url,new Response(x.bytes,{status:200,headers:x.headers}));navigator.serviceWorker.controller.postMessage({type:'fatcat-cache-status'});});await p.waitForFunction(()=>document.querySelector('.access-summary')?.textContent.includes('網站資源已備妥'));report.checks.push({missingRuntimeReportedNotReady:true});
 const preExpiry=await snapshot(p);await p.evaluate(t=>{window.__offlineTestNow=t;window.dispatchEvent(new Event('pageshow'));},expiry);await p.getByRole('button',{name:'重新連線驗證',exact:true}).waitFor();assert.match(await p.locator('.auth-card').innerText(),/14 天離線授權已到期/);assert.equal(await p.locator('.app').count(),1);const expired=await snapshot(p);assert.equal(expired.locked,true);assert.deepEqual(expired.canvas,preExpiry.canvas);assert.deepEqual(expired.camera,preExpiry.camera);assert.equal(expired.lease,null);report.checks.push({exactExpiry:expired,library:await library(p)});
 await p.screenshot({path:resolve(evidence,'offline-expired.png')});
 await context.setOffline(false);await p.locator('.web-account').waitFor();await ready(p);await p.evaluate(()=>window.__accessTest.setRecord({exists:false,server:true}));await p.getByRole('button',{name:'使用 Google 登入',exact:true}).waitFor();assert.equal(await p.locator('.app').count(),0);assert.equal(await p.evaluate(()=>localStorage.getItem('fatcat.offline-access.v1')),null);const retained=await library(p);assert.ok(retained.some(r=>r.name==='engineering-fixture.dxf'));report.checks.push({serverRevoked:true,libraryRetained:retained});
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.pass=false;report.failure=String(error.stack);report.failurePages=[];for(const p of context?.pages()||[]){report.failurePages.push({url:p.url(),body:await p.locator('body').innerText().catch(()=>''),state:await snapshot(p).catch(()=>null)});}throw error;}
finally{await writeFile(resolve(evidence,'headless-results.json'),JSON.stringify(report,null,2));if(context)await context.close();await rm(profile,{recursive:true,force:true});mock.server.close();prod.server.close();}
console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,measurement:report.measurement,errors:report.errors}));
