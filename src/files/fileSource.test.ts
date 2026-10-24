import {expect,it,vi} from 'vitest';
import {readIncomingDrawingFile} from '../native/incomingDrawing';
it('keeps the actual native handoff URI on the resulting File and uses bytes read',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('123')));
 try {
  const f=await readIncomingDrawingFile({id:'header-test',name:'a.dwg',size:3,mimeType:'application/acad',uri:'content://provider/document/actual.dwg?token=secret'});
  expect(f.size).toBe(3);
  expect(await resolveFileSource(f)).toEqual({kind:'path',path:'content://provider/document/actual.dwg'});
 }finally{vi.unstubAllGlobals();}
});
import {safeSourcePath,rememberFileSource,fileSource,resolveFileSource} from './fileSource';
import 'fake-indexeddb/auto';
import {createLibraryFolder,importDrawingToLibrary} from '../library/drawingLibrary';
it('retains actual picker metadata without credentials, fake paths or blob/data payloads',()=>{
 const file=new File(['123'],'a.dwg');
 rememberFileSource(file,'content://provider/tree/primary%3ADrawings/document/plan.dwg?token=secret#private');
 expect(fileSource(file)).toEqual({kind:'path',path:'content://provider/tree/primary%3ADrawings/document/plan.dwg'});
 expect(safeSourcePath('https://user:password@host/a.dwg?token=secret')).toBe('https://host/a.dwg');
 for(const path of ['C:\\fakepath\\a.dwg','data:text/plain,secret','blob:https://host/id'])expect(safeSourcePath(path)).toBe('');
});
it('uses browser relative path, otherwise admits path unavailable',async()=>{
 const f=new File(['123'],'a.dwg');expect(await resolveFileSource(f)).toEqual({kind:'import',path:''});
 Object.defineProperty(f,'webkitRelativePath',{value:'Folder/a.dwg'});
 expect(await resolveFileSource(f)).toEqual({kind:'path',path:'Folder/a.dwg'});
});
it('resolves real nested library metadata without inventing a filesystem path',async()=>{
 const a=await createLibraryFolder('root','工程');const b=await createLibraryFolder(a.id,'結構');const f=new File(['123'],'a.dwg');
 const e=await importDrawingToLibrary(f,b.id);
 expect(await resolveFileSource(f,e.id)).toEqual({kind:'library',path:'工程 / 結構 / a.dwg'});
});
