import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/translations";
import { DEFAULT_CHOICE, exportRequest, loadExportChoice, normaliseBox, saveExportChoice } from "./exportFlow";
import { ExportNote, ExportSheet } from "../components/ExportSheet";
import { FileBar } from "./ViewerChrome";

const noop = () => {};
class MemoryStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe("export choices (spec 005)", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to current view, PNG, A4 and remembers the last choice", () => {
    expect(loadExportChoice()).toEqual(DEFAULT_CHOICE);
    saveExportChoice({ range: "box", format: "pdf", paper: "A3" });
    expect(loadExportChoice()).toEqual({ range: "box", format: "pdf", paper: "A3" });
    localStorage.setItem("fatcat:export-choice", "{broken");
    expect(loadExportChoice()).toEqual(DEFAULT_CHOICE);
  });

  it("builds the request: title without extension, paper only for PDF, box only for 框選", () => {
    expect(exportRequest({ range: "view", format: "png", paper: "A3" }, "t1-B01主浴.dwg", "Model"))
      .toEqual({ range: "view", format: "png", paper: undefined, box: undefined, title: "t1-B01主浴", sheet: "Model" });
    const box = { x0: 1, y0: 2, x1: 30, y1: 40 };
    expect(exportRequest({ range: "box", format: "pdf", paper: "A3" }, "a.dxf", "配置1", box)).toMatchObject({ paper: "A3", box });
  });

  it("a drag becomes a normalised box; a tap is ignored", () => {
    expect(normaliseBox(100, 80, 20, 10)).toEqual({ x0: 20, y0: 10, x1: 100, y1: 80 });
    expect(normaliseBox(5, 5, 9, 40)).toBeNull();
  });
});

describe("export screens", () => {
  it("dialog: range, format, paper only for PDF, in both languages", () => {
    const png = renderToStaticMarkup(<ExportSheet choice={DEFAULT_CHOICE} onChange={noop} onExport={noop} onClose={noop} />);
    for (const s of ["輸出圖面", "目前畫面", "整張圖紙", "框選", "PNG", "PDF", 'aria-checked="true"']) expect(png).toContain(s);
    expect(png).not.toContain("A4");
    const pdf = renderToStaticMarkup(<I18nProvider initial="en"><ExportSheet choice={{ range: "sheet", format: "pdf", paper: "A4" }} onChange={noop} onExport={noop} onClose={noop} /></I18nProvider>);
    for (const s of ["Export drawing", "Whole sheet", "Paper", "A4", "A3"]) expect(pdf).toContain(s);
    expect(pdf).not.toMatch(/[㐀-鿿]/);
  });

  it("note: saved with 分享／打開, lower resolution explained; progress while working", () => {
    const done = renderToStaticMarkup(<ExportNote note={{ kind: "done", name: "a_Model_20261023-1200.pdf", saved: true, downscaled: { w: 4000, h: 3000, dpi: 120 } }} onShare={noop} onOpen={noop} onClose={noop} />);
    for (const s of ["已儲存：a_Model_20261023-1200.pdf", "分享", "打開", "4000×3000", "120 dpi"]) expect(done).toContain(s);
    expect(renderToStaticMarkup(<ExportNote note={{ kind: "working" }} onShare={noop} onOpen={noop} onClose={noop} />)).toContain("正在輸出…");
  });

  it("file bar shows the 輸出 tile only when export is offered", () => {
    const withExport = renderToStaticMarkup(<FileBar name="a.dwg" size={10} cardOpen={false} onCard={noop} onLibrary={noop} onClose={noop} onExport={noop} />);
    expect(withExport).toContain('aria-label="輸出"');
    expect(withExport).toContain("<span>輸出</span>");
    expect(renderToStaticMarkup(<FileBar name="a.pdf" size={10} cardOpen={false} onCard={noop} onLibrary={noop} onClose={noop} />)).not.toContain('aria-label="輸出"');
  });
});
