import {it,expect} from 'vitest';import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';import {installEngineeringScene} from './engineering';
import 'fake-indexeddb/auto';import fs from 'node:fs';import {importCadFont} from './cadFonts';import {installCadFontScene} from './cadFontsScene';
it('actual scene emits embedded SHX shape and text at repeated offsets',async()=>{
 const b=fs.readFileSync('fixtures/fatcat-test.shx');await importCadFont(new File([b],'fatcat-test.shx'));
 class S extends DxfScene{};installCadFontScene(S);installEngineeringScene(S);
 const d:any={tables:{style:{styles:{F:{handle:'AB',styleName:'F',font:'fatcat-test.shx'}}},lineType:{lineTypes:{L:{complex:true,pattern:[5,-5],elements:[{length:5,flags:0},{length:-5,flags:4,styleHandle:'AB',shape:65,scale:1,x:0,y:2}]}}}},entities:[{type:'LINE',lineType:'L',vertices:[{x:0,y:0},{x:30,y:0}]}]};
 const s:any=new S();await s.Build(d,[]);expect(s.cadComplexResults?.rendered).toBeGreaterThan(0);expect(d.cadReport.warnings.some((w:string)=>w.includes('尚未繪製'))).toBe(false);
});
const dxf='0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n0\nLTYPE\n2\nTEST\n73\n2\n40\n10\n49\n5\n74\n0\n49\n-5\n74\n2\n75\n0\n340\nAB\n46\n2\n50\n0.5\n44\n1\n45\n2\n9\nGAS\n0\nENDTAB\n0\nENDSEC\n0\nEOF\n';
it('preserves complex element flags/style handle/scale/angle/offset/text',()=>{const d:any=new DxfParser().parseSync(dxf);expect(d.tables.lineType.lineTypes.TEST.elements?.[1]).toMatchObject({length:-5,flags:2,styleHandle:'AB',scale:2,rotation:.5,x:1,y:2,text:'GAS'});});
it('draws the stock ltypeshp circle when the shape-file style was dropped (惠宇敦南 FENCELINE1)',async()=>{
 class S extends DxfScene{};installCadFontScene(S);installEngineeringScene(S);
 // FENCELINE1 (metric): 6.35, gap -2.54 with CIRC1 (133) S=2.54 X=-2.54, gap -2.54, 25.4; style 4F9E20 is not in the table
 const d:any={tables:{style:{styles:{}},lineType:{lineTypes:{FENCELINE1:{complex:true,pattern:[6.35,-2.54,-2.54,25.4],elements:[{length:6.35,flags:0},{length:-2.54,flags:4,shape:133,styleHandle:'4F9E20',scale:2.54,rotation:0,x:-2.54,y:0},{length:-2.54,flags:0},{length:25.4,flags:0}]}}}},entities:[{type:'LINE',lineType:'FENCELINE1',vertices:[{x:0,y:0},{x:100,y:0}]}]};
 const s:any=new S();await s.Build(d,[]);
 expect(s.cadComplexResults?.rendered).toBeGreaterThan(0);
 expect(d.cadReport.warnings.some((w:string)=>w.includes('FENCELINE1'))).toBe(false);
});
it('does not list a line-type text drawn in a substitute font as not drawn (喬瓏 鑫元鴻 新3-4IN排水管)',async()=>{
 class S extends DxfScene{};installCadFontScene(S);installEngineeringScene(S);
 const d:any={tables:{style:{styles:{AE:{handle:'27AED7',styleName:'AE',font:'romans.shx',bigFont:'ae.shx'}}},lineType:{lineTypes:{PIPE:{complex:true,pattern:[0.5,-0.125,-0.125],elements:[{length:0.5,flags:0},{length:-0.125,flags:2,styleHandle:'27AED7',scale:0.125,rotation:0,x:-0.0225,y:-0.0625,text:'I'},{length:-0.125,flags:0}]}}}},entities:[{type:'LINE',lineType:'PIPE',vertices:[{x:0,y:0},{x:10,y:0}]},{type:'TEXT',text:'I',startPoint:{x:0,y:5},textHeight:1}]}; // drawings carry Latin text, so the fonts load
 const {parse}=await import('opentype.js');const fonts=['LiberationSans-Regular.ttf','NotoSansCJKtc-Regular.otf'].map(n=>async()=>{const b=fs.readFileSync('public/fonts/'+n);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));});
 const s:any=new S();await s.Build(d,fonts);
 expect(s.cadComplexResults?.rendered).toBeGreaterThan(0);
 expect(d.cadReport.warnings.some((w:string)=>w.includes('PIPE'))).toBe(false);
});
