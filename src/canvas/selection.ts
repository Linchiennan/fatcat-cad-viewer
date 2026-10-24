import type {OverlayShape} from './overlayModel';
import type {DrawingPoint} from '../types/drawing';
export type Box={x:number;y:number;width:number;height:number};
export const selectionBounds=(b:Box):Box=>({x:b.x-6,y:b.y-6,width:b.width+12,height:b.height+12});
export const pointBox=(a:DrawingPoint,b:DrawingPoint):Box=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});
const labelBoxes=(s:OverlayShape):Box[]=>s.labels.map(l=>({x:l.x-[...l.text].length*l.size/2,y:l.y-l.size,width:[...l.text].length*l.size,height:l.size*1.3}));
export function measureBounds(s:OverlayShape,labels=labelBoxes(s)):Box{
 const boxes=[...s.points.map(p=>({x:p.x-5,y:p.y-5,width:10,height:10})),...(s.rightAngles??[]).flat().map(p=>({x:p.x-1,y:p.y-1,width:2,height:2})),...labels];
 if(!boxes.length)return {x:NaN,y:NaN,width:0,height:0};
 const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
 return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
export function hitMeasurement(s:OverlayShape,p:DrawingPoint,labels=labelBoxes(s)):boolean{
 if(labels.some(b=>insideBox({x:p.x,y:p.y,width:0,height:0},{x:b.x-6,y:b.y-6,width:b.width+12,height:b.height+12})))return true;
 const pts=s.closed?[...s.points,s.points[0]]:s.points;
 return pts.some((b,i)=>{const a=pts[Math.max(0,i-1)],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=12;});
}
export function insideBox(b:Box,r:Box):boolean{return b.x>=r.x && b.y>=r.y && b.x+b.width<=r.x+r.width && b.y+b.height<=r.y+r.height;}
export function removeSelected<T>(items:readonly T[],indices:readonly number[]):T[]{const selected=new Set(indices);return items.filter((_,i)=>!selected.has(i));}
