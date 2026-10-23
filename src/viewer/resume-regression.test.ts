import {it,expect} from 'vitest';
import fs from 'node:fs';
import {DxfScene} from 'dxf-viewer/src/DxfScene.js';
import {installEngineeringScene} from './engineering';
import {installMeasurementPreparation,buildMeasurementGeometry} from './measurementGeometry';
import {createRequire} from 'node:module';
const {parse}=createRequire(import.meta.url)('opentype.js');
const fonts=['LiberationSans-Regular.ttf','NotoSansCJKtc-Regular.otf'].map(n=>{const b=fs.readFileSync('public/fonts/'+n);return parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));});
it('CJK text width factor, height, rotation and translation survive actual scene tessellation',async()=>{
 const bounds=async(xScale:number,textHeight:number,rotation:number,x=0,y=0)=>{
 class S extends DxfScene{};installMeasurementPreparation(S);installEngineeringScene(S);
 const d:any={entities:[{type:'TEXT',text:'中文測試',textHeight,xScale,rotation,startPoint:{x,y},layer:'0'}]};const s=new S();await s.Build(d,fonts.map(f=>async()=>f));expect((s as any).hasMissingChars).toBe(false);return d.cadMeasurement.entities[0].bounds;
 };
 const a=await bounds(1,10,0),b=await bounds(.5,10,0),c=await bounds(1,20,0),r=await bounds(1,10,90),t=await bounds(1,10,0,30,50);
 expect(b.maxX-b.minX).toBeCloseTo((a.maxX-a.minX)*.5,5);expect(b.maxY-b.minY).toBeCloseTo(a.maxY-a.minY,5);expect(c.maxY-c.minY).toBeCloseTo((a.maxY-a.minY)*2,5);expect(r.maxY-r.minY).toBeCloseTo(a.maxX-a.minX,5);expect(t.minX-a.minX).toBeCloseTo(30,5);expect(t.minY-a.minY).toBeCloseTo(50,5);
});
it('clipped objects do not expose hidden full length; outside endpoints are excluded',()=>{
 const d:any={blocks:{B:{name:'B',entities:[{type:'LINE',vertices:[{x:-10,y:5},{x:20,y:5}]}]}},entities:[{type:'INSERT',name:'B',position:{x:0,y:0},xdata:{FATCAT_XCLIP:{values:[{code:1000,value:'0,0;10,10'}]}}}]};
 const g=buildMeasurementGeometry(d);expect(g.entities).toHaveLength(0);expect(g.snaps.every(p=>p.x>=0&&p.x<=10)).toBe(true);expect(g.completeBounds).toBe(false);
});
it('combined outer+inner polygon excludes inverted hole in measurement',()=>{
 const poly='-20,-20;20,-20;20,20;-20,20;-20,-20;0,0;0,10;10,10;10,0;0,0;-20,-20';
 const d:any={blocks:{B:{name:'B',entities:[{type:'LINE',vertices:[{x:2,y:5},{x:8,y:5}]},{type:'LINE',vertices:[{x:-10,y:5},{x:-5,y:5}]}]}},entities:[{type:'INSERT',name:'B',position:{x:0,y:0},xdata:{FATCAT_XCLIP:{values:[{code:1000,value:poly}]}}}]};
 const g=buildMeasurementGeometry(d);expect(g.entities).toHaveLength(1);expect(g.entities[0].length).toBe(5);
});
