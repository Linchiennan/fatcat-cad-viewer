import {ShxFont} from '@mlightcad/shx-parser/dist/index.es.js';
import type {DrawingPoint as P} from './savedView';
export {ShxFont};
export const fontKey=(name:string)=>name.replaceAll('\\','/').split('/').at(-1)!.toLowerCase();
let big5:Map<number,number>|undefined;
function glyphCode(font:ShxFont,char:string):number|undefined {
 const code=char.codePointAt(0)!;if(font.hasChar(code))return code;
 if(font.fontData.header.fontType!=='bigfont')return undefined;
 if(!big5){big5=new Map();const d=new TextDecoder('big5',{fatal:false});for(let h=0x81;h<=0xfe;h++)for(let l=0x40;l<=0xfe;l++){const s=d.decode(new Uint8Array([h,l]));if(s.length===1&&s!=='�'&&!big5.has(s.charCodeAt(0)))big5.set(s.charCodeAt(0),h*256+l);}}
 const encoded=big5.get(code);return encoded!==undefined&&font.hasChar(encoded)?encoded:undefined;
}
/** Return null for unsupported layout/missing glyph: caller retains CJK fallback. */
export function shxTextGeometry(e:any,font:ShxFont,bigFont?:ShxFont):P[][]|null {
 if(font.fontData.content.orientation==='vertical'||String(e.text??'').length>10000)return null;
 const text=String(e.text??'').replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'Ø').replace(/\\U\+([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
 if(text.includes('\\')||text.includes('%%'))return null;
 const height=e.textHeight??10,paths:P[][]=[];let advance=0;
 for(const ch of text){let f=font,code=glyphCode(f,ch);if(code===undefined&&bigFont){f=bigFont;code=glyphCode(f,ch);}if(code===undefined)return null;
  const metrics=f.fontData.content,shape=f.getCharShape(code,height*metrics.height/(metrics.baseUp||metrics.height));if(!shape)return null;
  for(const line of shape.polylines)paths.push(line.map(p=>({x:p.x+advance,y:p.y})));
  advance+=shape.lastPoint?.x??0;
 }
 if(!paths.length)return [];
 let sx=e.xScale??1,sy=1,rotation=(e.rotation??0)*Math.PI/180;
 const h=e.halign??e.horizontalJustification??0,v=e.valign??e.verticalJustification??0;
 let anchor=e.startPoint??{x:0,y:0},ox=0,oy=0;
 if((h===3||h===5)&&e.endPoint&&advance){const dx=e.endPoint.x-anchor.x,dy=e.endPoint.y-anchor.y;sx=Math.hypot(dx,dy)/advance;if(h===3)sy=sx;rotation=Math.atan2(dy,dx);}
 else {if((h||v)&&e.endPoint)anchor=e.endPoint;if(h===1||h===4)ox=-advance/2;else if(h===2)ox=-advance;else if(h!==0)return null;if(h===4)oy=-height/2;}
 if(v===1)oy=height*font.fontData.content.baseDown/(font.fontData.content.baseUp||1);else if(v===2)oy=-height/2;else if(v===3)oy=-height;
 const flags=e.textGenerationFlag??0;if(flags&2)sx=-sx;if(flags&4)sy=-sy;
 const skew=Math.tan((e.obliqueAngle??0)*Math.PI/180),cos=Math.cos(rotation),sin=Math.sin(rotation),mirror=e.extrusionDirection?.z<0?-1:1;
 return paths.map(line=>line.map(p=>{const x=(p.x+ox+skew*(p.y+oy))*sx,y=(p.y+oy)*sy;return {x:mirror*(anchor.x+x*cos-y*sin),y:anchor.y+x*sin+y*cos};}));
}
