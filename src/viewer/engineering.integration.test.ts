import { describe,it,expect } from 'vitest';
import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';
import { DxfScene } from 'dxf-viewer/src/DxfScene.js';
import { installEngineeringScene, prepareCad } from './engineering';
import { installMeasurementPreparation } from './measurementGeometry';
import { assembleXrefs,matchXref,parseCadFile } from './xrefs';
const line=(colorIndex=256)=>({type:'LINE',handle:'A',layer:'0',colorIndex,vertices:[{x:0,y:0},{x:100,y:0}]});
const file=(name:string,d:any)=>new File(['FATCAT-DXF-JSON\n'+JSON.stringify(d)],name);
describe('工程整合fixture，非施工圖',()=>{
 it('parser 420不受62順序覆蓋',()=>{
  for(const color of ['62\n256\n420\n1193046\n','420\n1193046\n62\n256\n']){
   const d:any=new DxfParser().parseSync('0\nSECTION\n2\nENTITIES\n0\nLINE\n'+color+'10\n0\n20\n0\n11\n10\n21\n0\n0\nENDSEC\n0\nEOF\n');expect(d.entities[0].color).toBe(0x123456);expect(d.entities[0].trueColor).toBe(0x123456);
  }
 });
 it('巢狀BYBLOCK/圖層0不同實例不互染',()=>{
  const d:any={tables:{layer:{layers:{A:{name:'A',color:0xff0000},B:{name:'B',color:0x00ff00}}}},blocks:{B:{name:'B',entities:[line(0)]},C:{name:'C',entities:[{type:'INSERT',name:'B',layer:'0',colorIndex:0,position:{x:0,y:0}}]}},entities:[{type:'INSERT',name:'C',layer:'A',position:{x:0,y:0}},{type:'INSERT',name:'C',layer:'B',position:{x:10,y:0}}]};prepareCad(d);
  const colors=d.entities.map((e:any)=>d.blocks[d.blocks[e.name].entities[0].name].entities[0].trueColor);expect(colors).toEqual([0xff0000,0x00ff00]);
 });
 it('原關閉層幾何保留，report保存初始狀態',async()=>{
  class Scene extends DxfScene{};installMeasurementPreparation(Scene);installEngineeringScene(Scene);
  const d:any={tables:{layer:{layers:{H:{name:'H',visible:false,frozen:true,color:0xff0000}}}},entities:[{...line(),layer:'H'}]};const scene=new Scene();await scene.Build(d,[]);
  expect(d.cadReport.layers[0].visible).toBe(false);expect(d.cadMeasurement.entities).toHaveLength(1);expect(d.cadMeasurement.entities[0].length).toBe(100);expect(d.cadMeasurement.entities[0].properties.handle).toBe('A');
 });
 it('外參的0圖層＝主圖0圖層：圖塊內0圖層物件隨插入圖層的顏色（碁創潭子 屋頂排水 A/C）',async()=>{
  const root=file('root.dxf',{blocks:{X:{name:'X',xrefPath:'child.dxf',type:4,position:{x:0,y:0},entities:[]}},entities:[{type:'INSERT',name:'X',layer:'XREF',position:{x:0,y:0}}]});
  const child=file('child.dxf',{tables:{layer:{layers:{'0':{name:'0',color:0xffffff},AC:{name:'AC',color:0xff5500}}}},
   blocks:{AC1:{name:'AC1',position:{x:0,y:0},entities:[line()]}},entities:[{type:'INSERT',name:'AC1',layer:'AC',position:{x:0,y:0}}]});
  const out=await assembleXrefs(root,[child]);const d=await parseCadFile(out.file);
  expect(d.blocks['X|AC1'].entities[0].layer).toBe('0');
  expect(d.tables.layer.layers['X|0']).toBeUndefined();
  prepareCad(d);
  const inner=Object.values(d.blocks as Record<string,any>).filter((b:any)=>b.cadName==='X|AC1').flatMap((b:any)=>b.entities);
  expect(inner.length).toBeGreaterThan(0);
  for(const e of inner)expect(e.trueColor).toBe(0xff5500);
 });
 it('外參讀檔+平移旋轉縮放交給同一INSERT管線',async()=>{
  const root=file('root.dxf',{blocks:{X:{name:'X',xrefPath:'child.dxf',type:4,position:{x:0,y:0},entities:[]}},entities:[{type:'INSERT',name:'X',position:{x:30,y:40},xScale:2,yScale:2,rotation:90}]});
  const child=file('child.dxf',{tables:{layer:{layers:{'0':{name:'0',color:255}}}},entities:[line()]});const out=await assembleXrefs(root,[child]);const d=await parseCadFile(out.file);
  class Scene extends DxfScene{};installMeasurementPreparation(Scene);installEngineeringScene(Scene);await new Scene().Build(d,[]);
  const e=d.cadMeasurement.entities[0];expect(e.length).toBeCloseTo(200);expect(e.points[0].x).toBeCloseTo(30);expect(e.points[0].y).toBeCloseTo(40);expect(e.points[1].y).toBeCloseTo(240);expect(out.statuses[0].status).toContain('已載入');
 });
 it('同名衝突不猜，逐檔對應可解',()=>{const a=new File(['a'],'same.dxf'),b=new File(['b'],'same.dxf');Object.defineProperty(a,'webkitRelativePath',{value:'a/same.dxf'});Object.defineProperty(b,'webkitRelativePath',{value:'b/same.dxf'});expect(matchXref('same.dxf','root.dxf',[a,b],{})).toBeNull();expect(matchXref('same.dxf','root.dxf',[a,b],{'same.dxf':'b/same.dxf'})).toBe(b);});
 it('巢狀覆疊不傳遞，循環阻擋，關閉後無幾何',async()=>{
  const make=(name:string,path:string,type:number)=>file(name,{blocks:{X:{name:'X',xrefPath:path,type,entities:[]}},entities:[{type:'INSERT',name:'X',position:{x:0,y:0}}]});
  const root=make('root.dxf','child.dxf',4),child=make('child.dxf','root.dxf',12); // real overlay xrefs carry 4|8
  const overlay=await assembleXrefs(root,[root,child]);expect(overlay.statuses.some(s=>s.status==='巢狀覆疊不傳遞')).toBe(true);
  const cyclic=make('child.dxf','root.dxf',4);const cycle=await assembleXrefs(root,[root,cyclic]);expect(cycle.statuses.some(s=>s.status.includes('循環'))).toBe(true);
  const disabled=await assembleXrefs(root,[child],{},new Set(['child.dxf']));expect(disabled.statuses[0].status).toBe('已關閉');expect((await parseCadFile(disabled.file)).blocks.X.entities).toHaveLength(0);
 });
});
