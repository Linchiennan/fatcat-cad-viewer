import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {beginParse,completeParse,readParseReceipt,PIPELINE_FINGERPRINT} from './parseAudit';
it('legacy receipt never supplies cached data; only successful fresh parse advances fingerprint',async()=>{
 const file=new File(['AC1018-original-bytes'],'legacy14H.dwg');
 const first=await beginParse(file,'library-id-1');
 expect(first.fingerprint).toBe(PIPELINE_FINGERPRINT);expect(first.status).toBe('parsing');expect(first.previousFingerprint).toBeNull();expect(first.reparseRequired).toBe(true);
 expect(await readParseReceipt('library-id-1')).toBeNull();
 await completeParse(file);
 const saved=await readParseReceipt('library-id-1');expect(saved?.fingerprint).toBe(PIPELINE_FINGERPRINT);expect(saved?.sourceSHA256).toBe(first.sourceSHA256);
 const reopened=await beginParse(new File(['AC1018-original-bytes'],'legacy14H.dwg'),'library-id-1');expect(reopened.reparseRequired).toBe(false);expect(reopened.mode).toBe('fresh-source-every-open');
});
it('stale fingerprint is migrated only after success; original content and permissions are untouched',async()=>{
 const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('fatcat-parse-receipts',2);q.onsuccess=()=>r(q.result);});
 const old={key:'legacy-stale',schema:0,fingerprint:'code4',sourceSHA256:'old',fontSignature:'',completedAt:1,cachedDXF:'stale derived payload'};
 await new Promise<void>(r=>{const t=db.transaction('receipts','readwrite');t.objectStore('receipts').put(old);t.oncomplete=()=>r();});db.close();
 const f=new File(['AC1018-original'],'14H.dwg'),audit=await beginParse(f,'legacy-stale');expect(audit.reparseRequired).toBe(true);expect(audit.previousFingerprint).toBe('code4');expect(await readParseReceipt('legacy-stale')).toEqual(old);
 await completeParse(f);const migrated=await readParseReceipt('legacy-stale');expect(migrated?.schema).toBe(1);expect(migrated).not.toHaveProperty('cachedDXF');expect(await f.text()).toBe('AC1018-original');
});
