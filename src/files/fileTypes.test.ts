import { describe, expect, it } from "vitest";
import {
  FILE_ACCEPT, LARGE_DXF_BYTES, MAX_ARCHIVE_BYTES, MAX_DRAWING_BYTES, MAX_DXF_BYTES, assertFileSize, detectDrawingFormat, fileExtension,
  formatSizeLimit, isArchiveFormat, isCadFormat, prepareDrawingFile, replaceExtension, tooLargeLimit,
} from "./fileTypes";

const sized = (name: string, size: number) => {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "ok";
};

describe("format detection (T12 3.2)", () => {
  const table: [string, string | null][] = [
    ["floor-plan.DXF", "dxf"], ["model.DwG", "dwg"], ["document.PDF", "pdf"], ["package.ZIP", "zip"],
    ["package.RAR", "rar"], ["  drawing.DWG  ", "dwg"], ["building.v2.dwg", "dwg"], ["photo.jpeg", "jpeg"],
    ["photo.JPG", "jpg"], ["drawing", null], ["drawing.txt", null],
  ];
  it.each(table)("%s → %s", (name, format) => {
    expect(detectDrawingFormat(name)).toBe(format);
  });
  it("finds no extension when the dot is missing or last", () => {
    expect(fileExtension("drawing.")).toBe("");
    expect(fileExtension("drawing")).toBe("");
  });
  it("classifies formats and limits", () => {
    expect(isCadFormat("pdf")).toBe(false);
    expect(isCadFormat("dwg")).toBe(true);
    expect(isArchiveFormat("zip")).toBe(true);
    expect(isArchiveFormat("dwg")).toBe(false);
    expect(formatSizeLimit("rar")).toBe(MAX_ARCHIVE_BYTES);
    expect(formatSizeLimit("pdf")).toBe(MAX_DRAWING_BYTES);
    expect(MAX_DRAWING_BYTES).toBe(134_217_728);
    expect(MAX_ARCHIVE_BYTES).toBe(67_108_864);
  });

  it("DXF content may reach 160 MB, asked about above 128 MB (用戶 2026-10-27)", () => {
    expect(formatSizeLimit("dxf")).toBe(MAX_DXF_BYTES);
    expect(formatSizeLimit("dwg")).toBe(MAX_DRAWING_BYTES);
    expect(MAX_DXF_BYTES).toBe(167_772_160);
    expect(LARGE_DXF_BYTES).toBe(MAX_DRAWING_BYTES);
    expect(code(() => prepareDrawingFile(sized("big.dxf", 150 * 1048576)))).toBe("ok");
    expect(code(() => prepareDrawingFile(sized("big.dxf", MAX_DXF_BYTES + 1)))).toBe("FILE_TOO_LARGE");
    expect(code(() => prepareDrawingFile(sized("big.dwg", MAX_DRAWING_BYTES + 1)))).toBe("FILE_TOO_LARGE");
  });
});

describe("replaceExtension", () => {
  it("replaces only the last extension or appends one", () => {
    expect(replaceExtension("building.v2.dwg", "dxf")).toBe("building.v2.dxf");
    expect(replaceExtension("building.v2.dwg", ".dxf")).toBe("building.v2.dxf");
    expect(replaceExtension("plan", "dxf")).toBe("plan.dxf");
    expect(replaceExtension(".hidden", "dxf")).toBe(".hidden.dxf");
  });
});

describe("size and pre-open checks (T12 3.3)", () => {
  it("accepts exactly the limit and rejects one byte more", () => {
    expect(code(() => assertFileSize(MAX_DRAWING_BYTES))).toBe("ok");
    expect(code(() => assertFileSize(MAX_DRAWING_BYTES + 1))).toBe("FILE_TOO_LARGE");
    expect(code(() => assertFileSize(Number.NaN))).toBe("FILE_READ_FAILED");
    expect(code(() => assertFileSize(-1))).toBe("FILE_READ_FAILED");
    expect(code(() => assertFileSize(0))).toBe("EMPTY_FILE");
  });
  it("checks the format first, then the size for that format", () => {
    expect(code(() => prepareDrawingFile(sized("folder/drawing.dxf", 10)))).toBe("UNSUPPORTED_FORMAT");
    expect(code(() => prepareDrawingFile(sized("a\u0001.dxf", 10)))).toBe("UNSUPPORTED_FORMAT");
    expect(code(() => prepareDrawingFile(sized("drawing.txt", 0)))).toBe("UNSUPPORTED_FORMAT");
    expect(code(() => prepareDrawingFile(sized("empty.dxf", 0)))).toBe("EMPTY_FILE");
    expect(code(() => prepareDrawingFile(sized("big.dwg", MAX_DRAWING_BYTES)))).toBe("ok");
    expect(code(() => prepareDrawingFile(sized("big.zip", MAX_ARCHIVE_BYTES + 1)))).toBe("FILE_TOO_LARGE");
    const ok = prepareDrawingFile(sized("Plan.DXF", 5));
    expect(ok).toMatchObject({ name: "Plan.DXF", format: "dxf", size: 5 });
  });
  it("tells the archive limit apart from the drawing limit", () => {
    try {
      prepareDrawingFile(sized("big.zip", MAX_ARCHIVE_BYTES + 1));
    } catch (e) {
      expect(tooLargeLimit(e)).toBe(MAX_ARCHIVE_BYTES);
    }
  });
  it("picker accept list keeps the specified order", () => {
    const list = FILE_ACCEPT.split(",");
    expect(list[0]).toBe(".png");
    expect(list).toContain("application/octet-stream");
    expect(list).toHaveLength(21);
  });
});
