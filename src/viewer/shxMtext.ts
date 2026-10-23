import {ShxFont,shxTextGeometry} from './shxText';
import type {DrawingPoint as P} from './savedView';
/** Bounded SHX MTEXT: explicit paragraphs, scoped H/W/Q, underline/overline,
 * attachment 1..9 and rotation. Unsupported controls fall back as a whole. */
export function shxMtextGeometry(e:any,font:ShxFont,big?:ShxFont):P[][]|null {
 const source=String(e.text??'');if(source.length>10000)return null;
 const base=e.height??e.textHeight??1;if(!(base>0))return null;
 type Style={height:number;width:number;oblique:number;under:boolean;over:boolean};
 let s:Style={height:base,width:1,oblique:0,under:false,over:false};const stack:Style[]=[];
 const lines:{paths:P[][];width:number;height:number}[]=[];let paths:P[][]=[],x=0,maxHeight=base;
 const flush=()=>{lines.push({paths,width:x,height:maxHeight});paths=[];x=0;maxHeight=base;};
 const add=(text:string):boolean=>{
  const strokes=shxTextGeometry({text,textHeight:s.height,xScale:s.width,obliqueAngle:s.oblique,startPoint:{x,y:0}},font,big);if(strokes===null)return false;
  // Advance comes from SHX pen position, not glyph bounding boxes.
  let advance=0;
  for(const ch of text){if(!font.hasChar(ch.codePointAt(0)!))return false;const m=font.fontData.content,g=font.getCharShape(ch.codePointAt(0)!,s.height*m.height/(m.baseUp||m.height));if(!g)return false;advance+=(g.lastPoint?.x??0)*s.width;}
  paths.push(...strokes);if(s.under)paths.push([{x,y:-s.height*.2},{x:x+advance,y:-s.height*.2}]);if(s.over)paths.push([{x,y:s.height*1.2},{x:x+advance,y:s.height*1.2}]);
  x+=advance;maxHeight=Math.max(maxHeight,s.height);return true;
 };
 for(let i=0;i<source.length;){const c=source[i++];
  if(c==='{'){stack.push({...s});continue;}if(c==='}'){if(!stack.length)return null;s=stack.pop()!;continue;}
  if(c!=='\\'){if(c==='\n'){flush();continue;}if(!add(c))return null;continue;}
  const cmd=source[i++];if(cmd==='P'){flush();continue;}
  if(cmd==='L'||cmd==='l'){s.under=cmd==='L';continue;}if(cmd==='O'||cmd==='o'){s.over=cmd==='O';continue;}
  if(cmd==='~'){if(!add(' '))return null;continue;}
  if(cmd==='H'||cmd==='W'||cmd==='Q'){
   const end=source.indexOf(';',i);if(end<0)return null;const value=source.slice(i,end),n=Number(value.replace(/x$/i,''));i=end+1;
   if(!Number.isFinite(n))return null;
   if(cmd==='H'){s.height=/x$/i.test(value)?s.height*n:n;if(s.height<=0||s.height>base*100)return null;}
   if(cmd==='W'){if(n<=0||n>100)return null;s.width=n;}
   if(cmd==='Q'){if(Math.abs(n)>=85)return null;s.oblique=n;}continue;
  }
  // Font switches, columns, stacks, paragraph tabs and unknown commands are explicit fallback.
  return null;
 }
 if(stack.length)return null;flush();
 // Avoid claiming automatic word-wrap parity: hand layout only when the declared box fits.
 const width=Math.max(...lines.map(l=>l.width));if(e.width>0&&width>e.width+1e-8)return null;
 const factor=e.lineSpacingFactor??e.lineSpacing??1;if(!(factor>0&&factor<=4))return null;
 let y=0;const placed:P[][]=[];for(let i=0;i<lines.length;i++){const l=lines[i];if(i)y-=lines[i-1].height*(5/3*factor-1)+l.height;placed.push(...l.paths.map(line=>line.map(p=>({x:p.x,y:p.y+y}))));}
 const bottom=y,top=lines[0].height,attachment=e.attachmentPoint??1;
 if(attachment<1||attachment>9||!Number.isInteger(attachment))return null;
 const col=(attachment-1)%3,row=Math.floor((attachment-1)/3),ox=-(e.width>0?e.width:width)*col/2,oy=row===0?-top:row===1?-(top+bottom)/2:-bottom;
 const anchor=e.position??e.startPoint??{x:0,y:0},dir=e.direction,rot=dir?Math.atan2(dir.y,dir.x):(e.rotation??0)*Math.PI/180,co=Math.cos(rot),si=Math.sin(rot);
 return placed.map(line=>line.map(p=>{const X=p.x+ox,Y=p.y+oy;return {x:anchor.x+X*co-Y*si,y:anchor.y+X*si+Y*co};}));
}
