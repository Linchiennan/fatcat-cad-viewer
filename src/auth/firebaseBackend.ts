import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, getIdTokenResult } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, doc, getDocFromServer, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import config from '../firebase-web-config.json';
import { AccessFailure, type AccessBackend, type Identity, type AccessRecord } from './accessController';

export function validIdentity(user: Identity, claims: { email?: unknown; email_verified?: unknown; firebase?: { sign_in_provider?: unknown } }): boolean {
  return !!user.email && !user.email.includes('/') && claims.email === user.email && claims.email_verified === true && claims.firebase?.sign_in_provider === 'google.com';
}
function record(snapshot: DocumentSnapshot): AccessRecord {
  return { exists: snapshot.exists(), enabled: snapshot.data()?.enabled, server: !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites };
}
export function createFirebaseBackend(): AccessBackend {
  const app = initializeApp(config, 'fatcat-web-access');
  const auth = getAuth(app);
  // Never persist Firestore authorization documents to IndexedDB.
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  const ref = (user: Identity) => doc(db, 'allowedUsers', user.email!); // exact token email; no lowercasing
  return {
    observe: next => onAuthStateChanged(auth, next),
    async verify(identity) {
      const user = auth.currentUser;
      if (!user || user.uid !== identity.uid) throw new AccessFailure('invalid-identity');
      const token = await getIdTokenResult(user, true);
      if (!validIdentity(identity, token.claims) || auth.currentUser !== user) throw new AccessFailure('invalid-identity');
      return record(await getDocFromServer(ref(identity)));
    },
    watch: (user, next, error) => onSnapshot(ref(user), { includeMetadataChanges: true }, snapshot => next(record(snapshot)), error),
    async signIn() { await signInWithPopup(auth, provider); },
    signOut: () => signOut(auth),
  };
}
