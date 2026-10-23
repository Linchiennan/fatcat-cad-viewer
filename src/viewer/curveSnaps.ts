import type {DrawingPoint as P} from './savedView';
/** Exact affine conic representation, independent of display tessellation. */
export type SnapCurve={center:P;u:P;v:P;start:number;sweep:number};
export type SnapPrimitive={line:[P,P]}|{curve:SnapCurve};
const tau=2*Math.PI;
const mod=(a:number)=>(a%tau+tau)%tau;
function circleRadius(c:SnapCurve):number|null {
 const a=Math.hypot(c.u.x,c.u.y),b=Math.hypot(c.v.x,c.v.y);
 return a>0&&Math.abs(a-b)<=1e-10*a&&Math.abs(c.u.x*c.v.x+c.u.y*c.v.y)<=1e-10*a*b?a:null;
}
const dot=(a:P,b:P)=>a.x*b.x+a.y*b.y;
const at=(c:SnapCurve,a:number):P=>({x:c.center.x+c.u.x*Math.cos(a)+c.v.x*Math.sin(a),y:c.center.y+c.u.y*Math.cos(a)+c.v.y*Math.sin(a)});
/** Isolate all real polynomial roots on [-1,1] using derivative intervals,
 * including even multiplicity roots; no display-polyline intersections. */
function rootsUnit(coeff:number[]):number[]{
 const scale=Math.max(...coeff.map(Math.abs));if(scale<1e-25)return [];
 const c=coeff.map(v=>v/scale);while(c.length>1&&Math.abs(c.at(-1)!)<1e-14)c.pop();
 if(c.length<2)return [];
 if(c.length===2){const t=-c[0]/c[1];return t>=-1-1e-12&&t<=1+1e-12?[Math.max(-1,Math.min(1,t))]:[];}
 const evaluate=(x:number)=>c.reduceRight((s,v)=>s*x+v,0);
 const knots=[-1,...rootsUnit(c.slice(1).map((v,i)=>v*(i+1))),1].sort((a,b)=>a-b),out:number[]=[];
 const offer=(v:number)=>{if(!out.some(x=>Math.abs(x-v)<1e-9))out.push(v);};
 for(const x of knots)if(Math.abs(evaluate(x))<1e-12)offer(x);
 for(let i=1;i<knots.length;i++){let lo=knots[i-1],hi=knots[i],f=evaluate(lo);if(f*evaluate(hi)>=0)continue;for(let n=0;n<60;n++){const mid=(lo+hi)/2,g=evaluate(mid);if(f*g<=0)hi=mid;else {lo=mid;f=g;}}offer((lo+hi)/2);}
 return out;
}
function chartPoints(c:SnapCurve,polynomial:(c:SnapCurve)=>number[],accept:(p:P)=>boolean):P[]{
 const out:P[]=[];
 for(const sign of [1,-1]){const q={...c,u:{x:c.u.x*sign,y:c.u.y*sign},v:{x:c.v.x*sign,y:c.v.y*sign}};
  for(const t of rootsUnit(polynomial(q))){const p=at(q,2*Math.atan(t));if(onCurve(c,p)&&accept(p)&&!out.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<1e-9*Math.max(1,Math.hypot(c.u.x,c.u.y))))out.push(p);}
 }return out;
}
function conicResidual(c:SnapCurve,p:P):number {
 const det=c.u.x*c.v.y-c.u.y*c.v.x;if(!det)return Infinity;
 const x=p.x-c.center.x,y=p.y-c.center.y;return ((x*c.v.y-y*c.v.x)/det)**2+((c.u.x*y-c.u.y*x)/det)**2-1;
}
export function conicIntersections(a:SnapCurve,b:SnapCurve):P[]{
 if(circleRadius(a)!==null&&circleRadius(b)!==null)return circleIntersections(a,b);
 const det=b.u.x*b.v.y-b.u.y*b.v.x;if(!det)return [];
 return chartPoints(a,c=>{
  const dx=c.center.x-b.center.x,dy=c.center.y-b.center.y;
  const local=(x:number,y:number)=>[(x*b.v.y-y*b.v.x)/det,(b.u.x*y-b.u.y*x)/det];
  const n=[local(dx+c.u.x,dy+c.u.y),local(2*c.v.x,2*c.v.y),local(dx-c.u.x,dy-c.u.y)],r=[-1,0,-2,0,-1];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)r[i+j]+=n[i][0]*n[j][0]+n[i][1]*n[j][1];return r;
 },p=>Math.abs(conicResidual(b,p))<1e-8&&onCurve(b,p));
}
export function curvePerpendicular(c:SnapCurve,p:P):P[]{
 const r=circleRadius(c);if(r===null)return chartPoints(c,q=>{
  const d={x:q.center.x-p.x,y:q.center.y-p.y},A=dot(q.v,q.v)-dot(q.u,q.u),B=dot(q.u,q.v),U=dot(d,q.u),V=dot(d,q.v);
  return [B+V,2*(A-U),-6*B,-2*(A+U),B-V];
 },()=>true);
 const dx=p.x-c.center.x,dy=p.y-c.center.y,d=Math.hypot(dx,dy);if(!d)return [];
 return [1,-1].map(s=>({x:c.center.x+s*r*dx/d,y:c.center.y+s*r*dy/d})).filter(q=>onCurve(c,q));
}
export function circleIntersections(a:SnapCurve,b:SnapCurve):P[]{
 const r=circleRadius(a),s=circleRadius(b);if(r===null||s===null)return [];
 const dx=b.center.x-a.center.x,dy=b.center.y-a.center.y,d=Math.hypot(dx,dy),eps=1e-12*Math.max(r,s,d);
 if(d<=eps||d>r+s+eps||d<Math.abs(r-s)-eps)return [];
 const x=(r*r-s*s+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-x*x));
 return (h<=eps?[0]:[-1,1]).map(sign=>({x:a.center.x+x*dx/d-sign*h*dy/d,y:a.center.y+x*dy/d+sign*h*dx/d})).filter(p=>onCurve(a,p)&&onCurve(b,p));
}
export function onCurve(c:SnapCurve,p:P):boolean {
 const det=c.u.x*c.v.y-c.u.y*c.v.x;if(!det)return false;
 const x=p.x-c.center.x,y=p.y-c.center.y;
 const a=Math.atan2((c.u.x*y-c.u.y*x)/det,(x*c.v.y-y*c.v.x)/det);
 return Math.abs(c.sweep)>=tau-1e-10||(c.sweep>=0?mod(a-c.start):mod(c.start-a))<=Math.abs(c.sweep)+1e-10;
}
export function lineCurve(a:P,b:P,c:SnapCurve):P[]{
 const det=c.u.x*c.v.y-c.u.y*c.v.x;if(!det)return [];
 const local=(p:P)=>({x:((p.x-c.center.x)*c.v.y-(p.y-c.center.y)*c.v.x)/det,y:(c.u.x*(p.y-c.center.y)-c.u.y*(p.x-c.center.x))/det});
 const p=local(a),q=local(b),dx=q.x-p.x,dy=q.y-p.y,A=dx*dx+dy*dy,B=2*(p.x*dx+p.y*dy),C=p.x*p.x+p.y*p.y-1;
 if(!A)return [];let disc=B*B-4*A*C;const eps=Number.EPSILON*32*(B*B+Math.abs(4*A*C)+1);if(disc < -eps)return [];disc=Math.max(0,disc);
 const roots=disc===0?[-B/(2*A)]:[(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];
 return roots.filter(t=>t>=-1e-12&&t<=1+1e-12).map(t=>({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})).filter(p=>onCurve(c,p));
}
