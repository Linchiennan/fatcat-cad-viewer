import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/translations";
import { LegalPage } from "./LegalPages";
import { markdownBlocks, markdownSection, THIRD_PARTY } from "./legalText";

const noop = () => {};
const licenseDir = new URL("../../licenses/", import.meta.url);

describe("privacy / license and source pages (P6)", () => {
  it("every license text named in the component list exists in licenses/", () => {
    const files = new Set(readdirSync(licenseDir));
    for (const c of THIRD_PARTY) for (const f of c.texts) expect(files.has(f), f).toBe(true);
  });

  it("the privacy policy is split by language", () => {
    const md = readFileSync(new URL("../../PRIVACY_POLICY.md", import.meta.url), "utf8");
    expect(markdownBlocks(markdownSection(md, "繁體中文")).length).toBeGreaterThan(3);
    expect(markdownBlocks(markdownSection(md, "English")).length).toBeGreaterThan(3);
  });

  it("privacy page: policy in the UI language, notice, component table; title bar with ✕", () => {
    const zh = renderToStaticMarkup(<LegalPage kind="privacy" onClose={noop} />);
    for (const s of ["隱私與授權告知", "© 2026 大肥貓", "GPL-3.0-only", "不提供任何擔保", "第三方元件", "dxf-viewer", 'aria-label="關閉"']) expect(zh).toContain(s);
    expect(zh).toContain("圖檔只在你的裝置上處理");
    const en = renderToStaticMarkup(<I18nProvider initial="en"><LegalPage kind="privacy" onClose={noop} /></I18nProvider>);
    for (const s of ["Privacy and licenses", "© 2026 Fat Cat (大肥貓)", "Drawings stay on your device", "WITHOUT ANY WARRANTY", "Third-party components"]) expect(en).toContain(s);
    expect(en).not.toContain("圖檔只在你的裝置上處理");
  });

  it("source page: GPL-3.0-only, where to get the source, MPL-2.0 patches", () => {
    const zh = renderToStaticMarkup(<LegalPage kind="source" onClose={noop} />);
    for (const s of ["原始碼說明", "原始碼公開位置待定，上架前填入。", "MPL-2.0", "patch-cjk-fonts.mjs"]) expect(zh).toContain(s);
    const en = renderToStaticMarkup(<I18nProvider initial="en"><LegalPage kind="source" onClose={noop} /></I18nProvider>);
    expect(en).toContain("to be announced");
    expect(en.replace(/大肥貓/g, "")).not.toMatch(/[㐀-鿿]/);
  });
});
