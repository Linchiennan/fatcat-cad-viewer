import { describe, expect, it } from "vitest";
import { mergeXrefFiles, removeXrefFile } from "./xrefPicks";

const file = (name: string, size = 1, rel = "") => { const f = new File(["x".repeat(size)], name); if (rel) Object.defineProperty(f, "webkitRelativePath", { value: rel }); return f; };

// 11F 給水: 圖框, 建築底圖 and 結構 each in its own folder, picked one at a time (用戶 2026-10-27).
describe("xref picks add up", () => {
  it("each pick is appended; the same file picked again is not added twice; earlier indices stay", () => {
    const frame = file("泓毅圖框-57間堂.dwg"), arch = file("11F-建築底圖.dwg", 2), struct = file("4F-結構4F-12F15F.dwg", 3);
    let files = mergeXrefFiles([], [frame]);
    files = mergeXrefFiles(files, [arch]);
    files = mergeXrefFiles(files, [struct, file("泓毅圖框-57間堂.dwg")]);
    expect(files.map((f) => f.name)).toEqual(["泓毅圖框-57間堂.dwg", "11F-建築底圖.dwg", "4F-結構4F-12F15F.dwg"]);
    // same name, other size or other folder: a different file
    expect(mergeXrefFiles(files, [file("11F-建築底圖.dwg", 9)])).toHaveLength(4);
    expect(mergeXrefFiles([file("a.dwg", 1, "x/a.dwg")], [file("a.dwg", 1, "y/a.dwg")])).toHaveLength(2);
  });

  it("removing one file clears mappings to it and shifts the later ones", () => {
    const files = [file("a.dwg"), file("b.dwg"), file("c.dwg")];
    const out = removeXrefFile(files, { A: "@0", B: "@1", C: "@2", D: "x/c.dwg" }, 1);
    expect(out.files.map((f) => f.name)).toEqual(["a.dwg", "c.dwg"]);
    expect(out.mapping).toEqual({ A: "@0", C: "@1", D: "x/c.dwg" });
  });
});
