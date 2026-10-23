import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {recordDiagnostic,readDiagnostics,flushDiagnostics,beginParse,failParse,readParseReceipt,diagnosticError} from './parseAudit';
it('keeps bounded persistent errors and latest events without drawing bytes or paths',async()=>{
 recordDiagnostic('js.error',diagnosticError(new Error('C:/Users/private/drawing.dwg failed')),true);
 for(let i=0;i<230;i++)recordDiagnostic('open.phase',{stage:'phase-'+i});
 await flushDiagnostics();const first=await readDiagnostics();
 expect(first.events.length).toBeLessThanOrEqual(200);expect(first.errors.length).toBe(1);
 expect(JSON.stringify(first)).not.toContain('C:/Users/private');
 expect(first.errors[0].data.stack).toContain('Error');
 expect(await readDiagnostics()).toEqual(first);
});
it('failed parse persists identity and failure but cannot advance successful receipt',async()=>{
 const f=new File(['not-a-dwg'],'bad.dwg');await beginParse(f,'old-library-id');failParse(f,new Error('bad source'),'convert');await flushDiagnostics();
 const r=await readDiagnostics();expect(r.current?.sourceSHA256).toMatch(/^[a-f0-9]{64}$/);expect(r.current?.status).toBe('failed');expect(r.current?.name).toBe('bad.dwg');
 expect(await readParseReceipt('old-library-id')).toBeNull();expect(JSON.stringify(r)).not.toContain('not-a-dwg');
 vi.resetModules();const fresh=await import('./parseAudit');expect(await fresh.readDiagnostics()).toEqual(r);
});
