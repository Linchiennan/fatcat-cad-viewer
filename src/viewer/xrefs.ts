import { preserveCadMetadata } from './cadDocument';
import {rasterData,standaloneRaster} from './rasterImages';
import { resolveOleImages } from './oleImages';
import { decodeMifEntities, decodeMifNames } from './mifText';
import { decodeCaretEntities } from './caretText';
import { annotateDxfXclips } from '../dwg/xclipMetadata';
import { bindDrawingIdentity } from './readingPosition';
import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';
import { convertDwgToDxf,conversionWarnings,conversionRebuiltBlocks,conversionUnloadedXrefs } from '../dwg/convertDwg';
import { detectDxfEncoding } from './dxfEncoding';
import { repairDxfText, repairWarning } from './dxfRepair';
import { applyReaderTexts } from '../dwg/missingBlocks';
import { readLayerStates } from "./layerStateTable";
export type XrefStatus={name:string;path:string;status:string;overlay:boolean;key:string};
type Any=any;
export function normalizeCadPath(value:string):string {
 const parts:string[]=[];for(const s of value.replaceAll('\\','/').split('/')){if(!s||s==='.')continue;if(s==='..')parts.pop();else parts.push(s.toLocaleLowerCase('en-US'));}return parts.join('/');
}
export function matchXref(path:string,parent:string,files:File[],mapping:Record<string,string>,key=path):File|null {
 const selected=mapping[key]??mapping[path];if(selected){if(/^@\d+$/.test(selected))return files[Number(selected.slice(1))]??null;const hits=files.filter(f=>(f.webkitRelativePath||f.name)===selected);return hits.length===1?hits[0]:null;}
 // A reference saved without an extension (e.g. "1英吋不鏽鋼閘閥") also matches the same name as .dwg/.dxf.
 const variants=/\.[a-z0-9]{2,4}$/i.test(path.split(/[\\/]/).at(-1)??'')?[path]:[path,path+'.dwg',path+'.dxf'];
 for(const candidate of variants){
  const relative=normalizeCadPath(parent.split('/').slice(0,-1).join('/')+'/'+candidate),exact=normalizeCadPath(candidate);
  const hits=files.filter(f=>{const p=normalizeCadPath(f.webkitRelativePath||f.name);return p===relative||p===exact;});
  if(hits.length===1)return hits[0];if(hits.length>1)return null;
 }
 for(const candidate of variants){
  const name=normalizeCadPath(candidate).split('/').at(-1);const base=files.filter(f=>normalizeCadPath(f.name)===name);
  if(base.length===1)return base[0];if(base.length>1)return null;
 }
 return null;
}
/** Spaces where a block shows up, following nested INSERTs ("Model" or layout names). */
export function blockUsage(doc:Any,blockName:string):Set<string>{
 const parents=new Map<string,Set<string>>(),top=new Map<string,Set<string>>();
 for(const e of doc.entities??[])if(e.type==='INSERT'){if(!top.has(e.name))top.set(e.name,new Set());top.get(e.name)!.add(e.cadSpace??'Model');}
 for(const [owner,b] of Object.entries(doc.blocks??{}) as [string,Any][])for(const e of b.entities??[])if(e.type==='INSERT'){if(!parents.has(e.name))parents.set(e.name,new Set());parents.get(e.name)!.add(owner);}
 const out=new Set<string>(),seen=new Set<string>(),walk=(name:string)=>{if(seen.has(name))return;seen.add(name);for(const s of top.get(name)??[])out.add(s);for(const p of parents.get(name)??[])walk(p);};
 walk(blockName);return out;
}
const usageNote=(spaces:Set<string>)=>{
 if(!spaces.size)return '；圖中未使用';
 if(spaces.has('Model'))return '';
 return `；用在圖紙「${[...spaces].join('」「')}」，請在下方 Dock 切換配置查看`;
};
/** Mark the xref blocks the DWG was saved with unloaded (names as the engine read them, \U+ codes decoded like the DXF names). */
export function markUnloadedXrefs(doc:Any,names:readonly string[]|undefined):void{
 if(!names?.length)return;
 const wanted=new Set(names.map(n=>n.replace(/\\U\+([0-9A-Fa-f]{4})/g,(_,h:string)=>String.fromCharCode(parseInt(h,16)))));
 for(const [name,block] of Object.entries(doc.blocks??{}) as [string,Any][])if((block.type&4)&&wanted.has(name))block.cadXrefUnloaded=true;
}
export async function parseCadFile(file:File):Promise<Any>{
 if(/\.(png|jpe?g)$/i.test(file.name))return standaloneRaster(file);
 const source=/\.dwg$/i.test(file.name)?await convertDwgToDxf(file):file;
 const bytes=annotateDxfXclips(new Uint8Array(await source.arrayBuffer()));const text=new TextDecoder(detectDxfEncoding(bytes.subarray(0,65536))).decode(bytes);let dxfText=text,repaired=0;let raw:Any;try{raw=new DxfParser().parseSync(dxfText);}catch(error){if(!/Cannot parse group code/.test(String(error)))throw error;const fixed=repairDxfText(text);dxfText=fixed.text;repaired=fixed.dropped;raw=new DxfParser().parseSync(dxfText);}
 const rebuilt=conversionRebuiltBlocks.get(source);let restored=0;if(rebuilt){raw.blocks??={};for(const [n,b] of Object.entries(rebuilt.blocks))if(!raw.blocks[n]){raw.blocks[n]=b;restored++;}}
 const parsed:Any=preserveCadMetadata(raw,dxfText);parsed.cadLayerStates=readLayerStates(dxfText);if(restored)(parsed.cadDiagnostics??=[]).push(`${restored} 個圖塊在 DWG 轉檔時遺漏，已改用備援讀取補回`);if(rebuilt?.error)(parsed.cadDiagnostics??=[]).push(`漏寫圖塊或文字的備援讀取失敗：${rebuilt.error}`);const textFixed=rebuilt?.texts?applyReaderTexts(parsed,rebuilt.texts):0;if(textFixed)(parsed.cadDiagnostics??=[]).push(`${textFixed} 段文字在 DWG 轉檔時解碼錯誤，已改用備援讀取修正`);for(const [type,n] of Object.entries(rebuilt?.skipped??{}))(parsed.cadDiagnostics??=[]).push(`補回的圖塊中有 ${n} 個 ${type} 尚未支援顯示`);if(repaired)(parsed.cadDiagnostics??=[]).push(repairWarning(repaired));await resolveOleImages(parsed);decodeMifEntities(parsed);decodeMifNames(parsed);markUnloadedXrefs(parsed,conversionUnloadedXrefs.get(source));decodeCaretEntities(parsed);if(conversionWarnings.get(source))(parsed.cadDiagnostics??=[]).push(file.name+'：DWG解析傳回 '+conversionWarnings.get(source)+' 筆診斷');return parsed;
}
/** Import into existing INSERT/BLOCK path; no network or alternate renderer. */
/** `manual`: files the user picked in the xref panel; only these (or a manual mapping) load a reference saved unloaded. */
export async function assembleXrefs(rootFile:File,files:File[],mapping:Record<string,string>={},disabled:Set<string>=new Set(),manual:ReadonlySet<File>=new Set()):Promise<{file:File;statuses:XrefStatus[]}> {
 if(files.length>64||files.reduce((sum,f)=>sum+f.size,0)>128*1024*1024)throw Error('外參超過64檔或128MB安全上限');
 const root=await parseCadFile(rootFile),statuses:XrefStatus[]=[],topLevel=new Map<XrefStatus,string>();
 // Each reference file is read and assembled once and reused wherever it is referenced. 昭盛 給水-7F: 22 references
 // pulled in 33 files 413 times through nesting, so counting (and rebuilding) per reference hit the cap and the whole
 // drawing failed; ZWCAD loads it. The cap counts different files.
 const assembled=new Map<File,Any>();
 async function resolve(doc:Any,parent:string,stack:File[],depth:number):Promise<void>{
  const images=[...(doc.entities??[]),...Object.values(doc.blocks??{}).flatMap((b:Any)=>b.entities??[])].filter((e:Any)=>e.type==='IMAGE'&&!e.cadOleImage);
  for(const image of new Set(images)){if(/\.(png|jpe?g)$/i.test(rootFile.name)&&image.imageData)continue;const path=image.imagePath,key=parent+'|IMAGE:'+image.handle,status:XrefStatus={name:'圖片 '+(image.handle??path),path,key,overlay:false,status:'未載入'};statuses.push(status);delete image.imageData;
   if(disabled.has(key)){image.hidden=true;status.status='已關閉';continue;}
   const file=matchXref(path,parent,files,mapping,key);
   if(!file){status.status='找不到或同名衝突，請逐檔對應';continue;}
   try{image.imageData=await rasterData(file);status.status='已載入：'+(file.webkitRelativePath||file.name);}catch(error){status.status='讀取失敗：'+String(error);}
  }
  const initial=Object.entries(doc.blocks??{}) as [string,Any][];
  // Plain blocks can carry a path too (LibreDWG writes group 1 = name); never empty them as missing xrefs.
  for(const [name,block] of initial){if(!block.xrefPath||!(block.type&4))continue;
   const path=block.xrefPath,key=parent+'|'+name,status:XrefStatus={name,path,key,overlay:!!(block.type&8),status:'未載入'};statuses.push(status);if(depth===0)topLevel.set(status,name);
   if(disabled.has(key)||disabled.has(path)){block.entities=[];status.status='已關閉';continue;}
   const file=matchXref(path,parent,files,mapping,key);
   // Saved unloaded: CAD keeps it unloaded on open (ZWCAD: 12 of 12), so it is not drawn here either, unless the user
   // picked a file for it in the panel: the flag is not always what CAD acts on (用戶 2026-10-27：有手動選檔就載入；11F 給水
   // has all three references flagged so and ZWCAD loads them). Files found automatically keep the ZWCAD-matched rule.
   const picked=!!file&&(manual.has(file)||!!mapping[key]||!!mapping[path]);
   if(block.cadXrefUnloaded&&!picked){block.entities=[];status.status='存檔時已卸載（CAD 開圖也不顯示）';continue;}
   if(depth>0&&status.overlay){block.entities=[];status.status='巢狀覆疊不傳遞';continue;}
   if(!file){block.entities=[];status.status='找不到或同名衝突，請逐檔對應';continue;}
   if(stack.includes(file)||depth>=16){block.entities=[];status.status='循環／深度上限已阻擋';continue;}
   let child=assembled.get(file);
   if(!child&&assembled.size>=64){block.entities=[];status.status='外參檔超過64個安全上限，未載入';continue;}
   try{
    if(!child){
     child=await parseCadFile(file);root.cadDiagnostics??=[];root.cadDiagnostics.push(...(child.cadDiagnostics??[]));for(const [type,n] of Object.entries(child.cadUnsupported??{}))root.cadDiagnostics.push(file.name+'：未支援物件 '+type+' '+n+' 筆');await resolve(child,file.webkitRelativePath||file.name,[...stack,file],depth+1);
     assembled.set(file,child);
    }
    const ns=name+'|';const rename=(e:Any)=>{
     const q={...e,layer:ns+(e.layer??'0'),handle:ns+(e.handle??'')};
     for(const k of ['name','block'])if(q[k]&&child.blocks?.[q[k]])q[k]=ns+q[k];
     if(q.lineType&&!['BYLAYER','BYBLOCK','CONTINUOUS'].includes(q.lineType.toUpperCase()))q.lineType=ns+q.lineType;
     if(q.styleName)q.styleName=ns+q.styleName;
     return q;
    };
    for(const [n,b] of Object.entries(child.blocks??{}) as [string,Any][])doc.blocks[ns+n]={...b,name:ns+n,entities:(b.entities??[]).map(rename)};
    doc.tables??={};for(const [table,records] of [['layer','layers'],['lineType','lineTypes'],['style','styles'],['dimstyle','dimStyles']]){
     doc.tables[table]??={};doc.tables[table][records]??={};
     for(const [n,v] of Object.entries(child.tables?.[table]?.[records]??{}) as [string,Any][])doc.tables[table][records][ns+n]=table==='layer'&&doc.tables[table][records][ns+n]?doc.tables[table][records][ns+n]:{...v,name:ns+n,styleName:ns+n,lineType:v.lineType&&!['CONTINUOUS','BYLAYER','BYBLOCK'].includes(v.lineType.toUpperCase())?ns+v.lineType:v.lineType};
    }
    block.entities=(child.entities??[]).filter((e:Any)=>!e.inPaperSpace).map(rename);
    block.position=child.header?.$INSBASE??block.position??{x:0,y:0,z:0};
    status.status='已載入：'+(file.webkitRelativePath||file.name)+(block.cadXrefUnloaded?'（存檔時標為卸載，依選的檔載入）':'');
   }catch(error){block.entities=[];status.status='讀取失敗：'+(error instanceof Error?error.message:String(error));}
  }
 }
 await resolve(root,rootFile.name,[rootFile],0);
 // Say where each top-level reference appears, so one used only on a sheet is not mistaken for missing.
 for(const [status,name] of topLevel)if(/^(已載入|找不到)/.test(status.status))status.status+=usageNote(blockUsage(root,name));
 root.cadXrefStatuses=statuses;
 const file=new File(['FATCAT-DXF-JSON\n'+JSON.stringify(root)],rootFile.name.replace(/\.(dwg|dxf|png|jpe?g)$/i,'.dxf'),{type:'application/dxf',lastModified:rootFile.lastModified});
 await bindDrawingIdentity(rootFile,file);return {file,statuses};
}
