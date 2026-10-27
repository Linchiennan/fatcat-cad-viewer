import { describe, expect, it } from "vitest";
import { assembleXrefs, markUnloadedXrefs } from "./xrefs";
import { conversionUnloadedXrefs } from "../dwg/convertDwg";

// A drawing whose two references each hold two references to the next level: six files, 2+4+…+64 = 126 references.
const level = (i: number, last: number) => {
  if (i === last) return ["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "10", "21", "0", "0", "ENDSEC", "0", "EOF"].join("\n");
  const next = `L${i + 1}.dxf`;
  const block = (n: string) => ["0", "BLOCK", "2", n, "70", "4", "10", "0", "20", "0", "1", next, "0", "ENDBLK"];
  return ["0", "SECTION", "2", "BLOCKS", ...block("A"), ...block("B"), "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES", "0", "INSERT", "8", "0", "2", "A", "10", "0", "20", "0", "0", "INSERT", "8", "0", "2", "B", "10", "0", "20", "0", "0", "ENDSEC", "0", "EOF"].join("\n");
};

describe("references inside references (昭盛 給水-7F: 33 files referenced 413 times)", () => {
  it("assembles each file once and caps different files, not references", async () => {
    const last = 6;
    const files = Array.from({ length: last + 1 }, (_, i) => new File([level(i, last)], `L${i}.dxf`));
    const { file, statuses } = await assembleXrefs(files[0], files.slice(1));
    expect(statuses.filter((s) => !s.status.startsWith("已載入"))).toEqual([]);
    const text = await file.text();
    const doc = JSON.parse(text.slice(text.indexOf("\n") + 1));
    // the innermost line reaches the main drawing through every level
    const deepest = Object.entries(doc.blocks).filter(([n]) => n.split("|").length === last);
    expect(deepest.length).toBeGreaterThan(0);
    expect(deepest.every(([, b]: [string, any]) => b.entities.some((e: any) => e.type === "LINE"))).toBe(true);
  });
});

describe("references saved unloaded (世舜 A1至A18施工平面圖: ZWCAD leaves them unloaded)", () => {
  it("marks only xref blocks, matching names with \\U+ codes decoded", () => {
    const doc: any = { blocks: { "参層": { type: 12 }, "壹層": { type: 12 }, "門": { type: 0 } } };
    markUnloadedXrefs(doc, ["\\U+53C2層", "門"]);
    expect(doc.blocks["参層"].cadXrefUnloaded).toBe(true);
    expect(doc.blocks["壹層"].cadXrefUnloaded).toBeUndefined();
    expect(doc.blocks["門"].cadXrefUnloaded).toBeUndefined();
  });
  it("does not load them even when the file is there, and says why", async () => {
    const root = new File([level(0, 1)], "L0.dxf"), child = new File([level(1, 1)], "L1.dxf");
    conversionUnloadedXrefs.set(root, ["A"]);
    const { file, statuses } = await assembleXrefs(root, [child]);
    expect(statuses.find((s) => s.name === "A")!.status).toMatch(/^存檔時已卸載/);
    expect(statuses.find((s) => s.name === "B")!.status).toMatch(/^已載入/);
    const text = await file.text();
    const doc = JSON.parse(text.slice(text.indexOf("\n") + 1));
    expect(doc.blocks["A"].entities).toEqual([]);
    expect(doc.blocks["B"].entities.length).toBeGreaterThan(0);
  });
});
