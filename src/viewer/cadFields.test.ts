import { describe, expect, it } from "vitest";
import { preserveCadMetadata, selectCadSpace } from "./cadDocument";
import { blockUsage, matchXref } from "./xrefs";

// Same chain as the 惠宇圖框 title block: MTEXT → ACAD_FIELD → TEXT → "_text" FIELD → "\AcVar ctab".
const dxf = (childCode = "\\AcVar ctab") => [
  "0", "SECTION", "2", "ENTITIES",
  "0", "MTEXT", "5", "45AE", "360", "4D3E", "8", "圖框", "10", "0", "20", "0", "30", "0", "40", "10", "1", "{\\T0.8;Model}",
  "0", "ENDSEC", "0", "SECTION", "2", "OBJECTS",
  "0", "DICTIONARY", "5", "4D3E", "330", "45AE", "3", "ACAD_FIELD", "360", "4D3F",
  "0", "DICTIONARY", "5", "4D3F", "330", "4D3E", "3", "TEXT", "360", "4D40",
  "0", "FIELD", "5", "4D40", "1", "_text", "2", "{\\T0.8;%<\\_FldIdx 0>%}", "90", "1", "360", "4D41",
  "0", "FIELD", "5", "4D41", "1", "AcVar", "2", childCode, "90", "0", "301", "Model",
  "0", "ENDSEC", "0", "EOF",
].join("\n");
const parsed = (text: string) => preserveCadMetadata({ entities: [{ type: "MTEXT", handle: "45AE", text: "{\\T0.8;Model}", layer: "圖框" }], blocks: {} }, text);

describe("layout-name fields", () => {
  it("recomputes \\AcVar ctab for the layout being shown", () => {
    const doc = parsed(dxf());
    expect(doc.entities[0].cadFieldTemplate).toBeTruthy();
    expect(selectCadSpace(doc, "Model").entities[0].text).toBe("{\\T0.8;Model}");
    doc.entities[0].cadSpace = "制水閥箱箱體圖";
    expect(selectCadSpace(doc, "制水閥箱箱體圖").entities[0].text).toBe("{\\T0.8;制水閥箱箱體圖}");
  });

  it("fills fields inside blocks, such as an attached title-block xref", () => {
    const doc = parsed(dxf());
    doc.blocks = { 惠宇圖框: { name: "惠宇圖框", entities: [{ ...doc.entities[0], handle: "惠宇圖框|45AE" }] } };
    const sheet = selectCadSpace(doc, "配置1");
    expect(sheet.blocks["惠宇圖框"].entities[0].text).toBe("{\\T0.8;配置1}");
  });

  it("leaves other fields at the value the file stored", () => {
    expect(parsed(dxf("\\AcVar filename")).entities[0].cadFieldTemplate).toBeUndefined();
  });
});

describe("xref matching and usage", () => {
  const file = (name: string) => new File(["x"], name);
  it("matches a reference saved without an extension to the .dwg of the same name", () => {
    const files = [file("惠宇圖框.dwg"), file("1英吋不鏽鋼閘閥.dwg")];
    expect(matchXref("1英吋不鏽鋼閘閥", "A03.dwg", files, {})?.name).toBe("1英吋不鏽鋼閘閥.dwg");
    expect(matchXref(".\\惠宇圖框.dwg", "A03.dwg", files, {})?.name).toBe("惠宇圖框.dwg");
    expect(matchXref("不存在", "A03.dwg", files, {})).toBeNull();
  });

  it("finds the spaces where a block appears, through nested blocks", () => {
    const doc = {
      entities: [{ type: "INSERT", name: "外框", cadSpace: "制水閥箱箱體圖" }, { type: "INSERT", name: "A$C7", cadSpace: "Model" }],
      blocks: { "A$C7": { entities: [{ type: "INSERT", name: "1英吋不鏽鋼閘閥" }] }, 外框: { entities: [] }, 孤兒: { entities: [] } },
    };
    expect([...blockUsage(doc, "外框")]).toEqual(["制水閥箱箱體圖"]);
    expect([...blockUsage(doc, "1英吋不鏽鋼閘閥")]).toEqual(["Model"]);
    expect(blockUsage(doc, "孤兒").size).toBe(0);
  });
});
