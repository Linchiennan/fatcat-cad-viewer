// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {act} from 'react';import {createRoot} from 'react-dom/client';
import {GloveBar} from './ViewerToolbar';import {MarkupBar} from './MarkupBar';
it('markup clear lives at bottom and invokes clear, never home',async()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const onCommand=vi.fn(),onClearMarks=vi.fn(); const props={onCommand,onClearMarks,canClearMarks:true,canMeasure:true,marking:true,onMeasure:vi.fn(),onMarkup:vi.fn(),onSearch:vi.fn(),onInspect:vi.fn()};
 await act(async()=>root.render(<><MarkupBar tool="pen" color="#fff" count={1} sharing={false} onTool={()=>{}} onColor={()=>{}} onUndo={()=>{}} onShare={()=>{}} onDone={()=>{}}/><GloveBar {...props}/></>));
 expect(host.querySelector('.markup-bar [aria-label="清除"]')).toBeNull();
 const clear=host.querySelector<HTMLButtonElement>('.glove-bar [aria-label="清除"]');expect(clear).not.toBeNull();
 await act(async()=>clear!.click());expect(onClearMarks).toHaveBeenCalledOnce();expect(onCommand).not.toHaveBeenCalled();
 expect(host.querySelector('.glove-bar [aria-label="回到初始畫面"]')).toBeNull();
 await act(async()=>root.unmount());host.remove();
});
