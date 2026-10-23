import {IDBFactory} from 'fake-indexeddb';
import {beforeEach,it,expect,vi} from 'vitest';
import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';
let lib:typeof import('./drawingLibrary');
const dxf=(length:number)=>`0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n${length}\n21\n0\n31\n0\n0\nENDSEC\n0\nEOF\n`;
const file=(length:number,name='same.dxf')=>new File([dxf(length)],name,{lastModified:1234});
const length=async(f:File)=>(new DxfParser().parseSync(await f.text())!.entities[0] as unknown as {vertices:{x:number}[]}).vertices[1].x;
beforeEach(async()=>{vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());lib=await import('./drawingLibrary');});
it('code8 reproducer: rename/reopen/reparse is snapshot A, same-name reimport is distinct B',async()=>{
 const a=await lib.importDrawingToLibrary(file(10));
 const externalB=file(900); // replacement of external same path cannot mutate imported bytes
 await lib.renameLibraryEntry(a.id,'changed.dxf');
 const reopened=await lib.openLibraryDrawing(a.id);
 expect(reopened.name).toBe('changed.dxf');expect(await length(reopened)).toBe(10);
 expect(await length(await lib.openLibraryDrawing(a.id))).toBe(10);
 const b=await lib.importDrawingToLibrary(externalB);
 expect(await length(await lib.openLibraryDrawing(b.id))).toBe(900);
 expect(await length(await lib.openLibraryDrawing(a.id))).toBe(10);
 const c=await lib.importDrawingToLibrary(file(900,'other.dxf'));
 expect(await length(await lib.openLibraryDrawing(c.id))).toBe(900);
});
it('explicit replacement changes bytes atomically at same ID without touching other entries',async()=>{
 const a=await lib.importDrawingToLibrary(file(10));const other=await lib.importDrawingToLibrary(file(77,'xref.dxf'));
 const updated=await lib.replaceLibraryDrawing(a.id,file(900,'chosen.dxf'));
 expect(updated.id).toBe(a.id);expect(updated.name).toBe(a.name);expect(updated.parentId).toBe(a.parentId);
 expect(await length(await lib.openLibraryDrawing(a.id))).toBe(900);
 expect(await length(await lib.openLibraryDrawing(other.id))).toBe(77);
 expect(await lib.listLibraryChildren('root')).toHaveLength(2);
 await expect(lib.replaceLibraryDrawing(a.id,new File([],'bad.dxf'))).rejects.toMatchObject({code:'INVALID_FILE'});
 expect(await length(await lib.openLibraryDrawing(a.id))).toBe(900);
});
