import { describe, expect, it } from "vitest";
import { decodeMifEntities, decodeMifNames, decodeMifText, dropReadPastTail, mifEncodingOf } from "./mifText";

describe("legacy \\M+ multibyte text", () => {
  it("decodes Japanese Shift-JIS codes from a TOTO sheet", () => {
    expect(decodeMifText("\\M+18379\\M+1815B\\M+18357No")).toBe("ページNo");
    expect(decodeMifText("(\\M+189FC)")).toBe("(改)");
    expect(decodeMifText("\\W0.9214;\\M+18345\\M+18348\\M+18356\\M+18385\\M+1838C\\M+18362\\M+18367")).toBe("\\W0.9214;ウォシュレット");
  });

  it("decodes Traditional Chinese Big5 and leaves escaped or unknown codes untouched", () => {
    expect(decodeMifText("\\M+2A4A4")).toBe("中");
    expect(decodeMifText("\\\\M+18379")).toBe("\\\\M+18379");
    expect(decodeMifText("\\M+48379")).toBe("\\M+48379");
    expect(decodeMifText("plain")).toBe("plain");
  });

  it("rewrites text in entities and block entities", () => {
    const doc = { entities: [{ type: "TEXT", text: "(\\M+189FC)" }], blocks: { B: { entities: [{ type: "ATTRIB", text: "\\M+18379" }] } } };
    expect(decodeMifEntities(doc)).toBe(2);
    expect(doc.entities[0].text).toBe("(改)");
    expect(doc.blocks.B.entities[0].text).toBe("ペ");
  });
});

describe("codes in names (上晴, a Big5 drawing LibreDWG wrote with \\M+5)", () => {
  const big5 = "ANSI_950";
  const layer = "09-\\M+5ACA1\\M+5B0CA\\M+5B3C3\\M+5ADD1"; // 09-活動傢俱 in Big5, garbage as GB
  const arrow = "\\M+5A7F7\\M+5AEC6\\M+5A4DE\\M+5BD75"; // 材料引線
  const xref = "\\M+5CDE2\\M+5B2BF\\M+585A2\\M+5BFBC20150601$0$1F"; // 外部參考…: 85A2 is no Big5 character, so GB as written

  it("decodes with the drawing's code page first, and as written when that fails part-way", () => {
    expect(decodeMifText(layer, "big5")).toBe("09-活動傢俱");
    expect(decodeMifText(xref, "big5")).toBe("外部參考20150601$0$1F");
    expect(mifEncodingOf({ header: { $DWGCODEPAGE: big5 } })).toBe("big5");
    expect(mifEncodingOf({ header: { $DWGCODEPAGE: "ANSI_1252" } })).toBeUndefined();
  });

  it("leaves a name in codes when it would take the place of one the table already has (上晴 B區 0818)", () => {
    const doc: any = { header: { $DWGCODEPAGE: big5 }, blocks: { [arrow]: { name: arrow, entities: [{ type: "TEXT", text: "DXF" }] }, "材料引線": { name: "材料引線", entities: [{ type: "TEXT", text: "補回" }] } },
      entities: [{ type: "INSERT", name: arrow }, { type: "INSERT", name: "材料引線" }] };
    decodeMifNames(doc);
    expect(Object.keys(doc.blocks).sort()).toEqual([arrow, "材料引線"].sort());
    expect(doc.blocks[arrow].entities[0].text).toBe("DXF");
    expect(doc.entities.map((e: any) => e.name)).toEqual([arrow, "材料引線"]);
  });

  it("decodes text content as written even in a Big5 drawing (上晴 C區: 小盒子修改 is held in GB codes)", () => {
    const doc: any = { header: { $DWGCODEPAGE: big5 }, entities: [{ type: "TEXT", text: "20160810\\M+5D0A1\\M+5BAD0\\M+5D7D3\\M+5D0DE\\M+5B8C4" }], blocks: {} };
    decodeMifEntities(doc);
    expect(doc.entities[0].text).toBe("20160810小盒子修改");
    expect(decodeMifNames(doc)).toBe(0); // nothing left for the name pass to re-read
  });

  it("decodes \\U+ codes in names and xref paths (世舜 太原段: 参 is no Big5 character)", () => {
    const name = "\\U+53C2層平面圖";
    const doc: any = { header: { $DWGCODEPAGE: big5 }, blocks: { [name]: { name, type: 4, xrefPath: "..\\001-XS-建築\\\\U+53C2層平面圖.dwg", entities: [] } },
      entities: [{ type: "INSERT", name }] };
    decodeMifNames(doc);
    expect(Object.keys(doc.blocks)).toEqual(["参層平面圖"]);
    expect(doc.blocks["参層平面圖"].xrefPath).toBe("..\\001-XS-建築\\参層平面圖.dwg");
    expect(doc.entities[0].name).toBe("参層平面圖");
  });

  it("cuts bytes read past the end after the last code, only when they hold a control character", () => {
    expect(dropReadPastTail(arrow + "<\u0001")).toBe(arrow);
    expect(dropReadPastTail(arrow + "-AR111")).toBe(arrow + "-AR111");
    expect(dropReadPastTail("樣式 " + arrow + "<\u0001 以實心箭頭近似")).toBe("樣式 " + arrow + " 以實心箭頭近似");
  });

  it("renames table keys and every reference the same way", () => {
    const doc: any = {
      header: { $DWGCODEPAGE: big5 },
      tables: { layer: { layers: { [layer]: { name: layer } } } },
      blocks: { [arrow]: { name: arrow, entities: [{ type: "LINE", layer }] } },
      entities: [{ type: "INSERT", name: arrow, layer }],
      cadDiagnostics: [`舊式引線 D21CB 箭頭樣式 ${arrow}<\u0001 以實心箭頭近似`],
    };
    expect(decodeMifNames(doc)).toBeGreaterThan(0);
    expect(Object.keys(doc.tables.layer.layers)).toEqual(["09-活動傢俱"]);
    expect(doc.tables.layer.layers["09-活動傢俱"].name).toBe("09-活動傢俱");
    expect(Object.keys(doc.blocks)).toEqual(["材料引線"]);
    expect(doc.blocks["材料引線"].entities[0].layer).toBe("09-活動傢俱");
    expect(doc.entities[0]).toMatchObject({ name: "材料引線", layer: "09-活動傢俱" });
    expect(doc.cadDiagnostics[0]).toBe("舊式引線 D21CB 箭頭樣式 材料引線 以實心箭頭近似");
  });
});
