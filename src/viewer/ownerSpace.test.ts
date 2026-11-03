import { expect, it } from "vitest";
import { ownerOf } from "./cadDocument";

// 喬瓏 插座-2F：配置頁的 Defpoints 裁切框先在 {ACAD_REACTORS} 裡列出用它的視埠（330），真正的擁有者是後面的 330
it("takes the owner outside reactor and dictionary groups", () => {
  const r = { type: "LWPOLYLINE", section: "ENTITIES", block: "", tags: [[5, "298136"], [102, "{ACAD_REACTORS"], [330, "298137"], [102, "}"], [330, "29812B"], [100, "AcDbEntity"], [8, "Defpoints"]] as [number, string][] };
  expect(ownerOf(r)).toBe("29812B");
  expect(ownerOf({ ...r, tags: [[5, "1"], [330, "1F"], [8, "0"]] })).toBe("1F");
});
