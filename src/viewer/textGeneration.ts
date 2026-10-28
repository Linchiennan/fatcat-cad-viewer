type Any=any;
/**
 * TEXT generation flags (group 71) for outline and bundled fonts, which dxf-viewer ignores: 2 = backward (mirrored
 * across the line through the anchor square to the baseline), 4 = upside down (mirrored across the baseline). Both
 * together turn the text half a turn about its anchor (11F 給水放樣 「H:45cm」 at 180° with flags 6 reads upright in CAD).
 */
export function* generationMirror(e:Any,entities:Iterable<Any>):Generator<Any>{
 const flags=e.textGenerationFlag??0,fx=flags&2?-1:1,fy=flags&4?-1:1;
 if(fx===1&&fy===1){yield* entities;return;}
 const h=e.halign??0,v=e.valign??0,anchor=(h||v)&&h!==3&&h!==5&&e.endPoint?e.endPoint:e.startPoint??{x:0,y:0};
 const r=(e.rotation??0)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
 const flip=(p:Any)=>{const dx=p.x-anchor.x,dy=p.y-anchor.y,lx=fx*(dx*cos+dy*sin),ly=fy*(-dx*sin+dy*cos);const q=p.clone?p.clone():{...p};q.x=anchor.x+lx*cos-ly*sin;q.y=anchor.y+lx*sin+ly*cos;return q;};
 for(const ent of entities){if(ent?.vertices)ent.vertices=ent.vertices.map(flip);yield ent;}
}
