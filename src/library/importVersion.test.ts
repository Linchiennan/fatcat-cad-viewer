import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
let lib: typeof import('./drawingLibrary');
beforeEach(async()=>{vi.resetModules(); vi.stubGlobal('indexedDB',new IDBFactory()); lib=await import('./drawingLibrary');});
afterEach(()=>vi.unstubAllGlobals());
it('update uses existing identity and preserves other files; copies use a new identity',async()=>{
 const old=await lib.importDrawingToLibrary(f()); const other=await lib.importDrawingToLibrary(new File(['other'],'other.dxf'));
 const r=await lib.importDrawingWithDecision(f('BBBBBB',2000),'root',async c=>{expect(c.reasons).toContain('大小不同');return 'update';});
 expect(r).toMatchObject({status:'saved',entry:{id:old.id,parentId:'root',name:old.name,lastModified:2000}});
 expect(await (await lib.readLibraryDrawing(old.id)).text()).toBe('BBBBBB');
 expect(await (await lib.readLibraryDrawing(other.id)).text()).toBe('other');
 const copy=await lib.importDrawingWithDecision(f(),'root',async()=> 'copy');
 expect(copy).toMatchObject({entry:{name:'plan (2).dxf'}}); expect(await lib.listLibraryDrawings()).toHaveLength(3);
});
it('same metadata compares every byte; identical file is not saved again',async()=>{
 const old=await lib.importDrawingToLibrary(f()); const decide=vi.fn(async()=> 'cancel' as const);
 expect(await lib.importDrawingWithDecision(f(),'root',decide)).toMatchObject({status:'same',entry:{id:old.id}});
 expect(decide).not.toHaveBeenCalled();
 await lib.importDrawingWithDecision(f('BBBB'),'root',decide); expect(decide).toHaveBeenCalledOnce();
 expect(await lib.listLibraryDrawings()).toHaveLength(1);
});
it('unknown date stays unknown and cannot silently deduplicate',async()=>{
 const old=await lib.importDrawingToLibrary(f('AAAA',0)); expect(old.lastModified).toBe(0);
 const decide=vi.fn(async(_c: import('./drawingLibrary').ImportConflict)=> 'update' as const);
 await lib.importDrawingWithDecision(f('BBBB',0),'root',decide);
 expect(decide.mock.calls[0][0].reasons).toContain('來源修改日期無法確認');
 expect((await lib.listLibraryDrawings())[0].lastModified).toBe(0);
});
it('different folders do not conflict',async()=>{
 const dest=await lib.createLibraryFolder('root','Project B'); await lib.importDrawingToLibrary(f());
 const decide=vi.fn(async()=> 'cancel' as const);
 expect(await lib.importDrawingWithDecision(f(),dest.id,decide)).toMatchObject({status:'saved',entry:{parentId:dest.id,name:'plan.dxf'}});
 expect(decide).not.toHaveBeenCalled();
});
it('rejects a changed target during decision without overwriting or copying',async()=>{
 const old=await lib.importDrawingToLibrary(f());
 await expect(lib.importDrawingWithDecision(f('BBBB'),'root',async()=>{await lib.replaceLibraryDrawing(old.id,f('CCCC'));return 'update';})).rejects.toMatchObject({code:'DUPLICATE_NAME'});
 expect(await (await lib.readLibraryDrawing(old.id)).text()).toBe('CCCC'); expect(await lib.listLibraryDrawings()).toHaveLength(1);
});
it('archive extraction preserves supplied source time; unknown remains unknown',async()=>{
 const r=await lib.importArchiveToLibrary([{path:'plan.dxf',file:f('AAAA',2222)}],'root','pack.zip');
 expect(r.drawings[0].lastModified).toBe(2222);
});
it('guarded same-name archive update also preserves identity',async()=>{
 const a=await lib.importDrawingToLibrary(new File(['zipA'],'pack.zip',{lastModified:1000}));
 const r=await lib.importDrawingWithDecision(new File(['zipB'],'pack.zip',{lastModified:2000}),'root',async()=> 'update');
 expect(r).toMatchObject({entry:{id:a.id,lastModified:2000}});expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe('zipB');
});
const f=(text='AAAA',date=1000)=>new File([text],'plan.dxf',{lastModified:date});
for (const choice of ['update','copy'] as const) it(`CAS refuses ${choice} if the chosen target moves during the dialog`,async()=>{
 const a=await lib.importDrawingToLibrary(f());const folder=await lib.createLibraryFolder('root','elsewhere');
 await expect(lib.importDrawingWithDecision(f('BBBB'),'root',async()=>{await lib.moveLibraryEntry(a.id,folder.id);return choice;})).rejects.toMatchObject({code:'DUPLICATE_NAME'});
 expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe('AAAA');expect((await lib.listLibraryDrawings())[0].parentId).toBe(folder.id);
});
it('CAS refuses a same-millisecond replacement with equal metadata',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(5555);
 const a=await lib.importDrawingToLibrary(f());
 await expect(lib.importDrawingWithDecision(f('BBBB'),'root',async()=>{await lib.replaceLibraryDrawing(a.id,f('CCCC'));return 'update';})).rejects.toMatchObject({code:'DUPLICATE_NAME'});
 expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe('CCCC');vi.restoreAllMocks();
});
it('source bytes changing while awaiting decision are rejected',async()=>{
 const a=await lib.importDrawingToLibrary(f());const source=f('BBBB');
 await expect(lib.importDrawingWithDecision(source,'root',async()=>{vi.spyOn(source,'arrayBuffer').mockResolvedValue(new TextEncoder().encode('CCCC').buffer);return 'update';})).rejects.toMatchObject({code:'DUPLICATE_NAME'});
 expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe('AAAA');
});
it('full-byte comparison sees changed suffix beyond a shared large prefix',async()=>{
 const prefix='A'.repeat(1000000);await lib.importDrawingToLibrary(f(prefix+'1'));
 const decide=vi.fn(async()=> 'cancel' as const);await lib.importDrawingWithDecision(f(prefix+'2'),'root',decide);expect(decide).toHaveBeenCalledOnce();
});
it('same size but different source date requires explicit choice even with identical bytes',async()=>{
 const old=await lib.importDrawingToLibrary(f()); const decide=vi.fn(async(_c: import('./drawingLibrary').ImportConflict)=> 'cancel' as const);
 const result=await lib.importDrawingWithDecision(f('AAAA',2000),'root',decide);
 expect(decide).toHaveBeenCalledOnce(); expect(decide.mock.calls[0][0].reasons).toContain('修改日期不同');
 expect(result.status).toBe('cancelled'); expect(await lib.listLibraryDrawings()).toEqual([old]);
});
