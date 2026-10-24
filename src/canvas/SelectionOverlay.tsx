import {useEffect,useRef,useState} from 'react';
import type {DrawingPoint} from '../types/drawing';
import type {Mark} from '../viewer/markup';
import {hitMark,markBounds} from '../viewer/markupMove';
import type {OverlayModel} from './overlayModel';
import {hitMeasurement,insideBox,measureBounds,pointBox,selectionBounds,type Box} from './selection';
export type Selection={marks:number[];measures:number[]};
export const emptySelection=():Selection=>({marks:[],measures:[]});
/** This layer never sees original CAD entities. Single mode observes taps while
 * leaving the engine's pan/pinch/wheel path intact; box mode owns the drag. */
export function SelectionOverlay({tool,marks,model,project,ppu,selected,onChange}:{
 tool:'single'|'box';marks:readonly Mark[];model:OverlayModel|null;
 project(points:readonly DrawingPoint[]):DrawingPoint[];ppu:number;
 selected:Selection;onChange(s:Selection):void;
}){
 const svg=useRef<SVGSVGElement>(null),live=useRef({tool,marks,model,project,ppu,onChange});
 live.current={tool,marks,model,project,ppu,onChange};
 const [drag,setDrag]=useState<Box|null>(null);
 const textBox=(i:number)=>svg.current?.parentElement?.querySelector<SVGGraphicsElement>(`.markup-layer [data-mark-index="${i}"]`)?.getBBox();
 const labelBoxes=(i:number)=>Array.from(svg.current?.parentElement?.querySelectorAll<SVGGraphicsElement>(`.measure-kept-shape:nth-child(${i+1}) text`)??[]).map(el=>{const b=el.getBBox(),pad=Number(el.getAttribute('stroke-width')??2)/2;return{x:b.x-pad,y:b.y-pad,width:b.width+pad*2,height:b.height+pad*2};});
 const bounds=()=>({marks:live.current.marks.map((m,i)=>m.kind==='text'?(textBox(i)??markBounds(m,live.current.project,live.current.ppu)):markBounds(m,live.current.project,live.current.ppu)),measures:live.current.model?.kept.map((s,i)=>measureBounds(s,labelBoxes(i)))??[]});
 useEffect(()=>{
  const root=svg.current?.parentElement;if(!root)return;
  const pointers=new Set<number>();let gesture:{id:number;start:DrawingPoint;dragged:boolean}|null=null;
  const local=(e:PointerEvent)=>{const r=root.getBoundingClientRect();return{x:(e.clientX-r.left)*root.clientWidth/r.width,y:(e.clientY-r.top)*root.clientHeight/r.height};};
  const down=(e:PointerEvent)=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   pointers.add(e.pointerId);
   if(pointers.size>1){gesture=null;setDrag(null);return;}
   gesture={id:e.pointerId,start:local(e),dragged:false};
   if(tool==='box'){e.preventDefault();svg.current?.setPointerCapture(e.pointerId);}
  };
  const move=(e:PointerEvent)=>{
   if(!gesture||gesture.id!==e.pointerId)return;
   const p=local(e);if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>5)gesture.dragged=true;
   if(tool==='box'&&gesture.dragged)setDrag(pointBox(gesture.start,p));
  };
  const up=(e:PointerEvent)=>{
   pointers.delete(e.pointerId);const g=gesture;if(!g||g.id!==e.pointerId)return;
   move(e);gesture=null;setDrag(null);
   const p=local(e),s=live.current;
   if(g.dragged){if(tool==='box'){const b=bounds(),r=pointBox(g.start,p);s.onChange({marks:b.marks.flatMap((b,i)=>insideBox(b,r)?[i]:[]),measures:b.measures.flatMap((b,i)=>insideBox(b,r)?[i]:[])});}return;}
   const mark=hitMark(s.marks,p,s.project,s.ppu,textBox);
   if(mark>=0){s.onChange({marks:[mark],measures:[]});return;}
   for(let i=(s.model?.kept.length??0)-1;i>=0;i--)if(hitMeasurement(s.model!.kept[i],p,labelBoxes(i))){s.onChange({marks:[],measures:[i]});return;}
   s.onChange(emptySelection());
  };
  const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);gesture=null;setDrag(null);};
  root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);
  return()=>{root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);};
 },[tool]);
 const b=bounds();
 return <svg ref={svg} className={`selection-overlay ${tool}`} aria-label="選取註記與量測">
  {selected.marks.map(i=>b.marks[i]?<rect key={`m${i}`} data-selected-mark={i} {...selectionBounds(b.marks[i])} className="selected-object"/>:null)}
  {selected.measures.map(i=>b.measures[i]?<rect key={`q${i}`} data-selected-measure={i} {...selectionBounds(b.measures[i])} className="selected-object"/>:null)}
  {drag?<rect {...drag} className="selection-window"/>:null}
 </svg>;
}
