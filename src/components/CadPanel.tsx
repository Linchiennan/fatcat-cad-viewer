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
import { mergeXrefFiles, removeXrefFile, sameFile } from '../viewer/xrefPicks';
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
export function setXrefSession(source:File,files:File[],statuses:XrefStatus[]):void{sessions.set(source,{files,mapping:{},disabled:new Set(),statuses});}
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
export function CadPanel({report,audit,source,initialTab,onLayer,onLayerState,onReload,onClose}:{report:CadReport;audit?:ParseAudit|null;source:File;initialTab?:string;onLayer:(name:string,visible:boolean)=>void;/** restore a named layer state of the drawing (圖層狀態管理員) */onLayerState?:(name:string)=>void;onReload:(file:File)=>void;onClose:()=>void}){
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
 async function rememberFolder(){setBusy(true);try{const r=await pickAndRememberFolder();const picked=mergeXrefFiles(files,r.files.slice(0,64));const m=new Set([...manual,...picked.filter(f=>r.files.some(g=>sameFile(f,g)))]);setFiles(picked);setManual(m);setFolders(await rememberedFolderNames());setBusy(false);await reload(picked,mapping,true,m);}catch(e){setMessage(e instanceof Error&&e.name==='AbortError'?tr('cad.xref.cancelled'):errorText(e));}finally{setBusy(false);}}
 useEffect(()=>{sessions.set(source,{files,mapping,disabled,statuses,manual});},[source,files,mapping,disabled,statuses,manual]);
 const rows=statuses.length?statuses:[...report.xrefs.map(x=>({...x,key:source.name+'|'+x.name})),...((report as any).images??[]).map((x:any)=>({name:tr('cad.xref.image',{handle:x.handle}),path:x.path,key:source.name+'|IMAGE:'+x.handle,overlay:false}))];
 const change=(name:string,v:boolean)=>{onLayer(name,v);refresh(n=>n+1);};
 async function directory(){setBusy(true);try{const picked=await incomingDrawingPlugin.selectXrefDirectory();const out:File[]=[];let total=0;for(const item of picked.files){const file=await readIncomingDrawingFile(item);total+=file.size;if(total>128*1024*1024)throw Error(TOO_LARGE);Object.defineProperty(file,'webkitRelativePath',{value:item.relativePath});out.push(file);}const merged=mergeXrefFiles(files,out);const m=new Set([...manual,...merged.filter(f=>out.some(g=>sameFile(f,g)))]);setFiles(merged);setManual(m);setBusy(false);await reload(merged,mapping,true,m);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function reload(useFiles:File[]=files,useMapping:Record<string,string>=mapping,auto=false,useManual:Set<File>=manual){setBusy(true);setMessage(auto?tr('cad.xref.autoBusy'):tr('cad.xref.busy'));try{const key=getParseAudit(source)?.key;await beginParse(source,key?.startsWith('content:')?undefined:key);const result=await assembleXrefs(source,useFiles,useMapping,disabled,useManual);setStatuses(result.statuses);onReload(result.file);const ok=result.statuses.filter(s=>/已載入|loaded/i.test(String(s.status))).length;setMessage(auto?tr('cad.xref.autoDone',{ok,total:result.statuses.length}):tr('cad.xref.done'));}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 const remembering=canRememberFolders()&&!Capacitor.isNativePlatform();
 // Phone browsers cannot pick a folder (用戶指定同「多選檔案」): only the multi-file picker is offered; the app keeps its native folder picker.
 const phoneWeb=cannotPickFolder()&&!Capacitor.isNativePlatform();
 // Each pick adds to what was picked before (refs in different folders = one pick per folder); mappings stay.
 const pickFiles=(list:FileList|null)=>{const picked=Array.from(list??[]).filter(f=>/\.(dwg|dxf|png|jpe?g)$/i.test(f.name));if(!picked.length)return;const merged=mergeXrefFiles(files,picked);const m=new Set([...manual,...merged.filter(f=>picked.some(g=>sameFile(f,g)))]);setFiles(merged);setManual(m);void reload(merged,mapping,true,m);};
 const removeFile=(i:number)=>{const next=removeXrefFile(files,mapping,i);const m=new Set([...manual].filter(f=>next.files.includes(f)));setFiles(next.files);setMapping(next.mapping);setManual(m);void reload(next.files,next.mapping,false,m);};
 const clearFiles=()=>{setFiles([]);setMapping({});setManual(new Set());void reload([],{},false,new Set());};
 return <section className="cad-sheet" aria-label={tr('cad.title')}><header><strong>{tr('cad.title')}</strong><button onClick={onClose}>{tr('cad.close')}</button></header><DragRow as="nav">{TABS.map(t=><button aria-pressed={tab===t} key={t} onClick={()=>setTab(t)}>{tr(TAB_KEYS[t])}</button>)}</DragRow><div className="cad-sheet-body">
 {tab==='本機字型'?<><p>{tr('cad.fonts.note')}</p><label>{tr('cad.fonts.import')}<input type="file" accept="*/*" multiple aria-label={tr('cad.fonts.import')} disabled={busy} onChange={async e=>{const list=Array.from(e.target.files??[]);setBusy(true);try{for(const f of list)await importCadFont(f);setFonts(await listCadFonts());setMessage(tr('cad.fonts.saved'));}catch(error){setMessage(String(error));}finally{setBusy(false);}}}/></label>{fonts.map(f=><div key={f.name}>{f.name} · {f.data.byteLength} bytes <button disabled={busy} onClick={async()=>{try{await removeCadFont(f.name);setFonts(await listCadFonts());}catch(e){setMessage(String(e));}}}>{tr('cad.fonts.remove',{name:f.name})}</button></div>)}<button disabled={busy} onClick={()=>void reload()}>{tr('cad.fonts.apply')}</button><p role="status">{message}</p></>:null}
 {tab==='圖層'?<>{report.layerStates?.length&&onLayerState?<div className="cad-layer-states"><button type="button" onClick={()=>setManagerOpen(true)}>{tr('cad.layers.states')}</button>{activeState?<span>{tr('cad.layers.stateLast',{name:activeState})}</span>:null}</div>:null}{managerOpen&&report.layerStates?.length&&onLayerState?<LayerStateManager states={report.layerStates} layers={report.layers} chosen={activeState} onClose={()=>setManagerOpen(false)} onRestore={n=>{setActiveState(n);setIsolated(null);onLayerState(n);refresh(c=>c+1);}}/>:null}<input aria-label={tr('cad.layers.search')} placeholder={tr('cad.layers.search')} value={query} onChange={e=>setQuery(e.target.value)}/>{isolated?<button onClick={()=>{for(const [n,v] of isolated)change(n,v);setIsolated(null);}}>{tr('cad.layers.unisolate')}</button>:null}<button onClick={()=>report.layers.forEach(l=>change(l.name,l.originalVisible))}>{tr('cad.layers.restore')}</button><button onClick={()=>report.layers.forEach(l=>change(l.name,true))}>{tr('cad.layers.allOn')}</button>{report.layers.filter(l=>l.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((l,i)=><div className="cad-layer" key={l.name}><input id={'cad-layer-'+i} type="checkbox" checked={l.visible} onChange={e=>change(l.name,e.target.checked)}/><button onClick={()=>{if(!isolated)setIsolated(new Map(report.layers.map(a=>[a.name,a.visible])));report.layers.forEach(a=>change(a.name,a.name===l.name));}}>{tr('cad.layers.isolate')}</button><label htmlFor={'cad-layer-'+i}><i style={{background:'#'+l.color.toString(16).padStart(6,'0')}}/>{l.name}</label></div>)}</>:null}
 {tab==='缺件警告'?<><p>{tr('cad.missing.note')}</p>{audit?<div aria-label={tr('cad.missing.auditLabel')}><p>{tr('cad.missing.version',{v:audit.fingerprint})}</p><p>{tr('cad.missing.thisRun',{state:audit.status==='complete'?tr('cad.missing.fresh'):tr('cad.missing.parsing'),cache:audit.reparseRequired?tr('cad.missing.reparse'):tr('cad.missing.noCache')})}</p><p style={{overflowWrap:'anywhere'}}>{tr('cad.missing.sha',{v:audit.sourceSHA256})}</p><p>{tr('cad.missing.source',{name:source.name,bytes:source.size})}</p><p>{tr('cad.missing.done',{time:audit.completedAt?new Date(audit.completedAt).toLocaleString(locale):tr('cad.missing.notDone')})}</p></div>:null}<button disabled={busy} onClick={()=>void reload()}>{tr('cad.missing.reparseBtn')}</button><p role="status">{message}</p><h3 className="cad-missing-title">{tr('cad.missing.title')}</h3>{split.missing.length?<ul className="cad-missing">{split.missing.map(w=><li key={w}>{w}</li>)}</ul>:<p>{tr('cad.missing.none')}</p>}<details className="cad-notes"><summary>{tr('cad.missing.notes',{N:split.notes.length+1})}</summary><ul>{split.notes.map(w=><li key={w}>{w}</li>)}<li>{tr('cad.missing.build',{ms:report.buildMs.toFixed(0),N:report.entityCount})}</li></ul></details></>:null}
 {tab==='外部參考'?<><p>{tr('cad.xref.intro',{folders:remembering?tr('cad.xref.introFolders'):''})}</p>{remembering?<div className="cad-xref"><button disabled={busy} onClick={()=>void rememberFolder()}>{tr('cad.xref.remember')}</button>{folders.length?<><p>{tr('cad.xref.remembered',{names:folders.join(tr('cad.listSep'))})}</p><button disabled={busy} onClick={async()=>{const n=await regrantFolders().catch(()=>0);setMessage(tr('cad.xref.regranted',{N:n}));}}>{tr('cad.xref.regrant')}</button>{folders.map(f=><button key={f} disabled={busy} onClick={async()=>{await forgetFolder(f);setFolders(await rememberedFolderNames());}}>{tr('cad.xref.forget',{name:f})}</button>)}</>:null}</div>:null}<label>{tr(phoneWeb?'cad.xref.pickMany':'cad.xref.pickFiles')}<input aria-label={tr(phoneWeb?'cad.xref.pickMany':'cad.xref.pickFiles')} type="file" accept="*/*" multiple disabled={busy} onChange={e=>{pickFiles(e.target.files);e.target.value='';}}/></label>{phoneWeb?null:Capacitor.isNativePlatform()?<button disabled={busy} onClick={()=>void directory()}>{tr('cad.xref.pickFolder')}</button>:isAppleMobile()?<p>{tr('cad.xref.noFolderIos')}</p>:<label>{tr('cad.xref.pickFolder')}<input aria-label={tr('cad.xref.pickFolder')} type="file" multiple {...({webkitdirectory:''} as object)} disabled={busy} onChange={e=>{pickFiles(e.target.files);e.target.value='';}}/></label>}{files.length?<div className="cad-xref-picked" aria-label={tr('cad.xref.picked',{N:files.length})}><div className="cad-xref-picked-head"><strong>{tr('cad.xref.picked',{N:files.length})}</strong><button disabled={busy} onClick={clearFiles}>{tr('cad.xref.clearPicked')}</button></div>{files.map((f,i)=><div className="cad-xref-file" key={(f.webkitRelativePath||f.name)+i}><span>{f.webkitRelativePath||f.name}<small>{(f.size/1048576).toFixed(1)} MB</small></span><button aria-label={tr('cad.xref.removePicked',{name:f.name})} disabled={busy} onClick={()=>removeFile(i)}>✕</button></div>)}<p className="cad-xref-hint">{tr('cad.xref.addMore')}</p></div>:null}
 {rows.map((x,i)=><div className="cad-xref" key={x.name+i}><strong>{x.name}</strong><p>{x.path} · {x.overlay?tr('cad.xref.overlay'):tr('cad.xref.attach')}</p><label><input type="checkbox" checked={!disabled.has(x.key)} onChange={e=>{const n=new Set(disabled);if(e.target.checked)n.delete(x.key);else n.add(x.key);setDisabled(n);}}/>{tr('cad.xref.load')}</label><select aria-label={tr('cad.xref.mapLabel',{name:x.name})} value={mapping[x.key]??''} onChange={e=>setMapping({...mapping,[x.key]:e.target.value})}><option value="">{tr('cad.xref.mapAuto')}</option>{files.map((f,j)=><option key={j} value={"@"+j}>{j+1} · {f.webkitRelativePath||f.name}</option>)}</select></div>)}
 <button disabled={busy} onClick={()=>void reload()}>{tr('cad.xref.reapply')}</button><p role="status">{message}</p><ul>{statuses.map((s,i)=><li key={i}>{tr('cad.statusLine',{path:s.path,status:s.status})}</li>)}</ul><p>{tr('cad.xref.note')}</p></>:null}
 </div></section>;
}
