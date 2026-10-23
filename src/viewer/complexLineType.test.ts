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
