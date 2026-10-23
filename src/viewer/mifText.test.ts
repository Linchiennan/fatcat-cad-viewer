import { describe, expect, it } from "vitest";
import { decodeMifEntities, decodeMifText } from "./mifText";

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
