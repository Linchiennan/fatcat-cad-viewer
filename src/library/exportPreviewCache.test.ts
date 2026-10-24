import {it,expect} from 'vitest';import 'fake-indexeddb/auto';import * as store from './exportStore';
it('persists page-one preview and page count without changing output bytes or resurrecting deleted exports',async()=>{
 const e=await store.saveExport({blob:new Blob(['pdf']),mime:'application/pdf',fileName:'pages.pdf',widthPx:1,heightPx:1,dpi:72,downscaled:false,thumbnail:new Blob([])});
 expect(store).toHaveProperty('cacheExportPreview');
 await store.cacheExportPreview(e.id,new Blob(['preview'],{type:'image/png'}),3);
 expect((await store.listExports()).find(x=>x.id===e.id)).toMatchObject({pageCount:3,previewVersion:1,thumbnailSize:7});
 expect(await (await store.readExport(e.id)).text()).toBe('pdf');expect((await store.readExportThumbnails([e.id])).get(e.id)?.size).toBe(7);
 await store.deleteExport(e.id);await store.cacheExportPreview(e.id,new Blob(['late']),3);expect(await store.listExports()).toHaveLength(0);
});
