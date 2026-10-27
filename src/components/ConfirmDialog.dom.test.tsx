// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfirmDialog } from "./ConfirmDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

// The large-drawing question waits on the answer either way: 繼續開啟 opens, 取消 goes home (用戶 2026-10-27).
describe("confirm dialog answers (DOM)", () => {
  const run = (pick: "ok" | "cancel") => {
    const log: string[] = [];
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(<ConfirmDialog request={{ message: "這張圖很大", okLabel: "繼續開啟", onOk: () => log.push("ok"), onCancel: () => log.push("cancel") }} onClose={() => log.push("close")} />));
    const buttons = [...document.querySelectorAll("button")];
    act(() => (pick === "ok" ? buttons.find((b) => b.textContent === "繼續開啟") : buttons[0])!.click());
    return log;
  };

  it("繼續開啟 closes then runs onOk, never onCancel", () => expect(run("ok")).toEqual(["close", "ok"]));
  it("取消 closes then runs onCancel, never onOk", () => expect(run("cancel")).toEqual(["close", "cancel"]));
});
