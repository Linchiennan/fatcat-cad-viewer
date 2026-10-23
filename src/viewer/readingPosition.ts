// Reading position and layer memory per drawing sheet (T14 3.6, 3.7). Keys: "fatcat-reading-v1:" + name
// + ":" + SHA-256 of the source, plus ":space:<layout>" for paper layouts and ":layers" for layer memory.
import type { MeasurementUnit } from './measurementGeometry';
export type ReadingPosition={x:number;y:number;width:number;sourceUnit?:MeasurementUnit;displayUnit?:MeasurementUnit;time:number};
const prefix='fatcat-reading-v1:';
const LAYERS=':layers';
const KEEP=100;
const identities=new WeakMap<File,string>();
const cache=new Map<string,ReadingPosition>();
let database:Promise<IDBDatabase>|undefined;
function db():Promise<IDBDatabase>{return database??=new Promise((resolve,reject)=>{const q=indexedDB.open('fatcat-reading-positions',1);q.onupgradeneeded=()=>q.result.createObjectStore('positions');q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});}
const valid=(v:ReadingPosition|null|undefined):v is ReadingPosition=>!!v&&[v.x,v.y,v.width].every(Number.isFinite)&&v.width>0;
export async function loadPosition(key:string):Promise<ReadingPosition|null>{try{const d=await db();const v=await new Promise<ReadingPosition|undefined>((resolve,reject)=>{const q=d.transaction('positions').objectStore('positions').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});if(valid(v))cache.set(key,v);}catch{/* local storage fallback */}return readPosition(key);}
async function persist(key:string,value:ReadingPosition):Promise<void>{try{const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction('positions','readwrite');tx.objectStore('positions').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}catch{/* storage unavailable does not break drawing */}}
export async function bindDrawingIdentity(source:File,target:File):Promise<void>{identities.set(target,await drawingIdentity(source));}
export async function drawingIdentity(file:File):Promise<string>{
 const known=identities.get(file);if(known)return known;
 const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return prefix+file.name+':'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
/** Reading-position key of one sheet: model space uses the drawing identity as is. */
export function sheetKey(identity:string,space:string):string{return space==='Model'?identity:identity+':space:'+encodeURIComponent(space);}
export function readPosition(key:string):ReadingPosition|null{
 try{const v=cache.get(key)??JSON.parse(localStorage.getItem(key)??'null');return valid(v)?v:null;}catch{return null;}
}
/** Keep the 100 most recent positions; a forgotten position takes its layer memory with it (待決 A-4: layer memory is never dropped first). */
function prune():void{
 const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)&&!k.endsWith(LAYERS));
 if(keys.length<=KEEP)return;
 const time=(k:string)=>{try{return Number(JSON.parse(localStorage.getItem(k)??'null')?.time)||0;}catch{return 0;}};
 for(const k of keys.sort((a,b)=>time(a)-time(b)).slice(0,keys.length-KEEP)){localStorage.removeItem(k);localStorage.removeItem(k+LAYERS);cache.delete(k);}
}
export function savePosition(key:string,value:Partial<ReadingPosition>):void{
 if(!key)return;
 const next={...readPosition(key),...value,time:Date.now()} as ReadingPosition;cache.set(key,next);void persist(key,next);
 try{localStorage.setItem(key,JSON.stringify(next));prune();}catch{/* Storage denied/full does not prevent reading the drawing. */}
}
/** Layer memory of a sheet: {layer name: shown}; unreadable = empty. */
export function readLayerMemory(key:string):Record<string,boolean>{
 try{const v=JSON.parse(localStorage.getItem(key+LAYERS)??'null');if(!v||typeof v!=='object'||Array.isArray(v))return {};const out:Record<string,boolean>={};for(const [k,s] of Object.entries(v))if(typeof s==='boolean')out[k]=s;return out;}catch{return {};}
}
/** Overwrite the layer memory of a sheet with the state of every report layer. */
export function saveLayerMemory(key:string,layers:Record<string,boolean>):void{
 if(!key)return;
 try{localStorage.setItem(key+LAYERS,JSON.stringify(layers));}catch{/* layer memory is a convenience */}
}
