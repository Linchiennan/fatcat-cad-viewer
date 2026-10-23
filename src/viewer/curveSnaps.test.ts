import {it,expect} from 'vitest';
import {buildMeasurementGeometry} from './measurementGeometry';
import {advancedSnap} from './engineering';
it('circle-circle intersections and circular perpendicular are analytic',()=>{
 const g=buildMeasurementGeometry({entities:[{type:'CIRCLE',center:{x:0,y:0},radius:5},{type:'CIRCLE',center:{x:8,y:0},radius:5}]});
 expect(advancedSnap(g.entities,{x:4,y:3.01},.1)).toMatchObject({kind:'intersection',x:4,y:3});
 expect(advancedSnap(g.entities.slice(0,1),{x:3,y:4.01},.1,{x:6,y:8})).toMatchObject({kind:'perpendicular',x:3,y:4});
});
it('respects arc sweep, negative bulges and nonuniform transformed ellipses',()=>{
 const arc=buildMeasurementGeometry({entities:[{type:'ARC',center:{x:0,y:0},radius:5,startAngle:0,endAngle:Math.PI},{type:'LINE',vertices:[{x:4,y:-10},{x:4,y:10}]}]});
 expect(advancedSnap(arc.entities,{x:4,y:-3},.1)).toBeNull();
 expect(advancedSnap(arc.entities,{x:4,y:3},.1)?.y).toBeCloseTo(3,10);
 const b=buildMeasurementGeometry({entities:[{type:'LWPOLYLINE',vertices:[{x:-5,y:0,bulge:-1},{x:5,y:0}]},{type:'LINE',vertices:[{x:4,y:-10},{x:4,y:10}]}]});
 expect(advancedSnap(b.entities,{x:4,y:3},.1)?.y).toBeCloseTo(3,10);
 const e=buildMeasurementGeometry({entities:[{type:'ELLIPSE',center:{x:0,y:0},majorAxisEndPoint:{x:10,y:0},axisRatio:.5},{type:'LINE',vertices:[{x:-20,y:3},{x:20,y:3}]}]});
 expect(advancedSnap(e.entities,{x:8,y:3},.1)?.x).toBeCloseTo(8,10);
});
it('finds ellipse normal and ellipse/ellipse intersection from conics',()=>{
 const g=buildMeasurementGeometry({entities:[{type:'ELLIPSE',center:{x:0,y:0},majorAxisEndPoint:{x:10,y:0},axisRatio:.5},{type:'ELLIPSE',center:{x:16,y:0},majorAxisEndPoint:{x:10,y:0},axisRatio:.5}]});
 const p=advancedSnap(g.entities,{x:8,y:3.001},.1);expect(p?.x).toBeCloseTo(8,9);expect(p?.y).toBeCloseTo(3,9);
 const n=advancedSnap(g.entities.slice(0,1),{x:8,y:3.001},.1,{x:8.8,y:4.2});expect(n?.kind).toBe('perpendicular');expect(n?.x).toBeCloseTo(8,9);expect(n?.y).toBeCloseTo(3,9);
});
it('snaps to analytic line-circle intersection, not sampled chords',()=>{
 const g=buildMeasurementGeometry({entities:[{type:'CIRCLE',center:{x:0,y:0},radius:5},{type:'LINE',vertices:[{x:-10,y:3},{x:10,y:3}]}]});
 expect(advancedSnap(g.entities,{x:4.01,y:3},.1)).toMatchObject({kind:'intersection',x:4,y:3});
});
