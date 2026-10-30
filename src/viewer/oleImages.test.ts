import { describe, expect, it } from "vitest";
import { hexToBytes, oleImage, presentationImage, readCfbStream } from "./oleImages";
import { preserveCadMetadata } from "./cadDocument";

const END = 0xfffffffe, FREE = 0xffffffff, FATSECT = 0xfffffffd;

// Minimal compound file (512-byte sectors): FAT, directory, then either regular or mini stream data.
function makeCfb(name: string, stream: Uint8Array, options: { loop?: boolean } = {}): Uint8Array {
  const sector = 512, mini = stream.length < 4096;
  const dataSectors = Math.ceil((mini ? Math.ceil(stream.length / 64) * 64 : stream.length) / sector) || 1;
  const miniFatSector = mini ? 2 + dataSectors : -1;
  const total = 2 + dataSectors + (mini ? 1 : 0);
  const out = new Uint8Array(sector * (1 + total)), view = new DataView(out.buffer);
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  view.setUint16(0x1a, 3, true); view.setUint16(0x1c, 0xfffe, true); view.setUint16(0x1e, 9, true); view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true); view.setUint32(0x30, 1, true); view.setUint32(0x38, 4096, true);
  view.setUint32(0x3c, mini ? miniFatSector : END, true); view.setUint32(0x40, mini ? 1 : 0, true); view.setUint32(0x44, END, true);
  for (let i = 0; i < 109; i++) view.setUint32(0x4c + i * 4, i === 0 ? 0 : FREE, true);
  const at = (s: number) => sector * (1 + s);
  const fat = new Array(sector / 4).fill(FREE);
  fat[0] = FATSECT; fat[1] = END;
  for (let i = 0; i < dataSectors; i++) fat[2 + i] = i === dataSectors - 1 ? END : 3 + i;
  if (options.loop) fat[2] = 2;
  if (mini) fat[miniFatSector] = END;
  fat.forEach((v, i) => view.setUint32(at(0) + i * 4, v, true));
  const entry = (index: number, entryName: string, type: number, start: number, size: number) => {
    const b = at(1) + index * 128;
    for (let i = 0; i < entryName.length; i++) view.setUint16(b + i * 2, entryName.charCodeAt(i), true);
    view.setUint16(b + 0x40, (entryName.length + 1) * 2, true); out[b + 0x42] = type;
    view.setUint32(b + 0x74, start, true); view.setUint32(b + 0x78, size, true);
  };
  if (mini) {
    entry(0, "Root Entry", 5, 2, Math.ceil(stream.length / 64) * 64);
    entry(1, name, 2, 0, stream.length);
    out.set(stream, at(2));
    const chunks = Math.ceil(stream.length / 64);
    for (let i = 0; i < sector / 4; i++) view.setUint32(at(miniFatSector) + i * 4, i < chunks - 1 ? i + 1 : i === chunks - 1 ? END : FREE, true);
  } else {
    entry(0, "Root Entry", 5, END, 0);
    entry(1, name, 2, 2, stream.length);
    out.set(stream, at(2));
  }
  return out;
}

function bmp(width: number, height: number): Uint8Array {
  const row = Math.ceil(width * 3 / 4) * 4, size = 54 + row * height, out = new Uint8Array(size), v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, width, true); v.setInt32(22, height, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  return out;
}

const native = (payload: Uint8Array) => { const out = new Uint8Array(4 + payload.length); new DataView(out.buffer).setUint32(0, payload.length, true); out.set(payload, 4); return out; };
const withAcadHeader = (cfb: Uint8Array) => { const out = new Uint8Array(128 + cfb.length); out.set(cfb, 128); return out; };

