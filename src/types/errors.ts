// Shared error codes (P3 final). One set of codes for file checks (T12 3.8.1), DWG conversion (T13 5.1),
// the drawing library (T11 5.1) and the error screen (T20 5.1). Screen text lives in the dictionary (T19).

/** App-level file errors (T12 3.8.1). */
export type FileErrorCode = "UNSUPPORTED_FORMAT" | "FILE_READ_FAILED" | "EMPTY_FILE" | "FILE_TOO_LARGE";

/** DWG conversion errors (T13 5.1). EMPTY_FILE / FILE_TOO_LARGE / FILE_READ_FAILED are shared with files. */
export type DwgErrorCode =
  | "DWG_CONVERSION_FAILED" | "DWG_UNSUPPORTED_VERSION" | "DWG_CORRUPT_OR_ENCRYPTED" | "DWG_PARSE_FAILED"
  | "DWG_EXPORT_FAILED" | "DWG_MEMORY_LIMIT" | "DWG_CONVERSION_TIMEOUT" | "DWG_RUNTIME_MISSING";

/** Viewer / PDF / archive errors shown on the error screen (T20 5.1). */
export type ViewerErrorCode = "DXF_OPEN_FAILED" | "PDF_OPEN_FAILED" | "PDF_PASSWORD" | "ARCHIVE_OPEN_FAILED" | "RENDER_FAILED";

/** Every code the error screen can show. */
export type AppErrorCode = FileErrorCode | DwgErrorCode | ViewerErrorCode;

/** DWG diagnostics shown in the error screen table (T13 3.3-4). */
export type DwgDiagnostics = { engine: "libredwg"; version: string; bytes: number; engineCode?: string };

/** Error carrying a code; `message` is an English developer message, never shown on screen. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly diagnostics?: DwgDiagnostics;
  constructor(code: AppErrorCode, message?: string, options?: { cause?: unknown; diagnostics?: DwgDiagnostics }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.diagnostics = options?.diagnostics;
  }
}

/** Drawing library errors (T11 5.1) and archive errors (T12 3.8.2). */
export type LibraryErrorCode =
  | "INVALID_NAME" | "DUPLICATE_NAME" | "INVALID_DESTINATION" | "STORAGE_FULL" | "INVALID_FILE" | "FILE_TOO_LARGE"
  | "UNAVAILABLE" | "NOT_FOUND" | "UNKNOWN"
  | "ARCHIVE_ENCRYPTED" | "ARCHIVE_LIMIT" | "ARCHIVE_INVALID_PATH" | "ARCHIVE_UNREADABLE";

export class LibraryError extends Error {
  readonly code: LibraryErrorCode;
  constructor(code: LibraryErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LibraryError";
    this.code = code;
  }
}

/** Message used by every skeleton function until its P4 group implements it. */
export function notImplemented(what: string): never {
  throw new Error("尚未實作：" + what);
}
