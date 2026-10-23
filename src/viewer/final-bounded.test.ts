import {it,expect} from 'vitest';
import fs from 'node:fs';
import {widePolyline} from './widePolyline';
import {complexLinePrimitives} from './complexLineType';
import {ShxFont} from './shxText';
import {shxMtextGeometry} from './shxMtext';
const b=fs.readFileSync('fixtures/fatcat-test.shx'),font=new ShxFont(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
it('native symbol SHX without shape zero uses raw units, not font cap scaling',()=>{
 const bytes=fs.readFileSync('fixtures/fatcat-shape.shx'),symbol=new ShxFont(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
 const scene:any={cadScale:1,cadLineTypes:{F:{elements:[{length:5,flags:0},{length:-2,flags:4,shape:1,styleHandle:'S',scale:2,y:1},{length:-10,flags:0}]}},cadStyles:{S:{handle:'S',font:'fatcat-shape.shx'}},cadFonts:new Map([['fatcat-shape.shx',symbol]]),*_DecomposePolyline(e:any){yield e;}};
 const result=[...complexLinePrimitives(scene,{lineType:'F'},{vertices:[{x:0,y:0},{x:100,y:0}]},null)];
 expect(result).toHaveLength(6);for(const [i,p] of [{x:7,y:1},{x:11,y:1},{x:11,y:5},{x:7,y:5}].entries()){expect(result[0].vertices[i].x).toBeCloseTo(p.x,10);expect(result[0].vertices[i].y).toBeCloseTo(p.y,10);}
 symbol.release();
});
it('arc-line miter lies on true offset circle and line, not chord triangle',()=>{
 const mesh=widePolyline([{x:0,y:0,bulge:1},{x:20,y:0},{x:30,y:0}],false,2);
 const vertices=mesh.flatMap(m=>m.vertices),outer={x:10+Math.sqrt(120),y:-1},inner={x:10+Math.sqrt(80),y:1};
 for(const target of [outer,inner])expect(Math.min(...vertices.map(p=>Math.hypot(p.x-target.x,p.y-target.y)))).toBeLessThan(1e-8);
 expect(mesh.every(m=>m.vertices.length===4)).toBe(true);
});
it('arc-arc joins match independent circle-circle gold to 1e-8',()=>{
 const mesh=widePolyline([{x:0,y:0,bulge:1},{x:20,y:0,bulge:1},{x:20,y:20}],false,2),points=mesh.flatMap(m=>m.vertices);
 for(const radius of [9,11]){const offset=Math.sqrt(radius*radius-50)/Math.sqrt(2),gold={x:15+offset,y:5-offset};expect(Math.min(...points.map(p=>Math.hypot(p.x-gold.x,p.y-gold.y)))).toBeLessThan(1e-8);}
});
it('arc-arc and closed curved paths remain finite and joined',()=>{
 for(const closed of [false,true]){const mesh=widePolyline([{x:0,y:0,bulge:.5,startWidth:1,endWidth:2},{x:20,y:0,bulge:-.5,startWidth:2,endWidth:3},{x:30,y:10,bulge:.3}],closed,2);expect(mesh.length).toBeGreaterThan(10);expect(mesh.flatMap(m=>m.vertices).every(p=>Number.isFinite(p.x+p.y))).toBe(true);}
});
it('SHX MTEXT paragraphs, scoped height width oblique underline and rotation',()=>{
 const e={text:'A\\P{\\H2x;\\W0.5;\\Q15;\\LA\\l}A',height:10,width:100,attachmentPoint:1,position:{x:30,y:40}};
 const g=shxMtextGeometry(e,font);expect(g).not.toBeNull();expect(g!.flat().every(p=>Number.isFinite(p.x+p.y))).toBe(true);expect(Math.min(...g!.flat().map(p=>p.y))).toBeLessThan(30);
 const rotated=shxMtextGeometry({...e,rotation:90},font)!;
 for(let i=0;i<g!.length;i++)for(let j=0;j<g![i].length;j++){expect(rotated[i][j].x-30).toBeCloseTo(-(g![i][j].y-40),8);expect(rotated[i][j].y-40).toBeCloseTo(g![i][j].x-30,8);}
});
it('native ZWCAD MTEXT fixture bottom matches read-only gold at 39.3333333',()=>{
 const g=shxMtextGeometry({text:'A\\P{\\H2x;\\W0.5;\\Q15;\\LA\\l}A',height:10,width:100,attachmentPoint:1,position:{x:0,y:80}},font)!;
 expect(Math.min(...g.flat().map(p=>p.y))).toBeCloseTo(39.33333333333333,8);
 expect(Math.max(...g.flat().map(p=>p.y))).toBeCloseTo(80,8);
});
it('unsupported MTEXT and overflow fall back, never silently strip formatting',()=>{
 for(const text of ['A\\S1/2;','{A','A\\C1;','AB'])expect(shxMtextGeometry({text,height:10},font)).toBeNull();
 expect(shxMtextGeometry({text:'AA',height:10,width:1},font)).toBeNull();
});
it('all nine attachment points translate, without changing geometry',()=>{
 const list=Array.from({length:9},(_,i)=>shxMtextGeometry({text:'AA\\PA',height:10,attachmentPoint:i+1},font)!);
 expect(list.every(g=>g.length===list[0].length)).toBe(true);
 expect(list[2][0][0].x).toBeLessThan(list[0][0][0].x);expect(list[6][0][0].y).toBeGreaterThan(list[0][0][0].y);
});
