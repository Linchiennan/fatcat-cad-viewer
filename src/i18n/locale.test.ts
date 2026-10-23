import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { detectInitialLocale, I18nProvider, LOCALE_KEY, localeFromLanguage, useI18n } from "./translations";

// Locale choice at start-up and its migration (T19 3.1, 7).
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
const OLD_KEY = ["iz", "cad.locale"].join(""); // the old app's storage key

describe("locale at start-up", () => {
  let storage: MemoryStorage;
  beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal("localStorage", storage); });
  afterEach(() => vi.unstubAllGlobals());

  it("system language: any Chinese → 繁中, everything else → English, unknown → 繁中", () => {
    expect(localeFromLanguage("zh-TW")).toBe("zh-TW");
    expect(localeFromLanguage("zh-CN")).toBe("zh-TW");
    expect(localeFromLanguage("en-US")).toBe("en");
    expect(localeFromLanguage("ja-JP")).toBe("en");
    expect(localeFromLanguage(undefined)).toBe("zh-TW");
  });

  it("a saved choice wins", () => {
    storage.setItem(LOCALE_KEY, "en");
    expect(detectInitialLocale()).toBe("en");
  });

  it("moves the old app's choice to the new key once", () => {
    storage.setItem(OLD_KEY, "en");
    expect(detectInitialLocale()).toBe("en");
    expect(storage.getItem(LOCALE_KEY)).toBe("en");
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });

  it("ignores values that are not zh-TW / en and falls back to the system language", () => {
    storage.setItem(LOCALE_KEY, "tr");
    vi.stubGlobal("navigator", { language: "ja-JP" });
    expect(detectInitialLocale()).toBe("en");
  });

  it("blocked storage still gives a locale", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} });
    vi.stubGlobal("navigator", { language: "zh-HK" });
    expect(detectInitialLocale()).toBe("zh-TW");
  });
});

describe("provider", () => {
  function Probe() {
    const { t, locale } = useI18n();
    return createElement("p", null, `${locale}:${t("home.myDrawings")}`);
  }
  it("components read one app-wide locale; without a provider they are 繁中", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toContain("zh-TW:我的圖面");
    expect(renderToStaticMarkup(createElement(I18nProvider, { initial: "en", children: createElement(Probe) }))).toContain("en:My drawings");
  });
});
