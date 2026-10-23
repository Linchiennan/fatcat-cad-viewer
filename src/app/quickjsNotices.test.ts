import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THIRD_PARTY } from './legalText';
describe('QuickJS distributed notices',()=>{
 it('exposes the shipped engine and PDF.js wrapper notices in the app',()=>{
  const rows=THIRD_PARTY.filter(x=>x.name.includes('QuickJS'));
  expect(rows).toHaveLength(2);
  expect(rows.every(x=>x.license==='MIT')).toBe(true);
  expect(rows.flatMap(x=>x.texts).sort()).toEqual(['pdfjs-quickjs-MIT.txt','quickjs-MIT.txt']);
 });
 it('preserves complete permission and author notices',()=>{
  const core=readFileSync('licenses/quickjs-MIT.txt','utf8');
  expect(core).toContain('Fabrice Bellard');expect(core).toContain('Charlie Gordon');
  for(const file of ['quickjs-MIT.txt','pdfjs-quickjs-MIT.txt']){
   const t=readFileSync('licenses/'+file,'utf8');expect(t).toContain('Permission is hereby granted');expect(t).toContain('THE SOFTWARE IS PROVIDED');
  }
 });
});
