import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
// 惠宇 007 廚房水電配置圖：MTEXT「冰箱位置」框寬 18.2、字高 15，CAD 逐字折成直排；App 只在空白折行，畫成一橫行
let r:any;
beforeAll(async()=>{r=new TextRenderer(['public/fonts/LiberationSans-Regular.ttf','public/fonts/NotoSansCJKtc-Regular.otf'].map(p=>async()=>{const b=fs.readFileSync(p);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}));await r.FetchFonts('ABCD 中文冰箱位置');});
function bounds(text:string,width:number){const p=new MTextFormatParser();p.Parse(text);const v=[...r.RenderMText({formattedText:p.GetContent(),position:{x:0,y:0},fontSize:15,width,rotation:0,attachment:1,color:0xffffff})].flatMap((e:any)=>e.vertices);
 return {w:Math.max(...v.map((q:any)=>q.x))-Math.min(...v.map((q:any)=>q.x)),h:Math.max(...v.map((q:any)=>q.y))-Math.min(...v.map((q:any)=>q.y))};}
it('breaks a CJK run between characters when the box is narrower than the text',()=>{
 const b=bounds('冰箱位置',18.22),one=bounds('冰',0);expect(b.w).toBeCloseTo(one.w,6);expect(b.h).toBeGreaterThan(3*15);});
it('keeps CJK text on one line when it fits, and still wraps Latin only at spaces',()=>{
 expect(bounds('冰箱位置',0).h).toBeLessThan(20);expect(bounds('冰箱位置',100).h).toBeLessThan(20);
 expect(bounds('ABCD',10).h).toBeLessThan(20);});
