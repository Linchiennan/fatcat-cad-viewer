// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {CheckStrip} from './ViewerChrome';
import {I18nProvider} from '../i18n/translations';
let host:HTMLDivElement,root:Root;
const tab=vi.fn(),space=vi.fn(),output=vi.fn();
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks();});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function mount(en=false,single=false){act(()=>root.render(<I18nProvider initial={en?'en':'zh-TW'}><CheckStrip spaces={single?[{name:'Model',order:0}]:[{name:'Model',order:0},{name:'Long layout 配置',order:1}]} space="Model" switching={false} missing={123456} xrefsUnloaded={99} onSpace={space} onTab={tab} onExport={output}/></I18nProvider>));}
function click(el:Element){act(()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));}
it('keeps model, layers and share on page one and restores diagnostics on page two',()=>{mount();expect([...host.querySelectorAll('[data-check-page="1"] button')].map(n=>n.textContent)).toEqual(['圖層','分享']);expect(host.querySelectorAll('select')).toHaveLength(1);expect(host.querySelectorAll('.check-strip-dots button')).toHaveLength(2);expect(host.querySelector('[data-check-page="2"]')?.hasAttribute('inert')).toBe(true);click(host.querySelectorAll('.check-strip-dots button')[1]);expect(host.querySelector('[data-check-page="1"]')?.hasAttribute('inert')).toBe(true);expect(host.querySelector('[data-check-page="2"]')?.textContent).toContain('123456');const diagnostics=host.querySelectorAll('[data-check-page="2"] button');click(diagnostics[0]);click(diagnostics[1]);expect(tab.mock.calls.map(c=>c[0])).toEqual(['missing','xrefs']);click(host.querySelectorAll('.check-strip-dots button')[0]);click(host.querySelector('nav button')!);click(host.querySelector('.strip-export')!);expect(tab).toHaveBeenCalledWith('layers');expect(output).toHaveBeenCalledTimes(1);const select=host.querySelector('select')!;act(()=>{select.value='Long layout 配置';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(space).toHaveBeenCalledWith('Long layout 配置');});
it('keeps model visible for a single-space drawing and translates share',()=>{mount(true,true);expect(host.querySelector('.space-name')?.textContent).toBe('Model');expect(host.querySelector('.strip-export')?.textContent).toBe('Share');expect(host.querySelector('[data-check-page="1"]')?.textContent).not.toContain('123456');});
