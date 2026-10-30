import {beforeAll, expect, it} from 'vitest';
import fs from 'node:fs';
import {parse} from 'opentype.js';
import 'dxf-viewer/src/DxfScene.js';
import {TextRenderer} from 'dxf-viewer/src/TextRenderer.js';
import {MTextFormatParser} from 'dxf-viewer/src/MTextFormatParser.js';
// Noto CJK 有 31 個字唯一的實心外框是順時針（］ ｝ 〕 ㄟ ˙…），以前被當成找不到外框的洞而拋錯，
// 整張圖畫不出來（世舜 10175W-B 排水圖）。兩套字型（一般、SHX 用細體）都要能畫出實心。
const LONE = '］｝〕ㄟ˙';
for (const font of ['NotoSansCJKtc-Regular.otf', 'NotoSansCJKtc-Light.otf']) {
  let r: any;
  beforeAll(async () => { r = new TextRenderer([async () => { const b = fs.readFileSync('public/fonts/' + font); return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }]); await r.FetchFonts(LONE); });
  it(`${font}: clockwise-only glyphs render as filled solids instead of throwing`, () => {
    for (const ch of LONE) {
      const p = new MTextFormatParser(); p.Parse(ch);
      const out = [...r.RenderMText({formattedText: p.GetContent(), position: {x: 0, y: 0}, fontSize: 10, width: 0, rotation: 0, attachment: 1, color: 0xffffff})] as any[];
      const v = out.flatMap((e) => e.vertices);
      expect(v.length, ch).toBeGreaterThan(0);
      const xs = v.map((q: any) => q.x), ys = v.map((q: any) => q.y);
      expect(Math.max(...xs) - Math.min(...xs), ch).toBeGreaterThan(0.3);
      expect(Math.max(...ys) - Math.min(...ys), ch).toBeGreaterThan(0.3);
    }
  });
}
