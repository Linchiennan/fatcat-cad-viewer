// Library strings that are not in the shared dictionary yet (待決 A-6, A-7, T11 5.2 page dots).
// Group D may move them into translations.ts; until then the screen picks the text by locale here.
import type { Locale } from "../i18n/translations";

const TEXT = {
  recentPages: { "zh-TW": "最近開啟頁數", en: "Recent pages" },
  page: { "zh-TW": "第 {n} 頁", en: "Page {n}" },
  /** Small text under a directory row in the archive dialog (待決 A-7: was the folder-name label). */
  archiveFolder: { "zh-TW": "資料夾", en: "Folder" },
  /** Archive over 64 MB (待決 A-6: the old text said 128 MB). */
  archiveTooLarge: {
    "zh-TW": "壓縮檔超過 64 MB 安全上限，請使用較小的壓縮檔。",
    en: "The archive is over the 64 MB safety limit. Use a smaller archive.",
  },
  // Exports area (spec 005).
  exports: { "zh-TW": "輸出成果", en: "Exports" },
  exportsSubtitle: { "zh-TW": "輸出的 PNG 與 PDF", en: "Your PNG and PDF exports" },
  exportsUsed: { "zh-TW": "已用空間 {size}", en: "Storage used: {size}" },
  exportsHint: { "zh-TW": "點一下打開；長按可改名、刪除、分享", en: "Tap to open; long-press to rename, delete or share" },
  exportsEmptyTitle: { "zh-TW": "還沒有輸出成果", en: "No exports yet" },
  exportsEmptyBody: { "zh-TW": "看圖時按「輸出」產生 PNG 或 PDF，會自動收在這裡。", en: "Use Export while viewing a drawing; each PNG or PDF is kept here." },
  exportsWarning: {
    "zh-TW": "輸出成果已超過 500 MB（目前 {size}）。長按不需要的檔案即可刪除；不會自動刪除。",
    en: "Exports now use over 500 MB ({size}). Long-press files you don't need to delete them; nothing is deleted automatically.",
  },
  exportsDeleteBody: { "zh-TW": "此檔案將從輸出成果移除。", en: "The file will be removed from Exports." },
  share: { "zh-TW": "分享", en: "Share" },
  open: { "zh-TW": "打開", en: "Open" },
  closeWarning: { "zh-TW": "關閉提示", en: "Close notice" },
  downscaled: { "zh-TW": "已降解析度", en: "Reduced resolution" },
  handoffNoApp: { "zh-TW": "找不到可以開啟此檔案的 App。", en: "No app on this device can open this file." },
  handoffTooLarge: { "zh-TW": "檔案超過 64 MB，無法交給其他 App。", en: "The file is over 64 MB and can't be handed to another app." },
} as const;

export type LibraryTextKey = keyof typeof TEXT;

export function libraryText(locale: Locale, key: LibraryTextKey, params?: Record<string, string | number>): string {
  const text: string = TEXT[key][locale] ?? TEXT[key]["zh-TW"];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}