describe("embedded OLE pictures", () => {
  it("reads a Paint BMP from a regular-sector Ole10Native stream after the 128-byte CAD header", () => {
    const picture = bmp(40, 40);
    const result = oleImage(withAcadHeader(makeCfb("\u0001Ole10Native", native(picture))));
    expect(result.mime).toBe("image/bmp");
    expect(result.bytes.length).toBe(picture.length);
  });

  it("reads a mini-stream package and finds the PNG after its file-name header", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const payload = new Uint8Array([2, 0, 0x61, 0x2e, 0x70, 0x6e, 0x67, 0, ...png]);
    const result = oleImage(makeCfb("\u0001Ole10Native", native(payload)));
    expect(result.mime).toBe("image/png");
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
  });

  it("explains unsupported embedded documents and rejects corrupt chains", () => {
    expect(() => oleImage(makeCfb("WordDocument", new Uint8Array(5000)))).toThrow(/內嵌 Word 文件，沒有預覽畫面/);
    expect(() => oleImage(makeCfb("Workbook", new Uint8Array(5000)))).toThrow(/內嵌 Excel 表格/);
    expect(() => oleImage(makeCfb("\u0001Ole10Native", native(new Uint8Array(4500)), { loop: true }))).toThrow(/循環/);
    expect(() => oleImage(new Uint8Array(1000))).toThrow(/複合檔/);
    expect(readCfbStream(makeCfb("\u0001Ole10Native", native(bmp(2, 2))), "missing")).toBeNull();
  });

  it("shows an embedded Excel table by its Office preview picture (鴻群差異註解 14209C)", () => {
    const wmf = new Uint8Array([1, 0, 9, 0, 0, 3, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
    const pres = new Uint8Array(40 + wmf.length), v = new DataView(pres.buffer);
    v.setUint32(0, 0xffffffff, true); v.setUint32(4, 14, true); v.setUint32(8, 4, true); v.setUint32(36, wmf.length, true);
    pres.set(wmf, 40);
    const result = oleImage(withAcadHeader(makeCfb("OlePres000", pres)));
    expect(result.mime).toBe("image/wmf");
    expect(Array.from(result.bytes)).toEqual(Array.from(wmf));
    v.setUint32(4, 2, true); // CF_BITMAP is not a stored picture
    expect(presentationImage(makeCfb("OlePres000", pres))).toBeNull();
  });

  it("converts DXF 310 hex chunks to bytes", () => {
    expect(Array.from(hexToBytes(["00ff", "7A"]))).toEqual([0, 255, 0x7a]);
  });

  it("turns an OLE2FRAME record into an embedded IMAGE placeholder with its frame corners", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "OLE2FRAME", "5", "AB1", "8", "照片", "100", "AcDbOle2Frame",
      "10", "10", "20", "50", "30", "0", "11", "30", "21", "40", "31", "0", "310", "00FF", "310", "7A", "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: {}, cadUnsupported: { OLE2FRAME: 1 } }, dxf);
    const e = doc.entities.find((x: any) => x.handle === "AB1");
    expect(e).toMatchObject({ type: "IMAGE", layer: "照片", cadOleImage: true, cadSpace: "Model" });
    expect(e.cadOle).toEqual({ hex: ["00FF", "7A"], corner1: { x: 10, y: 50, z: 0 }, corner2: { x: 30, y: 40, z: 0 } });
    expect(doc.cadUnsupported.OLE2FRAME).toBeUndefined();
  });
});

describe("static pictures pasted into CAD (CONTENTS stream)", () => {
  it("reads a StaticDib BMP (上晴 B區0818) and a placeable StaticMetafile WMF (惠宇 X05 公設標示)", () => {
    const bmp = new Uint8Array(70); const v = new DataView(bmp.buffer);
    bmp[0] = 0x42; bmp[1] = 0x4d; v.setUint32(2, 70, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
    v.setInt32(18, 2, true); v.setInt32(22, 2, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
    expect(oleImage(makeCfb("CONTENTS", bmp))).toMatchObject({ mime: "image/bmp" });
    const wmf = new Uint8Array([1, 0, 9, 0, 0, 3, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
    const placeable = new Uint8Array(22 + wmf.length); new DataView(placeable.buffer).setUint32(0, 0x9ac6cdd7, true); placeable.set(wmf, 22);
    const picture = oleImage(makeCfb("CONTENTS", placeable));
    expect(picture.mime).toBe("image/wmf");
    expect(Array.from(picture.bytes.subarray(0, 4))).toEqual([1, 0, 9, 0]);
  });
});
