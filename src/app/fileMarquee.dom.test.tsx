// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {FileBar} from './ViewerChrome';
it('animates only measured overflow and remeasures after resize',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let width=100;const callbacks:Array<()=>void>=[];
 vi.stubGlobal('ResizeObserver',class{constructor(cb:()=>void){callbacks.push(cb);}observe(){}disconnect(){}});
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
 vi.spyOn(HTMLElement.prototype,'scrollWidth','get').mockImplementation(function(this:HTMLElement){return this.textContent?.includes('long')?300:50;});
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FileBar name="long-name.dwg" source="short" size={2048} cardOpen={false} onCard={()=>{}} onLibrary={()=>{}} onClose={()=>{}}/>));
 expect(el.querySelectorAll('[data-overflow="true"]')).toHaveLength(1);
 width=500;await act(async()=>callbacks.forEach(cb=>cb()));
 expect(el.querySelectorAll('[data-overflow="true"]')).toHaveLength(0);
 await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
});
