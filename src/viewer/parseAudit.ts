import {listCadFonts} from './cadFonts';
/** No DXF/scene is persisted here. This is a success receipt, never a render cache. */
export const PIPELINE_FINGERPRINT='fatcat-3.0/libredwg-0.7.9/dxf-1.0.48/shx-1.4.5'; // 待決 C-24：新指紋，舊收據自動標「需重新解析」
export type ParseReceipt={key:string;schema:1;fingerprint:string;sourceSHA256:string;fontSignature:string;completedAt:number};
export type ParseAudit=Omit<ParseReceipt,'completedAt'>&{mode:'fresh-source-every-open';status:'parsing'|'complete';previousFingerprint:string|null;reparseRequired:boolean;startedAt:number;completedAt?:number;storageAvailable:boolean};
const audits=new WeakMap<File,ParseAudit>();
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const q=indexedDB.open('fatcat-parse-receipts',2);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('receipts'))q.result.createObjectStore('receipts',{keyPath:'key'});if(!q.result.objectStoreNames.contains('diagnostics'))q.result.createObjectStore('diagnostics',{keyPath:'id'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
export async function readParseReceipt(key:string):Promise<ParseReceipt|null>{try{const d=await database();try{return await new Promise((resolve,reject)=>{const q=d.transaction('receipts').objectStore('receipts').get(key);q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);});}finally{d.close();}}catch{return null;}}
export async function beginParse(file:File,libraryId?:string):Promise<ParseAudit>{
 const sourceSHA256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
 const key=libraryId??'content:'+sourceSHA256,prior=await readParseReceipt(key),fonts=await listCadFonts().catch(()=>[]);
 const fontSignature=fonts.map(f=>f.name+':'+f.sha256).sort().join('|');
 const audit:ParseAudit={key,schema:1,fingerprint:PIPELINE_FINGERPRINT,sourceSHA256,fontSignature,mode:'fresh-source-every-open',status:'parsing',previousFingerprint:prior?.fingerprint??null,reparseRequired:prior?.schema!==1||prior.fingerprint!==PIPELINE_FINGERPRINT||prior.sourceSHA256!==sourceSHA256||prior.fontSignature!==fontSignature,startedAt:Date.now(),storageAvailable:false};
 audits.set(file,audit);recordDiagnostic('parse.start',{key,name:file.name.replace(/^.*[\\/]/,''),bytes:file.size,sourceSHA256,fingerprint:PIPELINE_FINGERPRINT,startedAt:audit.startedAt,status:'parsing',stage:'source-hash-ready',fontSignature});return audit;
}
export function getParseAudit(file:File):ParseAudit|null{return audits.get(file)??null;}
export async function completeParse(file:File):Promise<ParseAudit|null>{
 const audit=audits.get(file);if(!audit)return null;
 const done:ParseAudit={...audit,status:'complete',completedAt:Date.now()};audits.set(file,done);recordDiagnostic('parse.complete',{key:done.key,sourceSHA256:done.sourceSHA256,status:'complete',completedAt:done.completedAt});
 try{const d=await database();try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction('receipts','readwrite');const row:ParseReceipt={key:done.key,schema:1,fingerprint:done.fingerprint,sourceSHA256:done.sourceSHA256,fontSignature:done.fontSignature,completedAt:done.completedAt!};tx.objectStore('receipts').put(row);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});done.storageAvailable=true;}finally{d.close();}}catch{/* Receipt storage failure must not delete or block the original library. */}
 return done;
}

