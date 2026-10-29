import { describe, expect, it } from "vitest";
import { paintMeasures } from "./paintMeasures";
import { overlayModel } from "./overlayModel";
import { DEFAULT_MEASURE_COLORS } from "../viewer/measureLabelStyle";

// 用戶 2026-10-29「量測的數據在分享時要保留」：分享／匯出的圖片要畫上量測線、數字與點。
/** A 2D context that records what is drawn and with which colour. */
function recorder() {
  const calls: { op: string; text?: string; style?: string; x?: number; y?: number }[] = [];
  const ctx: Record<string, unknown> = { measureText: (t: string) => ({ width: t.length * 8 }) };
  const proxy = new Proxy(ctx, {
    get: (t, k: string) => k in t ? t[k] : (...a: unknown[]) => {
      if (k === "fillText" || k === "strokeText") calls.push({ op: k, text: String(a[0]), style: String(k === "fillText" ? t.fillStyle : t.strokeStyle), x: a[1] as number, y: a[2] as number });
      if (k === "stroke" || k === "fill") calls.push({ op: k, style: String(k === "fill" ? t.fillStyle : t.strokeStyle) });
    },
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

const settings = { enabled: true, mode: "distance", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], kept: [{ mode: "distance", points: [{ x: 0, y: 50 }, { x: 0, y: 150 }] }], info: false } as never;
const model = overlayModel({ settings, entity: null, project: (pts) => pts.map((p) => ({ x: p.x * 2, y: p.y * 2 })), labelPx: 16, label: (v) => v.toFixed(1) });

describe("measuring marks on the shared picture", () => {
  it("draws every length, the current points' numbers and the lines in the chosen colours", () => {
    const { ctx, calls } = recorder();
    paintMeasures(ctx, model, "box", DEFAULT_MEASURE_COLORS, 2);
    const texts = calls.filter((c) => c.op === "fillText");
    expect(texts.map((c) => c.text)).toEqual(expect.arrayContaining(["100.0", "1", "2"]));
    expect(texts.find((c) => c.text === "100.0")?.style).toBe("#ff1f1f"); // red numbers (default)
    expect(calls.some((c) => c.op === "stroke" && c.style === "#ffb547")).toBe(true); // orange lines (default)
    expect(texts.filter((c) => c.text === "1")).toHaveLength(1); // kept results carry no point numbers, as on screen
  });

  it("uses the colours chosen in 量測設定", () => {
    const { ctx, calls } = recorder();
    paintMeasures(ctx, model, "gap", { text: "green", box: "white", line: "blue" }, 1);
    expect(calls.find((c) => c.op === "fillText" && c.text === "100.0")?.style).toBe("#34c759");
    expect(calls.some((c) => c.op === "stroke" && c.style === "#3d8bff")).toBe(true);
  });
});
