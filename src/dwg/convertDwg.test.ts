// Main-thread side of the DWG conversion with a fake worker (T13 9-1).
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../types/errors";
import { conversionRebuiltBlocks, conversionWarnings, convertDwgToDxf, DWG_TIMEOUT_MS, setDwgWorkerFactory } from "./convertDwg";
import { savedViewFor } from "../viewer/savedView";
import { drawingIdentity } from "../viewer/readingPosition";

type Reply = Record<string, unknown> | ((req: any) => Record<string, unknown> | null);

class FakeWorker extends EventTarget {
  terminated = false;
  requests: any[] = [];
  constructor(private readonly reply: Reply | null, private readonly postFails = false) { super(); }
  postMessage(message: any, transfer?: Transferable[]) {
    if (this.postFails) throw new DOMException("could not clone", "DataCloneError");
    this.requests.push({ message, transfer });
    if (!this.reply) return;
    const data = typeof this.reply === "function" ? this.reply(message) : { id: message.id, ...this.reply };
    if (data) queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data })));
  }
  terminate() { this.terminated = true; }
}

const dwg = (text = "AC1018 fake drawing bytes") => new File([new TextEncoder().encode(text)], "plan.v2.dwg");
const dxfBytes = () => new TextEncoder().encode("0\nSECTION\n0\nEOF\n").buffer;
let last: FakeWorker | null = null;
const use = (reply: Reply | null, postFails = false) => {
  last = null;
  setDwgWorkerFactory(() => (last = new FakeWorker(reply, postFails)) as unknown as Worker);
};

afterEach(() => { setDwgWorkerFactory(null); vi.useRealTimers(); });

