import { BufferAttribute, BufferGeometry, InstancedBufferGeometry, LineSegments, Mesh, RawShaderMaterial, Vector2 } from 'three';
import type { DxfViewer } from 'dxf-viewer';
/** Screen-space triangle strokes: WebGL implementations may only support line width 1.
 * Keep original CAD geometry/pattern and apply hundredths-mm lineweight at 96 CSS dpi.
 * Clipping shaders and instance transforms remain intact. */
export function installScreenStrokes(viewer:DxfViewer):()=>void {
 const materials:RawShaderMaterial[]=[];
 const scene=viewer.GetScene();
 for(const object of [...scene.children]) {
  if(!(object instanceof LineSegments))continue;
  const source=object.geometry,position=source.getAttribute('position'),index=source.index;
  const count=index?.count??position.count, points:number[]=[], directions:number[]=[], sides:number[]=[];
  for(let i=0;i+1<count;i+=2){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1;
   const dx=position.getX(b)-position.getX(a),dy=position.getY(b)-position.getY(a);if(!dx&&!dy)continue;
   for(const [id,side] of [[a,-1],[b,-1],[b,1],[a,-1],[b,1],[a,1]]) {points.push(position.getX(id),position.getY(id));directions.push(dx,dy);sides.push(side);}
  }
  const geometry=source instanceof InstancedBufferGeometry?new InstancedBufferGeometry():new BufferGeometry();
  if(geometry instanceof InstancedBufferGeometry&&source instanceof InstancedBufferGeometry)geometry.instanceCount=source.instanceCount;
  for(const [key,value] of Object.entries(source.attributes))if(key!=='position')geometry.setAttribute(key,value as BufferAttribute);
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(points),2));
  geometry.setAttribute('cadDirection',new BufferAttribute(new Float32Array(directions),2));
  geometry.setAttribute('cadSide',new BufferAttribute(new Float32Array(sides),1));
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
  scene.remove(object);scene.add(mesh);source.dispose();
 }
 return ()=>materials.forEach(m=>m.dispose());
}
