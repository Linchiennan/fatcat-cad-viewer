// Real libredwg runtime (public/runtime) on the synthetic DWG fixtures.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { convertDwgBytes, DwgFailure, validDxfOutput, type EngineFactory } from "./dwgEngine";
import { parseDxfXclip } from "./xclipMetadata";

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))));
const realEngine: EngineFactory = async (hooks) => {
  // @ts-expect-error the emscripten runtime has no type declarations
  const runtime = await import("../../public/runtime/libredwg/libredwg-web.js");
  return (runtime.default as (o: object) => Promise<unknown>)({ print: hooks.print, printErr: hooks.printErr });
};

// Public web source intentionally omits DWG binary fixtures; never count these as passing.
const haveDwgFixtures = ['host-native-fixture.dwg', 'host-native-clipped-fixture.dwg'].every(name => existsSync(new URL(`../../fixtures/${name}`, import.meta.url)));
describe("DWG conversion with the real engine", () => {
  it.skipIf(!haveDwgFixtures)("converts a native DWG to a valid DXF", async () => {
    const out = await convertDwgBytes(fixture("host-native-fixture.dwg"), realEngine);
    expect(validDxfOutput(out.dxf)).toBe(true);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(out.dxf));
    expect(doc.entities.length).toBeGreaterThan(0);
    expect(out.diagnostics).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it.skipIf(!haveDwgFixtures)("moves the XCLIP boundary of a clipped INSERT onto its xdata", async () => {
    const out = await convertDwgBytes(fixture("host-native-clipped-fixture.dwg"), realEngine);
    const doc = new DxfParser().parseSync(new TextDecoder().decode(out.dxf));
    const clipped = doc.entities.filter((e: any) => e.type === "INSERT" && parseDxfXclip(e));
    expect(clipped.length).toBeGreaterThan(0);
    expect(parseDxfXclip(clipped[0])!.length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it.skipIf(!haveDwgFixtures)("reports a truncated DWG with the engine flag class", async () => {
    const cut = fixture("host-native-fixture.dwg").slice(0, 4096);
    await expect(convertDwgBytes(cut, realEngine)).rejects.toBeInstanceOf(DwgFailure);
  }, 60_000);

  it("calls a text file renamed .dwg corrupt", async () => {
    const text = new TextEncoder().encode("hello world, not a drawing at all ".repeat(50));
    const failure = await convertDwgBytes(text, realEngine).catch((e) => e);
    expect(failure).toBeInstanceOf(DwgFailure);
    expect(failure.code).toBe("DWG_CORRUPT_OR_ENCRYPTED");
  }, 60_000);

  it.skipIf(!haveDwgFixtures)("maps a runtime that cannot start to DWG_RUNTIME_MISSING, or memory when it says so", async () => {
    await expect(convertDwgBytes(fixture("host-native-fixture.dwg"), async () => { throw new Error("404"); })).rejects.toMatchObject({ code: "DWG_RUNTIME_MISSING" });
    await expect(convertDwgBytes(fixture("host-native-fixture.dwg"), async () => { throw new Error("Cannot enlarge memory arrays"); })).rejects.toMatchObject({ code: "DWG_MEMORY_LIMIT" });
  });
});
