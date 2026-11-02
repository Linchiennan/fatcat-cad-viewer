import { expect, it } from "vitest";
import 'dxf-viewer/src/DxfScene.js';
// @ts-expect-error the engine's type file does not declare this helper
import { ParseSpecialChars } from "dxf-viewer/src/TextRenderer.js";
import { plainCadText } from "./textSearch";

// 喬瓏 管道間配罝-RF：「2%%34RP」在 ZWCAD 是 2"RP（%%數字＝十進位字碼），App 照字面畫出 %%34
it("draws %%nnn as the character with that decimal code", () => {
  expect(ParseSpecialChars("2%%34RP")).toBe('2"RP');
  expect(ParseSpecialChars("1-1/2%%34ACP %%d %%%")).toBe('1-1/2"ACP ° %');
  expect(plainCadText("2%%34RP")).toBe('2"RP');
});
