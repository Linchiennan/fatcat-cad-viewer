// File formats, size limits and the pre-open check (T12 3.1-3.3). Owner: P4 group A.
import { AppError } from "../types/errors";

export type DrawingFormat = "dxf" | "dwg" | "pdf" | "png" | "jpg" | "jpeg" | "zip" | "rar";

/** 128 MB for drawings, 64 MB for archives (exactly the limit is allowed). */
export const MAX_DRAWING_BYTES = 134_217_728;
export const MAX_ARCHIVE_BYTES = 67_108_864;
/**
 * DXF content (a .dxf file, or what a DWG converts to) may reach 160 MB: 128 MB turned away drawings that phones open
 * (用戶 2026-10-27：現在手機記憶體隨便都超過 2G). 160 MB covers 排水 138 / 竣工圖 148 / 配電盤 149 MB; 256 MB was tried and
 * 原山空調 (229 MB) did not open on a desktop in 15 minutes. Above LARGE_DXF_BYTES the viewer asks first, since an older
 * phone may run out of memory on it.
 */
export const MAX_DXF_BYTES = 167_772_160;
export const LARGE_DXF_BYTES = MAX_DRAWING_BYTES;

/** A file that passed the pre-open check. */
export type DrawingFile = { file: File; name: string; format: DrawingFormat; size: number };

const FORMATS: readonly DrawingFormat[] = ["dxf", "dwg", "pdf", "png", "jpg", "jpeg", "zip", "rar"];

/** Extension after the last dot (trimmed, lower case); "" when there is none or the dot is the last character. */
export function fileExtension(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || dot === trimmed.length - 1) return "";
  return trimmed.slice(dot + 1).toLowerCase();
}

/** Format from the file name's last extension (trimmed, lower case); null when unsupported. */
export function detectDrawingFormat(name: string): DrawingFormat | null {
  const ext = fileExtension(name);
  return (FORMATS as readonly string[]).includes(ext) ? (ext as DrawingFormat) : null;
}

export function isCadFormat(format: DrawingFormat): boolean {
  return format === "dxf" || format === "dwg";
}

export function isArchiveFormat(format: DrawingFormat): boolean {
  return format === "zip" || format === "rar";
}

/** Byte limit for a format. */
export function formatSizeLimit(format: DrawingFormat): number {
  return isArchiveFormat(format) ? MAX_ARCHIVE_BYTES : format === "dxf" ? MAX_DXF_BYTES : MAX_DRAWING_BYTES;
}

/** Throw AppError FILE_READ_FAILED / EMPTY_FILE / FILE_TOO_LARGE when `size` does not pass (default limit 128 MB). */
export function assertFileSize(size: number, limit = MAX_DRAWING_BYTES): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new AppError("FILE_READ_FAILED", `Invalid file size: ${size}`);
  if (size === 0) throw new AppError("EMPTY_FILE", "The file is empty");
  // The limit is in the message so the error screen can tell 64 MB archives from 128 MB drawings (待決 A-6).
  if (size > limit) throw new AppError("FILE_TOO_LARGE", tooLargeMessage(limit));
}

/** Developer message for a too-large file; tooLargeLimit() reads the limit back. */
export function tooLargeMessage(limit: number): string {
  return `File is larger than the ${limit} byte limit`;
}

/** Byte limit carried by a FILE_TOO_LARGE AppError / LibraryError from group A (null when unknown). */
export function tooLargeLimit(error: unknown): number | null {
  const e = error as { code?: string; message?: string } | null;
  if (!e || e.code !== "FILE_TOO_LARGE" || typeof e.message !== "string") return null;
  const m = /the (\d+) byte limit/.exec(e.message);
  return m ? Number(m[1]) : null;
}

/** True when a name has a slash, a backslash or a control character (U+0000-U+001F, U+007F). */
export function hasForbiddenNameCharacter(name: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[/\\\u0000-\u001f\u007f]/.test(name);
}

/** The pre-open check shared by every entry point; throws AppError (UNSUPPORTED_FORMAT first). */
export function prepareDrawingFile(file: File): DrawingFile {
  const name = file.name;
  const format = detectDrawingFormat(name);
  if (!format || hasForbiddenNameCharacter(name)) throw new AppError("UNSUPPORTED_FORMAT", `Unsupported file: ${name}`);
  assertFileSize(file.size, formatSizeLimit(format));
  return { file, name, format, size: file.size };
}

/** Replace the last extension ("building.v2.dwg" → "building.v2.dxf"); add one when there is none. */
export function replaceExtension(name: string, extension: string): string {
  const ext = extension.replace(/^\.+/, "");
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}.${ext}`;
  return `${name.slice(0, dot)}.${ext}`;
}

/** `accept` attribute for file pickers (T12 2-1, verbatim order). */
export const FILE_ACCEPT = [
  ".png", ".jpg", ".jpeg", "image/png", "image/jpeg", ".dxf", ".dwg", ".pdf", ".zip", ".rar",
  "application/dxf", "application/acad", "application/x-acad", "application/autocad_dwg", "image/vnd.dwg",
  "application/pdf", "application/zip", "application/x-zip-compressed", "application/vnd.rar",
  "application/x-rar-compressed", "application/octet-stream",
].join(",");
