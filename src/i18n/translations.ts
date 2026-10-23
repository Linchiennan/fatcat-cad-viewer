// Two-language dictionary (zh-TW default, en) and locale state (T19). Owner: P4 group D.
// t19-spec-strings.json is the string table extracted from the T19 spec in P3 (read-only test data):
// keys of sections 3.4 (without the unused ones), 3.5 and 5. Group D adds its own keys in ownStrings.ts.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import specStrings from "./t19-spec-strings.json";
import { OWN_STRINGS, type OwnKey, type Pair } from "./ownStrings";

export type Locale = "zh-TW" | "en";
export type SpecKey = keyof typeof specStrings;
export type TranslationKey = SpecKey | OwnKey;
export type TranslateParams = Record<string, string | number>;

/** Where the choice is kept now. */
export const LOCALE_KEY = "fatcat.locale";
const LEGACY_LOCALE_KEY = "izcad.locale"; // 舊版資料位置（舊版語系選擇的 localStorage 鍵，只供啟動遷移讀取，T19 7）

const DICTIONARY: Record<string, Pair> = { ...OWN_STRINGS, ...(specStrings as Record<string, Pair>) };

const isLocale = (value: unknown): value is Locale => value === "zh-TW" || value === "en";

/** Text for a key; {name} placeholders are filled from `params`. Unknown key → the zh-TW text, never the key. */
export function translate(locale: Locale, key: TranslationKey, params?: TranslateParams): string {
  const entry = DICTIONARY[key];
  if (!entry) return "";
  const text = locale === "en" ? entry.en : entry.zh;
  if (!params) return text;
  return text.replace(/\{([^{}]+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Private mode: the choice lasts for this visit only. */ }
}

/** zh* (any Chinese) → zh-TW; anything else → en; no language known → zh-TW. */
export function localeFromLanguage(language: string | undefined | null): Locale {
  if (!language) return "zh-TW";
  return language.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

/** Start-up locale: saved choice, else migrated old choice, else system language (zh* → zh-TW, others → en). */
export function detectInitialLocale(): Locale {
  const saved = readStorage(LOCALE_KEY);
  if (isLocale(saved)) return saved;
  // 舊版資料位置：舊鍵有合法值就搬到新鍵，再刪掉舊鍵。
  const legacy = readStorage(LEGACY_LOCALE_KEY);
  if (isLocale(legacy)) {
    writeStorage(LOCALE_KEY, legacy);
    try { localStorage.removeItem(LEGACY_LOCALE_KEY); } catch { /* keep going */ }
    return legacy;
  }
  const language = typeof navigator === "undefined" ? undefined : navigator.language;
  return localeFromLanguage(language);
}

type I18nValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: TranslationKey, params?: TranslateParams): string;
};

// Without a provider (unit tests rendering one component) everything is zh-TW.
const I18nContext = createContext<I18nValue>({
  locale: "zh-TW",
  setLocale: () => {},
  t: (key, params) => translate("zh-TW", key, params),
});

/** Hook for components: current locale, setter (saves the choice, sets <html lang>), and t(key, params). */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Provider holding the single app-wide locale. */
export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setState] = useState<Locale>(() => initial ?? detectInitialLocale());
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    writeStorage(LOCALE_KEY, next);
    setState(next);
  }, []);
  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }), [locale, setLocale]);
  return createElement(I18nContext.Provider, { value }, children);
}
