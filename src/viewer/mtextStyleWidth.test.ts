import {beforeAll,expect,it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import 'dxf-viewer/src/DxfScene.js'; // loads TextRenderer through DxfScene, as the App does (circular import)
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
import {unwrappedNarrow,withStyleWidth} from './cadFontsScene';
let r:any;
beforeAll(async()=>{r=new TextRenderer(['LiberationSans-Regular.ttf'].map(n=>async()=>{const b=fs.readFileSync('public/fonts/'+n);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}));await r.FetchFonts('7.5 ');});
const span=(text:string)=>{const p=new MTextFormatParser();p.Parse(text);const xs=[...r.RenderMText({formattedText:p.GetContent(),position:{x:0,y:0},fontSize:15,attachment:1,color:0})].flatMap((e:any)=>e.vertices.map((v:any)=>v.x));return Math.max(...xs)-Math.min(...xs);};
it('starts MTEXT at its STYLE width factor (惠宇敦南 9F 水電: LSP 0.4 dimension text ran together)',()=>{
 const e={text:'\\A1;7.5'},narrow=withStyleWidth(e,{widthFactor:0.4});
 expect(narrow.text).toBe('\\W0.4;\\A1;7.5');
 expect(span(narrow.text)/span(e.text)).toBeCloseTo(0.4,2);
 expect(withStyleWidth(e,{widthFactor:1})).toBe(e);
 expect(withStyleWidth(e,{})).toBe(e);
 expect(span(withStyleWidth({text:'{\\W1;7.5}'},{widthFactor:0.4}).text)).toBeCloseTo(span('7.5'),6); // inline \W still wins
});
it('does not wrap an MTEXT box no wider than a tenth of its height, as ZWCAD (標準層管道間 MLEADER width 0.6, height 10)',()=>{
 expect(unwrappedNarrow({width:0.6,height:10},{}).width).toBe(0);
 expect(unwrappedNarrow({width:1,height:10},{}).width).toBe(0);
 expect(unwrappedNarrow({width:1.2,height:10},{}).width).toBe(1.2); // ZWCAD breaks every character here
 expect(unwrappedNarrow({width:3,height:100},{}).width).toBe(0);
 expect(unwrappedNarrow({width:12,height:100},{}).width).toBe(12);
 expect(unwrappedNarrow({width:0.05,height:0},{fixedTextHeight:1}).width).toBe(0);
});
