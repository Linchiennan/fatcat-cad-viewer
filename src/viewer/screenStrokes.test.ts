import {it,expect} from 'vitest';
import {Scene,LineSegments,BufferGeometry,BufferAttribute,RawShaderMaterial,Mesh} from 'three';
import {installScreenStrokes} from './screenStrokes';
it('triangle strokes retain endpoints, layer membership and 0.5mm screen weight',()=>{
 const scene=new Scene(),geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,100,0]),2));
 const material=new RawShaderMaterial({vertexShader:'void main() { vec4 pos = vec4(position, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * pos; }'});
 const o=new LineSegments(geometry,material);o.userData.cadLineweight=50;const layer={objects:[o]};(o as any)._dxfViewerLayer=layer;scene.add(o);
 installScreenStrokes({GetScene:()=>scene,GetCanvas:()=>({clientWidth:540,clientHeight:912})} as any);
 const mesh=scene.children[0] as Mesh;expect(mesh.isMesh).toBe(true);expect(mesh.geometry.getAttribute('position').count).toBe(6);expect(layer.objects[0]).toBe(mesh);expect((mesh.material as RawShaderMaterial).uniforms.cadWidth.value).toBeCloseTo(.5*96/25.4);expect((mesh.material as RawShaderMaterial).vertexShader).toContain('gl_Position.xy +=');
});
