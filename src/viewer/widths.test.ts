import { it,expect } from 'vitest';
import { installEngineeringScene } from './engineering';
it('renders taper endpoints rather than constant first width',()=>{
 class Scene { *_DecomposePolyline(e:any){yield {type:2,vertices:e.vertices,shape:false};} Build(){} }
 installEngineeringScene(Scene);
 const s:any=new Scene();s.cadLineTypes={};s.cadScale=1;
 const all=[...s._DecomposePolyline({type:'LWPOLYLINE',vertices:[{x:0,y:0,startWidth:2,endWidth:6},{x:10,y:0}]},null)],result=all.filter((p:any)=>p.type===3);
 // The centre line too, so a width under one pixel still shows (喬瓏 動力-5F0419)
 expect(all.filter((p:any)=>p.type===2)).toHaveLength(1);
 expect(result[0].type).toBe(3);expect(result[0].vertices.map((p:any)=>[p.x,p.y])).toEqual([[0,1],[0,-1],[10,-3],[10,3]]);
});
it('overlapping return segment keeps its own width rather than searching the first edge',()=>{
 class Scene { *_DecomposePolyline(e:any){yield {type:2,vertices:e.vertices,shape:false};} Build(){} }
 installEngineeringScene(Scene);const s:any=new Scene();s.cadLineTypes={};s.cadScale=1;
 const r=[...s._DecomposePolyline({type:'LWPOLYLINE',vertices:[{x:0,y:0,startWidth:2,endWidth:2},{x:10,y:0,startWidth:6,endWidth:6},{x:0,y:0}]},null)].filter((p:any)=>p.type===3);
 expect(Math.abs(r[1].vertices[0].y)).toBe(3);
});
