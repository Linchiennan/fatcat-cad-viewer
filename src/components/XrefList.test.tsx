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
