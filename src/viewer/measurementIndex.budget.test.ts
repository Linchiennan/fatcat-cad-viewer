import {it,expect} from 'vitest';
import {buildMeasurementGeometry,basicSnap,entityDistance,MEASUREMENT_LIMITS} from './measurementGeometry';
it('oversized geometry is refused without consuming the budget or aborting subsequent snap entities',()=>{
 const g=buildMeasurementGeometry({entities:[{type:'SPLINE',handle:'large',controlPoints:Array.from({length:MEASUREMENT_LIMITS.points+1},(_,i)=>({x:i,y:0}))},{type:'LINE',handle:'after',vertices:[{x:10,y:10},{x:20,y:10}]}]});
 expect(g.limited).toBe(true);expect(g.entities.some(e=>e.properties?.handle==='after')).toBe(true);
 expect(basicSnap(g.snaps,{x:10.01,y:10},.1,['endpoint'])).toMatchObject({x:10,y:10,kind:'endpoint'});
});
it('continuous spline compaction keeps every sampled point and exact pick distance',()=>{
 const v=[{x:0,y:0},{x:1,y:3},{x:2,y:-1},{x:4,y:5}],g=buildMeasurementGeometry({entities:[{type:'SPLINE',controlPoints:v}]});
 expect(g.entities[0].points).toEqual(v);expect(g.entities[0].hit?.segments).toEqual([]);
 expect(entityDistance(g.entities[0],{x:1.5,y:1})).toBe(0);
});
