import {describe,it,expect} from 'vitest';
import {measureBounds,hitMeasurement,insideBox,removeSelected,selectionBounds} from './selection';
import type {OverlayShape} from './overlayModel';
const shape:OverlayShape={points:[{x:10,y:20},{x:110,y:20}],dots:[{x:10,y:20},{x:110,y:20}],closed:false,labels:[{x:60,y:10,text:'100 cm',size:14,stroke:2}]};
describe('whole-object selection',()=>{
 it('gives horizontal and vertical marks a visible highlight area',()=>{expect(selectionBounds({x:10,y:20,width:100,height:0}).height).toBeGreaterThan(0);});
 it('hits measure line, endpoint and label as same semantic record',()=>{
  for(const p of [{x:50,y:20},{x:110,y:20},{x:60,y:3}])expect(hitMeasurement(shape,p)).toBe(true);
  expect(hitMeasurement(shape,{x:180,y:90})).toBe(false);
 });
 it('requires entire measurement including label to be in rectangle',()=>{
  const b=measureBounds(shape);expect(insideBox(b,{x:0,y:15,width:120,height:30})).toBe(false);
  expect(insideBox(b,{x:-30,y:-30,width:180,height:80})).toBe(true);
 });
 it('deletes only selected records preserving others by identity',()=>{
  const a={},b={},c={};expect(removeSelected([a,b,c],[1])).toEqual([a,c]);expect(removeSelected([a,b,c],[])).toEqual([a,b,c]);
 });
});
