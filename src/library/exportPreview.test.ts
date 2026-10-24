// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({getPage:vi.fn(),destroy:vi.fn(),render:vi.fn(),getDocument:vi.fn()}));
vi.mock('../pdf/PdfViewer',()=>({loadPdfJs:async()=>({getDocument:f.getDocument}),runtimeUrl:(p:string)=>p}));
it('renders only page one at bounded thumbnail size and releases PDF resources',async()=>{
 const canvas=document.createElement('canvas');vi.spyOn(document,'createElement').mockReturnValue(canvas);vi.spyOn(canvas,'getContext').mockReturnValue({} as never);vi.spyOn(canvas,'toBlob').mockImplementation(cb=>cb(new Blob(['preview'])));
 f.render.mockReturnValue({promise:Promise.resolve()});f.getPage.mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:1000*scale,height:500*scale}),render:f.render,cleanup:vi.fn()});
 f.getDocument.mockReturnValue({promise:Promise.resolve({numPages:12,getPage:f.getPage}),destroy:f.destroy});
 const m=await import('./exportPreview');
 const file={arrayBuffer:async()=>new ArrayBuffer(5)} as File;const result=await m.renderExportPreview(file,'pdf');
 expect(result.pageCount).toBe(12);expect(f.getPage).toHaveBeenCalledExactlyOnceWith(1);expect(canvas.width).toBe(240);expect(canvas.height).toBe(120);expect(f.destroy).toHaveBeenCalledOnce();vi.restoreAllMocks();
});
