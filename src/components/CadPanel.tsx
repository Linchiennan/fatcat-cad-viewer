import { Capacitor } from '@capacitor/core';
import { DragRow } from "./DragRow";
import { incomingDrawingPlugin,readIncomingDrawingFile } from '../native/incomingDrawing';
import { isAppleMobile } from '../app/platform';
import { splitCadWarnings } from '../viewer/cadWarnings';
import { useState,useEffect } from 'react';
import { useI18n, type TranslationKey } from '../i18n/translations';
import { nativeErrorText } from '../i18n/nativeErrors';
import type { CadReport } from '../viewer/engineering';
import {importCadFont,listCadFonts,removeCadFont,type CadFontRecord} from '../viewer/cadFonts';
import {beginParse,getParseAudit,type ParseAudit} from '../viewer/parseAudit';
import { assembleXrefs, type XrefStatus } from '../viewer/xrefs';
import { mergeXrefFiles, sameFile } from '../viewer/xrefPicks';
import { forgetXrefs, rememberXref, storeXrefFile } from '../viewer/xrefMemory';
import { XrefList, type XrefRow } from './XrefList';
import { ImportVersionDialog } from '../library/ImportVersionDialog';
import type { ImportChoice, ImportConflict } from '../library/drawingLibrary';
import { LayerStateManager } from './LayerStateManager';
import { cannotPickFolder } from "../files/folderPick";
import { canRememberFolders, forgetFolder, pickAndRememberFolder, regrantFolders, rememberedFolderNames } from '../viewer/xrefFolders';

// Tab ids stay the zh names (the App opens a tab by them); the labels come from the dictionary.
const TABS=['圖層','缺件警告','外部參考','本機字型'] as const;
const TAB_KEYS:Record<(typeof TABS)[number],TranslationKey>={'圖層':'cad.tab.layers','缺件警告':'cad.tab.missing','外部參考':'cad.tab.xrefs','本機字型':'cad.tab.fonts'};
const TOO_LARGE='XREF_FOLDER_TOO_LARGE';

