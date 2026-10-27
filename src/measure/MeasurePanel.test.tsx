import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import spec from "../i18n/t19-spec-strings.json";
import { OWN_STRINGS } from "../i18n/ownStrings";

// The dictionary belongs to group D; answer with the T19 zh text so the panel renders on its own.
vi.mock("../i18n/translations", () => ({
  useI18n: () => ({
    locale: "zh-TW", setLocale() {},
    t: (key: string, params?: Record<string, string | number>) => {
      let s = ({ ...spec, ...OWN_STRINGS } as Record<string, { zh: string }>)[key]?.zh ?? key;
      for (const [k, v] of Object.entries(params ?? {})) s = s.replace(`{${k}}`, String(v));
      return s;
    },
  }),
}));

const { MeasurePanel } = await import("./MeasurePanel");
const { MeasureOverlay } = await import("../canvas/MeasureOverlay");
const { initialMeasureState, measureReducer } = await import("./measureState");
const { formatResult } = await import("./measureUnits");

const units = { source: "mm" as const, display: "cm" as const, assumed: false };
const props = (state = initialMeasureState()) => ({
  state, dispatch() {}, units, fileUnit: "mm" as const, onUnits() {}, decimals: 1, onDecimals() {}, limited: false,
  format: formatResult(units, 1), onClose() {}, onClearAll() {},
});

describe("measuring panel", () => {
  it("shows the result, parts, kept list with total, and the status", () => {
    let st = measureReducer(initialMeasureState(), { type: "toggle-measure" });
    for (const p of [{ x: 0, y: 0 }, { x: 628, y: 0 }, { x: 0, y: 0 }]) st = measureReducer(st, { type: "pick", pick: { point: p, snap: "midpoint", entity: null, screenY: 0, canvasHeight: 0 } });
    st = measureReducer(st, { type: "pick", pick: { point: { x: 300, y: 400 }, snap: "endpoint", entity: null, screenY: 0, canvasHeight: 0 } });
    const html = renderToStaticMarkup(<MeasurePanel {...props(st)} />);
    expect(html).toContain("50.0 cm");
    expect(html).toContain("水平 30.0 cm ／ 垂直 40.0 cm");
    expect(html).toContain("1. 距離　62.8 cm");
    expect(html).toContain("長度合計：62.8 cm");
    expect(html).toContain("已鎖定端點");
    expect(html).toContain('aria-label="上下拖動調整面板高度"');
    expect(html).toContain("毫米 (mm)・鎖點開");
    expect(html).toContain("<span>保留</span>");
    expect(html).toContain("<span>總長</span>");
  });

  it("desktop has no 物件 tile (用戶 2026-10-27：不實用); the phone panel keeps it", () => {
    const st = measureReducer(initialMeasureState(), { type: "toggle-measure" });
    expect(renderToStaticMarkup(<MeasurePanel {...props(st)} />)).not.toContain("<span>物件</span>");
    expect(renderToStaticMarkup(<MeasurePanel {...props(st)} glove />)).toContain("<span>物件</span>");
  });

  it("explains a property-only object and hints the unit", () => {
    let st = measureReducer(initialMeasureState(), { type: "toggle-measure" });
    st = measureReducer(st, { type: "mode", mode: "object" });
    const entity = { kind: "TEXT", layer: "T", points: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, length: 0, approximate: false, propertiesOnly: true, properties: { handle: "2A", text: "門" } };
    st = measureReducer(st, { type: "pick", pick: { point: { x: 0, y: 0 }, snap: null, entity, screenY: 0, canvasHeight: 0 } });
    const html = renderToStaticMarkup(<MeasurePanel {...props(st)} units={{ source: "drawing", display: "drawing", assumed: false }} fileUnit="drawing" />);
    expect(html).toContain("物件屬性查詢；不將繪製邊界當工程長度／面積");
    expect(html).toContain("識別碼");
    expect(html).toContain("檔案沒有可辨識的單位");
  });
});

describe("measuring overlay svg", () => {
  it("draws red numbered dots and a red label; grey kept dots", () => {
    const html = renderToStaticMarkup(<MeasureOverlay aim={{ x: 5, y: 5 }} snapAt={{ x: 7, y: 7, kind: "endpoint" }} model={{
      current: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, dots: [{ x: 0, y: 0 }, { x: 10, y: 0 }], labels: [{ x: 5, y: -5, text: "62.8 cm", size: 14, stroke: 2.8 }] },
      kept: [{ points: [{ x: 0, y: 9 }, { x: 9, y: 9 }], closed: false, dots: [{ x: 0, y: 9 }, { x: 9, y: 9 }], labels: [] }],
      outline: null,
    }} />);
    expect(html.match(/fill="#ff1f1f"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain(">62.8 cm<");
    expect(html.match(/class="measure-kept-dot"/g)).toHaveLength(2);
    expect(html).toContain(">端點<");
  });
});
