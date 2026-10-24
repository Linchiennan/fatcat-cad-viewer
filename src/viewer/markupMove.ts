import { arrowHead, textLines, TEXT_LINE_GAP, type Mark } from './markup';
import type { DrawingPoint } from './savedView';
type Project = (points: readonly DrawingPoint[]) => DrawingPoint[];
export function translateMark(mark: Mark, dx: number, dy: number): Mark {
 const shift = (p: DrawingPoint) => ({x:p.x+dx,y:p.y+dy});
 return mark.kind === 'text' ? {...mark,at:shift(mark.at)} : {...mark,points:mark.points.map(shift)} as Mark;
}
function distance(p:DrawingPoint,a:DrawingPoint,b:DrawingPoint) {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function markBounds(m:Mark,project:Project,ppu:number) {
 if(m.kind==='text') {const [p]=project([m.at]),px=Math.max(6,m.size*ppu),lines=textLines(m.text,px,m.width?m.width*ppu:undefined);return {x:p.x,y:p.y,width:Math.max(...lines.map(l=>[...l].length*px),px),height:px*(1+(lines.length-1)*TEXT_LINE_GAP)};}
 const points=project(m.points);if(m.kind==='arrow')points.push(...arrowHead(points[0],points[1]));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
/** CSS-pixel tolerance is independent of zoom; reverse order matches SVG paint order. */
export function hitMark(marks:readonly Mark[],p:DrawingPoint,project:Project,ppu:number,textBox?:(i:number)=>{x:number;y:number;width:number;height:number}|undefined) {
 for(let i=marks.length-1;i>=0;i--) {
  const m=marks[i],tol=12;
  if(m.kind==='text'){const b=textBox?.(i)??markBounds(m,project,ppu);if(p.x>=b.x-tol&&p.x<=b.x+b.width+tol&&p.y>=b.y-tol&&p.y<=b.y+b.height+tol)return i;continue;}
  let pts=project(m.points);const [a,b]=pts;
  if(m.kind==='rect')pts=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];
  if(m.kind==='arrow'){const [l,r]=arrowHead(a,b);pts=[a,b,l,b,r];}
  if(m.kind==='circle'){const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(a.x-b.x)/2,ry=Math.abs(a.y-b.y)/2;pts=Array.from({length:129},(_,j)=>({x:cx+rx*Math.cos(j*Math.PI/64),y:cy+ry*Math.sin(j*Math.PI/64)}));}
  if(pts.some((q,j)=>j>0&&distance(p,pts[j-1],q)<=tol))return i;
 }
 return -1;
}
