import { describe, it, expect } from "vitest";
import { translate, type TranslationKey } from "./translations";
import { OWN_STRINGS } from "./ownStrings";
import table from "./t19-spec-strings.json";

// Behaviour contract from the T19 spec (table extracted in P3, replaces the old zh-TW.json check):
// zh-TW and en word for word, English without Chinese, unit label and 128 MB kept. Implemented by group D.
const CJK = /[㐀-鿿]/;
const BILINGUAL_SAME = new Set(["home.formats", "lang.groupLabel", "lang.zh", "lang.en", "error.brand"]);
const rows = Object.entries(table) as [TranslationKey, { zh: string; en: string; section: string }][];
// Placeholder names such as {建置序號} are filled in before showing, so they are not shown text.
const shown = (text: string) => text.replace(/\{[^{}]+\}/g, "");

describe("繁中＋英文字典（T19）", () => {
  it("132 operation keys of T19 3.4 (140 minus the 8 unused) are in the table", () => {
    expect(rows.filter(([, v]) => /鍵）$/.test(v.section))).toHaveLength(132);
  });

  it("every key: zh-TW and en match the spec word for word; en has no Chinese", () => {
    for (const [key, v] of rows) {
      expect(translate("zh-TW", key)).toBe(v.zh);
      expect(translate("en", key)).toBe(v.en);
      if (!BILINGUAL_SAME.has(key)) expect(shown(translate("en", key))).not.toMatch(CJK);
    }
  });

  it("keeps the unit label and the 128 MB limit", () => {
    expect(new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 3 }).format(1234.56789)).toBe("1,234.568");
    expect(translate("zh-TW", "measure.sourceUnitLabel")).toBe("1 圖面單位 =");
    expect(translate("zh-TW", "error.tooLarge")).toContain("128 MB");
    expect(translate("en", "error.tooLarge")).toContain("128 MB");
  });

  it("group D's own keys never replace a spec key and their English has no Chinese", () => {
    for (const [key, v] of Object.entries(OWN_STRINGS)) {
      expect(key in table).toBe(false);
      expect(v.zh.length).toBeGreaterThan(0);
      expect(shown(v.en).replace(/大肥貓/g, "")).not.toMatch(CJK); // the owner name 大肥貓 may stay next to "Fat Cat"
    }
  });

  it("library strings moved in from group A, and 待決 A-6 (PNG／JPG listed, archives say 64 MB)", () => {
    expect(translate("zh-TW", "error.unsupportedFormat")).toBe("請選擇 DXF、DWG、PDF、PNG、JPG、ZIP 或 RAR 檔案。");
    expect(translate("en", "error.unsupportedFormat")).toBe("Choose a DXF, DWG, PDF, PNG, JPG, ZIP or RAR file.");
    expect(translate("zh-TW", "archive.err.tooLarge")).toContain("64 MB");
    expect(translate("en", "archive.err.tooLarge")).toContain("64 MB");
    expect(translate("zh-TW", "library.page", { n: 2 })).toBe("第 2 頁");
    expect(translate("en", "library.recentPages")).toBe("Recent pages");
    expect(translate("en", "archive.folder")).toBe("Folder");
  });

  it("fills placeholders and falls back to zh-TW, never the key name", () => {
    expect(translate("en", "home.platformApk", { "建置序號": 23 })).toBe("code23");
    expect(translate("zh-TW", "home.build", { "識別碼": "e35c6df16a32" })).toBe("build e35c6df16a32");
    expect(translate("en", "viewer.missingCount", { N: 2 })).toBe("2 missing items");
    expect(translate("en", "nope.key" as TranslationKey)).toBe("");
  });
});
