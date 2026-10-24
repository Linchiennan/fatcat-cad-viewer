import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
let r:any;
beforeAll(async()=>{void DxfScene; r=new TextRenderer([async()=>{const b=fs.readFileSync('public/fonts/LiberationSans-Regular.ttf');return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}]);await r.FetchFonts('ABCD');});
function render(text:string,width=71){const p=new MTextFormatParser();p.Parse(text);return [...r.RenderMText({formattedText:p.GetContent(),position:{x:10,y:14},fontSize:3.5,width,rotation:0,attachment:1,color:0xffffff})].map((e:any)=>({x:Math.min(...e.vertices.map((v:any)=>v.x)),y:Math.min(...e.vertices.map((v:any)=>v.y))}));}
it('zero and signed indents use drawing units, including scoped H and W',()=>{for(const value of [0,-2,2]){const a=render(`\\pi${value};{\\H2x;\\W2;A}`),b=render('{\\H2x;\\W2;A}');expect(a[0].x-b[0].x).toBeCloseTo(value,10);expect(a[0].y).toBe(b[0].y);}});
it('indent persists across P and restores for following paragraphs outside braces',()=>{const a=render('\\pi1;A\\P{\\pi2;B\\PC}\\PD'),b=render('A\\PB\\PC\\PD');[1,2,2,1].forEach((v,i)=>expect(a[i].x-b[i].x).toBeCloseTo(v,10));});
it('only first wrapped line is indented; never treats i as hanging left indent',()=>{const a=render('\\pi2;AAAA BBBB',20);expect(a[0].x).toBeCloseTo(12,10);expect(a[4].x).toBeCloseTo(10,10);expect(a[4].y).toBeLessThan(a[0].y);});
it('paragraph reset and x marker preserve existing q alignment',()=>{expect(render('\\pi2;A\\P\\pi0;B')[1].x).toBeCloseTo(10,10);expect(render('\\pxi2;A')).toEqual(render('\\pi2;A'));expect(render('\\pxqc;AB')).toEqual(render('\\pqc;AB'));});
it('malformed or unbounded indent never turns into an entity move',()=>{for(const s of ['NaN','Infinity','10001','2x','2junk'])expect(render('\\pi'+s+';AB')).toEqual(render('AB'));});
it('49E6 first-line indent offsets only second paragraph in drawing units, never insertion',()=>{const a=render('AB\\P\\pi5.52671;CD'),b=render('AB\\PCD');expect(a.slice(0,2)).toEqual(b.slice(0,2));for(let i=2;i<4;i++){expect(a[i].x-b[i].x).toBeCloseTo(5.52671,10);expect(a[i].y).toBe(b[i].y);}});
