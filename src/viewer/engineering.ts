import type { DrawingPoint } from './savedView';
import {widePolyline} from './widePolyline';
import {complexLinePrimitives} from './complexLineType';
import {Entity} from 'dxf-viewer/src/DxfScene.js';
import {dimensionBlockOffset} from './dimensionBlock';
import {installEntityBoxes} from './entityBoxes';
import {installFitSplines} from './fitSpline';
import {attdefAsText} from './attdefTag';
import type { SnapPoint, MeasurableEntity } from './measurementGeometry';
import {lineCurve,curvePerpendicular,conicIntersections,type SnapPrimitive} from './curveSnaps';
import type { CadLayerState } from "./layerStateTable";
export type CadLayer = { name:string; color:number; visible:boolean; originalVisible:boolean };
export type CadReport = { layers:CadLayer[]; /** named layer states saved in the drawing (圖層狀態管理員) */ layerStates?:CadLayerState[]; warnings:string[]; xrefs:{name:string;path:string;overlay:boolean;loaded?:boolean;disabled?:boolean;savedUnloaded?:boolean}[]; blockLayers?:string[]; entityCount:number; buildMs:number };
type Any = any;
export function resolveCadColor(e:Any,layers:Any,inheritedLayer='0',inheritedColor=0xffffff):number {
 if(Number.isInteger(e.trueColor))return e.trueColor;
 if(e.colorIndex===0)return inheritedColor;
 if(e.colorIndex!==undefined && e.colorIndex!==256 && e.color!==undefined)return e.color;
 const name=e.layer && e.layer!=='0'?e.layer:inheritedLayer;
 return layers[name]?.trueColor ?? layers[name]?.color ?? 0xffffff;
}
export function perpendicularSnap(p:DrawingPoint,a:DrawingPoint,b:DrawingPoint):SnapPoint|null {
 const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;if(!den)return null;
 const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/den;
 return t<0||t>1?null:{x:a.x+t*dx,y:a.y+t*dy,kind:'perpendicular'};
}
export function intersectionSnap(a:DrawingPoint,b:DrawingPoint,c:DrawingPoint,d:DrawingPoint):SnapPoint|null {
 const u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y},den=u.x*v.y-u.y*v.x;
 if(Math.abs(den)<=Number.EPSILON*Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)*8)return null;
 const x=c.x-a.x,y=c.y-a.y,t=(x*v.y-y*v.x)/den,s=(x*u.y-y*u.x)/den;
 return t<0||t>1||s<0||s>1?null:{x:a.x+t*u.x,y:a.y+t*u.y,kind:'intersection'};
}
/** Bounded local segment intersection search: never O(n²) over an entire drawing. */
export function advancedSnap(entities:MeasurableEntity[],target:DrawingPoint,tolerance:number,anchor?:DrawingPoint):SnapPoint|null {
 const candidates:SnapPrimitive[]=[];let best:SnapPoint|null=null,dist=tolerance;
 const offer=(p:SnapPoint|null)=>{if(p){const d=Math.hypot(p.x-target.x,p.y-target.y);if(d<=dist){dist=d;best=p;}}};
 for(const e of entities){const b=e.bounds;if(target.x<b.minX-tolerance||target.x>b.maxX+tolerance||target.y<b.minY-tolerance||target.y>b.maxY+tolerance)continue;
  const primitives=e.primitives??(!e.approximate&&!e.curved&&['LINE','LWPOLYLINE','POLYLINE'].includes(e.kind)?e.points.slice(1).map((b,i)=>({line:[e.points[i],b] as [DrawingPoint,DrawingPoint]})):[]);
  for(const p of primitives){if(anchor){if('line' in p)offer(perpendicularSnap(anchor,...p.line));else for(const q of curvePerpendicular(p.curve,anchor))offer({...q,kind:'perpendicular'});}if(candidates.length<96)candidates.push(p);}
 }
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];
  if('line' in a&&'line' in b)offer(intersectionSnap(...a.line,...b.line));
  else if('line' in a&&'curve' in b)for(const p of lineCurve(...a.line,b.curve))offer({...p,kind:'intersection'});
  else if('curve' in a&&'line' in b)for(const p of lineCurve(...b.line,a.curve))offer({...p,kind:'intersection'});
  else if('curve' in a&&'curve' in b)for(const p of conicIntersections(a.curve,b.curve))offer({...p,kind:'intersection'});
 }
 return best;
}
const DASH_LIMIT=200000;
// Segments one hatch may produce before it is drawn as its boundary only (see _DecomposeHatch below).
export const DENSE_HATCH_SEGMENTS=100000;
// Pattern segments a whole drawing may spend; past it only small hatches keep their pattern.
export const HATCH_BUDGET=6000000;
export const SMALL_HATCH_SEGMENTS=2000;
/** Signed DXF pattern, continuous phase across vertices; dots use a tiny visible segment. */
/** Old-style POLYLINE: a vertex width left out takes the polyline's default (40/41). The engine writes a zero width as
 * nothing, so an arrow drawn 20 → 0 came back with its end width missing and was filled as a 20-wide bar
 * (t2-16C客變 ST-MARKER arrows 1CA60…, tapered in ZWCAD). LWPOLYLINE has no defaults and is left as it is. */
