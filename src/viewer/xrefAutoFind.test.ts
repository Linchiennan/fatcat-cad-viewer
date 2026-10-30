import { describe, expect, it } from "vitest";
import { pickLibraryEntry, projectOf, xrefFileNames } from "./xrefAutoFind";

// 用戶 2026-10-30「跨專案的外參比對沒有分隔，不同案子同檔名的外參可能套錯」：只在主圖所在的案子（圖面庫最上層資料夾）裡找。
describe("references stay inside the main drawing's project", () => {
  // root ─ 14H ─ 建築 (主圖) / 圖框 (惠宇圖框)；root ─ 15C ─ 圖框 (惠宇圖框)
  const parents = new Map([["p14h", "root"], ["p14h-arch", "p14h"], ["p14h-frame", "p14h"], ["p15c", "root"], ["p15c-frame", "p15c"]]);
  const main = { id: "m", name: "1F 平面.dwg", parentId: "p14h-arch" };
  it("finds the project top folder of any folder", () => {
    expect(projectOf("p14h-frame", parents)).toBe("p14h");
    expect(projectOf("p15c", parents)).toBe("p15c");
    expect(projectOf("root", parents)).toBe("root");
  });
  it("takes the frame from another folder of the same job, never from another job", () => {
    const own = { id: "f14", name: "惠宇圖框.dwg", parentId: "p14h-frame" }, other = { id: "f15", name: "惠宇圖框.dwg", parentId: "p15c-frame" };
    expect(pickLibraryEntry("惠宇圖框.dwg", [main, own, other], main, parents)).toEqual(own);
    expect(pickLibraryEntry("惠宇圖框.dwg", [main, other], main, parents)).toBeNull();
    expect(pickLibraryEntry("..\\B3F 建築圖.dwg", [main, { id: "c", name: "15C__B3F 建築圖.dwg", parentId: "p15c" }], main, parents)).toBeNull();
  });
});
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
    expect(pickLibraryEntry("惠宇圖框.dwg", [main, entry("x1", "惠宇圖框.dwg", "a"), entry("x3", "惠宇圖框.dwg", "a")], main)).toBe("ambiguous");
    expect(pickLibraryEntry("主圖.dwg", [main], main)).toBeNull();
    expect(pickLibraryEntry("沒有.dwg", [main], main)).toBeNull();
  });

  // 用戶 2026-10-29「加」：B3F 消防圖的外參「B3F 建築圖.dwg」在資料夾裡叫「03--消防施工圖__1081030-B3F施工圖__B3F 建築圖.dwg」。
  it("takes the only drawing whose name ends with the reference name after a separator", () => {
    const main = entry("m", "03--消防施工圖__1081030-B3F施工圖__TO(林主任)B3F 施工圖.dwg", "f");
    const copy = entry("x", "03--消防施工圖__1081030-B3F施工圖__B3F 建築圖.dwg", "f");
    expect(pickLibraryEntry("..\\建築\\B3F 建築圖.dwg", [main, copy], main)).toEqual(copy);
    expect(pickLibraryEntry("B3F 建築圖.dwg", [main, copy, entry("e", "B3F 建築圖.dwg", "f")], main)).toMatchObject({ id: "e" }); // same name wins
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

// 用戶 2026-10-30「照路徑改」：13F-施工圖0620 的 01-13F-牆板放樣.dwg 存了 6 個相對路徑的外參，
// 7F～14F 每一層都有自己的 外部參考／001-建築平面圖、002-結構平面圖，檔名相同。照存的路徑在圖面庫的資料夾裡走。
describe("references found by their saved path (13F 牆板放樣)", () => {
  const FRAME = String.raw`..\外部參考\泓毅圖框-57間堂.dwg`, ARCH = String.raw`..\外部參考\001-建築平面圖\13F-建築底圖.dwg`;
  const STRUCT = String.raw`..\外部參考\002-結構平面圖\13F-結構.dwg`, POWER = String.raw`.\03-13F-動力插座.dwg`;
  type F = [id: string, name: string, parent: string];
  const lib = (folders: F[]) => ({ parents: new Map(folders.map(([id, , p]) => [id, p])), names: new Map(folders.map(([id, n]) => [id, n])) });
  const floor = (p: string, top: string): F[] => [[p + "S", "13F-施工圖", top], [p + "X", "外部參考", top], [p + "XA", "001-建築平面圖", p + "X"], [p + "XS", "002-結構平面圖", p + "X"]];
  const files = (p: string) => [
    entry(p + "m", "01-13F-牆板放樣.dwg", p + "S"), entry(p + "pw", "03-13F-動力插座.dwg", p + "S"), entry(p + "fr", "泓毅圖框-57間堂.dwg", p + "X"),
    entry(p + "ar", "13F-建築底圖.dwg", p + "XA"), entry(p + "st", "13F-結構.dwg", p + "XS"), entry(p + "st14", "14F-結構.dwg", p + "XS"),
  ];

  it("walks the path when the whole floor folder was imported", () => {
    const { parents, names } = lib([["P", "13F-施工圖0620", "root"], ...floor("a", "P")]);
    const all = files("a"), main = all[0];
    expect([FRAME, ARCH, STRUCT, POWER].map((p) => (pickLibraryEntry(p, all, main, parents, names) as { id: string }).id)).toEqual(["afr", "aar", "ast", "apw"]);
  });

  it("takes this floor's copy when 7F～14F were imported together", () => {
    const { parents, names } = lib([["J", "009-7F到14F水電施工圖", "root"], ["P13", "13F-施工圖0620", "J"], ...floor("a", "P13"), ["P12", "12F-施工圖0620", "J"], ...floor("b", "P12")]);
    const all = [...files("a"), ...files("b")], main = all[0];
    expect((pickLibraryEntry(STRUCT, all, main, parents, names) as { id: string }).id).toBe("ast");
    expect((pickLibraryEntry(FRAME, all, main, parents, names) as { id: string }).id).toBe("afr");
  });

  it("finds 外部參考 imported on its own, beside the drawings or somewhere else", () => {
    const beside = lib([["aS", "13F-施工圖", "root"], ["aX", "外部參考", "root"], ["aXA", "001-建築平面圖", "aX"], ["aXS", "002-結構平面圖", "aX"]]);
    const all = files("a"), main = all[0];
    expect((pickLibraryEntry(STRUCT, all, main, beside.parents, beside.names) as { id: string }).id).toBe("ast");
    const elsewhere = lib([["aS", "13F-施工圖", "root"], ["Z", "雜項", "root"], ["aX", "外部參考", "Z"], ["aXA", "001-建築平面圖", "aX"], ["aXS", "002-結構平面圖", "aX"]]);
    expect((pickLibraryEntry(STRUCT, all, main, elsewhere.parents, elsewhere.names) as { id: string }).id).toBe("ast");
  });

  it("does not take another job's file that only shares a common folder name", () => {
    // 13F has no 外部參考 in the library; job K has「外部參考／002-結構平面圖」too but no「13F-結構」, and「其他／外部參考」has a 13F-結構
    const { parents, names } = lib([["aS", "13F-施工圖", "P"], ["P", "13F", "root"], ["K", "別案", "root"], ["Kx", "其他", "K"], ["KX", "外部參考", "Kx"]]);
    const main = entry("am", "01-13F-牆板放樣.dwg", "aS"), other = entry("k", "13F-結構.dwg", "KX");
    expect(pickLibraryEntry(STRUCT, [main, other], main, parents, names)).toBeNull();
  });
});
