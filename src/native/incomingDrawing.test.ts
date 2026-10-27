import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../types/errors";

// Group A owns fileTypes. Until its functions are implemented, fall back to the contract rules (介面合約 2.1)
// so this module's behaviour can be tested now; once A lands, the real functions are used.
vi.mock("../files/fileTypes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../files/fileTypes")>();
  const fallback = <A extends unknown[], R>(fn: (...a: A) => R, local: (...a: A) => R) => (...a: A): R => {
    try { return fn(...a); } catch (e) { if (e instanceof Error && e.message.startsWith("尚未實作")) return local(...a); throw e; }
  };
  const formats = ["dxf", "dwg", "pdf", "png", "jpg", "jpeg", "zip", "rar"] as const;
  return {
    ...real,
    detectDrawingFormat: fallback(real.detectDrawingFormat, (name: string) => {
      const m = /\.([^.]+)$/.exec(name.trim());
      const ext = m?.[1].toLowerCase();
      return (formats as readonly string[]).includes(ext ?? "") ? (ext as (typeof formats)[number]) : null;
    }),
    formatSizeLimit: fallback(real.formatSizeLimit, (f) => (f === "zip" || f === "rar" ? real.MAX_ARCHIVE_BYTES : real.MAX_DRAWING_BYTES)),
    assertFileSize: fallback(real.assertFileSize, (size: number, limit = real.MAX_DRAWING_BYTES) => {
      if (!Number.isFinite(size) || size < 0) throw new AppError("FILE_READ_FAILED");
      if (size === 0) throw new AppError("EMPTY_FILE");
      if (size > limit) throw new AppError("FILE_TOO_LARGE");
    }),
  };
});

const { readIncomingDrawingFile } = await import("./incomingDrawing");

const DXF = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n";
const incoming = (over: Partial<Parameters<typeof readIncomingDrawingFile>[0]> = {}) => ({
  id: "id-1", name: "shared-plan.dxf", size: -1, mimeType: "application/dxf", uri: "content://provider/doc/1", ...over,
});
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof AppError ? e.code : (e as Error).name; }
  return "resolved";
};
const respond = (body: BodyInit | null, init?: ResponseInit) => vi.fn(async () => new Response(body, init));

afterEach(() => vi.unstubAllGlobals());

describe("readIncomingDrawingFile (T21 9.1)", () => {
  it("turns an inline data URI of unknown length into a File", async () => {
    const encoded = btoa(DXF);
    const result = await readIncomingDrawingFile(incoming({ uri: `data:application/dxf;base64,${encoded}` }));
    expect({ name: result.name, type: result.type, size: result.size }).toEqual({ name: "shared-plan.dxf", type: "application/dxf", size: DXF.length });
    expect((await result.text()).includes("SECTION")).toBe(true);
  });

  it("rejects unsupported names and remote URIs without reading", async () => {
    const fetch = respond(DXF);
    vi.stubGlobal("fetch", fetch);
    expect(await code(readIncomingDrawingFile(incoming({ name: "file.txt" })))).toBe("UNSUPPORTED_FORMAT");
    expect(await code(readIncomingDrawingFile(incoming({ uri: "https://example.com/file.dxf" })))).toBe("FILE_READ_FAILED");
    expect(await code(readIncomingDrawingFile(incoming({ id: "" })))).toBe("FILE_READ_FAILED");
    expect(await code(readIncomingDrawingFile(incoming({ name: "a\u0001b.dxf" })))).toBe("FILE_READ_FAILED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks a declared size before reading", async () => {
    const fetch = respond(DXF);
    vi.stubGlobal("fetch", fetch);
    expect(await code(readIncomingDrawingFile(incoming({ size: 0 })))).toBe("EMPTY_FILE");
    expect(await code(readIncomingDrawingFile(incoming({ size: 167_772_160 + 1 })))).toBe("FILE_TOO_LARGE"); // DXF: 160 MB (用戶 2026-10-27)
    expect(await code(readIncomingDrawingFile(incoming({ name: "a.dwg", size: 134_217_728 + 1 })))).toBe("FILE_TOO_LARGE");
    expect(await code(readIncomingDrawingFile(incoming({ name: "a.zip", size: 67_108_864 + 1 })))).toBe("FILE_TOO_LARGE");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an empty file when the unknown-size stream is empty", async () => {
    vi.stubGlobal("fetch", respond(new Uint8Array(0)));
    expect(await code(readIncomingDrawingFile(incoming()))).toBe("EMPTY_FILE");
  });

  it.each([["document.pdf", "%PDF-1.7"], ["bundle.zip", "PK\u0003\u0004"], ["bundle.rar", "Rar!\u001a\u0007"]])("reads %s", async (name, text) => {
    vi.stubGlobal("fetch", respond(text, { headers: { "content-type": "application/octet-stream" } }));
    const file = await readIncomingDrawingFile(incoming({ name, mimeType: "" }));
    expect(file.name).toBe(name);
    expect(file.type).toBe("application/octet-stream");
    expect(await file.text()).toBe(text);
  });

  it("fails when fewer bytes arrive than declared", async () => {
    vi.stubGlobal("fetch", respond("abc"));
    expect(await code(readIncomingDrawingFile(incoming({ size: 8 })))).toBe("FILE_READ_FAILED");
  });

  it("passes the abort signal through and bypasses the cache", async () => {
    const fetch = respond(DXF);
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await readIncomingDrawingFile(incoming(), controller.signal);
    expect(fetch).toHaveBeenCalledWith("content://provider/doc/1", { cache: "no-store", signal: controller.signal });
  });

  it("propagates an abort as AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    expect(await code(readIncomingDrawingFile(incoming()))).toBe("AbortError");
  });

  it("cancels an endless stream exactly once when it passes the limit", async () => {
    const megabyte = new Uint8Array(1 << 20);
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ cancel, pull(controller) { controller.enqueue(megabyte); } }))));
    expect(await code(readIncomingDrawingFile(incoming()))).toBe("FILE_TOO_LARGE");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("uses a numeric content-length before streaming and reports HTTP failures", async () => {
    vi.stubGlobal("fetch", respond(DXF, { headers: { "content-length": String(167_772_160 + 5) } }));
    expect(await code(readIncomingDrawingFile(incoming()))).toBe("FILE_TOO_LARGE");
    vi.stubGlobal("fetch", respond("missing", { status: 404 }));
    expect(await code(readIncomingDrawingFile(incoming()))).toBe("FILE_READ_FAILED");
  });
});