export function polylineVertexWidths(e:Any):Any[]{
 if(e.type!=='POLYLINE'||(e.startWidth===undefined&&e.endWidth===undefined))return e.vertices;
 return (e.vertices??[]).map((v:Any)=>({...v,startWidth:v.startWidth??e.startWidth??0,endWidth:v.endWidth??e.endWidth??0}));
}
export function dashSegments(points:DrawingPoint[],pattern:number[],scale:number,closed:boolean):DrawingPoint[][] {
 const output:DrawingPoint[][]=[];const pat=pattern.map(n=>n*scale);
 const cycle=pat.reduce((s,n)=>s+Math.abs(n),0);if(!Number.isFinite(cycle)||cycle<1e-10||!pat.length)return points.slice(1).map((p,i)=>[points[i],p]);
 const path=closed?[...points,points[0]]:points;
 // A pattern far finer than the line (tiny LTSCALE) would mean hundreds of thousands of dashes;
 // CAD then shows the line as continuous, and so do we instead of refusing the drawing.
 const total=path.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
 const continuous=()=>path.slice(1).map((p,i)=>[path[i],p]);
 if(total/cycle*pat.length>DASH_LIMIT)return continuous();
 // Too short for one whole pattern: CAD draws it solid (碁創潭子 肆層弱電 9F8A: 35.3 long on HIDDENX2 × LTSCALE 50 = 37.5,
 // solid in ZWCAD; cutting it left only the first 25-long dash).
 if(total<cycle-1e-9)return continuous();
 let k=0,left=Math.abs(pat[0])||Math.max(cycle*0.001,1e-7);
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(!len)continue;let pos=0;
  while(pos<len-1e-10){if(output.length>=DASH_LIMIT)return continuous();const step=Math.min(left,len-pos);
   if(pat[k]>=0)output.push([{x:a.x+(b.x-a.x)*pos/len,y:a.y+(b.y-a.y)*pos/len},{x:a.x+(b.x-a.x)*(pos+step)/len,y:a.y+(b.y-a.y)*(pos+step)/len}]);
   pos+=step;left-=step;if(left<=1e-10){k=(k+1)%pat.length;left=Math.abs(pat[k])||Math.max(cycle*0.001,1e-7);}
  }
 }
 return output;
}
/** LibreDWG writes the shape bit (74=4) on plain dash segments with no shape (75=0, 340=0); only
 * elements carrying real text or a real shape+style make a line type complex. */
