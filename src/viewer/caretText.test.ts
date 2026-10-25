import { describe, expect, it } from "vitest";
import { decodeCaretEntities, decodeCaretText } from "./caretText";

describe("DXF 字串的 ^J 換行碼", () => {
  it("MTEXT 的 ^J 變成換行，TEXT 變成空白；^M 拿掉、^I 變空白；一般的 ^ 不動", () => {
    // 永益14H客變圖「廚具變更」：第二行中間夾一個 Enter
    expect(decodeCaretText("廚具變更：\\P1.辦退電器櫃\\P2.面板變更全白灰^J(層板燈封板改白灰)", true))
      .toBe("廚具變更：\\P1.辦退電器櫃\\P2.面板變更全白灰\\P(層板燈封板改白灰)");
    expect(decodeCaretText("A^JB", false)).toBe("A B");
    expect(decodeCaretText("A^M^JB^IC", true)).toBe("A\\PB C");
    expect(decodeCaretText("10^3 與 x^2", true)).toBe("10^3 與 x^2");
  });

  it("圖面與圖塊內的文字都會處理", () => {
    const doc = { entities: [{ type: "MTEXT", text: "a^Jb" }, { type: "TEXT", text: "c^Jd" }], blocks: { B: { entities: [{ type: "ATTRIB", text: "e^Jf" }] } } };
    expect(decodeCaretEntities(doc)).toBe(3);
    expect(doc.entities.map((e) => e.text)).toEqual(["a\\Pb", "c d"]);
    expect(doc.blocks.B.entities[0].text).toBe("e f");
  });
});
