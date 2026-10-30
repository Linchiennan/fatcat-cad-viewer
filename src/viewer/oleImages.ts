// Embedded OLE pictures (OLE2FRAME, e.g. Paint "PBrush" pasted into a DWG).
// The DXF 310 data is a 128-byte AutoCAD header followed by an OLE compound file;
// the picture is the \u0001Ole10Native stream. Only local bytes; never fetch.
import { renderWmf, wmfInfo } from "./wmf";
type Any = any;
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MAX_OLE_BYTES = 64 * 1024 * 1024;
const END = 0xfffffffe, FREE = 0xffffffff;

export type OleImage = { bytes: Uint8Array; mime: "image/bmp" | "image/png" | "image/jpeg" | "image/wmf" };

export function hexToBytes(chunks: readonly string[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + (c.length >> 1), 0);
  if (total > MAX_OLE_BYTES) throw Error("內嵌物件超過64MB安全上限");
  const out = new Uint8Array(total);
  let k = 0;
  for (const chunk of chunks) for (let i = 0; i + 1 < chunk.length; i += 2) out[k++] = parseInt(chunk.substr(i, 2), 16);
  return out;
}

function findSignature(bytes: Uint8Array, limit = 4096): number {
  outer: for (let i = 0; i + 8 <= Math.min(bytes.length, limit + 8); i++) {
    for (let j = 0; j < 8; j++) if (bytes[i + j] !== CFB_SIGNATURE[j]) continue outer;
    return i;
  }
  return -1;
}

/** Minimal read-only compound file reader; returns the named stream or null. */
export function readCfbStream(file: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const u16 = (o: number) => view.getUint16(o, true), u32 = (o: number) => view.getUint32(o, true);
  if (file.length < 512) throw Error("內嵌物件資料不完整");
  const sectorSize = 1 << u16(0x1e), miniSize = 1 << u16(0x20);
  if (sectorSize !== 512 && sectorSize !== 4096) throw Error("內嵌物件格式異常（扇區大小）");
  const sectors = Math.floor((file.length - sectorSize) / sectorSize);
  const sectorOffset = (s: number) => {
    if (s >= sectors) throw Error("內嵌物件格式異常（扇區越界）");
    return sectorSize + s * sectorSize;
  };
  // FAT sectors listed in the header DIFAT, then the DIFAT chain.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const s = u32(0x4c + i * 4); if (s !== FREE) fatSectors.push(s); }
  let difat = u32(0x44);
  for (let guard = 0; difat !== END && difat !== FREE && guard < sectors; guard++) {
    const o = sectorOffset(difat), per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) { const s = u32(o + i * 4); if (s !== FREE) fatSectors.push(s); }
    difat = u32(o + per * 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) { const o = sectorOffset(s); for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(o + i * 4)); }
  const chain = (start: number, table: number[]): number[] => {
    const out: number[] = [];
    for (let s = start; s !== END && s !== FREE; s = table[s]) {
      if (s >= table.length || out.length > table.length) throw Error("內嵌物件格式異常（鏈結循環）");
      out.push(s);
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let k = 0;
    for (const s of chain(start, fat)) { if (k >= size) break; const o = sectorOffset(s), n = Math.min(sectorSize, size - k); out.set(file.subarray(o, o + n), k); k += n; }
    if (k < size) throw Error("內嵌物件資料不完整");
    return out;
  };
  const dirSectors = chain(u32(0x30), fat);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (const s of dirSectors) {
    const o = sectorOffset(s);
    for (let e = 0; e < sectorSize / 128; e++) {
      const b = o + e * 128, len = Math.min(64, u16(b + 0x40));
      let entryName = "";
      for (let i = 0; i + 2 < len; i += 2) entryName += String.fromCharCode(u16(b + i));
      entries.push({ name: entryName, type: file[b + 0x42], start: u32(b + 0x74), size: u32(b + 0x78) });
    }
  }
  const root = entries.find((e) => e.type === 5), entry = entries.find((e) => e.type === 2 && e.name === name);
  if (!entry) return null;
  if (entry.size > MAX_OLE_BYTES) throw Error("內嵌物件超過64MB安全上限");
  if (entry.size >= u32(0x38) || !root) return readChain(entry.start, entry.size);
  // Small streams live in the mini stream (root entry's chain) indexed by the mini FAT.
  const miniFat: number[] = [];
  for (const s of chain(u32(0x3c), fat)) { const o = sectorOffset(s); for (let i = 0; i < sectorSize / 4; i++) miniFat.push(u32(o + i * 4)); }
  const container = readChain(root.start, root.size), out = new Uint8Array(entry.size);
  let k = 0;
  for (const s of chain(entry.start, miniFat)) { if (k >= entry.size) break; const n = Math.min(miniSize, entry.size - k); out.set(container.subarray(s * miniSize, s * miniSize + n), k); k += n; }
  if (k < entry.size) throw Error("內嵌物件資料不完整");
  return out;
}

