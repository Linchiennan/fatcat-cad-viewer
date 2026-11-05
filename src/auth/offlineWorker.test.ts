import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
const scope='http://localhost/fatcat-cad-viewer/';
const worker=(runtime:string[],hashes:Record<string,string>={})=>readFileSync('web/sw.template.js','utf8').replace('__BUILD_ID__','test').replace('__PRECACHE__',JSON.stringify(['./index.html'])).replace('__RUNTIME_PRECACHE__',JSON.stringify(runtime)).replace('__RUNTIME_HASHES__',JSON.stringify(hashes));
class Req{url:string;cache:string;constructor(u:string,o:{cache:string}){this.url=new URL(u,scope).href;this.cache=o.cache;}}
/** In-memory Cache Storage keyed by URL string. */
function cacheStorage(initial:Record<string,Record<string,string>>={}){
 const stores=new Map(Object.entries(initial).map(([k,v])=>[k,new Map(Object.entries(v))]));
 const open=async(name:string)=>{if(!stores.has(name))stores.set(name,new Map());const s=stores.get(name)!;const key=(r:string|Req)=>typeof r==='string'?r:r.url;
  return {match:async(r:string|Req)=>s.has(key(r))?{body:s.get(key(r)),clone(){return this;},arrayBuffer:async()=>new TextEncoder().encode(s.get(key(r))).buffer}:undefined,
   put:async(r:string|Req,res:{body:string})=>{s.set(key(r),res.body);},addAll:async(list:Req[])=>{for(const r of list)s.set(r.url,'core');},
   keys:async()=>[...s.keys()].map(url=>({url})),delete:async(r:{url:string})=>s.delete(r.url)};};
 return {stores,caches:{open,keys:async()=>[...stores.keys()],delete:async(k:string)=>stores.delete(k)}};
}
const sha=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,16);
const run=(code:string,caches:unknown,fetched:Req[]=[])=>{const events:Record<string,(e:unknown)=>void>={};
 runInNewContext(code,{URL,Set,Map,Promise,Error,Request:Req,crypto:globalThis.crypto,Uint8Array,fetch:async(r:Req)=>{fetched.push(r);return {ok:true,body:'new'};},
  self:{registration:{scope},skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]},addEventListener:(n:string,f:(e:unknown)=>void)=>{events[n]=f;}},caches});
 const fire=async(name:string,extra={})=>{let done=Promise.resolve();events[name]({waitUntil:(p:Promise<void>)=>{done=p;},...extra});await done;};
 return {events,fire};};
const RT='fatcat-access-v1-/fatcat-cad-viewer/-runtime-files';

it('worker reports complete core AND runtime readiness; a missing runtime is not ready',async()=>{
 for(const expected of [true,false]){
  const {caches}=cacheStorage({['fatcat-access-v1-/fatcat-cad-viewer/-core-test']:{[scope+'index.html']:'x'},[RT]:expected?{[scope+'engine.wasm?fatcat-v=h1']:'x'}:{}});
  const {fire}=run(worker(['./engine.wasm'],{'./engine.wasm':'h1'}),caches);let result:{ready:boolean}|undefined;
  await fire('message',{data:{type:'fatcat-cache-status'},source:{postMessage:(v:{ready:boolean})=>{result=v;}}});
  expect(result?.ready).toBe(expected);
 }
});

it('install fetches new or changed files past the HTTP cache and keeps unchanged fonts and engines (用戶 2026-11-05：發布後手機開圖超慢)', async () => {
 const {caches,stores}=cacheStorage({[RT]:{[scope+'fonts/a.otf?fatcat-v=same']:'font',[scope+'runtime/e.wasm?fatcat-v=old']:'old engine'}});
 const fetched:Req[]=[];const {fire}=run(worker(['./fonts/a.otf','./runtime/e.wasm'],{'./fonts/a.otf':'same','./runtime/e.wasm':'new'}),caches,fetched);
 await fire('install');
 expect(fetched.map(r=>[r.url,r.cache])).toEqual([[scope+'runtime/e.wasm','reload']]); // the unchanged font is not downloaded again
 expect(stores.get('fatcat-access-v1-/fatcat-cad-viewer/-core-test')?.has(scope+'index.html')).toBe(true);
 await fire('activate');
 expect([...stores.get(RT)!.keys()].sort()).toEqual([scope+'fonts/a.otf?fatcat-v=same',scope+'runtime/e.wasm?fatcat-v=new']);
});

it('moving from per-version caches reuses copies whose bytes match and removes the old caches', async () => {
 const old='fatcat-access-v1-/fatcat-cad-viewer/-runtime-abc';
 const {caches,stores}=cacheStorage({[old]:{[scope+'fonts/a.otf']:'font bytes',[scope+'runtime/e.wasm']:'stale'}});
 const fetched:Req[]=[];const {fire}=run(worker(['./fonts/a.otf','./runtime/e.wasm'],{'./fonts/a.otf':sha('font bytes'),'./runtime/e.wasm':sha('fresh')}),caches,fetched);
 await fire('install');
 expect(fetched.map(r=>r.url)).toEqual([scope+'runtime/e.wasm']);
 await fire('activate');
 expect(stores.has(old)).toBe(false);
 expect(stores.get(RT)!.get(scope+`fonts/a.otf?fatcat-v=${sha('font bytes')}`)).toBe('font bytes');
});
