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
it('a near-zero segment of a wide line does not throw its edges out (A04 配置 went blank)',()=>{
 // the line of A04's sheet: two vertices 6e-11 apart on a straight run, then a rounded corner
 const r=primitives({width:2,vertices:[{x:538.6991951119026,y:36.99999930391732},{x:376.7529819333331,y:36.99999930180365},{x:330.7782548333389,y:36.99999930094509},{x:330.7782548333971,y:36.99999930094509},{x:311.2599616016132,y:36.99999930094509},{x:183.3648225052693,y:36.99999929958426,bulge:0.4142135623699786},{x:178.3648225053225,y:31.99999929958426},{x:178.3648225053225,y:17.89744730110885}]});
 const pts=r.flatMap((p:any)=>p.vertices);
 expect(pts.every((p:any)=>p.x>170&&p.x<545&&p.y>10&&p.y<45)).toBe(true);
});
