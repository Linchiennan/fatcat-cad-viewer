import { it, expect } from 'vitest';
import { parseCadFile } from './xrefs';

// Synthetic only: no private drawing, handles or manufacturer wording.
const encoded = '\\M+193FA\\M+1967B\\M+18CEA\\M+18365\\M+18358\\M+18367';
const dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1018\n9\n$DWGCODEPAGE\n3\nANSI_950\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nTEXT\n5\nA01\n8\n0\n10\n123.5\n20\n-4.25\n40\n3\n41\n0.89\n50\n15\n72\n2\n73\n0\n11\n140\n21\n-4.25\n1\n${encoded} / \\M+2A4A4\\M+2A4E5\n0\nENDSEC\n0\nEOF\n`;

it('automatically decodes mixed Japanese/Chinese MIF on every stored-source reopen without changing placement', async () => {
  const source = new File([dxf], 'synthetic-mixed.dxf');
  const original = new Uint8Array(await source.arrayBuffer());
  for (let reopen = 0; reopen < 2; reopen++) {
    // The library stores original bytes; each open creates a fresh File, not a predecoded scene.
    const file = new File([original], source.name);
    const doc = await parseCadFile(file);
    expect(doc.entities[0]).toMatchObject({
      text: '日本語テスト / 中文', textHeight: 3, xScale: 0.89, rotation: 15,
      startPoint: { x: 123.5, y: -4.25 }, endPoint: { x: 140, y: -4.25 },
      halign: 2, valign: 0,
    });
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(original);
  }
});
