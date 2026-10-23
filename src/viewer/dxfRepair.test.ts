import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { repairDxfText } from "./dxfRepair";

const dxf = (body: string) => `  0\nSECTION\n  2\nENTITIES\n${body}  0\nENDSEC\n  0\nEOF\n`;
const LINE = "  0\nLINE\n  8\n0\n 10\n0\n 20\n0\n 11\n5\n 21\n5\n";

describe("repairing DXF lines LibreDWG broke", () => {
  it("drops ACIS lines leaked into a long MTEXT so the drawing still opens (PARK.dwg)", () => {
    const broken = dxf(`  0\nMTEXT\n  8\n0\n 10\n0\n 20\n0\n 40\n2.5\n  3\n前段文字\nellipse-curve $-1 $-1 269.332 -124.4 #\npoint $-1 269.\n  1\n後段\n${LINE}`);
    expect(() => new DxfParser().parseSync(broken)).toThrow(/Cannot parse group code/);
    const { text, dropped } = repairDxfText(broken);
    expect(dropped).toBe(2);
    const parsed: any = new DxfParser().parseSync(text);
    expect(parsed.entities.map((e: any) => e.type)).toEqual(["MTEXT", "LINE"]);
  });

  it("drops material XML lines with line breaks (三菱 LGH-25RVX3-E)", () => {
    const broken = dxf(`  0\nLINE\n  8\nA\n  1\n<Material>\n</ArchDiffuseColor>\n</Material>\n 10\n1\n 20\n2\n 11\n3\n 21\n4\n`);
    const { text, dropped } = repairDxfText(broken);
    expect(dropped).toBe(2);
    expect((new DxfParser().parseSync(text) as any).entities[0].vertices[1]).toMatchObject({ x: 3, y: 4 });
  });

  it("leaves a sound file unchanged", () => {
    const sound = dxf(LINE);
    expect(repairDxfText(sound)).toEqual({ text: sound.replace(/\n$/, "\n"), dropped: 0 });
  });
});
