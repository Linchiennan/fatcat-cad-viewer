import { it, expect, vi, afterEach } from 'vitest';
import * as store from './measurementStore';
import type { KeptMeasurement } from '../viewer/measurementGeometry';
const data:KeptMeasurement[]=[{mode:'distance',points:[{x:0.123456789012345,y:-9},{x:3,y:4}]}];
afterEach(()=>vi.unstubAllGlobals());
it('roundtrips full precision by drawing and sheet, clear does not touch annotations',()=>{
 const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)});
 map.set('drawingA:markup','keep');expect(store.saveMeasurements('drawingA',data)).toBe(true);
 expect(store.loadMeasurements('drawingA')).toEqual(data);expect(store.loadMeasurements('drawingB')).toEqual([]);expect(store.loadMeasurements('drawingA:space:Layout')).toEqual([]);
 expect(store.saveMeasurements('drawingA',[])).toBe(true);expect(store.loadMeasurements('drawingA')).toEqual([]);expect(map.get('drawingA:markup')).toBe('keep');
});
it('refuses invalid/incomplete points and reports storage failure',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify([{mode:'distance',points:[{x:0,y:0}]}]),setItem:()=>{throw Error('quota')},removeItem:()=>{throw Error('quota')}});
 expect(store.loadMeasurements('x')).toEqual([]);expect(store.saveMeasurements('x',data)).toBe(false);expect(store.saveMeasurements('',data)).toBe(false);
});
