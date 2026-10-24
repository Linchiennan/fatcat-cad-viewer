import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../types/errors";
import { I18nProvider } from "../i18n/translations";
import { LoadingScreen } from "./LoadingScreen";
import { ErrorScreen } from "./ErrorScreen";
import { RecoveryScreen } from "./ErrorBoundary";
import { GloveBar, ViewerDock } from "./ViewerToolbar";
import { HomeScreen } from "../app/HomeScreen";
import { CheckStrip, FileBar } from "../app/ViewerChrome";
import * as Icons from "./Icons";

const noop = () => {};
const en = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider initial="en">{node}</I18nProvider>);

describe("loading screen (T20 2.1)", () => {
  it("shows four paw prints, the file name, the stage and a cancel button; percent only when known", () => {
    const html = renderToStaticMarkup(<LoadingScreen stage="converting" progress={null} fileName="t4-鴻群差異註解.dwg" onCancel={noop} />);
    expect(html.match(/class="paw-step"/g)).toHaveLength(4);
    expect(html).toContain("t4-鴻群差異註解.dwg");
    expect(html).toContain("正在轉換 DWG…");
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("%</p>");
    expect(html).toContain(">取消<");
    const known = renderToStaticMarkup(<LoadingScreen stage="preparing" progress={0.426} fileName="a.dxf" onCancel={noop} />);
    expect(known).toContain(`aria-valuenow="43"`);
    expect(known).toContain("scaleX(0.426)");
    expect(known).toContain("43%");
  });
});

