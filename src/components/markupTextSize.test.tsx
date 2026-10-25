// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkupTextDialog } from "./MarkupBar";
import { I18nProvider } from "../i18n/translations";
import { clampTextPx, loadTextPx, saveTextPx, TEXT_PX, type Mark } from "../viewer/markup";
import { applyMarkEdit } from "../canvas/marks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("註記文字大小", () => {
  it("字級限制在 8～96，非數字回到預設 18", () => {
    expect(clampTextPx(4)).toBe(8);
    expect(clampTextPx(200)).toBe(96);
    expect(clampTextPx(Number.NaN)).toBe(TEXT_PX);
    expect(clampTextPx(36.4)).toBe(36);
  });

  it("記住上次用的字級", () => {
    localStorage.clear();
    expect(loadTextPx()).toBe(18);
    saveTextPx(40);
    expect(loadTextPx()).toBe(40);
  });

  it("修改既有文字可一併改字級", () => {
    const marks: Mark[] = [{ kind: "text", color: "#f00", at: { x: 0, y: 0 }, text: "漏水", size: 2 }];
    const next = applyMarkEdit(marks, { edit: { index: 0, text: "漏水", size: 5 } });
    expect(next[0]).toMatchObject({ text: "漏水", size: 5 });
    expect(applyMarkEdit(marks, { edit: { index: 0, text: "漏水" } })).toBe(marks); // 沒改不產生新清單
  });

  it("輸入框右方有拉桿與數字框，兩者同步回報字級", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onTextPx = vi.fn();
    act(() => root.render(<I18nProvider><MarkupTextDialog onOk={() => {}} onCancel={() => {}} textPx={24} onTextPx={onTextPx} /></I18nProvider>));
    const range = host.querySelector('input[type="range"]') as HTMLInputElement;
    const num = host.querySelector('input[type="number"]') as HTMLInputElement;
    expect(range.value).toBe("24");
    expect(num.value).toBe("24");
    // One layout for one line and 多行: title, size controls, 確定 and ✕ on top; the text box alone fills the row below.
    const head = host.querySelector(".markup-dialog-head")!;
    expect([...head.children].map((e) => e.className)).toEqual(["markup-size", "markup-dialog-actions"]);
    expect(host.querySelector(".markup-dialog-title")).toBeNull(); // 不顯示「輸入註記文字」
    const row = host.querySelector(".markup-dialog-row")!;
    expect([...row.children].map((e) => e.tagName.toLowerCase())).toEqual(["input"]);
    const setValue = (el: HTMLInputElement, v: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => setValue(range, "50"));
    expect(onTextPx).toHaveBeenLastCalledWith(50);
    act(() => setValue(num, "12"));
    expect(onTextPx).toHaveBeenLastCalledWith(12);
    act(() => root.unmount());
  });
});
