import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
import {installCadFontScene} from './cadFontsScene';
import {fallbackMetrics} from './shxBigFontMetrics';
let r:any;
beforeAll(async()=>{class Scene extends DxfScene {} installCadFontScene(Scene);r=new TextRenderer(['LiberationSans-Regular.ttf','NotoSansCJKtc-Regular.otf'].map(n=>async()=>{const b=fs.readFileSync('public/fonts/'+n);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}));await r.FetchFonts('ABCD0123456789 中文');});
function render(text:string,metrics:any=fallbackMetrics({font:'txt'}),attachment=1,rotation=0,width=71){r.fatcatPitch=metrics;const p=new MTextFormatParser();p.Parse(text);return [...r.RenderMText({formattedText:p.GetContent(),position:{x:0,y:14},fontSize:3.5,width,rotation,attachment,color:0xffffff})].map((e:any)=>e.vertices.map((v:any)=>[v.x,v.y]));}
it('inline outline override removes inherited SHX wrapping without changing source height or insertion',()=>{const t='\\A1;{\\fMicrosoft JhengHei|b0|i0|c136|p34;              ABCD0123456\\P{\\W5.070241; }(305~540mm 中文中文中文)}';expect(render(t)).toEqual(render(t,null));});
it('restores inherited and nested font metrics after scope exit, including wide whitespace',()=>{const a=render('A{\\fArial; B{\\ftxt.shx; C} D}A');expect(a[0]).toEqual(render('A')[0]);const b=render('B',null)[0];a[1].forEach((v:any,i:number)=>expect(v[0]-a[1][0][0]).toBeCloseTo(b[i][0]-b[0][0],10));const tail=render('A{\\fArial; B}A');const bounds=(g:any)=>Math.max(...g.map((v:any)=>v[0]))-Math.min(...g.map((v:any)=>v[0]));expect(bounds(tail[2])).toBeCloseTo(bounds(render('A')[0]),10);expect(render('{\\fArial;A{\\W5; }B}')).toEqual(render('A{\\W5; }B',null));});
it('preserves attachment and rotated layout when STYLE changes under a full font override',()=>{for(const at of [1,5,9])for(const angle of [0,90])expect(render('{\\fArial;AB CD\\P中文}',fallbackMetrics({font:'txt'}),at,angle)).toEqual(render('{\\fArial;AB CD\\P中文}',null,at,angle));});
it('keeps text without font overrides unchanged and does not leak prior inline state',()=>{const a=render('AB CD');render('{\\fArial;AB CD}');expect(render('AB CD')).toEqual(a);expect(render('{\\Ftxt.shx;AB CD}',null)).toEqual(a);});
it('parses font identity in scope without rendering charset/pitch metadata as text',()=>{const p=new MTextFormatParser();p.Parse('{\\fArial|b0|i0|c136|p34;A}B');expect(p.GetContent()[0].content[0]).toEqual({type:MTextFormatParser.EntityType.FONT,font:'Arial'});expect([...p.GetText()]).toEqual(['A','B']);});
