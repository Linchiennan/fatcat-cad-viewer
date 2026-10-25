// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkupTextDialog } from "./MarkupBar";
import { I18nProvider } from "../i18n/translations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Android 中文輸入法：字還在組字（底線）時沒有一般 input 事件，確定鍵仍要能按、並送出框內的中文。
describe("中文組字時的確定鍵", () => {
  for (const multiline of [false, true]) {
    it(multiline ? "多行" : "單行", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      const onOk = vi.fn();
      act(() => root.render(<I18nProvider><MarkupTextDialog onOk={onOk} onCancel={() => {}} multiline={multiline} /></I18nProvider>));
      const box = host.querySelector(multiline ? "textarea" : ".markup-dialog-row input") as HTMLInputElement;
      const okBtn = host.querySelector(".markup-dialog-ok") as HTMLButtonElement;
      expect(okBtn.disabled).toBe(true);
      act(() => { box.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
      box.value = "中文"; // the keyboard writes the composing text without an input event
      expect(okBtn.disabled).toBe(false);
      act(() => okBtn.click());
      expect(onOk).toHaveBeenCalledWith("中文");
      act(() => root.unmount());
      host.remove();
    });
  }
});
