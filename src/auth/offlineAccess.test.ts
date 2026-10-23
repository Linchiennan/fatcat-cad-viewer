import { afterEach, expect, it, vi } from 'vitest';
import { AccessController, type AccessBackend, type Identity, type AccessRecord } from './accessController';
const alice = { uid: 'alice', email: 'Alice@example.test' };
import { LEASE_KEY, CLOCK_KEY, OFFLINE_MS } from './offlineLease';
const DAY = 86400000;
const store = () => { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k)??null, setItem:(k:string,v:string)=>{m.set(k,v);}, removeItem:(k:string)=>{m.delete(k);}, m }; };
const controllers: AccessController[]=[];
afterEach(()=>{controllers.forEach(c=>c.stop());controllers.length=0;vi.useRealTimers();});
const flush = async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(storage=store(), now=()=>Date.now()) {
 let changed:(u:Identity|null)=>void=()=>{}; let watcher:(r:AccessRecord)=>void=()=>{};
 const backend:AccessBackend={observe:fn=>{changed=fn;return()=>{};},verify:vi.fn(async()=>({exists:true,enabled:true,server:true})),watch:(_u,fn)=>{watcher=fn;return()=>{};},signIn:vi.fn(async()=>{}),signOut:vi.fn(async()=>{})};
 const c=new AccessController(backend,{storage,now,monotonic:now});controllers.push(c);c.start();
 return {c,backend,storage,login:(u:Identity|null=alice)=>changed(u),watch:(r:AccessRecord)=>watcher(r)};
}
it('persists exactly fourteen days and permits an offline cold start without extending the deadline',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
 const h=setup();h.login();await flush();const expiry=h.c.state.expiresAt;
 expect(expiry).toBe(Date.now()+14*DAY);h.c.stop();
 vi.setSystemTime(Date.now()+DAY);const cold=setup(h.storage);vi.mocked(cold.backend.verify).mockRejectedValue({code:'unavailable'});cold.login();await flush();
 expect(cold.c.state.status).toBe('allowed');expect(cold.c.state.expiresAt).toBe(expiry);
});
it('expires exactly at fourteen days, retains mounted drawing, and clears timers on stop',async()=>{
 vi.useFakeTimers(); const h=setup();h.login();await flush();
 await vi.advanceTimersByTimeAsync(OFFLINE_MS-1);expect(h.c.state.status).toBe('allowed');
 await vi.advanceTimersByTimeAsync(1);expect(h.c.state.status).toBe('locked');expect(h.c.state.reason).toBe('offline-expired');expect(h.c.state.mountedUid).toBe('alice');
 h.c.stop();expect(vi.getTimerCount()).toBe(0);
});
it('foreground enforces expiry even when a background request is hanging',async()=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(()=>{}));
 void h.c.recheck();vi.setSystemTime(Date.now()+OFFLINE_MS);void h.c.recheck();expect(h.c.state.status).toBe('locked');expect(h.c.state.reason).toBe('offline-expired');
});
it('does not flash checking on offline or background checks, timeout, cached watch, or update',async()=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();const expiry=h.c.state.expiresAt;const states:string[]=[];h.c.subscribe(()=>states.push(h.c.state.status));
 h.c.lock('offline');h.c.lock('background');h.c.lock('update-required');h.watch({exists:false,server:false});
 vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(()=>{}));void h.c.recheck();await vi.advanceTimersByTimeAsync(12000);
 expect(new Set(states)).toEqual(new Set(['allowed']));expect(h.c.state.expiresAt).toBe(expiry);
});
it('cached verify cannot issue, revoke or extend a lease; server watch cannot renew',async()=>{
 vi.useFakeTimers();const h=setup();vi.mocked(h.backend.verify).mockResolvedValue({exists:true,enabled:true,server:false});h.login();await flush();expect(h.storage.getItem(LEASE_KEY)).toBeNull();expect(h.c.state.status).toBe('locked');
 vi.mocked(h.backend.verify).mockResolvedValue({exists:true,enabled:true,server:true});await h.c.recheck();const expiry=h.c.state.expiresAt;vi.setSystemTime(Date.now()+DAY);h.watch({exists:true,enabled:true,server:true});expect(h.c.state.expiresAt).toBe(expiry);
 vi.mocked(h.backend.verify).mockResolvedValue({exists:false,server:false});await h.c.recheck();expect(h.c.state.status).toBe('allowed');expect(h.c.state.expiresAt).toBe(expiry);
});
it.each(['not-allowed','permission-denied','invalid-identity','unauthenticated','auth/user-disabled','auth/user-token-expired'])('server revocation %s removes local grant even if signout fails',async code=>{
 const h=setup();h.login();await flush();vi.mocked(h.backend.signOut).mockRejectedValue(new Error('offline'));
 if(code==='not-allowed')h.watch({exists:false,server:true});else {vi.mocked(h.backend.verify).mockRejectedValue({code});await h.c.recheck();}
 expect(h.c.state.status).toBe('denied');expect(h.storage.getItem(LEASE_KEY)).toBeNull();expect(h.c.state.mountedUid).toBeNull();
});
it('logout and switch do not resurrect old grants on offline relogin',async()=>{
 const h=setup();h.login();await flush();await h.c.logout();expect(h.storage.getItem(LEASE_KEY)).toBeNull();vi.mocked(h.backend.verify).mockRejectedValue({code:'unavailable'});h.login();await flush();expect(h.c.state.status).toBe('locked');
});
it.each([{uid:'bob',email:alice.email},{uid:alice.uid,email:'alice@example.test'},{uid:alice.uid,email:null}])('does not reuse another uid/email on cold start: %j',async identity=>{
 const h=setup();h.login();await flush();h.c.stop();const cold=setup(h.storage);vi.mocked(cold.backend.verify).mockRejectedValue({code:'unavailable'});cold.login(identity);await flush();expect(cold.c.state.status).toBe('locked');expect(cold.storage.getItem(LEASE_KEY)).toBeNull();
});
it('account switch deletes the old lease even when the new account is offline',async()=>{
 const h=setup();h.login();await flush();vi.mocked(h.backend.verify).mockRejectedValue({code:'unavailable'});h.login({uid:'bob',email:'bob@example.test'});await flush();expect(h.c.state.mountedUid).toBeNull();expect(h.storage.getItem(LEASE_KEY)).toBeNull();h.login();await flush();expect(h.c.state.status).toBe('locked');
});
it.each(['{','null','{}',JSON.stringify({version:1,uid:'alice',email:'Alice@example.test',issuedAt:1,expiresAt:9999999999999,lastSeen:1})])('rejects corrupt lease %s',async raw=>{
 const s=store();s.setItem(LEASE_KEY,raw);s.setItem(CLOCK_KEY,raw);const h=setup(s);vi.mocked(h.backend.verify).mockRejectedValue({code:'unavailable'});h.login();await flush();expect(h.c.state.status).toBe('locked');
});
it('rejects backwards clock on cold start and a replayed old lease against a newer checkpoint',async()=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();const raw=h.storage.getItem(LEASE_KEY)!;const start=Date.now();vi.setSystemTime(start+DAY);h.c.checkLocal();h.c.stop();h.storage.setItem(LEASE_KEY,raw);
 const replay=setup(h.storage);vi.mocked(replay.backend.verify).mockRejectedValue({code:'unavailable'});replay.login();await flush();expect(replay.c.state.status).toBe('locked');
 const h2=setup();h2.login();await flush();h2.c.stop();vi.setSystemTime(start);const back=setup(h2.storage);vi.mocked(back.backend.verify).mockRejectedValue({code:'unavailable'});back.login();await flush();expect(back.c.state.status).toBe('locked');expect(back.c.state.reason).toBe('clock-rollback');
});
it.each(['read','write','remove'])('storage %s failure never manufactures a durable offline grant',async mode=>{
 const s=store();if(mode==='read')s.getItem=()=>{throw Error('blocked');};if(mode==='write')s.setItem=()=>{throw Error('full');};if(mode==='remove')s.removeItem=()=>{throw Error('blocked');};
 const h=setup(s);h.login();await flush();expect(h.c.state.status).toBe('allowed');
 if(mode==='remove'){await h.c.logout();h.login();vi.mocked(h.backend.verify).mockRejectedValue({code:'unavailable'});await flush();await h.c.logout();}
 else {expect(h.c.state.expiresAt).toBeNull();h.c.lock();expect(h.c.state.status).toBe('locked');}
});
it('deduplicates concurrent checks and never accepts timed-out late resolution',async()=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();let resolve!:(r:AccessRecord)=>void;vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(r=>{resolve=r;}));void h.c.recheck();void h.c.recheck();expect(h.backend.verify).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(12000);const expiry=h.c.state.expiresAt;resolve({exists:true,enabled:true,server:true});await flush();expect(h.c.state.expiresAt).toBe(expiry);h.c.stop();expect(vi.getTimerCount()).toBe(0);
});
it.each([0,1])('offline cold startup is locked at expiry plus %d ms',async offset=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();const expiry=h.c.state.expiresAt!;h.c.stop();vi.setSystemTime(expiry+offset);const cold=setup(h.storage);vi.mocked(cold.backend.verify).mockRejectedValue({code:'unavailable'});cold.login();await flush();expect(cold.c.state.status).toBe('locked');expect(cold.c.state.mountedUid).toBeNull();expect(cold.c.state.reason).toBe('offline-expired');
});
it('running monotonic elapsed time prevents wall-clock rollback from extending the grant',async()=>{
 vi.useFakeTimers();let wall=Date.now(),mono=0;const s=store();let notify!:(u:Identity|null)=>void;const b:AccessBackend={observe:fn=>{notify=fn;return()=>{};},verify:async()=>({exists:true,enabled:true,server:true}),watch:()=>()=>{},signIn:async()=>{},signOut:async()=>{}};
 const c=new AccessController(b,{storage:s,now:()=>wall,monotonic:()=>mono});controllers.push(c);c.start();notify(alice);await flush();mono=OFFLINE_MS;wall-=DAY;c.checkLocal();expect(c.state.status).toBe('locked');expect(c.state.reason).toBe('offline-expired');
});
it('an old same-account request cannot revoke or renew a fresh relogin',async()=>{
 const h=setup();let resolve!:(r:AccessRecord)=>void;vi.mocked(h.backend.verify).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));h.login();await h.c.logout();h.login();await flush();const expiry=h.c.state.expiresAt;resolve({exists:false,server:true});await flush();expect(h.c.state.status).toBe('allowed');expect(h.c.state.expiresAt).toBe(expiry);
});
it('stop settles a hanging recheck and clears every timer',async()=>{
 vi.useFakeTimers();const h=setup();h.login();await flush();vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(()=>{}));let settled=false;void h.c.recheck().then(()=>{settled=true;});h.c.stop();await flush();expect(settled).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('relogin waits for old backend signout to finish',async()=>{
 const h=setup();h.login();await flush();let finish!:()=>void;vi.mocked(h.backend.signOut).mockImplementation(()=>new Promise(r=>{finish=r;}));void h.c.logout();const login=h.c.login();await flush();expect(h.backend.signIn).not.toHaveBeenCalled();finish();await login;expect(h.backend.signIn).toHaveBeenCalledOnce();
});
it('live server revocation remains observed while a recheck is hanging',async()=>{
 const h=setup();h.login();await flush();vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(()=>{}));void h.c.recheck();h.watch({exists:false,server:true});expect(h.c.state.status).toBe('denied');expect(h.storage.getItem(LEASE_KEY)).toBeNull();
});