describe("convertDwgToDxf", () => {
  it("returns a .dxf with the saved view and diagnostics, and ends the worker", async () => {
    use({ ok: true, dxf: dxfBytes(), savedView: { center: { x: 1, y: 2 }, viewHeight: 5, aspect: 2 }, diagnostics: 3, fallback: JSON.stringify({ blocks: { X: {} }, skipped: { HATCH: 1 } }) });
    const source = dwg();
    const out = await convertDwgToDxf(source);
    expect(out.name).toBe("plan.v2.dxf");
    expect(out.type).toBe("application/dxf");
    expect(savedViewFor(out)).toEqual({ center: { x: 1, y: 2 }, viewHeight: 5, aspect: 2 });
    expect(conversionWarnings.get(out)).toBe(3);
    expect(conversionRebuiltBlocks.get(out)).toEqual({ blocks: { X: {} }, skipped: { HATCH: 1 } });
    expect(await drawingIdentity(out)).toBe(await drawingIdentity(source));
    expect(last!.terminated).toBe(true);
    expect(last!.requests[0].transfer).toHaveLength(1);
  });

  // Checks that must stop the conversion before any byte is read or any worker exists.
  type Probe = { file: File; reads: () => number };
  const probe = (size: number, bytes: () => Promise<ArrayBuffer>): Probe => {
    let reads = 0;
    const file = { name: "probe.dwg", size, arrayBuffer: () => { reads++; return bytes(); } } as unknown as File;
    return { file, reads: () => reads };
  };
  const early: { title: string; size: number; aborted: boolean; failingRead?: boolean; expected: Record<string, string>; readsAllowed: number }[] = [
    { title: "a request that was cancelled before it started", size: 64, aborted: true, expected: { name: "AbortError" }, readsAllowed: 0 },
    { title: "a source above the 128 MB limit", size: 128 * 1024 * 1024 + 1, aborted: false, expected: { code: "FILE_TOO_LARGE" }, readsAllowed: 0 },
    { title: "a zero-byte source", size: 0, aborted: false, expected: { code: "EMPTY_FILE" }, readsAllowed: 0 },
    { title: "a source whose bytes cannot be read (stays FILE_READ_FAILED)", size: 64, aborted: false, failingRead: true, expected: { code: "FILE_READ_FAILED" }, readsAllowed: 1 },
  ];
  for (const c of early) {
    it(`stops without a worker for ${c.title}`, async () => {
      use({ ok: true, dxf: dxfBytes() });
      const p = probe(c.size, c.failingRead ? () => Promise.reject(new Error("unreadable")) : async () => new ArrayBuffer(c.size));
      const signal = c.aborted ? AbortSignal.abort() : undefined;
      const failure = await convertDwgToDxf(p.file, signal).then(() => null, (e) => e);
      expect(failure).toMatchObject(c.expected);
      expect(p.reads()).toBe(c.readsAllowed);
      expect(last).toBeNull();
    });
  }

  it("ends the worker and rejects with AbortError when cancelled mid-way", async () => {
    use(null);
    const ctrl = new AbortController();
    const run = convertDwgToDxf(dwg(), ctrl.signal);
    await vi.waitFor(() => expect(last?.requests.length).toBe(1));
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(last!.terminated).toBe(true);
  });

  it("ends the worker when the request cannot be sent", async () => {
    use(null, true);
    await expect(convertDwgToDxf(dwg())).rejects.toMatchObject({ name: "DataCloneError" });
    expect(last!.terminated).toBe(true);
  });

  it("times out after 180 s", async () => {
    vi.useFakeTimers();
    use(null);
    const run = convertDwgToDxf(dwg());
    const caught = run.catch((e) => e);
    await vi.waitFor(() => expect(last?.requests.length).toBe(1));
    await vi.advanceTimersByTimeAsync(DWG_TIMEOUT_MS);
    const error = await caught;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("DWG_CONVERSION_TIMEOUT");
    expect(error.diagnostics.version).toBe("AC1018 (AutoCAD 2004)");
    expect(last!.terminated).toBe(true);
  });

  it("maps empty output, unreadable replies and worker start failures", async () => {
    use({ ok: true, dxf: new ArrayBuffer(0) });
    await expect(convertDwgToDxf(dwg())).rejects.toMatchObject({ code: "DWG_EXPORT_FAILED" });

    use(null);
    let run = convertDwgToDxf(dwg());
    await vi.waitFor(() => expect(last?.requests.length).toBe(1));
    last!.dispatchEvent(new MessageEvent("messageerror"));
    await expect(run).rejects.toMatchObject({ code: "DWG_CONVERSION_FAILED" });

    use(null);
    run = convertDwgToDxf(dwg());
    await vi.waitFor(() => expect(last?.requests.length).toBe(1));
    last!.dispatchEvent(new Event("error"));
    await expect(run).rejects.toMatchObject({ code: "DWG_RUNTIME_MISSING" });
  });

  it("passes the worker's code and engine flags to the error screen", async () => {
    use({ ok: false, code: "DWG_PARSE_FAILED", message: "libredwg returned 256", engineError: 256 });
    const error = await convertDwgToDxf(dwg()).catch((e) => e);
    expect(error.code).toBe("DWG_PARSE_FAILED");
    expect(error.diagnostics).toEqual({ engine: "libredwg", version: "AC1018 (AutoCAD 2004)", bytes: 25, engineCode: "SECTIONNOTFOUND" });
  });

  it("refuses output over the limit and ignores replies for other requests", async () => {
    use((req) => ({ id: req.id, ok: true, dxf: new ArrayBuffer(134_217_729) }));
    await expect(convertDwgToDxf(dwg())).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    use((req) => ({ id: req.id + 1000, ok: true, dxf: dxfBytes() }));
    vi.useFakeTimers();
    const caught = convertDwgToDxf(dwg()).catch((e) => e);
    await vi.waitFor(() => expect(last?.requests.length).toBe(1));
    await vi.advanceTimersByTimeAsync(DWG_TIMEOUT_MS);
    expect((await caught).code).toBe("DWG_CONVERSION_TIMEOUT");
  });

  it("opens the drawing even when the fallback data is broken", async () => {
    use({ ok: true, dxf: dxfBytes(), diagnostics: 0, fallback: "{not json" });
    const out = await convertDwgToDxf(dwg());
    expect(conversionRebuiltBlocks.get(out)).toBeUndefined();
    expect(conversionWarnings.get(out)).toBe(0);
  });
});