const chosenStates=new WeakMap<File,string>();
const sessions=new WeakMap<File,{files:File[];mapping:Record<string,string>;disabled:Set<string>;statuses:XrefStatus[];manual?:Set<File>}>();
/** Hand automatically found references to the panel, so it shows them and can reload with them. */
export function setXrefSession(source:File,files:File[],statuses:XrefStatus[],mapping:Record<string,string>={},manual:Set<File>=new Set()):void{sessions.set(source,{files,mapping,disabled:new Set(),statuses,manual});}
export const hasXrefSession=(source:File)=>sessions.has(source);
export async function reuseXrefSession(previous: File, next: File): Promise<File | null> {
 const session=sessions.get(previous);
 if(!session)return null;
 sessions.set(next,session);
 if(!session.files.length)return null;
 const result=await assembleXrefs(next,session.files,session.mapping,session.disabled,session.manual);
 sessions.set(next,{...session,statuses:result.statuses});
 return result.file;
}
export function CadPanel({report,audit,source,entryId,initialTab,onLayer,onLayerState,onReload,onClose}:{report:CadReport;audit?:ParseAudit|null;source:File;/** library entry of the main drawing: picked xref files are stored next to it and remembered */entryId?:string;initialTab?:string;onLayer:(name:string,visible:boolean)=>void;/** restore a named layer state of the drawing (圖層狀態管理員) */onLayerState?:(name:string)=>void;onReload:(file:File)=>void;onClose:()=>void}){
 const {t:tr,locale}=useI18n();
 const errorText=(e:unknown)=>e instanceof Error&&e.message===TOO_LARGE?tr('cad.xref.tooLarge'):nativeErrorText(locale,e)??(e instanceof Error?e.message:String(e));
 const previous=sessions.get(source);
 const split=splitCadWarnings(report.warnings);
 const [fonts,setFonts]=useState<CadFontRecord[]>([]);
 useEffect(()=>{void listCadFonts().then(setFonts).catch(e=>setMessage(String(e)));},[]);
 const [isolated,setIsolated]=useState<Map<string,boolean>|null>(null);
 // the chosen layer state stays chosen when the panel is closed and opened again on the same drawing
 const [activeState,setActiveStateNow]=useState<string|null>(chosenStates.get(source)??null);
 const setActiveState=(name:string)=>{chosenStates.set(source,name);setActiveStateNow(name);};
 const [managerOpen,setManagerOpen]=useState(false);
 const [tab,setTab]=useState(initialTab??'圖層'),[query,setQuery]=useState(''),[,refresh]=useState(0);
 const [files,setFiles]=useState<File[]>(previous?.files??[]),[mapping,setMapping]=useState<Record<string,string>>(previous?.mapping??{}),[disabled,setDisabled]=useState<Set<string>>(previous?.disabled??new Set());
 // files the user picked here (not found automatically): only these load references saved unloaded
 const [manual,setManual]=useState<Set<File>>(previous?.manual??new Set());
 const [statuses,setStatuses]=useState<XrefStatus[]>(previous?.statuses??[]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [folders,setFolders]=useState<string[]>([]);
 useEffect(()=>{if(!Capacitor.isNativePlatform())void rememberedFolderNames().then(setFolders).catch(()=>setFolders([]));},[]);
 async function rememberFolder(){setBusy(true);try{const r=await pickAndRememberFolder();setFolders(await rememberedFolderNames());setBusy(false);await addMany(r.files.slice(0,64));}catch(e){setMessage(e instanceof Error&&e.name==='AbortError'?tr('cad.xref.cancelled'):errorText(e));}finally{setBusy(false);}}
 useEffect(()=>{sessions.set(source,{files,mapping,disabled,statuses,manual});},[source,files,mapping,disabled,statuses,manual]);
 const rows=statuses.length?statuses:[...report.xrefs.map(x=>({...x,key:source.name+'|'+x.name})),...((report as any).images??[]).map((x:any)=>({name:tr('cad.xref.image',{handle:x.handle}),path:x.path,key:source.name+'|IMAGE:'+x.handle,overlay:false}))];
 const change=(name:string,v:boolean)=>{onLayer(name,v);refresh(n=>n+1);};
 async function directory(){setBusy(true);try{const picked=await incomingDrawingPlugin.selectXrefDirectory();const out:File[]=[];let total=0;for(const item of picked.files){const file=await readIncomingDrawingFile(item);total+=file.size;if(total>128*1024*1024)throw Error(TOO_LARGE);Object.defineProperty(file,'webkitRelativePath',{value:item.relativePath});out.push(file);}setBusy(false);await addMany(out);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function reload(useFiles:File[]=files,useMapping:Record<string,string>=mapping,auto=false,useManual:Set<File>=manual):Promise<XrefStatus[]|null>{let loaded:XrefStatus[]|null=null;setBusy(true);setMessage(auto?tr('cad.xref.autoBusy'):tr('cad.xref.busy'));try{const key=getParseAudit(source)?.key;await beginParse(source,key?.startsWith('content:')?undefined:key);const result=await assembleXrefs(source,useFiles,useMapping,disabled,useManual);setStatuses(result.statuses);onReload(result.file);loaded=result.statuses;const ok=result.statuses.filter(s=>/已載入|loaded/i.test(String(s.status))).length;setMessage(auto?tr('cad.xref.autoDone',{ok,total:result.statuses.length}):tr('cad.xref.done'));}catch(e){setMessage(errorText(e));}finally{setBusy(false);}return loaded;}
 const remembering=canRememberFolders()&&!Capacitor.isNativePlatform();
 // Phone browsers cannot pick a folder (用戶指定同「多選檔案」): only the multi-file picker is offered; the app keeps its native folder picker.
 const phoneWeb=cannotPickFolder()&&!Capacitor.isNativePlatform();
 // Picked files go into the library (「外部參考」 next to the main drawing) and the drawing remembers them, so the next
 // opening applies them (用戶 2026-10-28). Without a library entry (not saved yet) they apply this time only.
 const [conflict,setConflict]=useState<{c:ImportConflict;resolve:(choice:ImportChoice)=>void}|null>(null);
 const decide=(c:ImportConflict)=>new Promise<ImportChoice>(resolve=>setConflict({c,resolve}));
 async function store(picked:File[]):Promise<{file:File;entryId:string}[]>{if(!entryId)return picked.map(file=>({file,entryId:''}));const out:{file:File;entryId:string}[]=[];for(const f of picked){const r=await storeXrefFile(entryId,f,decide);if(r)out.push(r);}return out;}
 async function pickFor(row:XrefRow,file:File){setBusy(true);try{const [s]=await store([file]);if(!s)return;const merged=mergeXrefFiles(files,[s.file]);const i=merged.findIndex(f=>sameFile(f,s.file));const nextMap={...mapping,[row.key]:'@'+i};const m=new Set([...manual,merged[i]]);setFiles(merged);setMapping(nextMap);setManual(m);if(entryId&&s.entryId)rememberXref(entryId,row.key,s.entryId);setBusy(false);await reload(merged,nextMap,true,m);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 // Several at once (below the list): each lands on the reference whose path it matches, and that pairing is remembered.
 async function addMany(picked:File[]){if(!picked.length)return;setBusy(true);try{const stored=await store(picked);const merged=mergeXrefFiles(files,stored.map(x=>x.file));const m=new Set([...manual,...merged.filter(f=>stored.some(x=>sameFile(f,x.file)))]);setFiles(merged);setManual(m);setBusy(false);const done=await reload(merged,mapping,true,m);if(entryId&&done)for(const st of done){const hit=/^已載入：(.+?)(（|；|$)/.exec(st.status);const x=hit&&stored.find(y=>(y.file.webkitRelativePath||y.file.name)===hit[1]);if(x&&x.entryId)rememberXref(entryId,st.key,x.entryId);}}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 const pickFiles=(list:FileList|null)=>{void addMany(Array.from(list??[]).filter(f=>/\.(dwg|dxf|png|jpe?g)$/i.test(f.name)));};
 const forgetAll=()=>{if(entryId)forgetXrefs(entryId);setFiles([]);setMapping({});setManual(new Set());void reload([],{},false,new Set());};
 return <section className="cad-sheet" aria-label={tr('cad.title')}><header><strong>{tr('cad.title')}</strong><button onClick={onClose}>{tr('cad.close')}</button></header><DragRow as="nav">{TABS.map(t=><button aria-pressed={tab===t} key={t} onClick={()=>setTab(t)}>{tr(TAB_KEYS[t])}</button>)}</DragRow><div className="cad-sheet-body">
 {tab==='本機字型'?<><p>{tr('cad.fonts.note')}</p><label className="cad-font-import">{tr('cad.fonts.import')}<input type="file" accept="*/*" multiple aria-label={tr('cad.fonts.import')} disabled={busy} onChange={async e=>{const list=Array.from(e.target.files??[]);setBusy(true);try{for(const f of list)await importCadFont(f);setFonts(await listCadFonts());setMessage(tr('cad.fonts.saved'));}catch(error){setMessage(String(error));}finally{setBusy(false);}}}/></label>{fonts.map(f=><div key={f.name}>{f.name} · {f.data.byteLength} bytes <button disabled={busy} onClick={async()=>{try{await removeCadFont(f.name);setFonts(await listCadFonts());}catch(e){setMessage(String(e));}}}>{tr('cad.fonts.remove',{name:f.name})}</button></div>)}<button disabled={busy} onClick={()=>void reload()}>{tr('cad.fonts.apply')}</button><p role="status">{message}</p></>:null}
 {tab==='圖層'?<>{report.layerStates?.length&&onLayerState?<div className="cad-layer-states"><button type="button" onClick={()=>setManagerOpen(true)}>{tr('cad.layers.states')}</button>{activeState?<span>{tr('cad.layers.stateLast',{name:activeState})}</span>:null}</div>:null}{managerOpen&&report.layerStates?.length&&onLayerState?<LayerStateManager states={report.layerStates} layers={report.layers} chosen={activeState} onClose={()=>setManagerOpen(false)} onRestore={n=>{setActiveState(n);setIsolated(null);onLayerState(n);refresh(c=>c+1);}}/>:null}<input aria-label={tr('cad.layers.search')} placeholder={tr('cad.layers.search')} value={query} onChange={e=>setQuery(e.target.value)}/><div className="cad-layer-actions">{isolated?<button onClick={()=>{for(const [n,v] of isolated)change(n,v);setIsolated(null);}}>{tr('cad.layers.unisolate')}</button>:null}<button onClick={()=>report.layers.forEach(l=>change(l.name,l.originalVisible))}>{tr('cad.layers.restore')}</button><button onClick={()=>report.layers.forEach(l=>change(l.name,true))}>{tr('cad.layers.allOn')}</button></div>{report.layers.filter(l=>l.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((l,i)=><div className="cad-layer" key={l.name}><input id={'cad-layer-'+i} type="checkbox" checked={l.visible} onChange={e=>change(l.name,e.target.checked)}/><button onClick={()=>{if(!isolated)setIsolated(new Map(report.layers.map(a=>[a.name,a.visible])));report.layers.forEach(a=>change(a.name,a.name===l.name));}}>{tr('cad.layers.isolate')}</button><label htmlFor={'cad-layer-'+i}><i style={{background:'#'+l.color.toString(16).padStart(6,'0')}}/>{l.name}</label></div>)}</>:null}
 {tab==='缺件警告'?<><p>{tr('cad.missing.note')}</p>{audit?<div aria-label={tr('cad.missing.auditLabel')}><p>{tr('cad.missing.version',{v:audit.fingerprint})}</p><p>{tr('cad.missing.thisRun',{state:audit.status==='complete'?tr('cad.missing.fresh'):tr('cad.missing.parsing'),cache:audit.reparseRequired?tr('cad.missing.reparse'):tr('cad.missing.noCache')})}</p><p style={{overflowWrap:'anywhere'}}>{tr('cad.missing.sha',{v:audit.sourceSHA256})}</p><p>{tr('cad.missing.source',{name:source.name,bytes:source.size})}</p><p>{tr('cad.missing.done',{time:audit.completedAt?new Date(audit.completedAt).toLocaleString(locale):tr('cad.missing.notDone')})}</p></div>:null}<button disabled={busy} onClick={()=>void reload()}>{tr('cad.missing.reparseBtn')}</button><p role="status">{message}</p><h3 className="cad-missing-title">{tr('cad.missing.title')}</h3>{split.missing.length?<ul className="cad-missing">{split.missing.map(w=><li key={w}>{w}</li>)}</ul>:<p>{tr('cad.missing.none')}</p>}<details className="cad-notes"><summary>{tr('cad.missing.notes',{N:split.notes.length+1})}</summary><ul>{split.notes.map(w=><li key={w}>{w}</li>)}<li>{tr('cad.missing.build',{ms:report.buildMs.toFixed(0),N:report.entityCount})}</li></ul></details></>:null}
 {tab==='外部參考'?<><XrefList rows={rows} rootName={source.name} disabled={disabled} busy={busy} onPick={(row,f)=>void pickFor(row,f)} onToggle={(row,on)=>{const n=new Set(disabled);if(on)n.delete(row.key);else n.add(row.key);setDisabled(n);}}/><p role="status">{message}</p><button disabled={busy} onClick={()=>void reload()}>{tr('cad.xref.reapply')}</button><details className="cad-xref-more"><summary>{tr('cad.xref.moreTools')}</summary><p>{tr('cad.xref.intro',{folders:remembering?tr('cad.xref.introFolders'):''})}</p><label>{tr(phoneWeb?'cad.xref.pickMany':'cad.xref.pickFiles')}<input aria-label={tr(phoneWeb?'cad.xref.pickMany':'cad.xref.pickFiles')} type="file" accept="*/*" multiple disabled={busy} onChange={e=>{pickFiles(e.target.files);e.target.value='';}}/></label>{phoneWeb?null:Capacitor.isNativePlatform()?<button disabled={busy} onClick={()=>void directory()}>{tr('cad.xref.pickFolder')}</button>:isAppleMobile()?<p>{tr('cad.xref.noFolderIos')}</p>:<label>{tr('cad.xref.pickFolder')}<input aria-label={tr('cad.xref.pickFolder')} type="file" multiple {...({webkitdirectory:''} as object)} disabled={busy} onChange={e=>{pickFiles(e.target.files);e.target.value='';}}/></label>}{remembering?<div className="cad-xref"><button disabled={busy} onClick={()=>void rememberFolder()}>{tr('cad.xref.remember')}</button>{folders.length?<><p>{tr('cad.xref.remembered',{names:folders.join(tr('cad.listSep'))})}</p><button disabled={busy} onClick={async()=>{const n=await regrantFolders().catch(()=>0);setMessage(tr('cad.xref.regranted',{N:n}));}}>{tr('cad.xref.regrant')}</button>{folders.map(f=><button key={f} disabled={busy} onClick={async()=>{await forgetFolder(f);setFolders(await rememberedFolderNames());}}>{tr('cad.xref.forget',{name:f})}</button>)}</>:null}</div>:null}{entryId?<button disabled={busy} onClick={forgetAll}>{tr('cad.xref.forgetAll')}</button>:null}<p>{tr('cad.xref.note')}</p></details>{conflict?<ImportVersionDialog conflict={conflict.c} onChoose={choice=>{const r=conflict.resolve;setConflict(null);r(choice);}}/>:null}</>:null}
 </div></section>;
}
