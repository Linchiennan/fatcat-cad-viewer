import {it,expect} from 'vitest';
import {prepareCad} from './engineering';
it('reports fallback font even when DXF omits STYLE table',()=>{
 const r=prepareCad({entities:[{type:'TEXT',text:'文字',startPoint:{x:0,y:0},textHeight:10}]});expect(r.warnings.some(s=>s.includes('字型'))).toBe(true);
});
it('warns that clipped objects are excluded from full-length picking',()=>{
 const r=prepareCad({entities:[{type:'INSERT',name:'B',position:{x:0,y:0},xdata:{FATCAT_XCLIP:{values:[{code:1000,value:'0,0;10,10'}]}}}],blocks:{B:{entities:[]}}});expect(r.warnings.some(s=>s.includes('裁切')&&s.includes('量測'))).toBe(true);
});
