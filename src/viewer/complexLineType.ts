import {fontKey} from './shxText';
type Any=any;
// The standard ltypeshp shapes the stock complex line types use (FENCELINE1 → 133, FENCELINE2 → 132, TRACKS → 130,
// ZIGZAG → 131, BATTING → 134), drawn at size 1. The shape-file style is often dropped on the way to DXF (惠宇敦南 12F水電施工圖:
// 19 of 282 drawings with FENCELINE1 showed a plain dashed line), and the font file is not ours to ship.
const circle=Array.from({length:37},(_,i)=>({x:1-Math.cos(i*Math.PI/18),y:Math.sin(i*Math.PI/18)}));
export const LTYPESHP:Record<number,{x:number;y:number}[][]>={
 130:[[{x:0,y:1},{x:0,y:-1}]],
 131:[[{x:0,y:0},{x:1,y:1},{x:2,y:0}]],
 132:[[{x:0,y:0},{x:0,y:1},{x:2,y:1},{x:2,y:-1},{x:0,y:-1},{x:0,y:0}]],
 133:[circle],
 // BAT (BATTING insulation): a slanted foot each side of a half circle of radius 2 centred at (1,2)
 134:[[{x:0,y:0},...Array.from({length:19},(_,i)=>({x:1-2*Math.cos(i*Math.PI/18),y:2+2*Math.sin(i*Math.PI/18)})),{x:2,y:0}]],
};
const builtinShape=(style:Any,code:number,size:number)=>{
 const paths=LTYPESHP[code];if(!paths||(style&&!/ltypeshp/i.test(style.font??'')))return null;
 return {polylines:paths.map(p=>p.map(q=>({x:q.x*size,y:q.y*size})))};
};
/** Group 50 radians, offsets scale with LTSCALE not the glyph's S value. */
export function* complexLinePrimitives(scene:Any,e:Any,prim:Any,ctx:Any):Generator<Any>{
 const lt=scene.cadLineTypes?.[e.lineType];if(!lt?.elements?.some((v:Any)=>v.flags&6))return;
 const result=scene.cadComplexResults??={rendered:0,missing:new Set<string>(),used:new Set<string>()};result.used.add(e.lineType);
 const scale=scene.cadScale*Math.abs(e.lineTypeScale??1),cycle=lt.elements.reduce((s:number,v:Any)=>s+Math.abs(v.length)*scale,0);if(cycle<1e-10)return;
 const points=prim.shape?[...prim.vertices,prim.vertices[0]]:prim.vertices;if(points.length<2)return;
 const edges=points.slice(1).map((b:Any,i:number)=>({a:points[i],b,len:Math.hypot(b.x-points[i].x,b.y-points[i].y)})).filter((q:Any)=>q.len>0);
 const total=edges.reduce((s:number,q:Any)=>s+q.len,0);let edgeIndex=0,edgeStart=0,phase=0,steps=0;
 for(let base=0;base<total-1e-10;base+=cycle){phase=0;for(const el of lt.elements){phase+=Math.abs(el.length)*scale;const pos=base+phase;if(!(el.flags&6)||pos>total+1e-10)continue;if(++steps>100000)throw Error('複合線型文字/形狀超過安全上限');
  while(edgeIndex<edges.length-1&&pos>edgeStart+edges[edgeIndex].len){edgeStart+=edges[edgeIndex].len;edgeIndex++;}
  const q=edges[edgeIndex],t=(pos-edgeStart)/q.len,angle=Math.atan2(q.b.y-q.a.y,q.b.x-q.a.x),cos=Math.cos(angle),sin=Math.sin(angle);
  let rotation=(el.rotation??0)+((el.flags&1)?0:angle);if(el.flags&8&&Math.cos(rotation)<0)rotation+=Math.PI;
  const origin={x:q.a.x+(q.b.x-q.a.x)*t+scale*((el.x??0)*cos-(el.y??0)*sin),y:q.a.y+(q.b.y-q.a.y)*t+scale*((el.x??0)*sin+(el.y??0)*cos)};
  const style:Any=Object.values(scene.cadStyles??{}).find((s:Any)=>s.handle===el.styleHandle);
  if(el.flags&2){
   const text={...e,type:'TEXT',text:el.text??'',styleName:style?.styleName,textHeight:(style?.fixedTextHeight||1)*(el.scale??1)*scale,startPoint:origin,endPoint:undefined,halign:0,valign:0,rotation:rotation*180/Math.PI,lineType:'CONTINUOUS',xScale:style?.widthFactor??1,width:0};
   // Text drawn in a substitute font is drawn: the font note already says so (喬瓏 鑫元鴻 空調-2F: the "I" of
   // 新3-4IN排水管 in romans.shx was listed as 尚未繪製 among the missing items).
   let emitted=false;for(const p of scene._DecomposeText(text,ctx)){emitted=true;yield p;}if(emitted)result.rendered++;else result.missing.add(e.lineType);
  }else {const font=style&&scene.cadFonts?.get(fontKey(style.font??''));const nativeScale=font?.fontData.header.fontType==='shapes'&&!(0 in font.fontData.content.data)?1:font?.fontData.content.height;const shape=font?.getCharShape(el.shape,(el.scale??1)*scale*nativeScale)??builtinShape(style,el.shape,(el.scale??1)*scale);if(!shape){result.missing.add(e.lineType);continue;}
   const c=Math.cos(rotation),s=Math.sin(rotation);for(const path of shape.polylines){const vertices=path.map((p:Any)=>({x:origin.x+p.x*c-p.y*s,y:origin.y+p.x*s+p.y*c}));yield* scene._DecomposePolyline({...e,type:'LWPOLYLINE',vertices,width:0,lineType:'CONTINUOUS',shape:false},ctx);}result.rendered++;
  }
 }}
}
