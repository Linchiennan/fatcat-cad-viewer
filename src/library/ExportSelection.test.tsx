// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';import {act} from 'react';import {createRoot} from 'react-dom/client';import 'fake-indexeddb/auto';
import {ExportsView} from './ExportsView';import {saveExport,listExports} from './exportStore';
it('hold selects; all/none, exit and confirmed selected-only delete',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 for(let i=0;i<11;i++)await saveExport({blob:new Blob(['png']),mime:'image/png',fileName:`${i}.png`,widthPx:1,heightPx:1,dpi:72,downscaled:false,thumbnail:new Blob(['preview'])});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<ExportsView popup={null} setPopup={()=>{}} busy={false} runBusy={async f=>{await f();}} notify={()=>{}} inert={false}/>));
 await act(async()=>{await new Promise(r=>setTimeout(r,40));});
 const buttons=()=>[...host.querySelectorAll<HTMLButtonElement>('button')];const button=(s:string)=>buttons().find(b=>b.textContent===s)!;
 expect(host.querySelectorAll('.export-grid .export')).toHaveLength(11);
 const card=host.querySelector<HTMLButtonElement>('.lib-row-main')!;
 await act(async()=>{card.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:1,clientY:1}));await new Promise(r=>setTimeout(r,650));});
 expect(host.querySelectorAll('input:checked')).toHaveLength(1);
 await act(async()=>card.click());expect(host.querySelectorAll('input:checked')).toHaveLength(1);
 await act(async()=>button('全部選擇').click());expect(host.querySelectorAll('input:checked')).toHaveLength(11);
 await act(async()=>button('全部取消').click());expect(host.querySelectorAll('input:checked')).toHaveLength(0);
 await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
 await act(async()=>button('刪除').click());expect(await listExports()).toHaveLength(11);
 expect(host.querySelector('[role=alertdialog]')?.textContent).toContain('1');
 await act(async()=>button('確認刪除').click());await act(async()=>{await new Promise(r=>setTimeout(r,40));});
 expect(await listExports()).toHaveLength(10);expect(host.querySelectorAll('input:checked')).toHaveLength(0);
 await act(async()=>button('退出選擇').click());expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
 await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();
});
