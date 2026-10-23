import {BufferGeometry,Float32BufferAttribute,Mesh,ShaderMaterial,Texture,Vector2,Matrix3,DoubleSide,SRGBColorSpace} from 'three';
import {parseDxfXclip} from '../dwg/xclipMetadata';
type Any=any;
export async function rasterData(file:File):Promise<string>{
 if(file.size>32*1024*1024)throw Error('圖片超過32MB安全上限');
 const bytes=new Uint8Array(await file.arrayBuffer());let mime='';
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else throw Error('只支援實際PNG/JPEG內容');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+mime+';base64,'+btoa(binary);
}
async function decode(data:string):Promise<HTMLImageElement>{
 if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data))throw Error('拒絕非本機PNG/JPEG來源');
 const image=new Image();image.src=data;await image.decode();if(image.width*image.height>32*1024*1024)throw Error('圖片像素超過32M安全上限');return image;
}
export async function standaloneRaster(file:File):Promise<Any>{const data=await rasterData(file),image=await decode(data);return {header:{$INSUNITS:0},tables:{layer:{layers:{'0':{name:'0',color:0xffffff,visible:true}}}},blocks:{},cadLayouts:[{name:'Model',order:0}],entities:[{type:'IMAGE',handle:'standalone-image',layer:'0',cadSpace:'Model',position:{x:0,y:0},u:{x:1,y:0},v:{x:0,y:1},imageSize:{x:image.width,y:image.height},imagePath:file.name,imageData:data,display:9}]};}
export function rasterOutline(e:Any):Any {const w=e.imageSize.x,h=e.imageSize.y,p=e.position,u=e.u,v=e.v;return {type:'LWPOLYLINE',layer:e.layer,handle:e.handle,shape:true,vertices:[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>({x:p.x+x*u.x+y*v.x,y:p.y+x*u.y+y*v.y})),hidden:e.hidden};}
export type RasterInstance={entity:Any;matrix:Matrix3;clips:Vector2[][];layer:string};
export function collectRasters(doc:Any):RasterInstance[]{const result:RasterInstance[]=[];
 function visit(entities:Any[],matrix:Matrix3,clips:Vector2[][],stack:string[],layer='0'){
  for(const e of entities){if(e.hidden)continue;const l=e.layer&&e.layer!=='0'?e.layer:layer;
   if(e.type==='IMAGE'){if((e.display??1)&1)result.push({entity:e,matrix,clips,layer:l});continue;}
   if(e.type!=='INSERT'||stack.includes(e.name)||stack.length>=24)continue;const b=doc.blocks?.[e.name];if(!b)continue;
   const a=(e.rotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=e.xScale??1,sy=e.yScale??1,p=e.position??{x:0,y:0},o=b.position??{x:0,y:0};
   const t=new Matrix3().set(c*sx,-s*sy,p.x-c*sx*o.x+s*sy*o.y,s*sx,c*sy,p.y-s*sx*o.x-c*sy*o.y,0,0,1);const m=matrix.clone().multiply(t),clip=parseDxfXclip(e);let next=clips;
   if(clip){const poly=clip.length===2?[clip[0],{x:clip[1].x,y:clip[0].y},clip[1],{x:clip[0].x,y:clip[1].y}]:clip;next=[...clips,poly.map(p=>new Vector2(p.x,p.y).applyMatrix3(m))];}
   visit(b.entities??[],m,next,[...stack,e.name],l);
  }
 }visit(doc.entities??[],new Matrix3(),[],[]);return result;
}
/** IMAGE frames enter existing fit/layer geometry; pixels are local textures. */
export function replaceRasterEntities(doc:Any):void{const replace=(es:Any[])=>es.map(e=>e.type==='IMAGE'?rasterOutline(e):e);doc.entities=replace(doc.entities??[]);for(const b of Object.values(doc.blocks??{}) as Any[])b.entities=replace(b.entities??[]);}
export async function installRasters(viewer:Any,instances:RasterInstance[],warnings:string[]):Promise<{dispose:()=>void;showLayer:(name:string,visible:boolean)=>void;count:number}>{
 const meshes:Mesh[]=[];const origin=viewer.GetOrigin()??{x:0,y:0};
 for(const item of instances){const e=item.entity;try{
  if(e.imageError)throw Error(e.imageError);
  if(!e.imageData)throw Error('找不到附件；請在外部參考選檔／資料夾並套用');
  if(Math.abs(e.u.z??0)>1e-8||Math.abs(e.v.z??0)>1e-8)throw Error('非XY平面影像尚未支援');
  const image=await decode(e.imageData),texture=new Texture(image);texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
  const w=e.imageSize.x,h=e.imageSize.y;if(!(w>0&&h>0))throw Error('影像尺寸無效');
  let polygon:Any[]=e.clipping&&((e.display??7)&4)?e.clip??[]:[];
  if(polygon.length===2){const [a,b]=polygon;polygon=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];}
  if(polygon.length>64||item.clips.length>4||item.clips.some(p=>p.length>64))throw Error('裁切超過64點／4層上限，未顯示以免誤導');
  const corners=rasterOutline(e).vertices.map((p:Any)=>new Vector2(p.x,p.y).applyMatrix3(item.matrix));
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(corners.flatMap((p:Vector2)=>[p.x-origin.x,p.y-origin.y,0]),3));geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
  const groups=item.clips.length+1,stride=Math.max(1,polygon.length,...item.clips.map(p=>p.length));
  if(groups*stride>viewer.GetRenderer().capabilities.maxFragmentUniforms-20)throw Error('裁切超過此裝置GPU容量，未顯示以免誤導');
  const points=Array.from({length:groups*stride},()=>new Vector2());polygon.forEach((p,i)=>points[i].set((p.x+.5)/w,(p.y+.5)/h));item.clips.forEach((ps,k)=>ps.forEach((p,i)=>points[stride*(k+1)+i].set(p.x-origin.x,p.y-origin.y)));
  const material=new ShaderMaterial({side:DoubleSide,transparent:true,depthTest:false,depthWrite:false,uniforms:{image:{value:texture},polys:{value:points},counts:{value:[polygon.length,...item.clips.map(p=>p.length)]},inside:{value:e.clipInside===false?0:1},alphaEnabled:{value:((e.display??9)&8)?1:0},brightness:{value:(e.brightness??50)/50-1},contrast:{value:(e.contrast??50)/50},fade:{value:(e.fade??0)/100}},vertexShader:'varying vec2 tex; varying vec2 world; void main(){tex=uv;world=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`precision highp float;
 uniform sampler2D image;uniform vec2 polys[${groups*stride}];uniform int counts[${groups}];uniform int inside;uniform int alphaEnabled;uniform float brightness;uniform float contrast;uniform float fade;varying vec2 tex;varying vec2 world;
 bool contains(vec2 p,int k){bool hit=false;int n=counts[k];for(int i=0;i<${stride};i++){if(i>=n)break;int j=i==0?n-1:i-1;vec2 a=polys[k*${stride}+i],b=polys[k*${stride}+j];if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
 void main(){if(counts[0]>=3&&contains(tex,0)!=(inside==1))discard;for(int k=1;k<${groups};k++){if(counts[k]>=3&&!contains(world,k))discard;}vec4 col=texture2D(image,tex);col.rgb=clamp((col.rgb-.5)*contrast+.5+brightness,0.,1.);col.rgb=mix(col.rgb,vec3(1.),fade);if(alphaEnabled==0)col.a=1.;gl_FragColor=col;
 #include <colorspace_fragment>
 }`});
  const mesh=new Mesh(geometry,material);mesh.userData.cadLayer=item.layer;mesh.renderOrder=-10;viewer.GetScene().add(mesh);meshes.push(mesh);
 }catch(error){warnings.push(`圖片 ${e.imagePath||e.imageDef||e.handle}：${error instanceof Error?error.message:String(error)}`);}}
 return {count:meshes.length,showLayer:(name,v)=>meshes.filter(m=>m.userData.cadLayer===name).forEach(m=>m.visible=v),dispose:()=>meshes.forEach(m=>{viewer.GetScene().remove(m);m.geometry.dispose();const mat=m.material as ShaderMaterial;mat.uniforms.image.value.dispose();mat.dispose();})};
}
