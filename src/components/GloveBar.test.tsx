import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GloveBar } from "./ViewerToolbar";

const base = { onCommand: () => {}, canMeasure: true, onMeasure: () => {}, onSearch: () => {}, onInspect: () => {}, onMarkup: () => {} };
// Buttons are icon-first: the full name is the accessible name, the caption is at most two characters.
const names = (html: string) => [...html.matchAll(/class="glove-btn[^"]*" aria-label="([^"]+)"/g)].map((m) => m[1]);
const captions = (html: string) => [...html.matchAll(/<\/svg><span>([^<]+)<\/span>/g)].map((m) => m[1]);
const inOrder = (html: string, wanted: string[]) => {
  const at = wanted.map((n) => names(html).indexOf(n));
  return at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]);
};

describe("glove bar for site use", () => {
  it("shows five icon buttons: 量測｜註記｜回到初始畫面 (center)｜搜尋｜資訊", () => {
    const html = renderToStaticMarkup(<GloveBar {...base} />);
    expect(names(html)).toEqual(["量測", "註記", "回到初始畫面", "搜尋", "資訊"]);
  });

  it("keeps every caption to two characters", () => {
    for (const props of [{}, { measuring: true }, { marking: true }, { searching: true }, { inspecting: true }]) {
      for (const c of captions(renderToStaticMarkup(<GloveBar {...base} {...props} />))) expect([...c].length).toBeLessThanOrEqual(2);
    }
  });

  it("says which mode is running and ends it with the same button", () => {
    expect(names(renderToStaticMarkup(<GloveBar {...base} measuring />))).toContain("結束量測");
    const marking = renderToStaticMarkup(<GloveBar {...base} marking />);
    expect(names(marking)).toContain("結束註記");
    expect(names(marking)).toContain("資訊");
    expect(names(renderToStaticMarkup(<GloveBar {...base} inspecting />))).toContain("結束資訊");
  });
});

describe("glove bar while measuring", () => {
  const tools = { mode: "distance" as const, onMode: () => {}, onUndo: () => {}, canUndo: true, onKeep: () => {}, canKeep: false };
  it("puts 量測 first and swaps the bar for the measuring tools until 結束量測", () => {
    expect(inOrder(renderToStaticMarkup(<GloveBar {...base} />), ["量測", "回到初始畫面"])).toBe(true);
    const html = renderToStaticMarkup(<GloveBar {...base} measuring measureTools={tools} />);
    expect(inOrder(html, ["結束量測", "量測模式", "復原", "保留這段"])).toBe(true);
    expect(html).toContain("<span>距離</span>");
    for (const hidden of ["回到初始畫面", "搜尋", "資訊"]) expect(names(html)).not.toContain(hidden);
  });

  it("puts 全部清除 (trash) between the mode and 復原", () => {
    const html = renderToStaticMarkup(<GloveBar {...base} measuring measureTools={{ ...tools, onClearAll: () => {}, canClearAll: true }} />);
    expect(inOrder(html, ["結束量測", "量測模式", "全部清除", "復原", "保留這段"])).toBe(true);
  });
});
