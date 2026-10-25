// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DragRow } from "./DragRow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(onClick = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<DragRow className="row"><button onClick={onClick}>a</button></DragRow>));
  const row = host.querySelector(".row") as HTMLElement;
  return { row, onClick, unmount: () => act(() => root.unmount()) };
}
const pointer = (el: Element, type: string, x: number, button = 1) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button });
  Object.assign(e, { pointerId: 7, pointerType: "mouse" });
  el.dispatchEvent(e);
  return e;
};

describe("滑鼠中鍵拖曳左右捲動", () => {
  it("中鍵按住往左拖，內容往右捲；放開後不觸發點擊", () => {
    const { row, onClick, unmount } = mount();
    const down = pointer(row, "pointerdown", 200);
    expect(down.defaultPrevented).toBe(true); // 不出現瀏覽器自動捲動圓圈
    pointer(row, "pointermove", 150);
    pointer(row, "pointermove", 80);
    expect(row.scrollLeft).toBe(120);
    pointer(row, "pointerup", 80);
    row.querySelector("button")!.click();
    expect(onClick).not.toHaveBeenCalled();
    unmount();
  });

  it("左鍵不拖曳（保留原本點擊）", () => {
    const { row, onClick, unmount } = mount();
    pointer(row, "pointerdown", 200, 0);
    pointer(row, "pointermove", 80, 0);
    expect(row.scrollLeft).toBe(0);
    pointer(row, "pointerup", 80, 0);
    row.querySelector("button")!.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("手指與觸控筆不攔截（交給原生捲動）", () => {
    const { row, unmount } = mount();
    const e = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 200, button: 1 });
    Object.assign(e, { pointerId: 3, pointerType: "touch" });
    row.dispatchEvent(e);
    pointer(row, "pointermove", 80);
    expect(row.scrollLeft).toBe(0);
    unmount();
  });
});
