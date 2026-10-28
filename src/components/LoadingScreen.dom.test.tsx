// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LoadingScreen, PROGRESS_AFTER_MS, STAGE_HOLD_MS } from "./LoadingScreen";
import type { LoadStage } from "../types/drawing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.useRealTimers(); });

// 用戶 2026-10-28：載入時貓爪下方的文字不要一閃一閃。A06 開圖最後 0.1 秒內「準備圖面／準備文字」來回 5 次，百分比行出現又消失。
describe("loading screen does not flicker (DOM)", () => {
  it("shows a new stage at most once per hold time and keeps the percent line in place", () => {
    vi.useFakeTimers();
    root = createRoot(document.body.appendChild(document.createElement("div")));
    const draw = (stage: LoadStage, progress: number | null) => act(() => root!.render(<LoadingScreen stage={stage} progress={progress} fileName="A06.dwg" onCancel={() => {}} />));
    const shown: string[] = [];
    const note = () => { const t = document.querySelector(".loading-stage")!.textContent!; if (shown.at(-1) !== t) shown.push(t); };
    draw("loading", null); note();
    const percentBox = () => document.querySelector(".loading-percent");
    expect(percentBox()).not.toBeNull();
    // a progress that lasts only milliseconds (14 → 100 % on A06) never shows; one that lasts shows its number
    draw("loading", 0.32); note(); draw("loading", 1); note();
    expect(percentBox()!.textContent?.trim()).toBe("");
    act(() => { vi.advanceTimersByTime(PROGRESS_AFTER_MS); });
    expect(percentBox()!.textContent).toBe("100%");
    expect(document.querySelector(".loading-bar")!.getAttribute("aria-valuenow")).toBe("100");
    for (const stage of ["parsing", "preparing", "fonts", "preparing", "fonts", "preparing"] as LoadStage[]) { draw(stage, null); note(); act(() => { vi.advanceTimersByTime(8); }); note(); }
    expect(percentBox()).not.toBeNull(); // still there, only hidden
    expect(percentBox()!.classList.contains("is-empty")).toBe(true);
    act(() => { vi.advanceTimersByTime(STAGE_HOLD_MS); }); note();
    // the quick back-and-forth collapses into one change to the latest stage
    expect(shown.length).toBeLessThanOrEqual(2);
    expect(shown.at(-1)).toBe(document.querySelector(".loading-stage")!.textContent);
  });
});
