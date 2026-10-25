import { describe, expect, it } from "vitest";
import { classifyEngineError, dwgDiagnostics, dwgVersionLabel, engineCodeName, looksLikeMemory } from "./dwgDiagnostics";

const head = (s: string) => new TextEncoder().encode(s);

describe("DWG diagnostics (T13 3.3, 3.4, 5.2)", () => {
  it("labels known header versions", () => {
    expect(dwgVersionLabel(head("AC1018xx"))).toBe("AC1018 (AutoCAD 2004)");
    expect(dwgVersionLabel(head("AC1032"))).toBe("AC1032 (AutoCAD 2018 format)");
    expect(dwgVersionLabel(head("AC1009"))).toBe("AC1009 (AutoCAD R11/R12)");
  });

  it("shows other printable headers as they are, else UNKNOWN", () => {
    expect(dwgVersionLabel(head("hello world"))).toBe("hello ");
    expect(dwgVersionLabel(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe("UNKNOWN");
    expect(dwgVersionLabel(head("AC1"))).toBe("UNKNOWN");
  });

  it("names engine flags", () => {
    expect(engineCodeName(0)).toBe("OK");
    expect(engineCodeName(256)).toBe("SECTIONNOTFOUND");
    expect(engineCodeName(2048 | 1)).toBe("WRONGCRC|INVALIDDWG");
    expect(engineCodeName(1 << 20)).toBe("LIBREDWG_ERROR_1048576");
  });

  it("classifies engine errors", () => {
    expect(classifyEngineError(8192 | 2048)).toBe("DWG_MEMORY_LIMIT");
    // 惠宇 E03（222 KB）：小檔回報記憶體不足其實是讀不了的資料，另存後可開
    expect(classifyEngineError(8192, 222024)).toBe("DWG_PARSE_FAILED");
    expect(classifyEngineError(8192, 64 * 1024 * 1024)).toBe("DWG_MEMORY_LIMIT");
    for (const bit of [1, 8, 16, 32, 64, 2048]) expect(classifyEngineError(bit)).toBe("DWG_CORRUPT_OR_ENCRYPTED");
    for (const bit of [2, 4, 128, 256, 512, 1024, 4096]) expect(classifyEngineError(bit)).toBe("DWG_PARSE_FAILED");
  });

  it("treats a wasm out-of-bounds access as bad data, not memory", () => {
    expect(looksLikeMemory("RuntimeError: memory access out of bounds")).toBe(false);
    expect(looksLikeMemory("Cannot enlarge memory arrays")).toBe(true);
    expect(looksLikeMemory(null, "Aborted(OOM)")).toBe(true);
    expect(looksLikeMemory("Allocation failed")).toBe(true);
    expect(looksLikeMemory("Out of memory")).toBe(true);
    expect(looksLikeMemory("bad section")).toBe(false);
  });

  it("builds the error screen table", () => {
    expect(dwgDiagnostics(head("AC1018"), 4096, 256)).toEqual({ engine: "libredwg", version: "AC1018 (AutoCAD 2004)", bytes: 4096, engineCode: "SECTIONNOTFOUND" });
    expect(dwgDiagnostics(head("hello "), 10)).toEqual({ engine: "libredwg", version: "hello ", bytes: 10 });
  });
});
