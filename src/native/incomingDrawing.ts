// Web side of the native "IncomingDrawing" plugin (T21 3.4-3.6). Owner: P4 group E.
// The Java plugin (tw.dafeimao.cadviewer) must use the same plugin name, method names and event names.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { assertFileSize, detectDrawingFormat, formatSizeLimit } from "../files/fileTypes";
import { AppError } from "../types/errors";

export const INCOMING_PLUGIN_NAME = "IncomingDrawing";

/** A file handed over by Android (T21 3.4.3). `size` is −1 when unknown; folder picks add `relativePath`. */
export interface IncomingDrawing {
  /** Fresh random UUID per delivery (dedupe + acknowledge). */
  id: string;
  name: string;
  size: number;
  /** May be an empty string. */
  mimeType: string;
  /** content:// or file:// */
  uri: string;
  relativePath?: string;
}

/** Native → web events (T21 3.4.5). Payload per event name. */
export type IncomingEvents = {
  /** A file was opened with / shared to the app; kept and re-sent if the web side was not listening yet. */
  incomingFile: IncomingDrawing;
  /** Android Back. */
  backKey: Record<string, never>;
  /** App moved to the foreground (true) or background (false). */
  foreground: { active: boolean };
};

export interface IncomingDrawingPlugin {
  /** The file waiting since a cold start, if any. */
  getPendingDrawing(): Promise<{ drawing: IncomingDrawing | null }>;
  /** Clear the pending file when the id matches (also resets the Activity intent). */
  acknowledgeDrawing(options: { id: string }): Promise<{ acknowledged: boolean }>;
  exitApp(): Promise<void>;
  /** Our xref folder picker; rejects with the T21 3.4.4 messages. */
  selectXrefDirectory(): Promise<{ files: Required<IncomingDrawing>[] }>;
  addListener<E extends keyof IncomingEvents>(event: E, handler: (payload: IncomingEvents[E]) => void): Promise<PluginListenerHandle>;
}

export const incomingDrawingPlugin = registerPlugin<IncomingDrawingPlugin>(INCOMING_PLUGIN_NAME);

/** Rejection codes the native side attaches (message stays the T21 5-10 Chinese text; screens may translate by code). */
export type NativeErrorCode =
  "XREF_CANCELLED" | "XREF_TOO_DEEP" | "XREF_TOO_MANY_ITEMS" | "XREF_LIMIT" | "XREF_READ_FAILED";

const LOCAL_URI = /^(content|file|blob|data):/i;
// Path separators and control characters (C0, DEL, C1) are never part of a handed-over file name.
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[/\\\u0000-\u001f\u007f-\u009f]/;

function readFailed(message: string, cause?: unknown): AppError {
  return new AppError("FILE_READ_FAILED", message, cause === undefined ? undefined : { cause });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Read an incoming file into a File, checking format, URI scheme and size before and while reading (T21 3.6); throws AppError. */
export async function readIncomingDrawingFile(drawing: IncomingDrawing, signal?: AbortSignal): Promise<File> {
  // 1. Checks that need no read at all.
  const format = detectDrawingFormat(drawing.name);
  if (!format) throw new AppError("UNSUPPORTED_FORMAT", `Unsupported incoming file: ${drawing.name}`);
  if (!drawing.id || !LOCAL_URI.test(drawing.uri) || BAD_NAME.test(drawing.name)) {
    throw readFailed("Incoming file rejected: missing id, non-local URI or unsafe name");
  }
  const limit = formatSizeLimit(format);
  const declared = Number.isFinite(drawing.size) && drawing.size >= 0 ? drawing.size : -1;
  if (declared >= 0) assertFileSize(declared, limit);

  // 2. Read through the WebView's local-file URL, never from a cache.
  let response: Response;
  try {
    response = await fetch(Capacitor.convertFileSrc(drawing.uri), { cache: "no-store", signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw readFailed("Incoming file fetch failed", error);
  }
  if (!response.ok) throw readFailed(`Incoming file fetch failed: HTTP ${response.status}`);
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && /^\d+$/.test(lengthHeader.trim())) assertFileSize(Number(lengthHeader.trim()), limit);

  // 3. Stream with a running limit so an oversized file is never held in memory whole.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          throw new AppError("FILE_TOO_LARGE", `Incoming file exceeds ${limit} bytes while streaming`);
        }
        chunks.push(value as Uint8Array<ArrayBuffer>);
      }
    } else {
      const whole = new Uint8Array(await response.arrayBuffer());
      total = whole.byteLength;
      chunks.push(whole);
    }
  } catch (error) {
    if (error instanceof AppError || isAbort(error)) throw error;
    throw readFailed("Incoming file stream failed", error);
  }
  assertFileSize(total, limit);
  if (declared > 0 && total !== declared) throw readFailed(`Incoming file size changed: declared ${declared}, read ${total}`);

  const type = drawing.mimeType || response.headers.get("content-type") || "application/octet-stream";
  return new File(chunks, drawing.name, { type, lastModified: Date.now() });
}