function sniff(bytes: Uint8Array, at: number): OleImage["mime"] | null {
  const b = (i: number) => bytes[at + i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x42 && b(1) === 0x4d && at + 30 <= bytes.length) {
    // A real BMP declares its own length and a sane DIB header.
    const size = bytes[at + 2] | (bytes[at + 3] << 8) | (bytes[at + 4] << 16) | (bytes[at + 5] << 24);
    const dib = bytes[at + 14] | (bytes[at + 15] << 8);
    if (size > 26 && at + size <= bytes.length + 2 && [12, 40, 52, 56, 108, 124].includes(dib)) return "image/bmp";
  }
  return null;
}

/** Name the embedded Office document so the warning says what is missing. */
function describeDocument(cfb: Uint8Array): string {
  const has = (name: string) => { try { return readCfbStream(cfb, name) !== null; } catch { return false; } };
  if (has("Workbook") || has("Book")) return "內嵌 Excel 表格";
  if (has("WordDocument")) return "內嵌 Word 文件";
  if (has("PowerPoint Document")) return "內嵌 PowerPoint 簡報";
  if (has("Package")) return "內嵌 Office 文件（docx／xlsx 等）";
  return "內嵌物件沒有圖片內容";
}

/**
 * The picture Office keeps for showing an embedded Excel / Word object without opening it
 * (\u0002OlePres000, MS-OLEDS OLEPresentationStream). CAD draws the same picture.
 */
export function presentationImage(cfb: Uint8Array): OleImage | null {
  const pres = readCfbStream(cfb, "\u0002OlePres000");
  if (!pres || pres.length < 48) return null;
  const view = new DataView(pres.buffer, pres.byteOffset, pres.byteLength);
  if (view.getUint32(0, true) !== 0xffffffff) return null; // a registered format name, not a standard picture
  const format = view.getUint32(4, true), device = view.getUint32(8, true);
  const at = 8 + device + 28;
  if (device < 4 || at > pres.length) throw Error("內嵌預覽格式異常");
  const size = view.getUint32(at - 4, true), data = pres.subarray(at, Math.min(pres.length, at + size));
  if (format === 8) {
    // CF_DIB: a BMP without its 14-byte file header.
    const bmp = new Uint8Array(14 + data.length), header = new DataView(bmp.buffer);
    const dib = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const bits = dib.getUint16(14, true), colors = dib.getUint32(32, true) || (bits <= 8 ? 1 << bits : 0);
    bmp[0] = 0x42; bmp[1] = 0x4d; header.setUint32(2, bmp.length, true);
    header.setUint32(10, 14 + dib.getUint32(0, true) + colors * 4 + (dib.getUint32(16, true) === 3 ? 12 : 0), true);
    bmp.set(data, 14);
    return { bytes: bmp, mime: "image/bmp" };
  }
  if (format === 3 || format === 14) {
    const wmf = data.length > 4 && data[2] === 9 && data[3] === 0 && (data[0] === 1 || data[0] === 2);
    if (!wmf) throw Error("內嵌預覽為 EMF 格式，尚未支援");
    return { bytes: data, mime: "image/wmf" };
  }
  return null;
}

/**
 * A picture pasted as a static object ("Picture (Device Independent Bitmap)" StaticDib, "Picture (Metafile)"
 * StaticMetafile) keeps it in CONTENTS: a BMP file, or a placeable WMF (22-byte header, key 0x9AC6CDD7).
 * 上晴 B區0818 and 惠宇 X05／X06 showed "no picture" because only Ole10Native and OlePres000 were read.
 */
