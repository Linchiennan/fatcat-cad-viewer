import { describe, expect, it } from "vitest";
import { buildArchiveList, normalizeArchivePath, selectedItems, type RawArchiveEntry } from "./archivePaths";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "ok";
};
const file = (path: string, size = 10): RawArchiveEntry => ({ path, size, directory: false, regular: true });

describe("archive paths (T12 3.4.2-3.4.3)", () => {
  it.each([["./Floor 1\\plan.dwg", "Floor 1/plan.dwg"], ["x\\.\\y.pdf", "x/y.pdf"]])("normalises %j", (raw, expected) => {
    expect(normalizeArchivePath(raw)).toBe(expected);
  });
  it("applies NFC, drops empty and dot segments and squeezes spaces", () => {
    expect(normalizeArchivePath("folder/Cafe\u0301.pdf")).toBe("folder/Café.pdf");
    expect(normalizeArchivePath("a//b/  two   spaces .dxf")).toBe("a/b/two spaces .dxf");
    expect(normalizeArchivePath("dir/")).toBe("dir");
  });
  it("rejects escaping, absolute, drive, network and control-character paths", () => {
    for (const bad of ["../plan.dwg", "floor/../plan.dwg", "/plan.dwg", "C:\\plan.dwg", "\\\\host\\plan.dwg", "floor/\u0000plan.dwg", "floor/ \n/plan.dwg", ""]) {
      expect(code(() => normalizeArchivePath(bad))).toBe("ARCHIVE_INVALID_PATH");
    }
    expect(code(() => normalizeArchivePath("  "))).toBe("ARCHIVE_INVALID_PATH");
    expect(code(() => normalizeArchivePath("a".repeat(221) + ".dwg"))).toBe("ARCHIVE_INVALID_PATH");
  });
  it("allows 16 levels and rejects 17", () => {
    expect(code(() => normalizeArchivePath("nested/".repeat(15) + "plan.dwg"))).toBe("ok");
    expect(code(() => normalizeArchivePath("nested/".repeat(16) + "plan.dwg"))).toBe("ARCHIVE_INVALID_PATH");
  });
  it("treats case-only duplicates as invalid", () => {
    expect(code(() => buildArchiveList([file("Floor/plan.pdf"), file("FLOOR/PLAN.PDF")]))).toBe("ARCHIVE_INVALID_PATH");
  });
});

describe("archive limits and listing (T12 3.4.1, 3.4.4)", () => {
  it("limits entry count, entry size and total size", () => {
    expect(code(() => buildArchiveList(Array.from({ length: 1000 }, (_, i) => file(`f${i}.txt`, 1))))).toBe("ok");
    expect(code(() => buildArchiveList(Array.from({ length: 1001 }, (_, i) => file(`f${i}.txt`, 1))))).toBe("ARCHIVE_LIMIT");
    expect(code(() => buildArchiveList([file("big.dwg", 134_217_729)]))).toBe("ARCHIVE_LIMIT");
    expect(code(() => buildArchiveList([file("a.dwg", 100_000_000), file("b.dwg", 40_000_000)]))).toBe("ARCHIVE_LIMIT");
  });
  it("marks only regular non-empty DXF/DWG/PDF files as supported", () => {
    const items = buildArchiveList([
      file("Floor 1/plan.dwg"), file("Floor 1/notes.pdf"), file("Floor 2/plan.dxf"), file("nested.zip"),
      file("readme.txt"), file("empty.pdf", 0), file("photo.png"),
      { path: "link.dwg", size: 5, directory: false, regular: false },
      { path: "Floor 1/", size: 0, directory: true, regular: true },
    ]);
    expect(items.filter((i) => i.supported).map((i) => i.path)).toEqual(["Floor 1/plan.dwg", "Floor 1/notes.pdf", "Floor 2/plan.dxf"]);
    expect(items.find((i) => i.directory)).toMatchObject({ path: "Floor 1", format: null, supported: false });
    expect(items.find((i) => i.path === "link.dwg")?.format).toBeNull();
    expect(items.map((i) => i.path).slice(0, 3)).toEqual(["Floor 1/plan.dwg", "Floor 1/notes.pdf", "Floor 2/plan.dxf"]);
  });
  it("only lets listed, supported paths be extracted", () => {
    const items = buildArchiveList([file("a.dwg"), file("b.txt")]);
    expect(selectedItems(items, ["a.dwg"])).toHaveLength(1);
    expect(code(() => selectedItems(items, []))).toBe("ARCHIVE_UNREADABLE");
    expect(code(() => selectedItems(items, ["b.txt"]))).toBe("ARCHIVE_UNREADABLE");
    expect(code(() => selectedItems(items, ["missing.dwg"]))).toBe("ARCHIVE_UNREADABLE");
  });
});
