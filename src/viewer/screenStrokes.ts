import { BufferAttribute, BufferGeometry, InstancedBufferGeometry, LineSegments, Mesh, RawShaderMaterial, Vector2 } from 'three';
import type { DxfViewer } from 'dxf-viewer';
/** The six corners of a segment's two triangles: [at the end point, side]. */
const STROKE_CORNERS:[boolean,number][]=[[false,-1],[true,-1],[true,1],[false,-1],[true,1],[false,1]];
/** Screen-space triangle strokes: WebGL implementations may only support line width 1.
 * Keep original CAD geometry/pattern and apply hundredths-mm lineweight at 96 CSS dpi.
 * Clipping shaders and instance transforms remain intact. */
export function installScreenStrokes(viewer:DxfViewer):()=>void {
 const materials:RawShaderMaterial[]=[];
 const scene=viewer.GetScene();
 for(const object of [...scene.children]) {
  if(!(object instanceof LineSegments))continue;
  const source=object.geometry,position=source.getAttribute('position'),index=source.index;
  // Filled straight into typed arrays: number[] (8 bytes a value, grown by doubling) plus the copy needed several
  // times the memory (上晴 公設B區-2 算圖: "Array buffer allocation failed" here).
  const count=index?.count??position.count, segments=count>>1;
  const points=new Float32Array(segments*12), directions=new Float32Array(segments*12), sides=new Float32Array(segments*6);
  let n=0;
  for(let i=0;i+1<count;i+=2){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1;
   const ax=position.getX(a),ay=position.getY(a),bx=position.getX(b),by=position.getY(b),dx=bx-ax,dy=by-ay;if(!dx&&!dy)continue;
   for(const [end,side] of STROKE_CORNERS){points[n*2]=end?bx:ax;points[n*2+1]=end?by:ay;directions[n*2]=dx;directions[n*2+1]=dy;sides[n]=side;n++;}
  }
  const geometry=source instanceof InstancedBufferGeometry?new InstancedBufferGeometry():new BufferGeometry();
  if(geometry instanceof InstancedBufferGeometry&&source instanceof InstancedBufferGeometry)geometry.instanceCount=source.instanceCount;
  for(const [key,value] of Object.entries(source.attributes))if(key!=='position')geometry.setAttribute(key,value as BufferAttribute);
  geometry.setAttribute('position',new BufferAttribute(points.subarray(0,n*2),2));
  geometry.setAttribute('cadDirection',new BufferAttribute(directions.subarray(0,n*2),2));
  geometry.setAttribute('cadSide',new BufferAttribute(sides.subarray(0,n),1));
  const material=(object.material as RawShaderMaterial).clone();materials.push(material);
  const instanced=material.vertexShader.includes('in vec3 instanceTransform0;');
  material.uniforms.cadViewport={value:new Vector2()};
  material.uniforms.cadWidth={value:Math.max(1,(object.userData.cadLineweight??0)/100*96/25.4)};
  material.vertexShader=material.vertexShader.replace('void main() {','in vec2 cadDirection;\nin float cadSide;\nuniform vec2 cadViewport;\nuniform float cadWidth;\nvoid main() {');
  const needle='gl_Position = projectionMatrix * modelViewMatrix * pos;';
  if(!material.vertexShader.includes(needle))throw new Error('CAD線寬shader版本不符');
  material.vertexShader=material.vertexShader.replace(needle,`${needle}\nvec2 cd = cadDirection;\n${instanced?'cd = mat2(instanceTransform0[0],instanceTransform1[0],instanceTransform0[1],instanceTransform1[1])*cd;':''}\nvec2 screenDir = vec2(cd.x * projectionMatrix[0][0],cd.y * projectionMatrix[1][1])*cadViewport;\nvec2 normal = normalize(vec2(-screenDir.y,screenDir.x));\ngl_Position.xy += normal * cadSide * cadWidth / cadViewport * gl_Position.w;`);
  const mesh=new Mesh(geometry,material);mesh.visible=object.visible;mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.matrix.copy(object.matrix);mesh.userData={...object.userData,cadScreenStroke:true};
  // Off-screen output (regionRender) sets fatcatRenderSize to the tile being drawn.
  mesh.onBeforeRender=()=>{const off=(viewer as unknown as {fatcatRenderSize?:{width:number;height:number}|null}).fatcatRenderSize;if(off){material.uniforms.cadViewport.value.set(off.width,off.height);return;}const c=viewer.GetCanvas();material.uniforms.cadViewport.value.set(c.clientWidth||c.width,c.clientHeight||c.height);};
  const layer=(object as unknown as {_dxfViewerLayer?:{objects:unknown[]}})._dxfViewerLayer;
  if(layer){const at=layer.objects.indexOf(object);if(at>=0)layer.objects[at]=mesh;}
  // Free only the old line vertices: the other attributes now belong to the stroke mesh too, and an instanced batch's
  // transforms are shared with its triangle mesh. Disposing them deleted that GPU buffer under the fills' vertex array
  // ("drawElementsInstanced: no buffer is bound to enabled attribute"; 鑫元鴻 電信-2F: 7 fill batches not drawn).
  for(const key of Object.keys(source.attributes))if(key!=='position')source.deleteAttribute(key);
  scene.remove(object);scene.add(mesh);source.dispose();
 }
 return ()=>materials.forEach(m=>m.dispose());
}
