import { describe, expect, it } from "vitest";
import { repairWarning } from "./dxfRepair";
import { NO_3D_VIEWPORT } from "./cadDocument";
import { splitCadWarnings } from "./cadWarnings";
import { cadMessageText } from "./warningText";

const CJK = /[㐀-鿿！-～　-〿]/;
// Every message the viewer can show (one sample per sentence), as the engine writes it.
const SAMPLES = [
  "字型以內附 Latin／繁中字型替代；SHX／原字型字寬未保證相同",
  "裁切物件僅提供完整可見物件的整體量測；跨界物件不回報隱藏段全長。反向／多層裁切仍需原CAD核對",
  "缺少線型定義：DASHED2，暫以實線顯示",
  "弧段寬度按弧長漸變、徑向偏移；繪製每段不超過1度，弧線交接仍須原CAD核對",
  "直段採偏移邊精確交點；曲線接角求實際偏移曲線交點，退化或超界採斜角，未宣稱所有CAD同形",
  "部分尺寸標註由引擎重建；箭頭／樣式未逐件核對",
  "缺少圖塊：DOOR1",
  "循環或過深圖塊已略過：LOOP",
  "未支援物件 3DSOLID：12（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）",
  "未支援物件 ACAD_PROXY_ENTITY：3",
  "a.dwg：未支援物件 OLE2FRAME 2 筆",
  "外部參考 4 筆未載入：請在外參面板選檔套用",
  "剖面線 7 個的圖樣過密，以實心色塊繪製",
  "剖面線 1 個超過整張圖的繪製量，只畫外框",
  "雲形線 3 條的節點資料不完整，已改用近似形狀繪製",
  "部分文字缺字，請勿視為完整圖面",
  "複合線型 GAS 的文字／形狀尚未繪製，僅顯示線段pattern",
  "DWG解析引擎傳回 5 筆診斷；可能含缺件或資料越界，未視為完整",
  repairWarning(9),
  "此版本 DWG 的引線箭頭開關解析不可靠，已依 CAD 預設畫出，請與 CAD 核對",
  "舊式引線 2F3 箭頭樣式 _DOT 以實心箭頭近似",
  "多線 1A 含斷開段，依參數分段繪製",
  "多線 1A 的內弧端蓋尚未支援，未繪製",
  "多重引線 9C 為曲線引線，以直線近似",
  "多重引線 9C 的圖塊內容尚未支援，只顯示引線",
  `配置 A3 視埠 4E 未顯示：${NO_3D_VIEWPORT}`,
  "配置 A3 視埠 4E 未顯示：裁切邊界 SPLINE 尚未支援",
  "配置 A3 視埠 4E 未顯示：找不到裁切邊界物件",
  "配置 A3 視埠 4E 未顯示：比例或尺寸無效",
  "遮罩下方可能有 INSERT 6 個未遮蔽（陣列、鏡射或超過遮罩上限的圖塊尚未遮蔽）",
  "圖片 logo.png：找不到附件；請在外部參考選檔／資料夾並套用",
  "12 個圖塊在 DWG 轉檔時遺漏，已改用備援讀取補回",
  "2 個線型在 DWG 轉檔時遺漏，已改用備援讀取補回",
  "8 段文字在 DWG 轉檔時解碼錯誤，已改用備援讀取修正",
  "漏寫圖塊或文字的備援讀取失敗：timeout",
  "補回的圖塊中有 3 個 HATCH 尚未支援顯示",
  // xref states and row names
  "已載入：refs/A.dwg",
  "已載入：A.dwg（存檔時標為卸載，依選的檔載入）；圖中未使用",
  "已自動載入（圖面庫）：A.dwg",
  "已自動載入（記住的外參）：A.dwg",
  "已自動載入（記住的資料夾「plans」）：A.dwg；用在圖紙「A1」「A2」，請在下方 Dock 切換配置查看",
  "未載入",
  "已關閉",
  "找不到或同名衝突，請逐檔對應；圖中未使用",
  "存檔時已卸載（CAD 開圖也不顯示）",
  "巢狀覆疊不傳遞",
  "循環／深度上限已阻擋",
  "外參檔超過64個安全上限，未載入",
  "讀取失敗：bad file",
  "外參超過64檔或128MB安全上限",
  "圖片 2B1",
];

describe("cadMessageText", () => {
  it("keeps Chinese messages as they are in the Chinese UI", () => {
    for (const s of SAMPLES) expect(cadMessageText(s, "zh-TW")).toBe(s);
  });
  it.each(SAMPLES)("leaves no Chinese in English: %s", (s) => {
    const en = cadMessageText(s, "en");
    expect(en, en).not.toMatch(CJK);
  });
  it("translates the split notes (internal parser notes) too", () => {
    const { notes } = splitCadWarnings(["給水.dwg：DWG解析傳回 4 筆診斷"]);
    expect(cadMessageText(notes[0], "en")).toBe("給水.dwg: 4 internal parser notes, usually harmless; if something is missing, check it in CAD");
  });
  it("keeps names and numbers", () => {
    expect(cadMessageText("外部參考 1 筆未載入：請在外參面板選檔套用", "en")).toBe("1 external reference not loaded: pick the file in the Xrefs tab");
    expect(cadMessageText("缺少圖塊：門窗-甲", "en")).toBe("Missing block: 門窗-甲");
    expect(cadMessageText("已自動載入（記住的資料夾「平面」）：B.dwg", "en")).toBe("Loaded automatically (remembered folder “平面”): B.dwg");
  });
  it("passes unknown messages through", () => {
    expect(cadMessageText("something new", "en")).toBe("something new");
  });
});
