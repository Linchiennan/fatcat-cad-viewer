import { describe, expect, it } from "vitest";
import { detectDxfEncoding } from "./dxfEncoding";

const ascii = (s: string) => new TextEncoder().encode(s);
const header = (vars: [string, string, string][], eol = "\n") =>
  ascii(["0", "SECTION", "2", "HEADER", ...vars.flatMap(([name, code, value]) => ["9", name, code, value]), "0", "ENDSEC"].join(eol) + eol);

describe("DXF text encoding (T13 3.5)", () => {
  it("reads an old Turkish code page", () => {
    expect(detectDxfEncoding(header([["$ACADVER", "1", "AC1015"], ["$DWGCODEPAGE", "3", "ANSI_1254"]]))).toBe("windows-1254");
  });

  it("uses UTF-8 from AutoCAD 2007 on even when the code page says otherwise", () => {
    expect(detectDxfEncoding(header([["$ACADVER", "1", "AC1021"], ["$DWGCODEPAGE", "3", "ANSI_950"]]))).toBe("utf-8");
    expect(detectDxfEncoding(header([["$ACADVER", "1", "AC1032"], ["$DWGCODEPAGE", "3", "ANSI_1252"]]))).toBe("utf-8");
  });

  it("reads Big5 for older drawings, with LF, CR or CRLF line ends and padded codes", () => {
    for (const eol of ["\n", "\r", "\r\n"]) {
      expect(detectDxfEncoding(header([["$ACADVER", "  1", "AC1018"], ["$DWGCODEPAGE", "  3", "ansi_950"]], eol))).toBe("big5");
    }
  });

  it("honours byte order marks", () => {
    expect(detectDxfEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x30]))).toBe("utf-8");
    expect(detectDxfEncoding(new Uint8Array([0xff, 0xfe, 0x30, 0]))).toBe("utf-16le");
    expect(detectDxfEncoding(new Uint8Array([0xfe, 0xff, 0, 0x30]))).toBe("utf-16be");
  });

  it("falls back to UTF-8 for unknown or undecodable code pages and plain text", () => {
    expect(detectDxfEncoding(header([["$ACADVER", "1", "AC1015"], ["$DWGCODEPAGE", "3", "ANSI_9999"]]))).toBe("utf-8");
    // DOS437 has no decoder on most devices: never fail, use UTF-8.
    const dos = detectDxfEncoding(header([["$ACADVER", "1", "AC1015"], ["$DWGCODEPAGE", "3", "DOS437"]]));
    expect(["utf-8", "ibm437"]).toContain(dos);
    expect(detectDxfEncoding(ascii("hello"))).toBe("utf-8");
  });

  it("only looks at the first 64 KB", () => {
    const pad = "999\n" + "x".repeat(70000) + "\n";
    expect(detectDxfEncoding(ascii(pad + "9\n$DWGCODEPAGE\n3\nANSI_950\n"))).toBe("utf-8");
  });
});
