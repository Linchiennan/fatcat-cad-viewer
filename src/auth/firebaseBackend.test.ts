import { describe, expect, it } from 'vitest';
import { validIdentity } from './firebaseBackend';
const user = { uid: 'sample', email: 'Alice@example.test' };
const valid = { email: user.email, email_verified: true, firebase: { sign_in_provider: 'google.com' } };
describe('verified Google identity contract', () => {
 it('accepts exact original email', () => expect(validIdentity(user, valid)).toBe(true));
 it.each([
  { ...valid, email: 'alice@example.test' }, { ...valid, email_verified: false }, { ...valid, email_verified: 'true' },
  { ...valid, firebase: { sign_in_provider: 'password' } }, { ...valid, firebase: {} }, { ...valid, email: null },
 ])('rejects %j', claims => expect(validIdentity(user, claims)).toBe(false));
 it('rejects missing email', () => expect(validIdentity({...user,email:null},valid)).toBe(false));
 it('rejects slash in document identifier', () => expect(validIdentity({...user,email:'a/b'}, {...valid,email:'a/b'})).toBe(false));
});
