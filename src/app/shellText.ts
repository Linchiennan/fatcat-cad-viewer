// Small pure helpers of the App shell: error text keys (T20 5.1), loading stage keys (T20 2.1-4),
// file size and version lines (T10 2.2-11, 2.4-2). Owner: P4 group D.
import { AppError, LOAD_TIMEOUT_MESSAGE, type AppErrorCode } from "../types/errors";
import { MAX_ARCHIVE_BYTES, MAX_DXF_BYTES, tooLargeLimit } from "../files/fileTypes";
import type { LoadStage } from "../types/drawing";
import type { Locale, TranslationKey } from "../i18n/translations";

const ERROR_KEYS: Record<AppErrorCode, TranslationKey> = {
  UNSUPPORTED_FORMAT: "error.unsupportedFormat",
  FILE_READ_FAILED: "error.fileRead",
  EMPTY_FILE: "error.emptyFile",
  FILE_TOO_LARGE: "error.tooLarge",
  DWG_CONVERSION_FAILED: "error.dwg.generic",
  DWG_UNSUPPORTED_VERSION: "error.dwg.version",
  DWG_CORRUPT_OR_ENCRYPTED: "error.dwg.header",
  DWG_PARSE_FAILED: "error.dwg.parse",
  DWG_EXPORT_FAILED: "error.dwg.export",
  DWG_MEMORY_LIMIT: "error.dwg.memory",
  DWG_CONVERSION_TIMEOUT: "error.dwg.timeout",
  DWG_RUNTIME_MISSING: "error.dwg.runtime",
  DXF_OPEN_FAILED: "error.dxfOpen",
  PDF_OPEN_FAILED: "error.pdfOpen",
  PDF_PASSWORD: "error.pdfPassword",
  ARCHIVE_OPEN_FAILED: "error.archiveOpen",
  RENDER_FAILED: "error.render",
};

/** Dictionary key of the reason shown for an error code. */
export function errorMessageKey(code: AppErrorCode): TranslationKey {
  return ERROR_KEYS[code] ?? "error.dxfOpen";
}

/** Reason shown on the error screen; a too-large archive says 64 MB, not 128 MB (待決 A-6). */
export function errorReasonKey(error: AppError): TranslationKey {
  if (error.code === "FILE_TOO_LARGE" && tooLargeLimit(error) === MAX_ARCHIVE_BYTES) return "archive.err.tooLarge";
  if (error.code === "FILE_TOO_LARGE" && tooLargeLimit(error) === MAX_DXF_BYTES) return "error.dxfTooLarge";
  if (error.code === "DXF_OPEN_FAILED" && error.message === LOAD_TIMEOUT_MESSAGE) return "error.loadTimeout";
  return errorMessageKey(error.code);
}

/** Cancelling is never an error (T20 5.3-1). */
export function isAbort(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

/** Coded errors pass through; anything else becomes `fallback` with the original kept as the cause. */
export function toAppError(error: unknown, fallback: AppErrorCode): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(fallback, message, { cause: error });
}

/**
 * Default code when converting or reading fails without a code (待決 18: split by format):
 * DWG → the generic DWG message, PDF → PDF, archives → archive, everything else → DXF.
 */
export function readFailureCode(format: string | null): AppErrorCode {
  if (format === "dwg") return "DWG_CONVERSION_FAILED";
  if (format === "pdf") return "PDF_OPEN_FAILED";
  if (format === "zip" || format === "rar") return "ARCHIVE_OPEN_FAILED";
  return "DXF_OPEN_FAILED";
}

/** Default code when the viewer fails (T10 3.2-11). */
export function viewerFailureCode(format: string | null): AppErrorCode {
  return format === "pdf" ? "PDF_OPEN_FAILED" : "DXF_OPEN_FAILED";
}

const STAGE_KEYS: Record<LoadStage, TranslationKey> = {
  reading: "load.phase.reading",
  converting: "load.phase.converting",
  loading: "load.phase.fetch",
  parsing: "load.phase.parse",
  preparing: "load.phase.prepare",
  fonts: "load.phase.font",
};

export function stageKey(stage: LoadStage): TranslationKey {
  return STAGE_KEYS[stage];
}

/** Progress 0..1 from done / total, or null when unknown (T10 3.2-9). */
export function progressFraction(done: number, total: number): number | null {
  if (!(total > 0) || !Number.isFinite(done) || !Number.isFinite(total)) return null;
  return Math.min(1, Math.max(0, done / total));
}

/** "N B" below 1024 bytes, otherwise KB / MB / GB with at most one decimal in the locale's number format. */
export function formatFileSize(bytes: number, locale: Locale): string {
  const nf = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (bytes < 1024) return `${nf(Math.max(0, Math.round(bytes)))} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${nf(value)} ${units[unit]}`;
}

/** Package version without one trailing ".0" (2.1.0 → 2.1). */
export function shortVersion(version: string): string {
  return version.replace(/\.0$/, "");
}

/** Upper-case format badge text of a file name ("DWG", "PDF" …). */
export function formatBadge(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).trim().toUpperCase() : "";
}
