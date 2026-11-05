import {it,expect} from 'vitest';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {installEngineeringScene} from './engineering';
function lines(e:any,lineTypes:any={}){class S extends DxfScene{};installEngineeringScene(S);const s:any=new S();s.cadLineTypes=lineTypes;s.cadScale=1;return [...s._DecomposeLine({type:'LINE',layer:'0',...e},null)];}
it('draws a zero-length LINE as a dot, as CAD does (惠宇敦南 6F撒水 exploded DOTS hatch *X79)',()=>{
 for(const lt of [{},{HIDDEN:{pattern:[6.35,-3.175]}}]){
  const r=lines({lineType:'HIDDEN',vertices:[{x:3,y:4},{x:3,y:4}]},lt);
  expect(r).toHaveLength(1);expect(r[0].type).toBe(0);expect(r[0].vertices).toEqual([{x:3,y:4}]);
 }
});
it('leaves an ordinary LINE a segment',()=>{
 const r=lines({vertices:[{x:0,y:0},{x:5,y:0}]});
 expect(r.map((p:any)=>p.type)).toEqual([1]);
});
