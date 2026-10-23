import { describe, expect, it } from "vitest";
import { splitCadWarnings } from "./cadWarnings";

describe("missing-parts list", () => {
  it("keeps real gaps and moves drawing-method notes aside (A03 sheet)", () => {
    const { missing, notes } = splitCadWarnings([
      "A03--制水閥箱箱體圖.dwg：DWG解析傳回 1 筆診斷",
      "惠宇圖框.dwg：DWG解析傳回 1 筆診斷",
      "字型以內附 Latin／繁中字型替代；SHX／原字型字寬未保證相同",
      "裁切物件僅提供完整可見物件的整體量測；跨界物件不回報隱藏段全長。反向／多層裁切仍需原CAD核對",
      "弧段寬度按弧長漸變、徑向偏移；繪製每段不超過1度，弧線交接仍須原CAD核對",
      "直段採偏移邊精確交點；曲線接角求實際偏移曲線交點，退化或超界採斜角，未宣稱所有CAD同形",
      "DWG解析引擎傳回 1 筆診斷；可能含缺件或資料越界，未視為完整",
    ]);
    expect(missing).toEqual([]);
    expect(notes.filter((n) => n.includes("內部提醒"))).toEqual([
      "A03--制水閥箱箱體圖.dwg：解析時有 1 則內部提醒，通常不影響畫面；若圖面有缺漏請回 CAD 核對",
      "惠宇圖框.dwg：解析時有 1 則內部提醒，通常不影響畫面；若圖面有缺漏請回 CAD 核對",
    ]);
    expect(notes).toHaveLength(6);
  });

  it("counts things that are not drawn or drawn wrongly as missing", () => {
    const { missing, notes } = splitCadWarnings([
      "未支援物件 REGION：2（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）",
      "外部參考 1 筆未載入：請在外參面板選檔套用",
      "部分文字缺字，請勿視為完整圖面",
      "舊式引線 1FF2D 為曲線引線，以直線近似",
      "DWG解析引擎傳回 3 筆診斷；可能含缺件或資料越界，未視為完整",
    ]);
    expect(missing).toEqual(["未支援物件 REGION：2（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）", "外部參考 1 筆未載入：請在外參面板選檔套用", "部分文字缺字，請勿視為完整圖面"]);
    expect(notes).toEqual(["舊式引線 1FF2D 為曲線引線，以直線近似", "解析時有 3 則內部提醒，通常不影響畫面；若圖面有缺漏請回 CAD 核對"]);
  });
});
