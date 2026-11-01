import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
// 靠左的 TEXT 從插入點起算，開頭空白也佔位；以前第一個有筆畫的字被對到插入點，空白不見
// （世舜 太原段 弱電「  防盜主機…」左移兩個字高，蓋住自己的「7.」）。
let r: any;
beforeAll(async () => { r = new TextRenderer([async () => { const b = fs.readFileSync('public/fonts/LiberationSans-Regular.ttf'); return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }]); await r.FetchFonts(' A'); });
const minX = (text: string) => Math.min(...[...r.Render({text, startPos: {x: 100, y: 0}, fontSize: 10, color: 0})].flatMap((e: any) => e.vertices).map((v: any) => v.x));
it('keeps leading spaces of a left-aligned TEXT', () => {
  const space = r.GetLineWidth(' ', 10);
  expect(space).toBeGreaterThan(1);
  expect(minX('  A') - minX('A')).toBeCloseTo(2 * space, 6);
});
it('starts a left-aligned TEXT at the insertion point, not at its first stroke', () => {
  expect(minX('A')).toBeGreaterThanOrEqual(100);
});
