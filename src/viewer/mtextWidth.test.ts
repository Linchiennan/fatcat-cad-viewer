import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
let r:any;
beforeAll(async()=>{r=new TextRenderer(['public/fonts/LiberationSans-Regular.ttf','public/fonts/NotoSansCJKtc-Regular.otf'].map(p=>async()=>{const b=fs.readFileSync(p);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}));await r.FetchFonts('ABCD 中文日本語');});
function render(text:string,attachment=1,rotation=0,width=0){const p=new MTextFormatParser();p.Parse(text);return [...r.RenderMText({formattedText:p.GetContent(),position:{x:41,y:-3.5},fontSize:3.5,width,rotation,attachment,color:0xffffff})].flatMap((e:any)=>e.vertices);}
function bounds(v:any[]){return {x0:Math.min(...v.map(p=>p.x)),x1:Math.max(...v.map(p=>p.x)),y0:Math.min(...v.map(p=>p.y)),y1:Math.max(...v.map(p=>p.y))};}
it('honors inline width for real Latin/CJK outline geometry without changing baseline or height',()=>{for(const text of ['ABCD','中文','日本語']){const a=bounds(render(text)),b=bounds(render('\\W0.5;'+text));expect(b.x1-b.x0).toBeCloseTo((a.x1-a.x0)*.5,8);expect(b.y0).toBeCloseTo(a.y0,8);expect(b.y1).toBeCloseTo(a.y1,8);}});
it('preserves middle attachment anchor when inline width changes',()=>{const a=bounds(render('日本語',5)),b=bounds(render('\\W0.9214;日本語',5));expect(b.x0-41).toBeCloseTo((a.x0-41)*.9214,8);expect(b.x1-41).toBeCloseTo((a.x1-41)*.9214,8);expect(b.y0).toBeCloseTo(a.y0,8);});
it('restores scoped width and combines relative width with height',()=>{const p=new MTextFormatParser();p.Parse('{\\W0.5;A}B');expect(p.GetContent()[0].content[0]).toMatchObject({width:0.5,relative:false});const a=bounds(render('AB')),b=bounds(render('\\W0.5;{\\W2x;AB}'));expect(b).toEqual(a);const c=bounds(render('{\\H2x;\\W0.5;AB}'));expect(c.x1-c.x0).toBeCloseTo(a.x1-a.x0,8);});
it('keeps scoped wide spaces instead of resetting them when the next glyph arrives',()=>{const a=bounds(render('A B')),b=bounds(render('A{\\W5; }B'));const space=r._GetCharShape(' ').advance*3.5;expect(b.x1-a.x1).toBeCloseTo(4*space,8);});
it('scales in text local axes before rotation',()=>{const a=bounds(render('AB',1,90)),b=bounds(render('\\W0.5;AB',1,90));expect(b.y1-b.y0).toBeCloseTo((a.y1-a.y0)*.5,8);expect(b.x1-b.x0).toBeCloseTo(a.x1-a.x0,8);});
