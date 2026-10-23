import type { AccessBackend, Identity, AccessRecord } from '../src/auth/accessController';
// Accessible only through the separate test-build configuration. No production bypass.
let user: Identity | null = JSON.parse(localStorage.getItem('test-only-identity') || 'null');
const remember = () => localStorage.setItem('test-only-identity', JSON.stringify(user));
let changed: (u: Identity | null) => void = () => {};
let watcher: (d: AccessRecord) => void = () => {};
let record: AccessRecord = { exists: true, enabled: true, server: true };
let failure = '';
let checks = 0;
Object.assign(window, { __accessTest: {
 setRecord: (next: AccessRecord) => { record = next; watcher(record); },
 setFailure: (code: string) => { failure = code; },
 login: (uid: string) => { user = { uid, email: `${uid}@example.test` }; remember(); changed(user); },
 checks: () => checks,
} });
export function createFirebaseBackend(): AccessBackend {
 return {
  observe: fn => { changed=fn; queueMicrotask(()=>fn(user)); return ()=>{changed=()=>{};}; },
  async verify() { checks++; if(failure || !navigator.onLine) throw {code:failure || 'unavailable'}; await new Promise(r=>setTimeout(r,100)); return record; },
  watch: (_user, next) => { watcher=next; return ()=>{watcher=()=>{};}; },
  async signIn() { user={uid:'alice',email:'Alice@example.test'}; remember(); changed(user); },
  async signOut() { user=null; remember(); changed(null); },
 };
}
