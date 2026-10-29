import { describe, expect, it } from "vitest";
import { pickLibraryEntry, xrefFileNames } from "./xrefAutoFind";
import { endsWithXrefName, matchXref } from "./xrefs";

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

  // 用戶 2026-10-29「加」：B3F 消防圖的外參「B3F 建築圖.dwg」在資料夾裡叫「03--消防施工圖__1081030-B3F施工圖__B3F 建築圖.dwg」。
  it("takes the only drawing whose name ends with the reference name after a separator", () => {
    const main = entry("m", "03--消防施工圖__1081030-B3F施工圖__TO(林主任)B3F 施工圖.dwg", "f");
    const copy = entry("x", "03--消防施工圖__1081030-B3F施工圖__B3F 建築圖.dwg", "f");
    expect(pickLibraryEntry("..\\建築\\B3F 建築圖.dwg", [main, copy], main)).toEqual(copy);
    expect(pickLibraryEntry("B3F 建築圖.dwg", [main, copy, entry("e", "B3F 建築圖.dwg", "g")], main)).toMatchObject({ id: "e" }); // same name wins
    expect(pickLibraryEntry("B3F 建築圖.dwg", [main, copy, entry("y", "舊版__B3F 建築圖.dwg", "f")], main)).toBe("ambiguous");
    expect(pickLibraryEntry("a.dwg", [main, entry("d", "data.dwg", "f"), entry("k", "一樓建築圖.dwg", "f")], main)).toBeNull();
    expect(pickLibraryEntry("建築圖.dwg", [main, entry("k", "一樓建築圖.dwg", "f")], main)).toBeNull(); // no separator before it
  });

  it("matches a prefixed copy among picked files too, only when it is the only one", () => {
    const f = (n: string) => new File(["x"], n);
    const copy = f("03--消防施工圖__B3F 建築圖.dwg");
    expect(matchXref("D:\\建築\\B3F 建築圖.dwg", "主圖.dwg", [f("主圖.dwg"), copy], {})).toBe(copy);
    expect(matchXref("B3F 建築圖.dwg", "主圖.dwg", [copy, f("舊__B3F 建築圖.dwg")], {})).toBeNull();
    expect(endsWithXrefName("B3F 建築圖.dwg", "b3f 建築圖.dwg")).toBe(false);
  });
});
