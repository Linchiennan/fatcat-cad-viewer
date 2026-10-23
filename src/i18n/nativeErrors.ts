// Text for errors the Android plugin rejects with (error.code, T21 5-10). Owner: P4 group D.
import { translate, type Locale, type TranslationKey } from "./translations";

export const NATIVE_ERROR_CODES = [
  "XREF_CANCELLED", "XREF_TOO_DEEP", "XREF_TOO_MANY_ITEMS", "XREF_LIMIT", "XREF_READ_FAILED", "APP_IDENTITY_FAILED",
] as const;
export type NativeErrorCode = (typeof NATIVE_ERROR_CODES)[number];

const PREFIX = "無法讀取外參資料夾：";

/**
 * Localised text of a plugin error, or null when it carries no known code (then show its own message).
 * XREF_READ_FAILED keeps the reason that follows the native prefix.
 */
export function nativeErrorText(locale: Locale, error: unknown): string | null {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  if (!(NATIVE_ERROR_CODES as readonly string[]).includes(code)) return null;
  const message = typeof e?.message === "string" ? e.message : "";
  const reason = message.startsWith(PREFIX) ? message.slice(PREFIX.length) : message;
  return translate(locale, `native.err.${code}` as TranslationKey, { reason });
}
