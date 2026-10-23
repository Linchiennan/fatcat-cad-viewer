// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileBar } from "./ViewerChrome";
import { CloseDrawingDialog } from "../components/CloseDrawingDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The viewing screen's ✕ wiring (T10 4.4): ✕ asks first; the backdrop does nothing; keep / close answer it.
function Viewer({ onClosed }: { onClosed(): void }) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <FileBar name="t1-B01主浴.dwg" size={666_726} cardOpen={false} onCard={() => {}} onLibrary={() => {}} onClose={() => setAsk(true)} />
      {ask ? <CloseDrawingDialog onKeep={() => setAsk(false)} onClose={() => { setAsk(false); onClosed(); }} /> : null}
    </>
  );
}

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("closing from the file bar (DOM)", () => {
  it("✕ shows the confirm with 取消，繼續看圖 focused; backdrop does nothing; 確認關閉圖面 closes", () => {
    let closed = 0;
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() => root!.render(<Viewer onClosed={() => closed++} />));
    const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label)!;
    act(() => button("關閉圖面").click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("取消，繼續看圖");
    act(() => (document.querySelector(".confirm-backdrop") as HTMLElement).click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    act(() => button("取消，繼續看圖").click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(closed).toBe(0);
    act(() => button("關閉圖面").click());
    act(() => button("確認關閉圖面").click());
    expect(closed).toBe(1);
  });
});
