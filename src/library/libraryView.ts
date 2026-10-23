// Pure helpers for the library screen: sorting, search, size/date text, error text, back key (T11 2-4).
// Owner: P4 group A.
import type { Locale, TranslationKey } from "../i18n/translations";
import { MAX_ARCHIVE_BYTES, tooLargeLimit } from "../files/fileTypes";
import { LibraryError } from "../types/errors";
import type { LibraryEntry } from "./drawingLibrary";

export type LibrarySort = "name" | "newest" | "largest";

/** Folders first; then name (natural, case-insensitive), newest updatedAt, or largest size (T11 3.6-2, 待決 B-15). */
export function sortLibraryEntries(entries: readonly LibraryEntry[], sort: LibrarySort, locale: Locale): LibraryEntry[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const byName = (a: LibraryEntry, b: LibraryEntry) => collator.compare(a.name, b.name);
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    if (sort === "newest") return b.updatedAt - a.updatedAt || byName(a, b);
    if (sort === "largest" && a.kind === "drawing" && b.kind === "drawing") return b.size - a.size || byName(a, b);
    return byName(a, b);
  });
}

/** Direct children whose NFKC, lower-cased name contains the NFKC, trimmed, lower-cased query (T11 3.7). */
export function filterLibraryEntries(entries: readonly LibraryEntry[], query: string, locale: Locale): LibraryEntry[] {
  const q = query.normalize("NFKC").trim().toLocaleLowerCase(locale);
  if (!q) return [...entries];
  return entries.filter((e) => e.name.normalize("NFKC").toLocaleLowerCase(locale).includes(q));
}

/** "N B", else KB / MB / GB with at most one decimal in the UI locale (T11 3.17-1). */
export function formatLibrarySize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

/** Day (2 digits), short month, 4-digit year in the UI locale ("2026年10月23日") (T11 3.17-2). */
export function formatLibraryDate(time: number, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "2-digit" });
  return formatter.format(time);
}

/** Page count and current page of the recent carousel (two cards a page, T11 2.3-5). */
export function recentPageCount(cards: number): number {
  return Math.ceil(cards / 2);
}
export function recentCurrentPage(scrollLeft: number, rowWidth: number): number {
  return Math.round(scrollLeft / Math.max(1, rowWidth + 10));
}

/** Extract progress as a whole percentage. */
export function progressPercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** Dictionary key, or one of the library's own extra strings, for an error. */
export type LibraryMessage = { key: TranslationKey } | { own: "archiveTooLarge" | "handoffNoApp" | "handoffTooLarge" };

export function libraryErrorMessage(error: unknown): LibraryMessage {
  const code = error instanceof LibraryError ? error.code : (error as { code?: string } | null)?.code;
  switch (code) {
    case "INVALID_NAME": return { key: "library.err.invalidName" };
    case "DUPLICATE_NAME": return { key: "library.err.nameExists" };
    case "INVALID_DESTINATION": return { key: "library.err.invalidDestination" };
    case "STORAGE_FULL": return { key: "library.err.storageFull" };
    case "INVALID_FILE": return { key: "library.err.invalidFile" };
    case "FILE_TOO_LARGE": return tooLargeLimit(error) === MAX_ARCHIVE_BYTES ? { own: "archiveTooLarge" } : { key: "library.err.tooLarge" };
    case "UNAVAILABLE": return { key: "library.err.unavailable" };
    case "NOT_FOUND": return { key: "library.err.notFound" };
    case "ARCHIVE_ENCRYPTED": return { key: "archive.err.encrypted" };
    case "ARCHIVE_LIMIT": return { key: "archive.err.limit" };
    case "ARCHIVE_INVALID_PATH": return { key: "archive.err.invalidPath" };
    case "ARCHIVE_UNREADABLE": return { key: "error.archiveOpen" };
    // Share / open of exports (E 組 fileHandoff).
    case "HANDOFF_NO_APP": return { own: "handoffNoApp" };
    case "HANDOFF_TOO_LARGE": return { own: "handoffTooLarge" };
    default: return { key: "library.err.failed" };
  }
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

/** What the library looks at for one Back / Esc press (T11 4.2). */
export type LibraryBackState = {
  archiveOpen: boolean;
  busy: boolean;
  textDialogOpen: boolean;
  destinationOpen: boolean;
  deleteOpen: boolean;
  actionsOpen: boolean;
  /** A menu or dialog of the exports area (spec 005). */
  exportPopupOpen?: boolean;
  /** The exports area is showing instead of the folders. */
  exportsOpen?: boolean;
  hasSearch: boolean;
  inSubfolder: boolean;
};
export type LibraryBackAction =
  | "cancel-archive" | "ignore" | "close-text" | "close-destination" | "close-delete" | "close-actions"
  | "close-export-popup" | "close-exports" | "clear-search" | "up" | "close-library";

/** First matching rule wins (T11 4.2); the header back button does the same. */
export function decideLibraryBack(s: LibraryBackState): LibraryBackAction {
  if (s.archiveOpen) return "cancel-archive";
  if (s.busy) return "ignore";
  if (s.textDialogOpen) return "close-text";
  if (s.destinationOpen) return "close-destination";
  if (s.deleteOpen) return "close-delete";
  if (s.actionsOpen) return "close-actions";
  if (s.exportPopupOpen) return "close-export-popup";
  if (s.exportsOpen) return "close-exports";
  if (s.hasSearch) return "clear-search";
  if (s.inSubfolder) return "up";
  return "close-library";
}

// Nested back handler while the library is open (T10 4.3-2). The App calls handleLibraryBack() before its
// own rules; it returns false when no library is mounted.
let backHandler: (() => void) | null = null;

export function setLibraryBackHandler(handler: (() => void) | null): void {
  backHandler = handler;
}

export function handleLibraryBack(): boolean {
  if (!backHandler) return false;
  backHandler();
  return true;
}
