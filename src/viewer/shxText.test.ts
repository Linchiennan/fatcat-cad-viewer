import {it,expect} from 'vitest';import fs from 'node:fs';
import {ShxFont} from '@mlightcad/shx-parser/dist/index.es.js';
import {shxTextGeometry} from './shxText';
import 'fake-indexeddb/auto';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {installCadFontScene} from './cadFontsScene';
import {installMeasurementPreparation} from './measurementGeometry';
import {installEngineeringScene} from './engineering';
import {importCadFont} from './cadFonts';
it('actual DxfScene renders imported SHX strokes and retains measured glyph bounds',async()=>{
 await importCadFont(new File([b],'fatcat-test.shx'));
 class S extends DxfScene{};installCadFontScene(S);installMeasurementPreparation(S);installEngineeringScene(S);
 const d:any={tables:{style:{styles:{F:{styleName:'F',font:'fatcat-test.shx',widthFactor:.5}}}},entities:[{type:'TEXT',styleName:'F',text:'AA',textHeight:10,rotation:90,startPoint:{x:30,y:40}}]};
 const s=new S();await s.Build(d,[]);expect(d.cadMeasurement.entities).toHaveLength(1);expect(d.cadMeasurement.entities[0].bounds.maxY).toBeCloseTo(51,8);
 expect(d.cadReport.warnings.some((w:string)=>w.includes('替代'))).toBe(false);
});
const b=fs.readFileSync('fixtures/fatcat-test.shx');const font=new ShxFont(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
it('imports local TTF and uses its renderer for its named STYLE',async()=>{
 const bytes=fs.readFileSync('public/fonts/LiberationSans-Regular.ttf');await importCadFont(new File([bytes],'local.ttf'));
 class S extends DxfScene{};installCadFontScene(S);installMeasurementPreparation(S);installEngineeringScene(S);
 const d:any={tables:{style:{styles:{F:{styleName:'F',font:'local.ttf',widthFactor:.5}}}},entities:[{type:'TEXT',styleName:'F',text:'CAD',textHeight:10,startPoint:{x:0,y:0}}]};
 await new S().Build(d,[]);expect(d.cadMeasurement.entities).toHaveLength(1);expect(d.cadReport.warnings.some((w:string)=>w.includes('替代'))).toBe(false);
});
it('uses native SHX advances, cap height, width and rotation',()=>{
 const r=shxTextGeometry({text:'AA',textHeight:10,xScale:.5,rotation:90,startPoint:{x:30,y:40}},font);
 expect(r).not.toBeNull();const points=r!.flat();expect(Math.max(...points.map(p=>p.y))-40).toBeCloseTo(11,8);expect(30-Math.min(...points.map(p=>p.x))).toBeCloseTo(10,8);
});
it('missing glyph triggers whole text fallback rather than silent dropping',()=>{expect(shxTextGeometry({text:'AB',textHeight:10,startPoint:{x:0,y:0}},font)).toBeNull();});
