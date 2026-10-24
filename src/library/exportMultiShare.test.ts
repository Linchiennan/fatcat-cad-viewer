import {it,expect,vi,afterEach} from 'vitest';import * as actions from './exportFileActions';import {Capacitor} from '@capacitor/core';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('shares the entire mixed selection in one Web Share call without waiting for reads',async()=>{
 const files=[new File(['a'],'a.png',{type:'image/png'}),new File(['b'],'b.pdf',{type:'application/pdf'})];
 const share=vi.fn(async()=>{});vi.stubGlobal('navigator',{canShare:()=>true,share});
 expect(actions).toHaveProperty('shareExportFiles');
 const pending=actions.shareExportFiles(files);expect(share).toHaveBeenCalledWith({files});expect(await pending).toBe('shared');
});
it('unsupported/native multi-file and denied share never silently downloads or shares first only',async()=>{
 vi.stubGlobal('navigator',{canShare:()=>false});expect(actions).toHaveProperty('shareExportFiles');
 const files=[new File(['a'],'a.png'),new File(['b'],'b.pdf')];expect(await actions.shareExportFiles(files)).toBe('unsupported');
 vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);expect(await actions.shareExportFiles(files)).toBe('unsupported');
 vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(false);vi.stubGlobal('navigator',{canShare:()=>true,share:async()=>{throw new DOMException('denied','NotAllowedError');}});
 await expect(actions.shareExportFiles(files)).rejects.toThrow('denied');
});
