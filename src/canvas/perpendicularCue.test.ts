import {it,expect} from 'vitest';
import {initialMeasureState,measureReducer} from '../measure/measureState';
import {overlayModel} from './overlayModel';
const pick=(x:number,y:number,snap:any=null)=>({type:'pick' as const,pick:{point:{x,y},snap,entity:null,screenY:0,canvasHeight:600}});
it('retains only genuine perpendicular metadata and draws rotated fixed-size right angle',()=>{
 for(const [x,y] of [[0,100],[100,0],[100,100]]){
  let s=measureReducer(initialMeasureState(),{type:'toggle-measure'});s=measureReducer(s,pick(x,y));s=measureReducer(s,pick(0,0,'perpendicular'));s=measureReducer(s,{type:'close'});
  expect(s.settings.kept[0].points[1]).toMatchObject({x:0,y:0,perpendicularFrom:{x,y}});
  for(const scale of [1,3]){const model=overlayModel({settings:s.settings,entity:null,project:ps=>ps.map(p=>({x:p.x*scale+35,y:-p.y*scale+60})),labelPx:14,label:String});const q=model.kept[0].rightAngles?.[0];expect(q).toHaveLength(3);const [a,b,c]=q!;expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeCloseTo(10);expect(Math.hypot(c.x-b.x,c.y-b.y)).toBeCloseTo(10);expect((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)).toBeCloseTo(0);}
 }
 for(const kind of [null,'endpoint','intersection']){let s=measureReducer(initialMeasureState(),{type:'toggle-measure'});s=measureReducer(s,pick(0,100));s=measureReducer(s,pick(0,0,kind));const m=overlayModel({settings:s.settings,entity:null,project:ps=>[...ps],labelPx:14,label:String});expect(m.current?.rightAngles??[]).toEqual([]);}
});
