import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { libarchiveWasm, type LibarchiveWasm } from "libarchive-wasm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createArchiveHandler, openArchiveBytes, type ArchiveReply, type ArchiveRequest } from "./archiveCore";
import { ARCHIVE_REQUEST_TIMEOUT_MS, openArchive, setArchiveWorkerFactory, type ArchiveWorkerLike } from "./archives";
import { checkRarHeader, extractRar, listRar } from "./rarReader";
import { crc32, extractZipEntry, listZip } from "./zipReader";

// ---- helpers -------------------------------------------------------------------------------------------
type RawZipEntry = { name: Uint8Array | string; data?: Uint8Array | string; flags?: number; external?: number };
const bytesOf = (v: Uint8Array | string | undefined) => (typeof v === "string" ? new TextEncoder().encode(v) : v ?? new Uint8Array());

/** A stored (uncompressed) ZIP built byte by byte, so names, flags and attributes can be anything. */
function buildStoredZip(entries: RawZipEntry[]): Uint8Array {
  const locals: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  for (const e of entries) {
    const name = bytesOf(e.name);
    const data = bytesOf(e.data);
    const crc = crc32(data);
    const offset = locals.length;
    const flags = e.flags ?? 0;
    u32(locals, 0x04034b50); u16(locals, 20); u16(locals, flags); u16(locals, 0); u16(locals, 0); u16(locals, 0);
    u32(locals, crc); u32(locals, data.length); u32(locals, data.length); u16(locals, name.length); u16(locals, 0);
    locals.push(...name, ...data);
    u32(central, 0x02014b50); u16(central, (3 << 8) | 20); u16(central, 20); u16(central, flags); u16(central, 0);
    u16(central, 0); u16(central, 0); u32(central, crc); u32(central, data.length); u32(central, data.length);
    u16(central, name.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0);
    u32(central, e.external ?? 0); u32(central, offset); central.push(...name);
  }
  const end: number[] = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length);
  u32(end, central.length); u32(end, locals.length); u16(end, 0);
  return new Uint8Array([...locals, ...central, ...end]);
}

