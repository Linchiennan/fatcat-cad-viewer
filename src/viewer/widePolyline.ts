import type {DrawingPoint as P} from './savedView';
type V=P&{bulge?:number;startWidth?:number;endWidth?:number};
export type WidthMesh={vertices:P[];indices:number[]};
/** Radial arc offsets and along-arc linear width. Polygonal display error <= 1 degree per chord.
 * Straight joins intersect actual (possibly tapered) offset edges. */
export function widePolyline(vertices:V[],closed:boolean,width:number,pattern:number[]=[],scale=1):WidthMesh[]{
 const groups:{left:P[];right:P[];arc:boolean;sample:(t:number,side:number)=>P}[]=[],out:WidthMesh[]=[],joins:WidthMesh[]=[];
 const pat=pattern.map(n=>n*scale),cycle=pat.reduce((s,v)=>s+Math.abs(v),0);let k=0,left=cycle?Math.abs(pat[0])||Math.max(cycle*.001,1e-7):Infinity;
 const active=cycle>1e-10;let total=0;
 for(let i=0;i<(closed?vertices.length:vertices.length-1);i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length],dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);if(chord<1e-12)continue;
  const bulge=a.bulge??0,theta=4*Math.atan(bulge),arc=Math.abs(theta)>1e-10;
  const r=arc?chord*(1+bulge*bulge)/(4*Math.abs(bulge)):0;
  const off=arc?chord*(1-bulge*bulge)/(4*bulge):0;
  const center={x:(a.x+b.x)/2-dy/chord*off,y:(a.y+b.y)/2+dx/chord*off},angle=Math.atan2(a.y-center.y,a.x-center.x),len=arc?r*Math.abs(theta):chord;
  const wa=Math.max(0,a.startWidth??width),wb=Math.max(0,a.endWidth??a.startWidth??width);
  const sample=(t:number,sign:number)=>{
   const w=(wa+(wb-wa)*t)/2;
   if(arc){const q=angle+theta*t,rad=r-sign*Math.sign(theta)*w;return {x:center.x+rad*Math.cos(q),y:center.y+rad*Math.sin(q)};}
   return {x:a.x+dx*t-sign*dy/chord*w,y:a.y+dy*t+sign*dx/chord*w};
  };
  let pos=0;
  while(pos<len-1e-12){const step=Math.min(left,len-pos),t0=pos/len,t1=(pos+step)/len;
   if(!active||pat[k]>=0){const n=arc?Math.max(2,Math.ceil(Math.abs(theta)*(t1-t0)/(Math.PI/180)/2)*2):1;
    if((total+=n)>200000)throw Error('寬多段線細分超過安全上限');
    const group={left:[] as P[],right:[] as P[],arc,sample};for(let j=0;j<=n;j++){const t=t0+(t1-t0)*j/n;group.left.push(sample(t,1));group.right.push(sample(t,-1));}groups.push(group);
   }
   pos+=step;if(active){left-=step;if(left<1e-10){k=(k+1)%pat.length;left=Math.abs(pat[k])||Math.max(cycle*.001,1e-7);}}
  }
 }
 const ranges=new Map<P[],[number,number]>();
 const cross=(a:P,b:P)=>a.x*b.y-a.y*b.x;
 if(!active)for(let i=closed?0:1;i<groups.length;i++){
  const a=groups[(i+groups.length-1)%groups.length],b=groups[i];
  for(const side of ['left','right'] as const){const p=a[side],q=b[side],A=p.at(-1)!,B=q[0];
   if(!a.arc&&!b.arc){const U={x:A.x-p.at(-2)!.x,y:A.y-p.at(-2)!.y},V={x:q[1].x-B.x,y:q[1].y-B.y},den=cross(U,V);
    if(Math.abs(den)>1e-12*Math.hypot(U.x,U.y)*Math.hypot(V.x,V.y)){const t=cross({x:B.x-A.x,y:B.y-A.y},V)/den,M={x:A.x+t*U.x,y:A.y+t*U.y};p[p.length-1]=M;q[0]=M;continue;}
   }
   if(a.arc||b.arc){
    // Intersect the actual radial/tapered offset curves, not the display chords.
    const sign=side==='left'?1:-1;let t=1,u=0,hit:P|undefined;
    for(let iteration=0;iteration<24;iteration++){
     const X=a.sample(t,sign),Y=b.sample(u,sign),error={x:Y.x-X.x,y:Y.y-X.y};
     if(Math.hypot(error.x,error.y)<1e-9){hit={x:(X.x+Y.x)/2,y:(X.y+Y.y)/2};break;}
     const h=1e-5,ap=a.sample(t+h,sign),am=a.sample(t-h,sign),bp=b.sample(u+h,sign),bm=b.sample(u-h,sign);
     const U={x:(ap.x-am.x)/(2*h),y:(ap.y-am.y)/(2*h)},V={x:(bp.x-bm.x)/(2*h),y:(bp.y-bm.y)/(2*h)},den=cross(U,V);
     if(Math.abs(den)<1e-12*Math.hypot(U.x,U.y)*Math.hypot(V.x,V.y))break;
     t+=cross(error,V)/den;u+=cross(error,U)/den;
     if(!Number.isFinite(t+u)||Math.abs(t-1)>.5||Math.abs(u)>.5)break;
    }
    if(hit){
     // Resample the trimmed/extended boundary so an inner miter cannot fold back.
     const n=p.length-1,m=q.length-1,start=ranges.get(p)?.[0]??0,end=ranges.get(q)?.[1]??1;
     if(t<=start||u>=end)continue;
     ranges.set(p,[start,t]);ranges.set(q,[u,end]);
     for(let j=0;j<=n;j++)p[j]=a.sample(start+j/n*(t-start),sign);
     for(let j=0;j<=m;j++)q[j]=b.sample(u+(end-u)*j/m,sign);
     p[n]=hit;q[0]=hit;continue;
    }
   }
   // Degenerate/nonintersecting offsets retain a bounded bevel (not an exact miter).
   if(Math.hypot(A.x-B.x,A.y-B.y)>1e-10){const center={x:(a.left.at(-1)!.x+a.right.at(-1)!.x)/2,y:(a.left.at(-1)!.y+a.right.at(-1)!.y)/2};joins.push({vertices:[center,A,B],indices:[0,1,2]});}
  }
 }
 for(const g of groups)for(let i=1;i<g.left.length;i++)out.push({vertices:[g.left[i-1],g.right[i-1],g.right[i],g.left[i]],indices:[0,1,2,0,2,3]});
 return [...out,...joins];
}
