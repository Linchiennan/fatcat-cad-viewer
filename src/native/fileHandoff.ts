// Hand an output file (PNG / PDF) to other apps: share sheet or "open with". Owner: P4 group E.
// Android goes through the native "FileHandoff" plugin (FileProvider under cache/shared/, read grant only);
// the web build uses the Web Share API when it can share files, otherwise a download.
import { Capacitor, registerPlugin } from "@capacitor/core";

/** What happened: handed to the share sheet / another app, saved as a download, or cancelled by the user. */
export type HandoffOutcome = "shared" | "opened" | "downloaded" | "cancelled";

/** Largest file handed over (the bridge carries it as base64). */
export const MAX_HANDOFF_BYTES = 64 * 1024 * 1024;

interface FileHandoffPlugin {
  share(options: { data: string; fileName: string; mimeType: string }): Promise<void>;
  open(options: { data: string; fileName: string; mimeType: string }): Promise<void>;
}

export const fileHandoffPlugin = registerPlugin<FileHandoffPlugin>("FileHandoff");

/** Rejection codes from the native side. */
export type HandoffErrorCode = "HANDOFF_TOO_LARGE" | "HANDOFF_NO_APP" | "HANDOFF_FAILED";

export class HandoffError extends Error {
  readonly code: HandoffErrorCode;
  constructor(code: HandoffErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HandoffError";
    this.code = code;
  }
}

// eslint-disable-next-line no-control-regex
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** A file name every target app and file system accepts: no path or reserved characters, at most 120 characters. */
export function safeHandoffName(fileName: string): string {
  const clean = fileName.replace(UNSAFE, "_").trim();
  const name = clean === "" || /^\.+$/.test(clean) ? "output" : clean;
  if (name.length <= 120) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  return name.slice(0, 120 - ext.length) + ext;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function nativeError(error: unknown): HandoffError {
  const code = (error as { code?: string } | null)?.code;
  if (code === "HANDOFF_NO_APP" || code === "HANDOFF_TOO_LARGE") return new HandoffError(code, String((error as Error).message ?? code));
  return new HandoffError("HANDOFF_FAILED", "Native handoff failed", { cause: error });
}

function download(blob: Blob, name: string): HandoffOutcome {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

async function viaNative(method: "share" | "open", blob: Blob, name: string, mime: string): Promise<void> {
  if (blob.size > MAX_HANDOFF_BYTES) throw new HandoffError("HANDOFF_TOO_LARGE", `Over ${MAX_HANDOFF_BYTES} bytes`);
  const options = { data: await toBase64(blob), fileName: name, mimeType: mime };
  try {
    await (method === "share" ? fileHandoffPlugin.share(options) : fileHandoffPlugin.open(options));
  } catch (error) {
    throw nativeError(error);
  }
}

/** Offer the file to other apps (system share sheet / Web Share); falls back to a download on the web. */
export async function shareFile(blob: Blob, fileName: string, mime: string): Promise<HandoffOutcome> {
  const name = safeHandoffName(fileName);
  if (Capacitor.isNativePlatform()) {
    await viaNative("share", blob, name, mime);
    return "shared";
  }
  const file = new File([blob], name, { type: mime });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
      // Share refused (e.g. no user gesture left): keep the file anyway.
    }
  }
  return download(blob, name);
}

/** Open the file in another app (Android: the system "open with"; web: a new tab, or a download when blocked). */
export async function openFile(blob: Blob, fileName: string, mime: string): Promise<HandoffOutcome> {
  const name = safeHandoffName(fileName);
  if (Capacitor.isNativePlatform()) {
    await viaNative("open", blob, name, mime);
    return "opened";
  }
  const url = URL.createObjectURL(new Blob([blob], { type: mime }));
  const tab = window.open(url, "_blank");
  if (!tab) {
    // Pop-up blocked: save it instead.
    URL.revokeObjectURL(url);
    return download(blob, name);
  }
  tab.opener = null;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "opened";
}
