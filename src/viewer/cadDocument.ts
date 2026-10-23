// Preserve metadata omitted by the pinned dxf-viewer parser. Never fetch paths.
import { multileaderEntities } from './multileader';
import { leaderEntities, type LeaderStyle } from './leader';
import { applyWipeouts, wipeoutPolygon } from './wipeout';
import { mlineEntities, mlineStyleFromTags, type MlineStyle } from './mline';
import { applyLayoutFields, fieldTemplate } from './cadFields';
import colorTable from 'dxf-viewer/src/parser/AutoCadColorIndex';
type Any=any;
type Tag=[number,string];
type RecordDxf={type:string;section:string;block:string;tags:Tag[]};
export type CadLayout={name:string;order:number;owner?:string};
function records(source:string):RecordDxf[]{
 const lines=source.split(/\r\n|\n|\r/),out:RecordDxf[]=[];let current:RecordDxf|undefined,section='',block='';
 for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim()),value=lines[i+1].trim();
  if(code===0){if(value==='ENDBLK')block='';current={type:value,section,block,tags:[]};out.push(current);}
  if(!current)continue;current.tags.push([code,value]);
  if(current.type==='SECTION'&&code===2){section=value;current.section=value;}
  if(current.type==='BLOCK'&&code===2){block=value;current.block=value;}
 }return out;
}
const text=(r:RecordDxf,c:number,f='')=>r.tags.find(t=>t[0]===c)?.[1]??f;
const num=(r:RecordDxf,c:number,f=0)=>Number(text(r,c,String(f)));
const point=(r:RecordDxf,c:number)=>({x:num(r,c),y:num(r,c+10),z:num(r,c+20)});
/** Style fields shared by generated entities (colour, true colour, line type, lineweight). */
const styleOf=(r:RecordDxf)=>{const ci=num(r,62,256),tc=r.tags.find(t=>t[0]===420);return {colorIndex:ci,...(tc?{trueColor:Number(tc[1])&0xffffff}:ci>=1&&ci<=255?{color:colorTable[ci]}:{}),...(text(r,6)?{lineType:text(r,6)}:{}),...(r.tags.some(t=>t[0]===370)?{lineweight:num(r,370)}:{})};};
function simpleEntity(r:RecordDxf,handle:string,doc:Any):Any|null{
 const base={handle,layer:text(r,8,'0'),hidden:num(r,60)===1,...styleOf(r)};
 if(r.type==='TRACE')return {...base,type:'SOLID',points:[point(r,10),point(r,11),point(r,12),point(r,13)]};
 if(r.type==='ACAD_TABLE'){const name=text(r,2);return name&&doc.blocks?.[name]?{...base,type:'INSERT',name,position:point(r,10),xScale:1,yScale:1,zScale:1,rotation:0}:null;}
 // Construction lines have no end; draw them well past the drawing's saved extents.
 const lo=doc.header?.$EXTMIN,hi=doc.header?.$EXTMAX,span=lo&&hi?Math.hypot(hi.x-lo.x,hi.y-lo.y):0,far=Number.isFinite(span)&&span>0&&span<1e12?span*4:1e6;
 const p=point(r,10),d=point(r,11),len=Math.hypot(d.x,d.y);if(!(len>0))return null;
 const ux=d.x/len,uy=d.y/len,from=r.type==='RAY'?p:{x:p.x-ux*far,y:p.y-uy*far,z:0};
 return {...base,type:'LINE',vertices:[{x:from.x,y:from.y,z:0},{x:p.x+ux*far,y:p.y+uy*far,z:0}]};
}
/** Closed polygon of a viewport clip object (polyline with arcs, circle, ellipse); null if unsupported. */
export function clipBoundary(e:Any):{x:number;y:number}[]|null{
 const ring=(n:number,at:(t:number)=>{x:number;y:number})=>Array.from({length:n},(_,i)=>at(2*Math.PI*i/n));
 if(e.type==='CIRCLE'&&e.radius>0)return ring(48,t=>({x:e.center.x+e.radius*Math.cos(t),y:e.center.y+e.radius*Math.sin(t)}));
 if(e.type==='ELLIPSE'&&e.majorAxisEndPoint&&e.axisRatio>0){const m=e.majorAxisEndPoint,r=e.axisRatio;return ring(48,t=>({x:e.center.x+m.x*Math.cos(t)-r*m.y*Math.sin(t),y:e.center.y+m.y*Math.cos(t)+r*m.x*Math.sin(t)}));}
 if(e.type!=='LWPOLYLINE'&&e.type!=='POLYLINE')return null;
 const vs:Any[]=(e.vertices??[]).filter((p:Any)=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(vs.length<3&&!(vs.length===2&&vs.some((p:Any)=>p.bulge)))return null;
 const out:{x:number;y:number}[]=[];
 vs.forEach((p:Any,i:number)=>{out.push({x:p.x,y:p.y});const q=vs[(i+1)%vs.length],b=p.bulge??0;if(!b)return;
  // Bulge = tan(sweep/4); subdivide the arc so the clip follows the curve.
  const sweep=4*Math.atan(b),chord=Math.hypot(q.x-p.x,q.y-p.y);if(!(chord>0))return;
  // Center lies on the chord's left normal at signed distance chord*(1-b²)/(4b); radius chord*(1+b²)/(4|b|).
  const s=chord*(1-b*b)/(4*b),r=chord*(1+b*b)/(4*Math.abs(b)),cx=(p.x+q.x)/2-s*(q.y-p.y)/chord,cy=(p.y+q.y)/2+s*(q.x-p.x)/chord;
  const a0=Math.atan2(p.y-cy,p.x-cx),n=Math.max(2,Math.ceil(Math.abs(sweep)/(Math.PI/16)));for(let k=1;k<n;k++){const a=a0+sweep*k/n;out.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});}
 });
 return out.length<=256?out:null;
}
export function selectCadSpace(source:Any,name:string):Any {
 const doc=structuredClone(source);doc.blocks??={};doc.cadDiagnostics??=[];doc.cadActiveSpace=name;
 const belongs=(e:Any)=>(e.cadSpace??(e.inPaperSpace?'圖紙（未命名）':'Model'))===name;
 const model=(doc.entities??[]).filter((e:Any)=>!e.inPaperSpace&&(!e.cadSpace||e.cadSpace==='Model')&&e.type!=='VIEWPORT');
 const selected=(doc.entities??[]).filter(belongs);doc.entities=selected.filter((e:Any)=>e.type!=='VIEWPORT').map((e:Any)=>({...e,inPaperSpace:false}));
 // Layout-name fields follow the layout shown, as CAD re-evaluates them.
 const fillFields=()=>{applyLayoutFields(doc.entities??[],name);for(const b of Object.values(doc.blocks??{}) as Any[])applyLayoutFields(b.entities??[],name);};
 if(name==='Model'){fillFields();return doc;}
 // Paper coordinates are measured in paper units, not the model's INSUNITS.
 doc.header={...doc.header,$INSUNITS:0};
 for(const v of selected.filter((e:Any)=>e.type==='VIEWPORT'&&!(e.flags&131072)&&((e.id>1&&e.status!==0)||(e.id===0&&e.cadPaperViewportIndex>0)))){
  const warn=(why:string)=>doc.cadDiagnostics.push(`配置 ${name} 視埠 ${v.handle} 未顯示：${why}`);
  // Object-clipped viewport: use the boundary entity (paper coordinates) as the clip polygon.
  let boundary:{x:number;y:number}[]|null=null;
  if((v.clipHandle&&v.clipHandle!=='0')||(v.flags&65536)){
   const owner=(source.entities??[]).find((e:Any)=>e.handle&&e.handle===v.clipHandle);
   boundary=owner?clipBoundary(owner):null;
   if(!boundary){warn(owner?`裁切邊界 ${owner.type} 尚未支援`:'找不到裁切邊界物件');continue;}
  }
  if((v.flags&1)||Math.abs(v.direction?.x??0)>1e-9||Math.abs(v.direction?.y??0)>1e-9||(v.direction?.z??1)<=0){warn('透視／非俯視投影尚未支援');continue;}
  if(!(v.width>0&&v.height>0&&v.viewHeight>0)){warn('比例或尺寸無效');continue;}
  const scale=v.height/v.viewHeight,a=-v.twist*Math.PI/180,c=Math.cos(a),s=Math.sin(a),target=v.target??{x:0,y:0},center=v.viewCenter;
  // DCS center is already in the twisted view coordinate system.

  const offset={x:v.position.x-scale*(c*target.x-s*target.y+center.x),y:v.position.y-scale*(s*target.x+c*target.y+center.y),z:0};
  const inverse=(x:number,y:number)=>({x:target.x+c*(x/scale+center.x)+s*(y/scale+center.y),y:target.y-s*(x/scale+center.x)+c*(y/scale+center.y)});
  const clip=boundary?boundary.map(p=>inverse(p.x-v.position.x,p.y-v.position.y)):[inverse(-v.width/2,-v.height/2),inverse(v.width/2,-v.height/2),inverse(v.width/2,v.height/2),inverse(-v.width/2,v.height/2)];
  const frozen=new Set(Object.entries(doc.tables?.layer?.layers??{}).filter(([,l]:[string,Any])=>(v.frozen??[]).includes(l.handle)).map(([n])=>n));
  const block='__FATCAT_VIEWPORT_'+v.handle;doc.blocks[block]={name:block,position:{x:0,y:0,z:0},entities:model.filter((e:Any)=>!frozen.has(e.layer))};
  doc.entities.push({type:'INSERT',name:block,handle:'viewport-'+v.handle,layer:v.layer,position:offset,xScale:scale,yScale:scale,zScale:1,rotation:-v.twist,xdata:{FATCAT_XCLIP:{values:[{code:1000,value:clip.map(p=>p.x+','+p.y).join(';')}]}}});
 }
 fillFields();
 return doc;
}
export function preserveCadMetadata(doc:Any,source:string):Any{
 if(source.startsWith('FATCAT-DXF-JSON\n'))return doc;
 const rows=records(source),layouts:CadLayout[]=[{name:'Model',order:0}],defs=new Map<string,string>();
 for(const r of rows){if(r.type==='IMAGEDEF')defs.set(text(r,5),text(r,1));if(r.type==='LAYOUT'){
  const start=r.tags.findIndex(t=>t[0]===100&&t[1]==='AcDbLayout');const rr={...r,tags:start<0?r.tags:r.tags.slice(start)};
  const name=text(rr,1);if(name&&name.toLowerCase()!=='model')layouts.push({name,order:num(rr,71),owner:text(rr,330)});
 }}
 const ownerSpace=new Map(layouts.filter(l=>l.owner).map(l=>[l.owner,l.name]));
 for(const r of rows.filter(r=>r.type==='BLOCK_RECORD')){const name=text(r,2);if(name.toLowerCase()==='*model_space')ownerSpace.set(text(r,5),'Model');}
 const byHandle=new Map<string,Any>();for(const e of [...(doc.entities??[]),...Object.values(doc.blocks??{}).flatMap((b:Any)=>b.entities??[])])if(e.handle)byHandle.set(String(e.handle),e);
 const paperViewportCounts=new Map<string,number>();
 // Arrow inputs the pinned parser drops: DIMLDRBLK handles and block-record names.
 // AutoCAD 2010+ (AC1024 and later) DWGs: LibreDWG's LEADER arrowhead flag disagrees with ZWCAD.
 const newDwg=/^AC10(2[4-9]|3\d)$/.test(String(doc.header?.$ACADVER??''));
 const recordsByHandle=new Map(rows.filter(r=>r.tags.some(t=>t[0]===5)).map(r=>[text(r,5),r]));
 const mlineStyles=new Map<string,MlineStyle>();for(const r of rows.filter(r=>r.type==='MLINESTYLE')){const st=mlineStyleFromTags(r.tags);mlineStyles.set(text(r,5),st);mlineStyles.set(text(r,2),st);}
 const blockNames=new Map<string,string>(rows.filter(r=>r.type==='BLOCK_RECORD').map(r=>[text(r,5),text(r,2)]));
 const dimStyles=new Map<string,LeaderStyle>(rows.filter(r=>r.type==='DIMSTYLE').map(r=>[text(r,2),{asz:r.tags.some(t=>t[0]===41)?num(r,41):undefined,scale:r.tags.some(t=>t[0]===40)?num(r,40):undefined,arrowBlock:blockNames.get(text(r,341))}]));
 const styleNames=new Map<string,string>(Object.values(doc.tables?.style?.styles??{}).filter((st:Any)=>st?.handle).map((st:Any)=>[String(st.handle),st.styleName??st.name]));
 const queues=new Map<string,Any[]>(),indices=new Map<string,number>();for(const [block,entities] of [['',doc.entities??[]],...Object.entries(doc.blocks??{}).map(([name,b]:[string,Any])=>[name,b.entities??[]])] as [string,Any[]][]){for(const e of entities){const key=block+'|'+e.type;if(!queues.has(key))queues.set(key,[]);queues.get(key)!.push(e);}}
 for(const r of rows){if(!['ENTITIES','BLOCKS'].includes(r.section)||['BLOCK','ENDBLK','SECTION','ENDSEC','SEQEND','VERTEX'].includes(r.type))continue;
  const handle=text(r,5),owner=text(r,330);let space=text(r,410)||ownerSpace.get(owner)||(num(r,67)?'圖紙（未命名）':'Model');
  if(r.block&&r.block.toLowerCase().startsWith('*paper_space'))space=ownerSpace.get(owner)||space;
  if(space!=='Model'&&!layouts.some(l=>l.name===space))layouts.push({name:space,order:layouts.length});
  const queueKey=r.block+'|'+r.type,index=indices.get(queueKey)??0,queued=queues.get(queueKey)?.[index];indices.set(queueKey,index+1);let e=handle?byHandle.get(handle):queued;
  if(e&&['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(r.type)&&r.tags.some(t=>t[0]===360)){const t=fieldTemplate(r,recordsByHandle);if(t)e.cadFieldTemplate=t;}
  if(r.type==='MLINE'){
   const ci=num(r,62,256),made=mlineEntities(r.tags,{handle,layer:text(r,8,'0'),color:ci===256?{}:ci===0?{colorIndex:0}:{colorIndex:ci,color:colorTable[ci]},style:mlineStyles.get(text(r,340))??mlineStyles.get(text(r,2)),elementByBlockUnreliable:newDwg});
   for(const m of made.entities){m.cadSpace=space;m.inPaperSpace=space!=='Model';(r.block&&doc.blocks?.[r.block]?doc.blocks[r.block].entities:(doc.entities??=[])).push(m);}
   (doc.cadDiagnostics??=[]).push(...made.notes);continue;
  }
  if(r.type==='LEADER'){
   const made=leaderEntities(r.tags,{handle,layer:text(r,8,'0'),style:dimStyles.get(text(r,3)),blockName:h=>blockNames.get(h),arrowFlagUnreliable:newDwg});
   for(const m of made.entities){m.cadSpace=space;m.inPaperSpace=space!=='Model';(r.block&&doc.blocks?.[r.block]?doc.blocks[r.block].entities:(doc.entities??=[])).push(m);}
   (doc.cadDiagnostics??=[]).push(...made.notes);continue;
  }
  if(r.type==='MULTILEADER'){
   // Leader lines, arrowheads and MTEXT replace the unsupported entity in its own space/block.
   const made=multileaderEntities(r.tags,{handle,layer:text(r,8,'0'),styleName:h=>styleNames.get(h)});
   for(const m of made.entities){m.cadSpace=space;m.inPaperSpace=space!=='Model';(r.block&&doc.blocks?.[r.block]?doc.blocks[r.block].entities:(doc.entities??=[])).push(m);}
   (doc.cadDiagnostics??=[]).push(...made.notes);continue;
  }
  if(r.type==='WIPEOUT'){
   // Masks earlier geometry inside its boundary; resolved geometrically after all entities are read.
   const ci=num(r,62,256),xs=r.tags.filter(t=>t[0]===14).map(t=>Number(t[1])),ys=r.tags.filter(t=>t[0]===24).map(t=>Number(t[1]));
   e={type:'WIPEOUT',handle,layer:text(r,8,'0'),hidden:num(r,60)===1,colorIndex:ci,color:ci>=1&&ci<=255?colorTable[ci]:undefined,polygon:wipeoutPolygon({position:point(r,10),u:point(r,11),v:point(r,12),clip:xs.map((x,i)=>({x,y:ys[i]}))})};
   if(r.block&&doc.blocks?.[r.block])doc.blocks[r.block].entities.push(e);else(doc.entities??=[]).push(e);
  }
  if(r.type==='TRACE'||r.type==='XLINE'||r.type==='RAY'||r.type==='ACAD_TABLE'){
   // TRACE is a filled quadrilateral like SOLID; XLINE / RAY are drawn across the drawing's extents;
   // ACAD_TABLE is shown through the block CAD stores with the table's drawn cells.
   const made=simpleEntity(r,handle,doc);
   if(made){e=made;if(r.block&&doc.blocks?.[r.block])doc.blocks[r.block].entities.push(e);else(doc.entities??=[]).push(e);}
  }
  if(r.type==='OLE2FRAME'){
   // Embedded picture: 10=upper-left, 11=lower-right, 310=OLE bytes; decoded later by resolveOleImages.
   e={type:'IMAGE',handle,layer:text(r,8,'0'),hidden:num(r,60)===1,display:1,imagePath:'內嵌物件 '+handle,imageDef:'',cadOleImage:true,position:point(r,10),u:{x:1,y:0,z:0},v:{x:0,y:1,z:0},imageSize:{x:0,y:0},cadOle:{hex:r.tags.filter(t=>t[0]===310).map(t=>t[1]),corner1:point(r,10),corner2:point(r,11)}};
   if(r.block&&doc.blocks?.[r.block])doc.blocks[r.block].entities.push(e);else(doc.entities??=[]).push(e);
  }
  if(['IMAGE','VIEWPORT'].includes(r.type)){
   e={type:r.type,handle,layer:text(r,8,'0'),position:point(r,10),hidden:num(r,60)===1};
   if(r.type==='IMAGE'){
    const xs=r.tags.filter(t=>t[0]===14).map(t=>Number(t[1])),ys=r.tags.filter(t=>t[0]===24).map(t=>Number(t[1]));
    Object.assign(e,{imagePath:defs.get(text(r,340))??'',imageDef:text(r,340),u:point(r,11),v:point(r,12),imageSize:{x:num(r,13),y:num(r,23)},display:num(r,70,3),clipping:num(r,280)===1,clipType:num(r,71,1),clip:xs.map((x,i)=>({x,y:ys[i]})),clipInside:num(r,290,1)!==0,brightness:num(r,281,50),contrast:num(r,282,50),fade:num(r,283)});
   }else {Object.assign(e,{id:num(r,69),status:num(r,68),width:num(r,40),height:num(r,41),viewCenter:point(r,12),direction:point(r,16),target:point(r,17),viewHeight:num(r,45),twist:num(r,51),flags:num(r,90),clipHandle:text(r,340),frozen:r.tags.filter(t=>t[0]===331).map(t=>t[1])});if(/^\*paper_space/i.test(r.block)){e.cadPaperViewportIndex=paperViewportCounts.get(r.block)??0;paperViewportCounts.set(r.block,e.cadPaperViewportIndex+1);}}
   if(r.block&&doc.blocks?.[r.block])doc.blocks[r.block].entities.push(e);else(doc.entities??=[]).push(e);
  }
  if(e){e.cadSpace=space;e.inPaperSpace=space!=='Model';}
 }
 // Inactive paper layouts can live in *Paper_SpaceN BLOCKS, not ENTITIES.
 const known=new Set((doc.entities??[]).map((e:Any)=>e.handle));
 for(const [name,b] of Object.entries(doc.blocks??{}) as [string,Any][]){if(!/^\*paper_space/i.test(name))continue;for(const e of b.entities??[])if(!e.handle||!known.has(e.handle)){doc.entities.push(e);known.add(e.handle);}}
 // Draw order: SORTENTSTABLE sort handle, else the entity's own handle (generated parts share their source's).
 const sortKeys=new Map<string,number>();for(const r of rows.filter(r=>r.type==='SORTENTSTABLE')){let ent='';for(const [c,v] of r.tags){if(c===331)ent=v;else if(c===5&&ent){sortKeys.set(ent,parseInt(v,16));ent='';}}}
 const order=(e:Any)=>sortKeys.get(String(e.handle))??(parseInt(String(e.handle??'0'),16)||0);
 const vars=rows.find(r=>r.type==='WIPEOUTVARIABLES'),showFrame=vars?num(vars,70,1)!==0:true,skipped=new Map<string,number>();
 if([...(doc.entities??[]),...Object.values(doc.blocks??{}).flatMap((b:Any)=>b.entities??[])].some((e:Any)=>e.type==='WIPEOUT')){
  doc.entities=applyWipeouts(doc.entities??[],order,showFrame,skipped);
  for(const b of Object.values(doc.blocks??{}) as Any[])if(b.entities?.some((e:Any)=>e.type==='WIPEOUT'))b.entities=applyWipeouts(b.entities,order,showFrame,skipped);
  for(const [type,n] of skipped)(doc.cadDiagnostics??=[]).push(`遮罩下方可能有 ${type} ${n} 個未遮蔽（目前只遮直線與聚合線）`);
 }
 doc.cadLayouts=layouts.sort((a,b)=>a.order-b.order);if(doc.cadUnsupported){delete doc.cadUnsupported.IMAGE;delete doc.cadUnsupported.VIEWPORT;delete doc.cadUnsupported.OLE2FRAME;delete doc.cadUnsupported.MULTILEADER;delete doc.cadUnsupported.LEADER;delete doc.cadUnsupported.WIPEOUT;delete doc.cadUnsupported.MLINE;delete doc.cadUnsupported.SEQEND;delete doc.cadUnsupported.TRACE;delete doc.cadUnsupported.XLINE;delete doc.cadUnsupported.RAY;if(rows.filter(r=>r.type==='ACAD_TABLE').every(r=>doc.blocks?.[text(r,2)]))delete doc.cadUnsupported.ACAD_TABLE;/* end-of-sequence marker, not a drawable object */}return doc;
}