const testdata = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./testdata/${name}`, import.meta.url))));
let wasm: Promise<LibarchiveWasm> | null = null;
function loadLibarchive(): Promise<LibarchiveWasm> {
  const binary = readFileSync(fileURLToPath(new URL("../../node_modules/libarchive-wasm/dist/libarchive.wasm", import.meta.url)));
  wasm ??= libarchiveWasm({ wasmBinary: binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) });
  return wasm;
}
const code = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof DOMException) return e.name;
    return (e as { code?: string }).code ?? (e as Error).name;
  }
  return "ok";
};
const text = (b: Uint8Array) => new TextDecoder().decode(b);

const sampleZip = (level: 0 | 6) => zipSync({
  "Floor 1/plan.dwg": [bytesOf("DWG-CONTENT-1"), { level }],
  "Floor 1/notes.pdf": [bytesOf("%PDF-1.4 notes"), { level }],
  "Floor 2/plan.dxf": [bytesOf("0\nSECTION\n".repeat(50)), { level }],
  "nested.zip": [bytesOf("PK"), { level }],
  "readme.txt": [bytesOf("hello"), { level }],
  "empty.pdf": [new Uint8Array(), { level }],
});

// ---- ZIP -------------------------------------------------------------------------------------------------
describe("ZIP (T12 3.5)", () => {
  it.each([0, 6] as const)("lists 6 entries, 3 supported, and extracts them intact (level %i)", (level) => {
    const zip = sampleZip(level);
    const listing = listZip(zip);
    expect(listing.items).toHaveLength(6);
    expect(listing.items.filter((i) => i.supported).map((i) => i.path)).toEqual(["Floor 1/plan.dwg", "Floor 1/notes.pdf", "Floor 2/plan.dxf"]);
    expect(text(extractZipEntry(zip, listing, "Floor 1/plan.dwg"))).toBe("DWG-CONTENT-1");
    expect(text(extractZipEntry(zip, listing, "Floor 2/plan.dxf"))).toBe("0\nSECTION\n".repeat(50));
  });
  it("refuses a member with one changed byte", () => {
    const zip = sampleZip(0);
    const listing = listZip(zip);
    const at = Buffer.from(zip).indexOf("DWG-CONTENT-1");
    zip[at] ^= 0xff;
    expect(() => extractZipEntry(zip, listing, "Floor 1/plan.dwg")).toThrow(expect.objectContaining({ code: "ARCHIVE_UNREADABLE" }));
  });
  it("rejects encrypted, truncated, split and zip64 archives", async () => {
    expect(await code(() => listZip(buildStoredZip([{ name: "a.dwg", data: "x", flags: 1 }])))).toBe("ARCHIVE_ENCRYPTED");
    expect(await code(() => listZip(sampleZip(6).slice(0, -5)))).toBe("ARCHIVE_UNREADABLE");
    const split = buildStoredZip([{ name: "a.dwg", data: "x" }]);
    split[split.length - 22 + 4] = 1; // disk number
    expect(await code(() => listZip(split))).toBe("ARCHIVE_UNREADABLE");
    const zip64 = buildStoredZip([{ name: "a.dwg", data: "x" }]);
    zip64[zip64.length - 22 + 8] = 0xff; zip64[zip64.length - 22 + 9] = 0xff;
    zip64[zip64.length - 22 + 10] = 0xff; zip64[zip64.length - 22 + 11] = 0xff;
    expect(await code(() => listZip(zip64))).toBe("ARCHIVE_UNREADABLE");
    expect(await code(() => listZip(new Uint8Array(40)))).toBe("ARCHIVE_UNREADABLE");
  });
  it("applies path and count rules from the directory", async () => {
    expect(await code(() => listZip(buildStoredZip([{ name: "../plan.dwg", data: "x" }])))).toBe("ARCHIVE_INVALID_PATH");
    expect(await code(() => listZip(buildStoredZip([{ name: "A/p.pdf", data: "x" }, { name: "a/P.PDF", data: "y" }])))).toBe("ARCHIVE_INVALID_PATH");
    const many = buildStoredZip(Array.from({ length: 1001 }, (_, i) => ({ name: `f${i}.txt`, data: "" })));
    expect(await code(() => listZip(many))).toBe("ARCHIVE_LIMIT");
  });
  it("reads UTF-8 flagged names and guesses Big5 for unflagged Chinese names (待決 B-17)", () => {
    const big5 = new Uint8Array([0xa5, 0xad, 0xad, 0xb1, 0xb9, 0xcf, 0x2e, 0x64, 0x77, 0x67]); // 平面圖.dwg
    const listing = listZip(buildStoredZip([
      { name: big5, data: "x" },
      { name: "樓層/說明.pdf", data: "y", flags: 0x800 },
    ]));
    expect(listing.items.map((i) => i.path)).toEqual(["平面圖.dwg", "樓層/說明.pdf"]);
    // Unflagged UTF-8 (tools that forget the flag) is also read correctly.
    expect(listZip(buildStoredZip([{ name: "中文.dxf", data: "x" }])).items[0].path).toBe("中文.dxf");
    // Bytes that are neither UTF-8 nor Big5 fall back to Latin-1.
    expect(listZip(buildStoredZip([{ name: new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x70, 0x64, 0x66]), data: "x" }])).items[0].path).toBe("café.pdf");
  });
  it("marks unix symlinks and directories", () => {
    const listing = listZip(buildStoredZip([
      { name: "link.dwg", data: "target", external: 0xa1ff << 16 },
      { name: "dir/", data: "" },
      { name: "d2", data: "", external: 0x41ed << 16 },
    ]));
    expect(listing.items.map((i) => [i.path, i.directory, i.supported])).toEqual([["link.dwg", false, false], ["dir", true, false], ["d2", true, false]]);
  });
});

// ---- RAR -------------------------------------------------------------------------------------------------
describe("RAR (T12 3.6)", () => {
  it("checks the header before any WASM decoding", async () => {
    expect(await code(() => checkRarHeader(new Uint8Array(32)))).toBe("ARCHIVE_UNREADABLE");
    expect(await code(() => checkRarHeader(testdata("rar4-headers-encrypted.rar")))).toBe("ARCHIVE_ENCRYPTED");
    expect(await code(() => checkRarHeader(testdata("rar5-headers-encrypted.rar")))).toBe("ARCHIVE_ENCRYPTED");
    expect(await code(() => checkRarHeader(testdata("rar4.rar")))).toBe("ok");
    expect(await code(() => checkRarHeader(testdata("rar5.rar")))).toBe("ok");
    const loader = vi.fn(loadLibarchive);
    expect(await code(openArchiveBytes("rar", testdata("rar5-headers-encrypted.rar"), loader).then((a) => a.items))).toBe("ARCHIVE_ENCRYPTED");
  });
  it("lists and extracts RAR4 with a Chinese name", async () => {
    const mod = await loadLibarchive();
    const bytes = testdata("rar4.rar");
    const items = listRar(mod, bytes);
    const txt = items.find((i) => i.path === "docs/readme.txt")!;
    expect(txt.size).toBeGreaterThan(0);
    expect(items.find((i) => i.path === "平面圖.dwg")?.supported).toBe(true);
    const out = extractRar(mod, bytes, new Map([["docs/readme.txt", txt.size]]));
    expect(text(out.get("docs/readme.txt")!)).toContain("test text document");
  });
  it("lists and extracts RAR5 with progress", async () => {
    const mod = await loadLibarchive();
    const opened = await openArchiveBytes("rar", testdata("rar5.rar"), () => Promise.resolve(mod));
    expect(opened.items.find((i) => i.path === "樓層/平面圖.pdf")?.supported).toBe(true);
    const progress: [number, number][] = [];
    const files = opened.extract(["樓層/平面圖.pdf"], (d, t) => progress.push([d, t]));
    expect(files).toHaveLength(1);
    expect(text(files[0].bytes)).toBe("%PDF-1.4 fake");
    expect(progress).toEqual([[1, 1]]);
    const hello = listRar(mod, testdata("rar5.rar")).find((i) => i.path === "hello.txt")!;
    expect(text(extractRar(mod, testdata("rar5.rar"), new Map([["hello.txt", hello.size]])).get("hello.txt")!)).toContain("hello libarchive test suite");
  });
  it("rejects encrypted entries", async () => {
    const mod = await loadLibarchive();
    expect(await code(() => listRar(mod, testdata("rar5-data-encrypted.rar")))).toBe("ARCHIVE_ENCRYPTED");
  });
});

// ---- session protocol -------------------------------------------------------------------------------
type Fake = ArchiveWorkerLike & { terminated: number; sent: ArchiveRequest[] };
function fakeWorker(options: { hang?: boolean } = {}): Fake {
  const worker: Fake = {
    terminated: 0,
    sent: [],
    onmessage: null,
    onerror: null,
    postMessage(message) {
      worker.sent.push(message);
      if (options.hang) return;
      setTimeout(() => void handler(message), 0);
    },
    terminate() {
      worker.terminated++;
    },
  };
  const handler = createArchiveHandler((reply: ArchiveReply) => setTimeout(() => worker.onmessage?.({ data: reply } as MessageEvent<ArchiveReply>), 0), () => loadLibarchive());
  return worker;
}
const zipFile = () => new File([sampleZip(6) as BlobPart], "package.zip");

describe("archive session (T12 3.7)", () => {
  afterEach(() => {
    setArchiveWorkerFactory(null);
    vi.useRealTimers();
  });
  it("opens, extracts only the chosen paths with progress, and closes once", async () => {
    const worker = fakeWorker();
    setArchiveWorkerFactory(() => worker);
    const session = await openArchive(zipFile());
    expect(session.items.filter((i) => i.supported)).toHaveLength(3);
    const progress: [number, number][] = [];
    const files = await session.extract(["Floor 1/notes.pdf"], undefined, (d, t) => progress.push([d, t]));
    expect(progress).toEqual([[1, 1]]);
    expect(files.map((f) => [f.path, f.file.name, f.file.type])).toEqual([["Floor 1/notes.pdf", "notes.pdf", "application/pdf"]]);
    expect(await files[0].file.text()).toBe("%PDF-1.4 notes");
    const dwg = await session.extract(["Floor 1/plan.dwg"]);
    expect(dwg[0].file.type).toBe("application/octet-stream");
    session.close();
    session.close();
    expect(worker.terminated).toBe(1);
    expect(session.closed).toBe(true);
    expect(await code(session.extract(["Floor 1/plan.dwg"]))).toBe("AbortError");
  });
  it("cancelling while opening ends with AbortError and terminates once", async () => {
    const worker = fakeWorker({ hang: true });
    setArchiveWorkerFactory(() => worker);
    const controller = new AbortController();
    const opening = openArchive(zipFile(), controller.signal);
    controller.abort();
    expect(await code(opening)).toBe("AbortError");
    expect(worker.terminated).toBe(1);
    const pre = new AbortController();
    pre.abort();
    expect(await code(openArchive(zipFile(), pre.signal))).toBe("AbortError");
  });
  it("a stuck request times out after 60 s as over the limit", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker({ hang: true });
    setArchiveWorkerFactory(() => worker);
    const opening = openArchive(zipFile());
    const result = code(opening);
    await vi.advanceTimersByTimeAsync(ARCHIVE_REQUEST_TIMEOUT_MS + 1);
    expect(await result).toBe("ARCHIVE_LIMIT");
    expect(worker.terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a crashed worker reports unreadable; replies for other ids are ignored", async () => {
    const worker = fakeWorker({ hang: true });
    setArchiveWorkerFactory(() => worker);
    const opening = openArchive(zipFile());
    const result = code(opening);
    worker.onmessage?.({ data: { id: 999, type: "opened", items: [] } } as unknown as MessageEvent<ArchiveReply>);
    worker.onerror?.(new Event("error"));
    expect(await result).toBe("ARCHIVE_UNREADABLE");
    expect(worker.terminated).toBe(1);
  });
  it("only one request at a time; errors keep the session usable", async () => {
    const worker = fakeWorker();
    setArchiveWorkerFactory(() => worker);
    const session = await openArchive(zipFile());
    const first = session.extract(["Floor 1/plan.dwg"]);
    expect(await code(session.extract(["Floor 1/notes.pdf"]))).toBe("ARCHIVE_UNREADABLE");
    await first;
    expect(await code(session.extract(["readme.txt"]))).toBe("ARCHIVE_UNREADABLE");
    expect(session.closed).toBe(false);
    expect((await session.extract(["Floor 2/plan.dxf"]))[0].file.name).toBe("plan.dxf");
    session.close();
  });
  it("file checks run before any worker starts", async () => {
    const factory = vi.fn(() => fakeWorker());
    setArchiveWorkerFactory(factory);
    expect(await code(openArchive(new File(["x"], "plan.dwg")))).toBe("ARCHIVE_UNREADABLE");
    const big = new File(["x"], "big.zip");
    Object.defineProperty(big, "size", { value: 67_108_865 });
    expect(await code(openArchive(big))).toBe("FILE_TOO_LARGE");
    expect(factory).not.toHaveBeenCalled();
  });
});
