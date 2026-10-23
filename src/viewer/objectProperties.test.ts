import {it,expect} from 'vitest';import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {installMeasurementPreparation,nearestEntity} from './measurementGeometry';import {installEngineeringScene} from './engineering';
import {buildMeasurementGeometry} from './measurementGeometry';
it('measurement preserves 40-point concave clip rather than its enclosing rectangle',()=>{
 const polygon=Array.from({length:40},(_,i)=>{const a=i*Math.PI/20,r=i%2?4:10;return `${r*Math.cos(a)},${r*Math.sin(a)}`;}).join(';');
 const d:any={blocks:{B:{entities:[{type:'LINE',vertices:[{x:8,y:1},{x:9,y:1}]}]}},entities:[{type:'INSERT',name:'B',position:{x:0,y:0},xdata:{FATCAT_XCLIP:{values:[{code:1000,value:polygon}]}}}]};
 expect(buildMeasurementGeometry(d).entities).toHaveLength(0);
});
it('indexes rendered solid faces as properties only, not fabricated zero length',async()=>{
 class S extends DxfScene{};installMeasurementPreparation(S);installEngineeringScene(S);
 const d:any={entities:[{type:'SOLID',handle:'FACE',layer:'0',points:[{x:0,y:0},{x:10,y:0},{x:0,y:10},{x:10,y:10}]}]};await new S().Build(d,[]);
 const e=nearestEntity(d.cadMeasurement.entities,{x:5,y:5},.1);expect(e?.kind).toBe('SOLID');expect((e as any)?.propertiesOnly).toBe(true);expect(e?.properties?.handle).toBe('FACE');expect(nearestEntity(d.cadMeasurement.entities,{x:15,y:5},.1)).toBeNull();
});