export function staticPicture(cfb: Uint8Array): OleImage | null {
  const contents = readCfbStream(cfb, "CONTENTS");
  if (!contents || contents.length < 26) return null;
  if (sniff(contents, 0) === "image/bmp") return { bytes: contents, mime: "image/bmp" };
  const key = new DataView(contents.buffer, contents.byteOffset, 4).getUint32(0, true);
  const wmf = key === 0x9ac6cdd7 ? contents.subarray(22) : contents;
  if (wmf[2] === 9 && wmf[3] === 0 && (wmf[0] === 1 || wmf[0] === 2)) return { bytes: wmf, mime: "image/wmf" };
  if (contents[0] === 1 && contents[1] === 0 && contents[2] === 0 && contents[3] === 0 && contents[40] === 0x20 && contents[41] === 0x45) throw Error("內嵌圖片為 EMF 格式，尚未支援");
  return null;
}

/** Picture bytes inside OLE2FRAME data, or an explanation of why there is none. */
export function oleImage(data: Uint8Array): OleImage {
  const start = findSignature(data);
  if (start < 0) throw Error("內嵌物件不是可讀的 OLE 複合檔");
  const cfb = data.subarray(start);
  const native = readCfbStream(cfb, "\u0001Ole10Native");
  if (!native || native.length < 8) {
    const preview = presentationImage(cfb) ?? staticPicture(cfb);
    if (preview) return preview;
    throw Error(describeDocument(cfb) + "，沒有預覽畫面，無法顯示（請在電腦 CAD 查看）");
  }
  const declared = new DataView(native.buffer, native.byteOffset, 4).getUint32(0, true);
  const payload = native.subarray(4, Math.min(native.length, 4 + declared));
  // Paint pictures start with the image; packaged files wrap it after a name header.
  for (let i = 0; i < Math.min(payload.length, 4096); i++) {
    const mime = sniff(payload, i);
    if (mime) return { bytes: payload.subarray(i), mime };
  }
  throw Error("內嵌物件不是 BMP／PNG／JPEG 圖片，尚未支援");
}

const WMF_MAX_SIDE = 2400;

function wmfToPngDataUrl(bytes: Uint8Array): { data: string; width: number; height: number } {
  const info = wmfInfo(bytes), scale = Math.min(4, WMF_MAX_SIDE / Math.max(info.width, info.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(info.width * scale)); canvas.height = Math.max(1, Math.round(info.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw Error("無法建立圖片畫布");
  context.fillStyle = "#fff"; // CAD shows embedded Office objects on an opaque white sheet
  context.fillRect(0, 0, canvas.width, canvas.height);
  renderWmf(bytes, context, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

async function toPngDataUrl(image: OleImage): Promise<{ data: string; width: number; height: number }> {
  if (image.mime === "image/wmf") return wmfToPngDataUrl(image.bytes);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], { type: image.mime }));
  try {
    if (bitmap.width * bitmap.height > 32 * 1024 * 1024) throw Error("圖片像素超過32M安全上限");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("無法建立圖片畫布");
    context.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL("image/png"), width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); }
}

/** Turn OLE2FRAME placeholders from preserveCadMetadata into local IMAGE entities. */
export async function resolveOleImages(doc: Any): Promise<void> {
  const all = [...(doc.entities ?? []), ...Object.values(doc.blocks ?? {}).flatMap((b: Any) => b.entities ?? [])];
  for (const e of all) {
    if (e.type !== "IMAGE" || !e.cadOle) continue;
    const { hex, corner1, corner2 } = e.cadOle;
    delete e.cadOle;
    try {
      const picture = await toPngDataUrl(oleImage(hexToBytes(hex)));
      const width = Math.abs(corner2.x - corner1.x), height = Math.abs(corner2.y - corner1.y);
      if (!(width > 0 && height > 0)) throw Error("內嵌圖片框尺寸無效");
      Object.assign(e, {
        imageData: picture.data,
        imageSize: { x: picture.width, y: picture.height },
        position: { x: Math.min(corner1.x, corner2.x), y: Math.min(corner1.y, corner2.y), z: 0 },
        u: { x: width / picture.width, y: 0, z: 0 },
        v: { x: 0, y: height / picture.height, z: 0 },
      });
    } catch (error) {
      e.imageError = error instanceof Error ? error.message : String(error);
    }
  }
}
