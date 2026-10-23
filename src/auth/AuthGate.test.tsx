// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import { AccessController, type AccessBackend, type Identity } from './accessController';
import { I18nProvider } from '../i18n/translations';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
describe('AuthGate DOM authorization boundary',()=>{
 it('shows popup-blocked guidance in English and Traditional Chinese',async()=>{
  const backend:AccessBackend={observe:fn=>{queueMicrotask(()=>fn(null));return()=>{};},verify:async()=>({exists:false,server:true}),watch:()=>()=>{},signIn:async()=>{throw {code:'auth/popup-blocked'};},signOut:async()=>{}};
  const controller=new AccessController(backend);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(<I18nProvider><AuthGate controller={controller}><div>NEVER_MOUNT</div></AuthGate></I18nProvider>));
  await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='繁中')!.click());
  await act(async()=>controller.login());expect(host.textContent).toContain('請允許彈出視窗');
  await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='EN')!.click());expect(host.textContent).toContain('Allow pop-ups');expect(host.textContent).not.toContain('NEVER_MOUNT');
  await act(async()=>root.unmount());host.remove();
 });
 it('never duplicates CAD when an analytics sibling unmounts; blocks offline and revocation',async()=>{
  let auth: (u:Identity|null)=>void=()=>{};
  let watch: (r:{exists:boolean;enabled:boolean;server:boolean})=>void=()=>{};
  const backend:AccessBackend={observe:fn=>{auth=fn;return()=>{};},verify:async()=>({exists:true,enabled:true,server:true}),watch:(_u,fn)=>{watch=fn;return()=>{};},signIn:async()=>{},signOut:vi.fn(async()=>{})};
  const controller=new AccessController(backend);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(<I18nProvider><AuthGate controller={controller}><div className="test-cad">CAD</div></AuthGate></I18nProvider>));
  expect(host.querySelector('.test-cad')).toBeNull();expect(host.querySelector('iframe')).toBeNull();
  await act(async()=>auth({uid:'same-key',email:'test@example.test'}));expect(host.querySelectorAll('.test-cad')).toHaveLength(1);expect(host.querySelectorAll('iframe')).toHaveLength(1);
  const original=host.querySelector('.test-cad');
  await act(async()=>controller.lock());expect(host.querySelectorAll('.test-cad')).toHaveLength(1);expect(host.querySelector('.test-cad')).toBe(original);expect(host.querySelector('.web-cad')?.getAttribute('aria-hidden')).toBe('true');expect(host.querySelector('.web-cad')?.classList.contains('is-locked')).toBe(true);expect(host.querySelector('iframe')).toBeNull();
  await act(async()=>controller.recheck());expect(host.querySelector('.test-cad')).toBe(original);
  await act(async()=>watch({exists:true,enabled:false,server:true}));expect(host.querySelector('.test-cad')).toBeNull();expect(host.querySelector('iframe')).toBeNull();expect(backend.signOut).toHaveBeenCalled();
  await act(async()=>root.unmount());host.remove();
 });
});
