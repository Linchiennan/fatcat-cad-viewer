import {it,expect} from 'vitest';
import 'fake-indexeddb/auto';
import {fileSource,rememberFileSource,resolveFileSource} from './fileSource';
import {importDrawingWithDecision,openLibraryDrawing,replaceLibraryDrawing,importDrawingToLibrary} from '../library/drawingLibrary';
it('preserves sanitized original provenance through frozen import, reopen and replacement',async()=>{
 const f=new File(['abc'],'source.dwg',{lastModified:1});rememberFileSource(f,'content://provider/actual.dwg?token=secret');
 const r=await importDrawingWithDecision(f,'root',async()=> 'copy');if(r.status==='cancelled')throw Error('cancelled');
 expect(fileSource(await openLibraryDrawing(r.entry.id))).toEqual({kind:'path',path:'content://provider/actual.dwg'});
 const next=new File(['abcd'],'source.dwg');rememberFileSource(next,'Folder/new.dwg');const updated=await importDrawingWithDecision(next,'root',async()=> 'update');expect(updated.status!=='cancelled' && updated.entry.id).toBe(r.entry.id);
 expect(await resolveFileSource(await openLibraryDrawing(r.entry.id),r.entry.id)).toEqual({kind:'path',path:'Folder/new.dwg'});
 await replaceLibraryDrawing(r.entry.id,new File(['unknown'],'source.dwg'));
 expect(await resolveFileSource(await openLibraryDrawing(r.entry.id),r.entry.id)).toEqual({kind:'import',path:''});
});
it('never substitutes library location for unavailable original path',async()=>{
 const f=new File(['old'],'old.dwg');const e=await importDrawingToLibrary(f);
 expect(await resolveFileSource(f,e.id)).toEqual({kind:'import',path:''});
});