export function normalizeLineType(lt:Any):void{
 for(const el of lt.elements??[]){
  if((el.flags&2)&&!(typeof el.text==='string'&&el.text.length>0))el.flags&=~2;
  if((el.flags&4)&&!(el.shape>0&&el.styleHandle&&String(el.styleHandle)!=='0'))el.flags&=~4;
 }
 lt.complex=(lt.elements??[]).some((el:Any)=>el.flags&6);
}
export function prepareCad(dxf:Any):CadReport {
 const layers=dxf.tables?.layer?.layers??{};
 const report:CadReport={layers:Object.entries(layers).map(([name,l]:[string,Any])=>({name,color:l.trueColor??l.color??0xffffff,visible:l.visible!==false&&!l.frozen,originalVisible:l.visible!==false&&!l.frozen})),warnings:[],xrefs:[],entityCount:0,buildMs:0};
 const counts=new Map<string,number>(Object.entries(dxf.cadUnsupported??{}));
 const warn=(s:string)=>{if(!report.warnings.includes(s))report.warnings.push(s);};
 const overrides:Record<string,boolean>=dxf.cadLayerVisibility??{},blockLayers=new Set<string>();
 const layerShown=(name:string)=>overrides[name]??(layers[name]?layers[name].visible!==false&&!layers[name].frozen:true);
 for(const [name,lt] of Object.entries(dxf.tables?.lineType?.lineTypes??{}) as [string,Any][]){normalizeLineType(lt);if(lt.complex)warn('複合線型 '+name+' 的文字／形狀尚未繪製，僅顯示線段pattern');}
 for(const message of dxf.cadDiagnostics??[])warn(message);
 const supported=new Set(['LINE','LWPOLYLINE','POLYLINE','ARC','CIRCLE','ELLIPSE','POINT','SPLINE','INSERT','TEXT','MTEXT','3DFACE','SOLID','DIMENSION','ATTRIB','ATTDEF','HATCH']);
 const blocks=dxf.blocks??{},variants:Any={},memo=new Map<string,string>();
 // An xref block is loaded once it has content; ones turned off in the panel are not "missing".
 const offXrefs=new Set((dxf.cadXrefStatuses??[]).filter((x:Any)=>x.status==='已關閉').map((x:Any)=>x.name));
 // Only blocks flagged as external references (70 bit 4); LibreDWG also writes a path (group 1) for plain blocks.
 for(const block of Object.values(blocks) as Any[])if(block.xrefPath&&(block.type&4))report.xrefs.push({name:block.name,path:block.xrefPath,overlay:!!(block.type&8),loaded:(block.entities?.length??0)>0,disabled:offXrefs.has(block.name),...(block.cadXrefUnloaded?{savedUnloaded:true}:{})});
 const adapt=(e:Any,layer:string,color:number,lineType:string,stack:string[],inheritedWeight=0):Any=>{
  report.entityCount++;const out={...e};
  if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(e.type))warn('字型以內附 Latin／繁中字型替代；SHX／原字型字寬未保證相同');
  if(e.xdata?.FATCAT_XCLIP)warn('裁切物件僅提供完整可見物件的整體量測；跨界物件不回報隱藏段全長。反向／多層裁切仍需原CAD核對');
  out.cadOriginal={handle:e.handle,layer:e.layer??'0',colorIndex:e.colorIndex??256,trueColor:e.trueColor,lineType:e.lineType??'BYLAYER',text:e.text,rotation:e.rotation,textHeight:e.textHeight??e.height,lineweight:e.lineweight,styleName:e.styleName,widthFactor:e.xScale,radius:e.radius,pattern:e.patternName,dimensionType:e.dimensionType,block:e.block};
  out.layer=e.layer&&e.layer!=='0'?e.layer:layer;
  // Block content is drawn under its INSERT's layer, so an off/frozen layer of a nested entity must hide it here.
  // Uses the effective layer, so layer-0 content inheriting an off layer from its INSERT hides too.
  if(stack.length&&out.layer&&out.layer!=='0'){blockLayers.add(out.layer);if(!layerShown(out.layer))out.hidden=true;}out.trueColor=resolveCadColor(e,layers,layer,color);out.color=out.trueColor;
  const lt=String(e.lineType??'BYLAYER');out.lineType=lt.toUpperCase()==='BYLAYER'?layers[out.layer]?.lineType??'CONTINUOUS':lt.toUpperCase()==='BYBLOCK'?lineType:lt;
  if(!['CONTINUOUS','BYLAYER','BYBLOCK'].includes(out.lineType.toUpperCase())&&!dxf.tables?.lineType?.lineTypes?.[out.lineType])warn('缺少線型定義：'+out.lineType+'，暫以實線顯示');
  if(!supported.has(e.type))counts.set(e.type,(counts.get(e.type)??0)+1);
  if(e.vertices?.some((v:Any)=>v.startWidth||v.endWidth)||e.width){
   if(e.vertices?.some((v:Any)=>v.bulge))warn('弧段寬度按弧長漸變、徑向偏移；繪製每段不超過1度，弧線交接仍須原CAD核對');
   if((e.vertices?.length??0)>2&&e.vertices?.some((v:Any)=>v.bulge))warn('直段採偏移邊精確交點；曲線接角求實際偏移曲線交點，退化或超界採斜角，未宣稱所有CAD同形');
  }
  const weight=e.lineweight??-1;const layerWeight=layers[out.layer]?.lineweight??0;out.cadLineweight=weight===-2?inheritedWeight:weight===-1?layerWeight:weight; if(out.cadLineweight<0)out.cadLineweight=dxf.header?.$LWDEFAULT??25;
  if(e.type==='DIMENSION'&&!e.block)warn('部分尺寸標註由引擎重建；箭頭／樣式未逐件核對');
  if(e.type==='INSERT'&&e.name){const block=blocks[e.name];if(!block){warn('缺少圖塊：'+e.name);return out;}
   if(stack.includes(e.name)||stack.length>=24){warn('循環或過深圖塊已略過：'+e.name);out.hidden=true;return out;}
   const key=JSON.stringify([e.name,out.layer,out.trueColor,out.lineType,out.cadLineweight]);let name=memo.get(key);
   if(!name){if(memo.size>=20000)throw Error('圖塊繼承變體超過安全上限');name='__fatcat_'+memo.size;memo.set(key,name);variants[name]={...block,name,cadName:block.cadName??block.name,entities:(block.entities??[]).map((child:Any)=>adapt(child,out.layer,out.trueColor,out.lineType,[...stack,e.name],out.cadLineweight))};}
   out.name=name;
  }
  return out;
 };
 dxf.entities=(dxf.entities??[]).map((e:Any)=>adapt(attdefAsText(e),'0',0xffffff,'CONTINUOUS',[]));
 // Retain dimension anonymous blocks; insert variants avoid context-dependent shared mutation.
 dxf.blocks={...blocks,...variants};
 // ACIS bodies: the DWG parser (LibreDWG) yields no shape data for them, so say why instead of a generic gap.
 for(const [type,n] of counts)warn(['REGION','3DSOLID','BODY'].includes(type)?`未支援物件 ${type}：${n}（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）`:`未支援物件 ${type}：${n}`);
 // Only unloaded references are a gap; once loaded (or turned off, or saved unloaded as CAD keeps it) there is nothing to report.
 const unloadedXrefs=report.xrefs.filter(x=>!x.loaded&&!x.disabled&&!x.savedUnloaded).length;
 if(unloadedXrefs)warn(`外部參考 ${unloadedXrefs} 筆未載入：請在外參面板選檔套用`);
 for(const l of Object.values(layers) as Any[]){l.visible=true;l.frozen=false;}
 if(Object.values(dxf.tables?.style?.styles??{}).length)warn('字型以內附 Latin／繁中字型替代；SHX／原字型字寬未保證相同');
 report.blockLayers=[...blockLayers];
 return report;
}
export function installEngineeringScene(ctor:Any):void {
 const p=ctor.prototype,original=p.Build;
 installEntityBoxes(p);
 installFitSplines(p);
 // A spline whose knot vector does not fit its control points (seen in hatch boundaries of PARK 1F
 // 水電施工圖) used to abort the whole drawing. Retry with standard knots, else follow the control polygon.
 const interpolate=p._InterpolateSpline;
 p._InterpolateSpline=function(t:number,degree:number,points:number[][],knots?:number[]|null,weights?:number[]|null){
  try{return interpolate.call(this,t,degree,points,knots,weights);}catch{this.cadBadSplines=(this.cadBadSplines??0)+(t===0?1:0);}
  try{return interpolate.call(this,t,Math.min(Math.max(1,degree||1),points.length-1),points,null,null);}catch{/* fall through */}
  const n=points.length;if(!n)return [0,0];const x=Math.min(Math.max(t,0),1)*(n-1),i=Math.min(Math.floor(x),n-2),f=x-i;
  return n===1?points[0]:points[i].map((v,k)=>v+(points[i+1][k]-v)*f);
 };
 p._GetLineType=(e:Any)=>1000+Math.max(0,e.cadLineweight??0);
 // A pattern far too fine for its area (上晴 B區-2: AR-CONC at scale 0.1, about 400,000 to 840,000 segments per hatch,
 // repeated through nested xref and clipped blocks to over 100 million) kept the drawing worker past the load timeout.
 // A hatch past DENSE_HATCH_SEGMENTS is drawn as its boundary only, and once the drawing has spent HATCH_BUDGET
 // segments on patterns, any hatch past SMALL_HATCH_SEGMENTS is too. Copies of a block hold copies of a hatch with
 // the same handle, so once one is drawn as its boundary the others go straight to that.
 // A dimension's *D block goes at its group-12 point, as CAD places it (see dimensionBlock.ts).
 const decomposeDimension=p._DecomposeDimension;
 p._DecomposeDimension=function*(e:Any,ctx:Any){
  const at=dimensionBlockOffset(e);
  if((at.x||at.y)&&e.block!=null&&this.blocks?.has?.(e.block)){this._ProcessInsert({name:e.block,position:at,layer:e.layer,color:e.color,colorIndex:e.colorIndex},ctx);return;}
  yield* decomposeDimension.call(this,e,ctx);
 };
 const decomposeHatch=p._DecomposeHatch;
 p._DecomposeHatch=function*(e:Any,ctx:Any){
  const outlined:Set<string>=this.cadDenseHatches??=new Set();
  const key=e.handle?`${e.handle}|${e.patternName}|${e.patternScale}`:null;
  if(!key||!outlined.has(key)){
   const limit=(this.cadHatchSegments??0)<HATCH_BUDGET?DENSE_HATCH_SEGMENTS:SMALL_HATCH_SEGMENTS;
   const out:Any[]=[];let over=false;
   for(const x of decomposeHatch.call(this,e,ctx)){out.push(x);if(out.length>limit){over=true;break;}}
   if(!over){this.cadHatchSegments=(this.cadHatchSegments??0)+out.length;yield* out;return;}
   if(key)outlined.add(key);
  }
  this.cadDenseHatchCount=(this.cadDenseHatchCount??0)+1;
  const transform=this._GetEntityExtrusionTransform(e),layer=this._GetEntityLayer(e,ctx),color=this._GetEntityColor(e,ctx);
  for(const loop of this._GetHatchBoundaryLoops(e)){
   const v=(loop.vertices??[]).map((q:Any)=>transform?q.clone().applyMatrix3(transform):q);
   if(v.length<2)continue;
   const vertices:Any[]=[];for(let i=0;i<v.length;i++)vertices.push(v[i],v[(i+1)%v.length]);
   yield new Entity({type:Entity.Type.LINE_SEGMENTS,vertices,layer,color});
  }
 };
 p.Build=async function(dxf:Any,fonts:Any){const start=performance.now();const report=prepareCad(dxf);this.cadLineTypes=dxf.tables?.lineType?.lineTypes??{};this.cadComplexResults={rendered:0,missing:new Set(),used:new Set()};this.cadScale=Math.abs(dxf.header?.$LTSCALE??1);this.cadBadSplines=0;this.cadDenseHatchCount=0;this.cadDenseHatches=new Set();this.cadHatchSegments=0;this.cadBoxes=dxf.cadEntityBoxes?{}:null;await original.call(this,dxf,fonts);if(this.cadDenseHatchCount)report.warnings.push(`剖面線 ${this.cadDenseHatchCount} 個的圖樣過密或超過整張圖的繪製量，只畫外框`);if(this.cadBadSplines)report.warnings.push(`雲形線 ${this.cadBadSplines} 條的節點資料不完整，已改用近似形狀繪製`);if(this.cadFontResults?.rendered>0&&!this.cadFontResults.fallback)report.warnings=report.warnings.filter(w=>!w.startsWith('字型以內附'));// Only a complex line type that is drawn somewhere and still missing its text or shapes is a gap.
 report.warnings=report.warnings.filter(w=>{const m=/^複合線型 (.+) 的文字／形狀尚未繪製/.exec(w);return !m||(this.cadComplexResults.used.has(m[1])&&this.cadComplexResults.missing.has(m[1]));});if(this.hasMissingChars)report.warnings.push('部分文字缺字，請勿視為完整圖面');for(const w of this.cadSceneWarnings??[])if(!report.warnings.includes(w))report.warnings.push(w);report.buildMs=performance.now()-start;(report as Any).fontDiagnostics=this.cadFontDiagnostics??null;if(this.cadBoxes){(report as Any).entityBoxes=this.cadBoxes;this.cadBoxes=null;}dxf.cadReport=report;};
 // Load hidden layers; saved ON/OFF is applied to actual GPU layer objects after loading.
 p._FilterEntity=function(e:Any){return !e.hidden&&(!this.options.suppressPaperSpace||!e.inPaperSpace);};
 for(const method of ['_DecomposeLine','_DecomposePolyline','_DecomposeArc','_DecomposeCircle','_DecomposeEllipse']){
  const orig=p[method];p[method]=function*(e:Any,ctx:Any){
   // POLYLINE keeps its default width in 40/41 (startWidth/endWidth); LWPOLYLINE in 43 (width)
   const wide=method==='_DecomposePolyline'&&(e.width>0||e.startWidth>0||e.endWidth>0||e.vertices?.some((v:Any)=>v.startWidth>0||v.endWidth>0));
   if(wide&&!e.isPolyfaceMesh&&!e.includesCurveFitVertices&&!e.includesSplineFitVertices){
    const first=orig.call(this,e,ctx).next().value;if(!first)return;
    yield* complexLinePrimitives(this,e,first,ctx);
    const meshes=widePolyline(polylineVertexWidths(e),!!e.shape,e.width??e.startWidth??0,this.cadLineTypes[e.lineType]?.pattern??[],this.cadScale*Math.abs(e.lineTypeScale??1));
    for(const mesh of meshes){if(e.extrusionDirection?.z<0)mesh.vertices=mesh.vertices.map(v=>({x:-v.x,y:v.y}));yield Object.assign(Object.create(Object.getPrototypeOf(first)),first,{type:3,...mesh});}return;
   }
   for(const prim of orig.call(this,e,ctx)){
   if(prim.type!==1&&prim.type!==2){yield prim;continue;}
   yield* complexLinePrimitives(this,e,prim,ctx);
   const pattern=this.cadLineTypes[e.lineType]?.pattern??[];
   const width=e.width??e.startWidth??e.vertices?.[0]?.startWidth??0;
   const hasWidth=width>0||e.vertices?.some((v:Any)=>v.startWidth>0||v.endWidth>0);
   if(!pattern.length&&!hasWidth){yield prim;continue;}
   let segments:DrawingPoint[][];
   if(pattern.length)segments=dashSegments(prim.vertices,pattern,this.cadScale*Math.abs(e.lineTypeScale??1),!!prim.shape);
   else {const pts=prim.shape?[...prim.vertices,prim.vertices[0]]:prim.vertices;segments=pts.slice(1).map((b:DrawingPoint,i:number)=>[pts[i],b]);}
   if(hasWidth){
    const path:Any[]=prim.shape?[...prim.vertices,prim.vertices[0]]:prim.vertices;
    const mesh=(vertices:DrawingPoint[],indices:number[])=>Object.assign(Object.create(Object.getPrototypeOf(prim)),prim,{type:3,vertices,indices});
    const offset=(p:DrawingPoint,n:DrawingPoint,w:number,sign:number)=>({x:p.x+n.x*w*sign/2,y:p.y+n.y*w*sign/2});
    const edges=path.slice(1).map((b:Any,i:number)=>{const a=path[i],len=Math.hypot(b.x-a.x,b.y-a.y);return {a,b,len,n:{x:-(b.y-a.y)/len,y:(b.x-a.x)/len},wa:a.startWidth??width,wb:a.endWidth??a.startWidth??width};}).filter(q=>q.len>1e-12);
    let edgeIndex=0;
    for(const [a,b] of segments){const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
     const matches=(q:typeof edges[number])=>{const t=((middle.x-q.a.x)*(q.b.x-q.a.x)+(middle.y-q.a.y)*(q.b.y-q.a.y))/(q.len*q.len);return (b.x-a.x)*(q.b.x-q.a.x)+(b.y-a.y)*(q.b.y-q.a.y)>0&&t>=-1e-8&&t<=1+1e-8&&Math.abs((middle.x-q.a.x)*q.n.x+(middle.y-q.a.y)*q.n.y)<1e-7*q.len;};
     while(edgeIndex<edges.length&&!matches(edges[edgeIndex]))edgeIndex++;const edge=edges[edgeIndex];if(!edge)continue;
     if(Math.hypot(b.x-edge.b.x,b.y-edge.b.y)<1e-8)edgeIndex++;
     const at=(p:DrawingPoint)=>{const t=Math.max(0,Math.min(1,((p.x-edge.a.x)*(edge.b.x-edge.a.x)+(p.y-edge.a.y)*(edge.b.y-edge.a.y))/(edge.len*edge.len)));return Math.max(0,edge.wa+(edge.wb-edge.wa)*t);};
     const wa=at(a),wb=at(b);yield mesh([offset(a,edge.n,wa,1),offset(a,edge.n,wa,-1),offset(b,edge.n,wb,-1),offset(b,edge.n,wb,1)],[0,1,2,0,2,3]);
    }
    // Fill continuous corners with a bounded bevel (never unbounded acute miters).
    if(!pattern.length)for(let i=prim.shape?0:1;i<edges.length;i++){const prev=edges[(i+edges.length-1)%edges.length],next=edges[i];if(Math.hypot(prev.b.x-next.a.x,prev.b.y-next.a.y)>1e-8)continue;for(const sign of [-1,1])yield mesh([next.a,offset(next.a,prev.n,prev.wb,sign),offset(next.a,next.n,next.wa,sign)],[0,1,2]);}
   }
   else yield Object.assign(Object.create(Object.getPrototypeOf(prim)),prim,{type:1,vertices:segments.flat(),shape:false});
  }};
 }
}
