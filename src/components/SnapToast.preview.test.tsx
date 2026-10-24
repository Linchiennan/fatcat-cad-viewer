// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {SnapToast} from './SnapToast';
it('keeps live snap visible, clears out-of-tolerance and mode exit, retains confirmed tap toast',async()=>{
 vi.useFakeTimers();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement('div'),root=createRoot(el);
 const render=async(props:any)=>act(()=>root.render(<SnapToast {...props}/>));
 await render({text:null,serial:0,previewText:'端點'});
 expect(el.querySelector('.snap-toast.on')?.textContent).toBe('端點');
 await act(()=>vi.advanceTimersByTime(2500));expect(el.querySelector('.snap-toast.on')?.textContent).toBe('端點');
 await render({text:null,serial:0,previewText:null});expect(el.querySelector('.snap-toast.on')).toBeNull();
 await render({text:'已點到垂足',serial:1});expect(el.querySelector('.snap-toast.on')?.textContent).toBe('已點到垂足');
 await render({text:null,serial:0});expect(el.querySelector('.snap-toast.on')).toBeNull();
 await act(()=>root.unmount());vi.useRealTimers();
});
