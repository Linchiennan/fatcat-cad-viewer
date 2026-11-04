// dxf-viewer 1.0.48: MTEXT wraps only at spaces, so a run of CJK text with no spaces never breaks.
// AutoCAD/ZWCAD break between any two CJK characters: a 冰箱位置 box 18 wide at height 15 stacks one
// character per line (惠宇 007 廚房水電配置圖). Each CJK character, and the character after one, starts
// its own chunk so BuildLines can break there. Run after patch-mtext-height.mjs (it applies the other MTEXT patches).
import fs from 'node:fs';
const file = 'node_modules/dxf-viewer/src/TextRenderer.js';
// Inserted ahead of the other patches' chunk tests in FeedChar, so their own idempotence anchors stay intact.
const old = `        if (shape === null) {
            return
        }
        if (this.curChunk !== null && this.curChunk.block === null`;
const next = `        if (shape === null) {
            return
        }
        if (this.curChunk !== null && this.curChunk.lastChar !== null && (IsCjkBreak(c) || IsCjkBreak(this.curChunk.lastChar))) {
            this._AddChunk()
        }
        if (this.curChunk !== null && this.curChunk.block === null`;
const helperAnchor = 'TextBox.Paragraph = class {';
const helper = `/** A line may break before or after this character (CJK ideographs, kana, hangul, full-width forms). */
function IsCjkBreak(c) {
    return /[\\u2E80-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF\\uFF00-\\uFFEF]/.test(c)
}

TextBox.Paragraph = class {`;
let s = fs.readFileSync(file, 'utf8');
if (!s.includes(next)) {
  if (!s.includes(old)) throw Error('MTEXT CJK wrap version anchor mismatch: ' + file);
  s = s.replace(old, next);
}
if (!s.includes('function IsCjkBreak(')) {
  if (!s.includes(helperAnchor)) throw Error('MTEXT CJK wrap helper anchor mismatch: ' + file);
  s = s.replace(helperAnchor, helper);
}
fs.writeFileSync(file, s);