// Diagnostics share the audit database, never the drawing-library schema.
// 200 recent events rotate; first 100 important errors remain until explicitly
// cleared (no automatic clearing on export). Further errors are counted.
import {BUILD_CODE,BUILD_ID} from '../app/buildIdentity';
type Data=Record<string,any>;
export type DiagnosticEvent={at:string;type:string;session:string;webCode:number;webBuild:string;native:Data|null;data:Data};
export type DiagnosticState={id:'session';events:DiagnosticEvent[];errors:DiagnosticEvent[];overflowErrors:number;current:Data|null;storageError?:string};
const emptyDiagnostics=():DiagnosticState=>({id:'session',events:[],errors:[],overflowErrors:0,current:null});
let diagnosticQueue:Promise<void>=Promise.resolve(),memory:DiagnosticState|null=null;
let nativeIdentity:Data|null=null,installedHandlers=false,lastPhase='';
const session=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
function redact(text:string):string{return text.replace(/(?:[A-Za-z]:[\\/]|file:\/\/|content:\/\/)[^\s"'<>]+/g,'[path-redacted]').replace(/https?:\/\/[^/\s)]+/g,'[web-origin]').slice(0,4000);}
function safe(value:any,depth=0):any {
 if(value==null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return redact(value);
 if(depth>5)return '[depth-limit]';
 if(Array.isArray(value))return value.slice(0,64).map(x=>safe(x,depth+1));
 if(value instanceof Blob||value instanceof ArrayBuffer)return '[binary-excluded]';
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([k,v])=>[k,safe(v,depth+1)]));
 return String(value).slice(0,100);
}
export function diagnosticError(error:unknown):Data {const e=error as Error;return {message:redact(e?.message??String(error)),stack:redact(e?.stack??''),errorName:e?.name??'Error'};}
async function loadDiagnostics():Promise<DiagnosticState>{if(memory)return memory;const d=await database();try{return memory=await new Promise<DiagnosticState>((resolve,reject)=>{const q=d.transaction('diagnostics').objectStore('diagnostics').get('session');q.onsuccess=()=>resolve(q.result??emptyDiagnostics());q.onerror=()=>reject(q.error);});}finally{d.close();}}
export function recordDiagnostic(type:string,data:Data={},important=false):void {
 try {const payload=safe(data);diagnosticQueue=diagnosticQueue.then(async()=>{
  let state:DiagnosticState;try{state=await loadDiagnostics();}catch{state=memory??(memory=emptyDiagnostics());state.storageError='本機診斷儲存不可用；本次僅記憶體';}
  if(type==='open.request'){lastPhase='';state.current={...payload,status:'opening',session};}
  if(type==='parse.start')state.current={...payload,session};
  if(type==='parse.complete'||type==='parse.failed'||type==='parse.phase'||type==='font.selection'||type==='library.saved'){
   if(state.current&&(!payload.key||state.current.key===payload.key))state.current={...state.current,...payload};
  }
  const event:DiagnosticEvent={at:new Date().toISOString(),type,session,webCode:BUILD_CODE,webBuild:BUILD_ID,native:nativeIdentity,data:payload};
  if(important)event.data={...payload,source:state.current?{key:state.current.key,name:state.current.name,bytes:state.current.bytes,sourceSHA256:state.current.sourceSHA256,stage:state.current.stage,status:state.current.status}:null};
  if(JSON.stringify(event).length>6000)event.data={message:'事件超過6000字元；細節已截短',detail:JSON.stringify(payload).slice(0,4500)};
  state.events.push(event);state.events=state.events.slice(-200);
  if(important){if(state.errors.length<100)state.errors.push(event);else state.overflowErrors++;}
  try{const d=await database();try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction('diagnostics','readwrite');tx.objectStore('diagnostics').put(state);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{d.close();}}catch{state.storageError='本機診斷寫入失敗；開圖不受影響';}
 }).catch(()=>{/* A diagnostic failure must never break opening a drawing. */});}catch{/* Even serialization is best effort. */}
}
export async function flushDiagnostics():Promise<void>{await diagnosticQueue;}
export async function readDiagnostics():Promise<DiagnosticState>{await flushDiagnostics();try{return structuredClone(await loadDiagnostics());}catch{return {...emptyDiagnostics(),storageError:'無法讀取持久診斷紀錄'};}}
export function failParse(file:File|undefined,error:unknown,stage:string):void {const audit=file?audits.get(file):null;recordDiagnostic('parse.failed',{key:audit?.key,status:'failed',stage,...diagnosticError(error)},true);}
export function diagnosticPhase(stage:string):void {if(stage===lastPhase)return;lastPhase=stage;recordDiagnostic('parse.phase',{stage});}
export function setDiagnosticNativeIdentity(info:Data):void {nativeIdentity=safe(info);recordDiagnostic('native.identity',nativeIdentity!);}
export function installDiagnosticHandlers():void {
 if(installedHandlers||typeof window==='undefined')return;installedHandlers=true;
 window.addEventListener('error',e=>recordDiagnostic('js.error',diagnosticError(e.error??e.message),true));
 window.addEventListener('unhandledrejection',e=>recordDiagnostic('promise.unhandled',diagnosticError(e.reason),true));
 void readDiagnostics().then(previous=>{if(previous.current?.status==='parsing'||previous.current?.status==='opening')recordDiagnostic('previous.incomplete',{message:'上次開圖有開始、無完成標記；可能中斷，不能判定原生崩潰或OS強殺',previous:previous.current},true);recordDiagnostic('app.start',{timeSource:'device clock, ISO-8601 UTC; not server-verified',fingerprint:PIPELINE_FINGERPRINT});});
}

