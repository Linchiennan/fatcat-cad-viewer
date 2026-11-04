import { beforeAll, expect, it } from "vitest";
import fs from "node:fs";
import { parse } from "opentype.js";
import "dxf-viewer/src/DxfScene.js";
import { TextRenderer } from "dxf-viewer/src/TextRenderer.js";
import { ENGINE_FONTS } from "./cadEngine";

// ≒ is in Big5 and common on drawings (喬瓏 鑫元鴻 火警圖、惠宇敦南 A06-09) but neither Noto CJK TC nor Liberation has it.
const load = (p: string) => async () => { const b = fs.readFileSync("public/" + p); return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
let r: any;
beforeAll(async () => { r = new TextRenderer(ENGINE_FONTS.slice(0, -1).map(load)); });
it("the engine fonts draw ≒", async () => {
  expect(await r.FetchFonts("約≒20m")).toBe(true);
  expect(r._GetCharShape("≒")).not.toBeNull();
});
