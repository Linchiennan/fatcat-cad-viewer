import type { Identity } from './accessController';
export const OFFLINE_MS = 14 * 24 * 60 * 60 * 1000;
export const LEASE_KEY = 'fatcat.offline-access.v1';
export const CLOCK_KEY = 'fatcat.offline-clock.v1';
export type LeaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type Lease = { version: 1; uid: string; email: string; issuedAt: number; expiresAt: number; lastSeen: number };
export function browserLeaseStorage(): LeaseStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
/** Best-effort local gate, NOT a signature or tamper-resistant security boundary. */
export class OfflineLease {
  reason = 'online-required';
  constructor(private storage: LeaseStorage | undefined, private now: () => number) {}
  clear() {
    // Tombstone first: failed removal must not leave a valid old lease.
    try { this.storage?.setItem(CLOCK_KEY, 'null'); } catch { /* unavailable storage */ }
    try { this.storage?.removeItem(LEASE_KEY); } catch { /* never touch the drawing library */ }
  }
  read(user: Identity, touch = true): Lease | null {
    try {
      const raw = this.storage?.getItem(LEASE_KEY); if (!raw) return null;
      const v = JSON.parse(raw) as Lease;
      const guard = JSON.parse(this.storage?.getItem(CLOCK_KEY) ?? 'null') as Lease | null;
      const now = this.now();
      if (!v || v.version !== 1 || !user.email || v.uid !== user.uid || v.email !== user.email ||
          ![v.issuedAt,v.expiresAt,v.lastSeen,now].every(Number.isSafeInteger) || v.issuedAt < 0 ||
          v.expiresAt - v.issuedAt !== OFFLINE_MS || v.lastSeen < v.issuedAt || v.lastSeen >= v.expiresAt ||
          !guard || guard.version !== 1 || guard.expiresAt !== v.expiresAt || guard.uid !== v.uid || guard.email !== v.email || guard.issuedAt !== v.issuedAt || guard.lastSeen !== v.lastSeen) {
        this.reason = 'invalid-offline-grant'; this.clear(); return null;
      }
      if (now < v.lastSeen) { this.reason = 'clock-rollback'; this.clear(); return null; }
      if (now >= v.expiresAt) { this.reason = 'offline-expired'; this.clear(); return null; }
      const touched = { ...v, lastSeen: now };
      if (touch && !this.save(touched)) return null;
      return touched;
    } catch { this.reason = 'storage-unavailable'; this.clear(); return null; }
  }
  issue(user: Identity): Lease | null {
    const now = this.now();
    if (!user.email || !Number.isSafeInteger(now) || now < 0) return null;
    const lease: Lease = { version: 1, uid: user.uid, email: user.email, issuedAt: now, expiresAt: now + OFFLINE_MS, lastSeen: now };
    return this.save(lease) ? lease : null;
  }
  private save(lease: Lease): boolean {
    try {
      if (!this.storage) throw new Error('storage unavailable');
      const value = JSON.stringify(lease);
      this.storage.setItem(CLOCK_KEY, value); this.storage.setItem(LEASE_KEY, value);
      if (this.storage.getItem(CLOCK_KEY) !== value || this.storage.getItem(LEASE_KEY) !== value) throw new Error('storage readback failed');
      return true;
    } catch { this.reason = 'storage-unavailable'; this.clear(); return false; }
  }
}
