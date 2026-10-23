export type Identity = { uid: string; email: string | null };
export type AccessRecord = { exists: boolean; enabled?: unknown; server: boolean };
export type AccessStatus = 'checking' | 'signed-out' | 'allowed' | 'locked' | 'denied';
export type AccessState = { status: AccessStatus; mountedUid: string | null; reason: string };
export interface AccessBackend {
  observe(next: (user: Identity | null) => void): () => void;
  verify(user: Identity): Promise<AccessRecord>;
  watch(user: Identity, next: (record: AccessRecord) => void, error: (error: unknown) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
export class AccessFailure extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : 'unavailable';
}
/** No access decisions are persisted. Generation invalidates requests, watches and account changes. */
export class AccessController {
  state: AccessState = { status: 'checking', mountedUid: null, reason: '' };
  private user: Identity | null = null;
  private generation = 0;
  private active = false;
  private authOff?: () => void;
  private watchOff?: () => void;
  private listeners = new Set<() => void>();
  constructor(private backend: AccessBackend) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private emit(status: AccessStatus, reason = '', mountedUid = this.state.mountedUid) {
    this.state = { status, reason, mountedUid }; for (const fn of this.listeners) fn();
  }
  private cancel() { this.generation++; this.watchOff?.(); this.watchOff = undefined; }
  start() {
    this.active = true;
    this.authOff = this.backend.observe(user => {
      this.cancel(); this.user = user;
      if (!user) { this.emit(this.state.status === 'denied' ? 'denied' : 'signed-out', this.state.reason, null); return; }
      this.emit('checking', '', null); void this.recheck();
    });
  }
  stop() { this.active = false; this.cancel(); this.authOff?.(); }
  /** Lock, but never clear IndexedDB or the already-mounted account's drawing state. */
  lock(reason = 'offline') { this.cancel(); if (this.user) this.emit('locked', reason); }
  private deny(reason: string) {
    this.cancel(); this.user = null; this.emit('denied', reason, null);
    void this.backend.signOut().catch(() => { /* UI remains denied even if logout fails. */ });
  }
  private accept(record: AccessRecord) {
    if (!record.server) { this.emit('locked', 'offline'); return; }
    if (!record.exists || record.enabled !== true) { this.deny('not-allowed'); return; }
    if (this.user) this.emit('allowed', '', this.user.uid);
  }
  async recheck() {
    const user = this.user; if (!this.active || !user) return;
    this.cancel(); const ticket = this.generation;
    this.emit('checking');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const record = await Promise.race([
        this.backend.verify(user),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AccessFailure('timeout')), 12000); }),
      ]);
      if (!this.active || ticket !== this.generation) return;
      this.accept(record);
      if (this.state.status !== 'allowed') return;
      this.watchOff = this.backend.watch(user, data => {
        if (this.active && ticket === this.generation) this.accept(data);
      }, error => {
        if (this.active && ticket === this.generation) this.fail(error);
      });
    } catch (error) {
      if (this.active && ticket === this.generation) this.fail(error);
    } finally { if (timer) clearTimeout(timer); }
  }
  private fail(error: unknown) {
    const code = errorCode(error);
    if (['invalid-identity', 'permission-denied', 'unauthenticated', 'auth/user-disabled', 'auth/user-token-expired'].includes(code)) this.deny(code);
    else this.emit('locked', code);
  }
  async login() {
    try { await this.backend.signIn(); }
    catch (error) { if (this.active && !this.user) this.emit('signed-out', errorCode(error), null); }
  }
  async logout() {
    this.cancel(); this.user = null; this.emit('signed-out', '', null);
    try { await this.backend.signOut(); }
    catch { this.emit('signed-out', 'logout-failed', null); }
  }
}
