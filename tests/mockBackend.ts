import type { AccessBackend, Identity, AccessRecord } from '../src/auth/accessController';
// Accessible only through the separate test-build configuration. No production bypass.
let user: Identity | null = null;
let changed: (u: Identity | null) => void = () => {};
let watcher: (d: AccessRecord) => void = () => {};
let record: AccessRecord = { exists: true, enabled: true, server: true };
let failure = '';
let checks = 0;
Object.assign(window, { __accessTest: {
 setRecord: (next: AccessRecord) => { record = next; watcher(record); },
 setFailure: (code: string) => { failure = code; },
 login: (uid: string) => { user = { uid, email: `${uid}@example.test` }; changed(user); },
 checks: () => checks,
} });
export function createFirebaseBackend(): AccessBackend {
 return {
  observe: fn => { changed=fn; queueMicrotask(()=>fn(user)); return ()=>{changed=()=>{};}; },
  async verify() { checks++; if(failure) throw {code:failure}; await new Promise(r=>setTimeout(r,100)); return record; },
  watch: (_user, next) => { watcher=next; return ()=>{watcher=()=>{};}; },
  async signIn() { user={uid:'alice',email:'Alice@example.test'}; changed(user); },
  async signOut() { user=null; changed(null); },
 };
}
