import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
it('worker reports complete core AND runtime readiness; a missing runtime is not ready',async()=>{
 const code=readFileSync('web/sw.template.js','utf8').replace('__BUILD_ID__','test').replace('__PRECACHE__',JSON.stringify(['./index.html'])).replace('__RUNTIME_PRECACHE__',JSON.stringify(['./engine.wasm']));
 const events:Record<string,(e:unknown)=>void>={};const scope='http://localhost/fatcat-cad-viewer/';let missing=false;
 const caches={open:async(name:string)=>({keys:async()=>missing&&name.includes('runtime')?[]:[{url:new URL(name.includes('runtime')?'./engine.wasm':'./index.html',scope).href}]}),keys:async()=>[]};
 runInNewContext(code,{URL,Set,Promise,self:{registration:{scope},addEventListener:(n:string,f:(e:unknown)=>void)=>{events[n]=f;}},caches});
 expect(events.message).toBeTypeOf('function');
 for(const expected of [true,false]){let done=Promise.resolve();let result:{ready:boolean}|undefined;missing=!expected;events.message({data:{type:'fatcat-cache-status'},source:{postMessage:(v:{ready:boolean})=>{result=v;}},waitUntil:(p:Promise<void>)=>{done=p;}});await done;expect(result?.ready).toBe(expected);}
});
it('install fetches every precached file past the HTTP cache, so a new build never stores the old engine', async () => {
 const code=readFileSync('web/sw.template.js','utf8').replace('__BUILD_ID__','test').replace('__PRECACHE__',JSON.stringify(['./index.html'])).replace('__RUNTIME_PRECACHE__',JSON.stringify(['./runtime/libredwg/libredwg-web.wasm']));
 const events:Record<string,(e:unknown)=>void>={};const scope='http://localhost/fatcat-cad-viewer/';const added:{url:string;cache:string}[]=[];
 class Req{url:string;cache:string;constructor(u:string,o:{cache:string}){this.url=new URL(u,scope).href;this.cache=o.cache;}}
 const caches={open:async()=>({addAll:async(list:Req[])=>{for(const r of list)added.push({url:r.url,cache:r.cache});}}),keys:async()=>[]};
 runInNewContext(code,{URL,Set,Promise,Request:Req,self:{registration:{scope},skipWaiting:async()=>{},addEventListener:(n:string,f:(e:unknown)=>void)=>{events[n]=f;}},caches});
 let done=Promise.resolve();events.install({waitUntil:(p:Promise<void>)=>{done=p;}});await done;
 expect(added.map(a=>a.cache)).toEqual(['reload','reload']);
 expect(added.some(a=>a.url.endsWith('/runtime/libredwg/libredwg-web.wasm'))).toBe(true);
});