describe("error screen (T20 2.4)", () => {
  it("bad.dxf: title, DXF reason, 我的圖面／重試／返回", () => {
    const html = renderToStaticMarkup(<ErrorScreen error={new AppError("DXF_OPEN_FAILED", "parse failed at line 3")} onLibrary={noop} onRetry={noop} onBack={noop} />);
    for (const s of ["無法開啟檔案", "無法開啟 DXF 檔案。", "我的圖面", "重試", "返回", "大肥貓CAD看圖"]) expect(html).toContain(s);
    expect(html).not.toContain("parse failed");
  });
  it("DWG diagnostics table only when the error carries it; 重試 only with a remembered drawing", () => {
    const err = new AppError("DWG_CORRUPT_OR_ENCRYPTED", "x", { diagnostics: { engine: "libredwg", version: "AC1032", bytes: 2048, engineCode: "E42" } });
    const html = renderToStaticMarkup(<ErrorScreen error={err} onLibrary={noop} onBack={noop} />);
    for (const s of ["DWG 版本", "AC1032", "引擎代碼", "E42"]) expect(html).toContain(s);
    expect(html).not.toContain("重試");
  });
  it("English", () => {
    const html = en(<ErrorScreen error={new AppError("EMPTY_FILE")} onLibrary={noop} />);
    expect(html).toContain("Fat Cat CAD Viewer");
    expect(html).toContain("The file is empty. Choose a complete file.");
  });
  it("recovery screen is an alert with 此裝置無法繪製圖面。 and 重試", () => {
    const html = renderToStaticMarkup(<RecoveryScreen />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("此裝置無法繪製圖面。");
    expect(html).toContain("重試");
  });
});

describe("home screen (T10 2.2)", () => {
  it("says everything in the spec, in both languages", () => {
    const zh = renderToStaticMarkup(<HomeScreen onLibrary={noop} />);
    for (const s of ["大肥貓CAD看圖", "繁中", "EN", "手機離線 CAD 看圖", "簡單好操作~", "輕鬆看CAD圖面", "直接在裝置上開啟 CAD 圖面、PDF 與壓縮檔。",
      "我的圖面", "DXF · DWG · PDF", "離線看圖", "圖檔只在這台裝置處理，不會上傳。", "隱私與授權告知", "原始碼說明", "版本 3.0 · ", "build ", "brand-cat.png", 'aria-label="簡單好操作~輕鬆看CAD圖面"']) {
      expect(zh).toContain(s);
    }
    expect(zh).toContain('class="butterfly"');
    expect(zh).toContain("© 2026 大肥貓");
    const english = en(<HomeScreen onLibrary={noop} />);
    for (const s of ["Fat Cat CAD Viewer", "Offline CAD viewer for phones", "Easy to use,", "easy to read CAD", "My drawings", "Works offline", "Version 3.0", "© 2026 Fat Cat (大肥貓)"]) {
      expect(english).toContain(s);
    }
  });
});

describe("viewer top (T10 2.4)", () => {
  it("file bar: no badge, name, source, 檔案大小: …, library and close", () => {
    const html = renderToStaticMarkup(<FileBar name="t1-B01主浴.dwg" size={666_726} cardOpen={false} onCard={noop} onLibrary={noop} onClose={noop} />);
    expect(html).not.toContain('format-badge');
    for (const s of ["原始來源路徑未提供", "t1-B01主浴.dwg", "檔案大小: 651.1 KB", 'aria-label="我的圖面"', 'aria-label="關閉圖面"']) expect(html).toContain(s);
    const card = renderToStaticMarkup(<FileBar name="long.dwg" size={1} cardOpen onCard={noop} onLibrary={noop} onClose={noop} />);
    expect(card).toContain('aria-label="關閉完整檔名"');
  });
  it("check strip: 模型 ▾ with all sheets and no missing/xref entry", () => {
    const html = renderToStaticMarkup(<CheckStrip spaces={[{ name: "Model", order: 0 }, { name: "主浴器具配置圖", order: 1 }, { name: "圖紙（未命名）", order: 2 }]}
      space="Model" switching={false} missing={1} xrefsUnloaded={1} onSpace={noop} onTab={noop} />);
    for (const s of ["模型", "▾", "模型（Model）", "主浴器具配置圖", "圖層"]) expect(html).toContain(s);
    expect(html.match(/<option/g)).toHaveLength(3);
    const single = renderToStaticMarkup(<CheckStrip spaces={[{ name: "Model", order: 0 }]} space="Model" switching={false} missing={0} xrefsUnloaded={0} onSpace={noop} onTab={noop} />);
    expect(single).toContain("<select");
    expect(single).not.toContain("⚠");
  });
});

describe("bottom tools (T18)", () => {
  const base = { onCommand: noop, canMeasure: true, onMeasure: noop, onSearch: noop, onInspect: noop, onMarkup: noop };
  it("PDF: 量測、標註、搜尋、資訊 greyed with the PDF explanation, 初始 still usable", () => {
    const html = renderToStaticMarkup(<GloveBar {...base} canMeasure={false} />);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(4);
    expect(html).toContain("這個檔案不能量測（PDF 只能看）");
    expect(html).toContain("glove-paw");
    expect(html.match(/glove-ear/g)).toHaveLength(2);
  });
  it("measuring bar: 結束 pressed, 清除／復原／保留 off until there is something to act on", () => {
    const tools = { mode: "distance" as const, onMode: noop, onUndo: noop, canUndo: false, onKeep: noop, canKeep: false, onClearAll: noop, canClearAll: false };
    const html = renderToStaticMarkup(<GloveBar {...base} measuring measureTools={tools} />);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(html).toContain("<span>結束</span>");
  });
  it("English captions stay short", () => {
    const html = en(<GloveBar {...base} />);
    for (const s of ["Measure", "Markup", "Start", "Search", "Info"]) expect(html).toContain(`<span>${s}</span>`);
  });
  it("dock: fit, reset, separator and four tools; PDF only fit and reset; no start button", () => {
    const html = renderToStaticMarkup(<ViewerDock {...base} />);
    expect(html.match(/class="dock-item/g)).toHaveLength(6);
    expect(html).toContain("dock-sep");
    expect(html).toContain("符合螢幕：整張圖置中放到畫面內");
    expect(html).not.toContain("回到初始畫面");
    const pdf = renderToStaticMarkup(<ViewerDock {...base} canMeasure={false} />);
    expect(pdf.match(/class="dock-item/g)).toHaveLength(2);
    expect(pdf).not.toContain("dock-sep");
  });
});

describe("icons (T18 8-2)", () => {
  it("45 line icons, 24×24, stroke 1.8, currentColor, round ends", () => {
    const list = Object.values(Icons).filter((v) => typeof v === "function") as ((p: object) => React.ReactElement)[];
    expect(list).toHaveLength(45);
    for (const Icon of list) {
      const svg = renderToStaticMarkup(<Icon />);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('stroke-width="1.8"');
      expect(svg).toContain('stroke-linecap="round"');
    }
  });
});

describe("drawing check panel in both languages (P5)", () => {
  const report = { layers: [{ name: "A-WALL", color: 0xff0000, visible: true, originalVisible: true }], warnings: [], xrefs: [{ name: "X1", path: "x1.dwg", overlay: false }], entityCount: 12, buildMs: 34 };
  const source = new File(["x"], "t1.dwg");
  it("繁中 unchanged, English without Chinese UI text", async () => {
    const { CadPanel } = await import("./CadPanel");
    const zh = renderToStaticMarkup(<CadPanel report={report} source={source} initialTab="缺件警告" onLayer={noop} onReload={noop} onClose={noop} />);
    for (const s of ["圖面檢查", "開圖成功不代表內容完整。請與原 CAD 核對後使用。", "未偵測到已知缺件；並非完整性證明。", "場景建置：34 毫秒；巡覽實體 12。"]) expect(zh).toContain(s);
    const xref = en(<CadPanel report={report} source={source} initialTab="外部參考" onLayer={noop} onReload={noop} onClose={noop} />);
    for (const s of ["Drawing check", "Choose xref files", "Attach", "Load", "Match by relative path / unique file name"]) expect(xref).toContain(s);
    const layers = en(<CadPanel report={report} source={source} initialTab="圖層" onLayer={noop} onReload={noop} onClose={noop} />);
    expect(layers.replace(/A-WALL/g, "")).not.toMatch(/[㐀-鿿]/);
  });
});
