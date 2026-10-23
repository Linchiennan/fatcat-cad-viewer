import 'fake-indexeddb/auto';import {it,expect} from 'vitest';import fs from 'node:fs';
import {importCadFont,listCadFonts,removeCadFont} from './cadFonts';
it('validates and persists only local SHX bytes then deletes exact name',async()=>{
 const b=fs.readFileSync('fixtures/fatcat-test.shx');await importCadFont(new File([b],'Fatcat-test.SHX'));
 const list=await listCadFonts();expect(list.find(f=>f.name==='fatcat-test.shx')?.data.byteLength).toBe(b.length);
 await expect(importCadFont(new File(['not a font'],'bad.shx'))).rejects.toThrow();
 await removeCadFont('fatcat-test.shx');expect((await listCadFonts()).some(f=>f.name==='fatcat-test.shx')).toBe(false);
});
