import { describe, expect, it } from "vitest";
import { pickLibraryEntry, xrefFileNames } from "./xrefAutoFind";

const entry = (id: string, name: string, parentId = "root") => ({ id, name, parentId });

describe("finding external references by themselves", () => {
  it("looks for the file name of the saved path, adding .dwg/.dxf when it has no extension", () => {
    expect(xrefFileNames("..\\..\\圖框\\惠宇圖框.dwg")).toEqual(["惠宇圖框.dwg"]);
    expect(xrefFileNames("C:/x/1英吋不鏽鋼閘閥")).toEqual(["1英吋不鏽鋼閘閥", "1英吋不鏽鋼閘閥.dwg", "1英吋不鏽鋼閘閥.dxf"]);
    expect(xrefFileNames("")).toEqual([]);
  });

  it("uses the only same-name drawing in the library, ignoring case (A03 + 惠宇圖框)", () => {
    const main = entry("a03", "A03--制水閥箱箱體圖.dwg", "f1");
    const lib = [main, entry("frame", "惠宇圖框.DWG", "f1"), entry("other", "別的圖.dwg", "f1")];
    expect(pickLibraryEntry("D:\\專案\\惠宇圖框.dwg", lib, main)).toEqual(lib[1]);
  });

  it("prefers the main drawing's folder when the same name exists in several folders", () => {
    const main = entry("m", "主圖.dwg", "p14h");
    const lib = [main, entry("x1", "惠宇圖框.dwg", "p15c"), entry("x2", "惠宇圖框.dwg", "p14h")];
    expect(pickLibraryEntry("惠宇圖框.dwg", lib, main)).toEqual(lib[2]);
  });

  it("never guesses between several candidates and never uses the drawing itself", () => {
    const main = entry("m", "主圖.dwg", "a");
    expect(pickLibraryEntry("惠宇圖框.dwg", [main, entry("x1", "惠宇圖框.dwg", "b"), entry("x2", "惠宇圖框.dwg", "c")], main)).toBe("ambiguous");
    expect(pickLibraryEntry("主圖.dwg", [main], main)).toBeNull();
    expect(pickLibraryEntry("沒有.dwg", [main], main)).toBeNull();
  });
});
