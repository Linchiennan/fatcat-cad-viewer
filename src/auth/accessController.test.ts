import { describe, it, expect, vi } from 'vitest';
import { AccessController, type AccessBackend, type Identity, type AccessRecord } from './accessController';
const alice: Identity = { uid: 'alice', email: 'Alice@example.test' };
const bob: Identity = { uid: 'bob', email: 'bob@example.test' };
function harness() {
  let changed: (u: Identity | null) => void = () => {};
  let watch: (d: AccessRecord) => void = () => {};
  const backend: AccessBackend = {
    observe: fn => { changed = fn; return () => {}; },
    verify: vi.fn(async () => ({ exists: true, enabled: true, server: true })),
    watch: (_u, fn) => { watch = fn; return () => {}; },
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
  };
  const data = new Map<string, string>();
  const c = new AccessController(backend, {storage: {getItem:k=>data.get(k)??null, setItem:(k,v)=>{data.set(k,v);}, removeItem:k=>{data.delete(k);}}}); c.start();
  return { c, backend, login: (u: Identity | null) => changed(u), watch: (d: AccessRecord) => watch(d) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
describe('verified server access with 14-day offline grants', () => {
  it('never grants anonymous access', () => { const h = harness(); h.login(null); expect(h.c.state.status).toBe('signed-out'); expect(h.c.state.mountedUid).toBeNull(); h.c.stop(); });
  it('grants only a confirmed server enabled true document', async () => { const h = harness(); h.login(alice); expect(h.c.state.status).toBe('checking'); await flush(); expect(h.c.state.status).toBe('allowed'); expect(h.c.state.mountedUid).toBe('alice'); h.c.stop(); });
  it.each([{ exists: false, enabled: true, server: true }, { exists: true, enabled: false, server: true }, { exists: true, enabled: 'true', server: true }, { exists: true, server: true }, { exists: true, enabled: true, server: false }])('fails closed: %j', async record => { const h = harness(); vi.mocked(h.backend.verify).mockResolvedValue(record); h.login(alice); await flush(); expect(h.c.state.status).not.toBe('allowed'); expect(h.c.state.mountedUid).toBeNull(); h.c.stop(); });
  it('retains an already open drawing usable on network failure without clearing library', async () => { const h = harness(); h.login(alice); await flush(); h.c.lock(); expect(h.c.state.status).toBe('allowed'); expect(h.c.state.mountedUid).toBe('alice'); vi.mocked(h.backend.verify).mockRejectedValue(new Error('offline')); await h.c.recheck(); expect(h.c.state.status).toBe('allowed'); expect(h.c.state.mountedUid).toBe('alice'); h.c.stop(); });
  it('revokes on removed/disabled server watch and signs out', async () => { const h = harness(); h.login(alice); await flush(); h.watch({ exists: true, enabled: false, server: true }); expect(h.c.state.status).toBe('denied'); expect(h.c.state.mountedUid).toBeNull(); expect(h.backend.signOut).toHaveBeenCalledOnce(); h.c.stop(); });
  it('cache metadata cannot revoke a valid local grant', async () => { const h = harness(); h.login(alice); await flush(); h.watch({ exists: true, enabled: true, server: false }); expect(h.c.state.status).toBe('allowed'); h.c.stop(); });
  it('ignores an old account request after switching', async () => { const h = harness(); let resolve!: (d: AccessRecord) => void; vi.mocked(h.backend.verify).mockImplementationOnce(() => new Promise(r => { resolve = r; })); h.login(alice); h.login(bob); await flush(); expect(h.c.state.mountedUid).toBe('bob'); resolve({ exists: true, enabled: true, server: true }); await flush(); expect(h.c.state.mountedUid).toBe('bob'); h.c.stop(); });
  it('logout cancels pending work synchronously', async () => { const h = harness(); let resolve!: (d: AccessRecord) => void; vi.mocked(h.backend.verify).mockImplementationOnce(() => new Promise(r => { resolve = r; })); h.login(alice); await h.c.logout(); resolve({ exists: true, enabled: true, server: true }); await flush(); expect(h.c.state.mountedUid).toBeNull(); expect(h.c.state.status).not.toBe('allowed'); h.c.stop(); });
  it('visibility recheck keeps valid access while awaiting fresh response', async () => { const h = harness(); h.login(alice); await flush(); let resolve!: (d: AccessRecord) => void; vi.mocked(h.backend.verify).mockImplementationOnce(() => new Promise(r => { resolve = r; })); const p = h.c.recheck(); expect(h.c.state.status).toBe('allowed'); resolve({ exists: true, enabled: true, server: true }); await p; expect(h.c.state.status).toBe('allowed'); h.c.stop(); });
  it.each(['permission-denied','invalid-identity','unauthenticated'])('rejects fatal server/identity error %s',async code=>{const h=harness();vi.mocked(h.backend.verify).mockRejectedValue({code});h.login(alice);await flush();expect(h.c.state.status).toBe('denied');expect(h.c.state.mountedUid).toBeNull();expect(h.backend.signOut).toHaveBeenCalled();h.c.stop();});
  it('times out rather than trusting a hanging server request',async()=>{vi.useFakeTimers();const h=harness();vi.mocked(h.backend.verify).mockImplementation(()=>new Promise(()=>{}));h.login(alice);await vi.advanceTimersByTimeAsync(12000);expect(h.c.state.status).toBe('locked');expect(h.c.state.mountedUid).toBeNull();h.c.stop();vi.useRealTimers();});
  it('ignores a previous account watch after switching',async()=>{const h=harness();let old:((r:AccessRecord)=>void)|undefined;vi.spyOn(h.backend,'watch').mockImplementationOnce((_u,fn)=>{old=fn;return()=>{};});h.login(alice);await flush();h.login(bob);await flush();old?.({exists:false,server:true});expect(h.c.state.status).toBe('allowed');expect(h.c.state.mountedUid).toBe('bob');expect(h.backend.signOut).not.toHaveBeenCalled();h.c.stop();});
  it('a stopped controller ignores resolved requests', async () => { const h = harness(); h.login(alice); h.c.stop(); await flush(); expect(h.c.state.status).not.toBe('allowed'); });
});
