import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
const env = await initializeTestEnvironment({ projectId: 'demo-fatcat-access', firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync('firestore.rules','utf8') } });
const results=[];
async function test(name, fn) { await fn(); results.push({name,pass:true}); console.log('PASS',name); }
const email='Alice@example.test';
const claims=(provider='google.com',verified=true) => ({email,email_verified:verified,firebase:{sign_in_provider:provider}});
const own=(db) => doc(db,'allowedUsers',email);
try {
 await env.withSecurityRulesDisabled(async c => { await setDoc(own(c.firestore()), {enabled:true}); await setDoc(doc(c.firestore(),'allowedUsers','disabled@example.test'),{enabled:false}); });
 await test('anonymous get denied',()=>assertFails(getDoc(own(env.unauthenticatedContext().firestore()))));
 for(const provider of ['password','anonymous','custom']) await test(`${provider} get denied`,()=>assertFails(getDoc(own(env.authenticatedContext('test',claims(provider)).firestore()))));
 await test('unverified Google denied',()=>assertFails(getDoc(own(env.authenticatedContext('test',claims('google.com',false)).firestore()))));
 const db=env.authenticatedContext('alice',claims()).firestore();
 await test('own exact-email Google get allowed',()=>assertSucceeds(getDoc(own(db))));
 await test('case-changed email denied',()=>assertFails(getDoc(doc(db,'allowedUsers',email.toLowerCase()))));
 await test('other email denied',()=>assertFails(getDoc(doc(db,'allowedUsers','other@example.test'))));
 await test('list denied',()=>assertFails(getDocs(collection(db,'allowedUsers'))));
 await test('create denied',()=>assertFails(setDoc(doc(db,'allowedUsers','new@example.test'),{enabled:true})));
 await test('overwrite denied',()=>assertFails(setDoc(own(db),{enabled:true})));
 await test('update denied',()=>assertFails(updateDoc(own(db),{enabled:false})));
 await test('delete denied',()=>assertFails(deleteDoc(own(db))));
 await test('other collection get denied',()=>assertFails(getDoc(doc(db,'drawings','private'))));
 await test('other collection write denied',()=>assertFails(setDoc(doc(db,'drawings','private'),{})));
 const disabled=env.authenticatedContext('disabled',{...claims(),email:'disabled@example.test'}).firestore();
 await test('own disabled readable: application must check enabled',async()=>{ const s=await assertSucceeds(getDoc(doc(disabled,'allowedUsers','disabled@example.test'))); if(s.data().enabled!==false) throw Error('not false'); });
 const missing=env.authenticatedContext('missing',{...claims(),email:'missing@example.test'}).firestore();
 await test('own missing readable: application must require exists',async()=>{ const s=await assertSucceeds(getDoc(doc(missing,'allowedUsers','missing@example.test'))); if(s.exists()) throw Error('exists'); });
} finally { await env.cleanup(); writeFileSync('../rules-results.json',JSON.stringify({emulator:true,production:false,total:results.length,results},null,2)); }
