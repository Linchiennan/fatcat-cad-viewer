import {it,expect} from 'vitest';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {installEngineeringScene} from './engineering';
function primitives(e:any){class S extends DxfScene{};installEngineeringScene(S);const s:any=new S();s.cadLineTypes={};s.cadScale=1;return [...s._DecomposePolyline({type:'LWPOLYLINE',layer:'0',...e},null)];}
it('arc width interpolates by arc parameter and uses radial offsets',()=>{
 const r=primitives({vertices:[{x:-10,y:0,bulge:1,startWidth:2,endWidth:6},{x:10,y:0}]});
 const pts=r.flatMap((p:any)=>p.vertices);expect(pts.some((p:any)=>Math.abs(p.x)<1e-8&&Math.abs(p.y+8)<1e-8)).toBe(true);expect(pts.some((p:any)=>Math.abs(p.x)<1e-8&&Math.abs(p.y+12)<1e-8)).toBe(true);
});
it('straight wide corners meet at offset-edge intersections, not bevels',()=>{
 const r=primitives({width:2,vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]});
 const pts=r.flatMap((p:any)=>p.vertices);expect(pts.some((p:any)=>p.x===9&&p.y===1)).toBe(true);expect(pts.some((p:any)=>p.x===11&&p.y===-1)).toBe(true);
});
