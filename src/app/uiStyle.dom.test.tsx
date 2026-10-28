// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { applyUiStyle, readUiStyle, UiStyleSwitch, UI_STYLES } from "./uiStyle";
import { I18nProvider } from "../i18n/translations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; localStorage.clear(); applyUiStyle("plain"); });

// 用戶 2026-10-28：首頁「繁中｜EN」左邊的介面樣式切換（原始＋5 種立體），這台裝置記住
describe("interface style switch (DOM)", () => {
  it("offers 原始 and the five looks, applies the pick to the page and keeps it", () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(<I18nProvider initial="zh-TW"><UiStyleSwitch /></I18nProvider>));
    const select = document.querySelector<HTMLSelectElement>(".ui-style-switch select")!;
    expect([...select.options].map((o) => o.textContent)).toEqual(["原始", "玻璃", "分層", "金屬"]);
    expect(select.value).toBe("plain");
    expect(document.documentElement.dataset.uiStyle).toBeUndefined();
    act(() => { select.value = "glass"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.documentElement.dataset.uiStyle).toBe("glass");
    expect(readUiStyle()).toBe("glass");
    act(() => { select.value = "plain"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.documentElement.dataset.uiStyle).toBeUndefined();
  });
  it("ignores an unknown saved value", () => {
    localStorage.setItem("fatcat-ui-style", "neon");
    expect(readUiStyle()).toBe("plain");
    for (const removed of ["soft", "keycap"]) { localStorage.setItem("fatcat-ui-style", removed); expect(readUiStyle()).toBe("plain"); }
    expect(UI_STYLES).toHaveLength(4);
  });
});
