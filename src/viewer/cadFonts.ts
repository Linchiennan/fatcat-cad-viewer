import {ShxFont,fontKey} from './shxText';
import {parse} from 'opentype.js';
export type CadFontRecord={name:string;data:ArrayBuffer;sha256:string};
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('fatcat-local-fonts',1);r.onupgradeneeded=()=>r.result.createObjectStore('fonts',{keyPath:'name'});r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});}
export async function listCadFonts():Promise<CadFontRecord[]>{if(typeof indexedDB==='undefined')return [];const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('fonts').objectStore('fonts').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function write(name:string,record?:CadFontRecord){const db=await database();try{await new Promise<void>((resolve,reject)=>{const t=db.transaction('fonts','readwrite');if(record)t.objectStore('fonts').put(record);else t.objectStore('fonts').delete(name);t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error);t.onerror=()=>reject(t.error);});}finally{db.close();}}
export async function importCadFont(file:File):Promise<void>{
 if(!/\.(shx|ttf|otf)$/i.test(file.name)||file.size>20*1024*1024||file.size<24)throw Error('請選擇20MB以內的合法SHX／TTF／OTF字型');
 const data=await file.arrayBuffer();if(/\.shx$/i.test(file.name)){const font=new ShxFont(data);if(!Object.keys(font.fontData.content.data).length)throw Error('SHX沒有字形');font.release();}else if(!parse(data).numGlyphs)throw Error('字型沒有字形');
 const name=fontKey(file.name),all=await listCadFonts();if(all.filter(f=>f.name!==name).reduce((n,f)=>n+f.data.byteLength,0)+data.byteLength>64*1024*1024)throw Error('本機字型庫超過64MB');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
 await write(name,{name,data,sha256});const check=(await listCadFonts()).find(f=>f.name===name);if(check?.sha256!==sha256||check.data.byteLength!==data.byteLength)throw Error('字型保存讀回不一致');
}
export async function removeCadFont(name:string):Promise<void>{await write(name);if((await listCadFonts()).some(f=>f.name===name))throw Error('字型刪除讀回不一致');}
