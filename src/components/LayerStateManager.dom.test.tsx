// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LayerStateManager } from "./LayerStateManager";
import type { CadLayerState } from "../viewer/layerStateTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

const states: CadLayerState[] = [
  { name: "紅綠", layers: { 牆: { visible: true, colorIndex: 1, color: 0xff0000 } } },
  { name: "藍黃", layers: { 牆: { visible: true, colorIndex: 5, color: 0x0000ff } } },
];
const layers = [{ name: "牆", visible: true, color: 0xff0000 }];

// CAD's dialog: every state with 與目前圖層相同, a tap selects, two taps restore and close (用戶 2026-10-27).
describe("圖層狀態管理員 (DOM)", () => {
  const mount = () => {
    const log: string[] = [];
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(<LayerStateManager states={states} layers={layers} chosen={null} onRestore={(n) => log.push("還原 " + n)} onClose={() => log.push("關閉")} />));
    const row = (name: string) => [...document.querySelectorAll("tbody tr")].find((r) => r.textContent?.startsWith(name)) as HTMLElement;
    return { log, row };
  };

  it("lists every state and whether it is the same as the current layers, inside a scrolling list", () => {
    mount();
    expect([...document.querySelectorAll("tbody tr")].map((r) => r.textContent)).toEqual(["紅綠是", "藍黃否"]);
    expect(document.querySelector(".layer-state-list table")).not.toBeNull();
  });

  it("one tap selects; a second tap on the same row restores it and closes", () => {
    const { log, row } = mount();
    act(() => row("藍黃").click());
    expect(row("藍黃").getAttribute("aria-selected")).toBe("true");
    expect(log).toEqual([]);
    act(() => row("藍黃").click());
    expect(log).toEqual(["關閉", "還原 藍黃"]);
  });

  it("two taps on different rows only move the selection", () => {
    const { log, row } = mount();
    act(() => row("紅綠").click());
    act(() => row("藍黃").click());
    expect(log).toEqual([]);
    expect(row("藍黃").getAttribute("aria-selected")).toBe("true");
  });
});
