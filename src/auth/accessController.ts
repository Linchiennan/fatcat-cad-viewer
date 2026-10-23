import { OfflineLease, browserLeaseStorage, type LeaseStorage } from './offlineLease';
export type Identity = { uid: string; email: string | null };
export type AccessRecord = { exists: boolean; enabled?: unknown; server: boolean };
export type AccessStatus = 'checking' | 'signed-out' | 'allowed' | 'locked' | 'denied';
export type AccessState = { status: AccessStatus; mountedUid: string | null; reason: string; expiresAt: number | null };
export interface AccessBackend {
  observe(next: (user: Identity | null) => void): () => void;
  /** Verify fresh Google claims AND read the allowlist from the server. */
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
/** Leases bind exact uid/email. Generation invalidates old requests and watches. */
export class AccessController {
  state: AccessState = { status: 'checking', mountedUid: null, reason: '', expiresAt: null };
  private user: Identity | null = null;
  private generation = 0;
  private active = false;
  private authOff?: () => void;
  private watchOff?: () => void;
  private requestTimer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private cancelRequest?: () => void;
  private signingOut?: Promise<void>;
  private listeners = new Set<() => void>();
  private lease: OfflineLease;
  private now: () => number;
  constructor(private backend: AccessBackend, options: { storage?: LeaseStorage; now?: () => number; monotonic?: () => number } = {}) {
    const wall = options.now ?? Date.now;
    const monotonic = options.monotonic ?? (() => performance.now());
    const startWall = wall(), startMono = monotonic();
    // A running page cannot extend its deadline by moving the wall clock back.
    this.now = () => Math.max(wall(), Math.floor(startWall + monotonic() - startMono));
    this.lease = new OfflineLease(options.storage ?? browserLeaseStorage(), this.now);
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private emit(status: AccessStatus, reason = '', mountedUid = this.state.mountedUid, expiresAt = this.state.expiresAt) {
    this.state = { status, reason, mountedUid, expiresAt }; for (const fn of this.listeners) fn();
  }
  private cancel() {
    this.generation++; this.cancelRequest?.(); this.cancelRequest = undefined; this.watchOff?.(); this.watchOff = undefined;
    clearTimeout(this.requestTimer); clearTimeout(this.expiryTimer);
    this.requestTimer = this.expiryTimer = undefined; this.pending = undefined;
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.authOff = this.backend.observe(user => {
      if (!this.active) return;
      const same = this.user && user && this.user.uid === user.uid && this.user.email === user.email;
      if (same) { void this.recheck(); return; }
      if (this.user || !user) this.lease.clear();
      this.cancel(); this.user = user;
      if (!user) { this.emit(this.state.status === 'denied' ? 'denied' : 'signed-out', this.state.reason, null, null); return; }
      this.emit('checking', '', null, null); this.checkLocal(); void this.recheck();
    });
  }
  stop() { this.active = false; this.cancel(); this.authOff?.(); this.authOff = undefined; }
  /** Offline/background/update events only enforce the existing deadline. */
  lock(reason = 'offline') { if (this.user) this.checkLocal(reason); }
  checkLocal(reason = 'offline', touch = true) {
    if (!this.active || !this.user) return false;
    const grant = this.lease.read(this.user, touch);
    clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    if (!grant) {
      this.emit('locked', this.lease.reason === 'online-required' ? reason : this.lease.reason, this.state.mountedUid, null);
      return false;
    }
    this.emit('allowed', reason, this.user.uid, grant.expiresAt);
    this.expiryTimer = setTimeout(() => this.checkLocal(), Math.max(1, grant.expiresAt - this.now()));
    return true;
  }
  private deny(reason: string) {
    this.lease.clear(); this.cancel(); this.user = null; this.emit('denied', reason, null, null);
    this.signingOut = this.backend.signOut().catch(() => { /* UI remains denied even if logout fails. */ });
  }
  async recheck() {
    const user = this.user; if (!this.active || !user) return;
    const local = this.checkLocal('');
    if (this.pending) return this.pending;
    if (!local && this.lease.reason === 'online-required') this.emit('checking');
    const ticket = this.generation;
    const work = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const record = await Promise.race([
          this.backend.verify(user),
          new Promise<never>((_, reject) => { this.cancelRequest = () => reject(new AccessFailure('cancelled')); }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AccessFailure('timeout')), 12000); this.requestTimer = timer; }),
        ]);
        if (!this.active || ticket !== this.generation) return;
        if (!record.server) { this.checkLocal('offline'); return; }
        if (!record.exists || record.enabled !== true) { this.deny('not-allowed'); return; }
        const grant = this.lease.issue(user);
        if (grant) this.checkLocal('');
        else this.emit('allowed', 'storage-unavailable', user.uid, null);
        if (this.watchOff) return;
        this.watchOff = this.backend.watch(user, data => {
          if (!this.active || ticket !== this.generation) return;
          // Snapshots revoke, but NEVER issue/renew a Google-verified lease.
          if (data.server && (!data.exists || data.enabled !== true)) this.deny('not-allowed');
        }, error => {
          if (this.active && ticket === this.generation) this.fail(error);
        });
      } catch (error) {
        if (this.active && ticket === this.generation) this.fail(error);
      } finally {
        clearTimeout(timer);
        if (ticket === this.generation) { this.requestTimer = undefined; this.pending = undefined; this.cancelRequest = undefined; }
      }
    };
    this.pending = work(); return this.pending;
  }
  private fail(error: unknown) {
    const code = errorCode(error);
    if (['invalid-identity', 'permission-denied', 'unauthenticated', 'auth/user-disabled', 'auth/user-token-expired'].includes(code)) this.deny(code);
    else this.checkLocal(code);
  }
  async login() {
    try { await this.signingOut; if (this.active) await this.backend.signIn(); }
    catch (error) { if (this.active && !this.user) this.emit('signed-out', errorCode(error), null, null); }
  }
  async logout() {
    this.lease.clear(); this.cancel(); this.user = null; this.emit('signed-out', '', null, null);
    try { const operation = this.backend.signOut(); this.signingOut = operation.catch(() => {}); await operation; }
    catch { if (!this.user) this.emit('signed-out', 'logout-failed', null, null); }
  }
}

