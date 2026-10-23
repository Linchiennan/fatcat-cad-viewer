// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { I18nProvider } from '../i18n/translations';
import { AccessController, type AccessBackend } from './accessController';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let cleanup=()=>{};afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps the same CAD node on worker update and declares resource readiness separately',async()=>{
 const sw=new EventTarget();Object.assign(sw,{controller:{postMessage:vi.fn()},ready:new Promise(()=>{})});Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
 const b:AccessBackend={observe:fn=>{queueMicrotask(()=>fn({uid:'a',email:'a@test'}));return()=>{};},verify:async()=>({exists:true,enabled:true,server:true}),watch:()=>()=>{},signIn:async()=>{},signOut:async()=>{}};
 const data=new Map<string,string>();const c=new AccessController(b,{storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}}});const el=document.createElement('div');document.body.append(el);const root=createRoot(el);cleanup=()=>{act(()=>root.unmount());el.remove();c.stop();};
 await act(async()=>{root.render(<I18nProvider><AuthGate controller={c}><div data-testid="cad">drawing</div></AuthGate></I18nProvider>);});
 const cad=el.querySelector('[data-testid=cad]');expect(cad).not.toBeNull();
 await act(async()=>{sw.dispatchEvent(new MessageEvent('message',{data:{type:'fatcat-worker-ready',build:'NEW'}}));});
 expect(el.querySelector('.web-cad')?.classList.contains('is-locked')).toBe(false);
 expect(el.querySelector('[data-testid=cad]')).toBe(cad);
 expect(el.textContent).toMatch(/離線授權有效至|Offline access until/);
 expect(el.textContent).toMatch(/資源|resources/);
});
