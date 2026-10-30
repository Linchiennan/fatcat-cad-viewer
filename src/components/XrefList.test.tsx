import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { XrefList } from "./XrefList";

// 11F 給水放樣: five references to apply; the overlays inside 08-11F-給水 are not drawn in CAD either (用戶 2026-10-28).
const rows = [
  { name: "08-11F-給水", path: ".\\08-11F-給水.dwg", key: "06.dwg|08-11F-給水", overlay: false, status: "已自動載入（記住的外參）：08-11F-給水.dwg" },
  { name: "4F-結構", path: "..\\外部參考\\002\\4F.dwg", key: "08-11F-給水.dwg|4F-結構", overlay: true, status: "巢狀覆疊不傳遞" },
  { name: "11F-建築底圖", path: "..\\外部參考\\001\\11F.dwg", key: "06.dwg|11F-建築底圖", overlay: false, status: "找不到或同名衝突，請逐檔對應" },
];
const html = renderToStaticMarkup(<XrefList rows={rows} rootName="06.dwg" disabled={new Set()} busy={false} onPick={() => {}} onToggle={() => {}} />);

describe("xref list: red / green, overlays inside references folded away", () => {
  it("counts only references CAD draws: 2, one missing", () => {
    expect(html).toContain("這張圖用到 2 個外參，1 個還沒套用");
    expect(html).toMatch(/cad-xref-row applied.*08-11F-給水/);
    expect(html).toMatch(/cad-xref-row missing.*11F-建築底圖/);
  });
  it("puts the nested overlay in a closed fold at the end, gray, saying CAD does not show it", () => {
    const fold = html.slice(html.indexOf("<details"));
    expect(fold).toMatch(/^<details class="cad-xref-hidden"><summary>另有 1 個外參裡的覆疊/);
    expect(fold).not.toContain(" open");
    expect(fold).toMatch(/cad-xref-row not-needed.*4F-結構.*在 08-11F-給水.dwg 裡.*CAD 開這張圖也不顯示/);
    expect(html.indexOf("4F-結構")).toBeGreaterThan(html.indexOf("11F-建築底圖"));
  });
});

// 用戶 2026-10-30：13F 牆板放樣「亂選套用 他還是綠色」— 動力插座選成 02-13F-頂板放樣.dwg 仍顯示綠色已載入。
describe("a hand-picked file of another name", () => {
  const picked = [
    { name: "03-13F-動力插座", path: String.raw`.\03-13F-動力插座.dwg`, key: "01.dwg|03-13F-動力插座", overlay: true, status: "已載入：02-13F-頂板放樣.dwg", mismatch: true },
    { name: "04-13F-照明", path: String.raw`.\04-13F-照明.dwg`, key: "01.dwg|04-13F-照明", overlay: true, status: "已載入：04-13F-照明.dwg" },
  ];
  const out = renderToStaticMarkup(<XrefList rows={picked} rootName="01.dwg" disabled={new Set()} busy={false} onPick={() => {}} onToggle={() => {}} />);
  it("is orange, names both files and is counted apart", () => {
    expect(out).toMatch(/cad-xref-row mismatch.*03-13F-動力插座.*檔名不符：選的是 02-13F-頂板放樣.dwg，外參要的是 03-13F-動力插座.dwg/);
    expect(out).toMatch(/cad-xref-row applied.*04-13F-照明/);
    expect(out).toContain("1 個外參選的檔和外參名稱不同（橘色）");
  });
});
