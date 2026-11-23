import { readFileSync } from "node:fs";
import { PDFArray, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { lastImagePlacement, linkSheetToPhotos, markRect } from "./sheetLinks";

const JPG = new Uint8Array(readFileSync(new URL("../../web/demo/camera/demo-photo-1.jpg", import.meta.url)));

describe("對位圖 arrows link to their photos (用戶 2026-11-24 選 A 同檔加照片頁)", () => {
  it("reads where pdf-lib laid the picture (translate, rotate, scale, skew)", () => {
    const c = "q\n1 0 0 1 0 0.0163 cm\n1 0 0 1 0 0 cm\n1190.55 0 0 841.86 0 0 cm\n1 0 0 1 0 0 cm\n/Image-7 Do\nQ\n";
    const at = lastImagePlacement(c)!;
    expect(at.w).toBeCloseTo(1190.55); expect(at.h).toBeCloseTo(841.86); expect(at.x).toBeCloseTo(0); expect(at.y).toBeCloseTo(0.0163);
    const moved = lastImagePlacement("q\n1 0 0 1 20 30 cm\n100 0 0 50 0 0 cm\n/Im Do\nQ\n")!;
    expect([moved.x, moved.y, moved.w, moved.h]).toEqual([20, 30, 100, 50]);
  });

  it("puts a spot's tap area where it is on the picture (y up)", () => {
    expect(markRect({ pointId: "a", fx: 0.25, fy: 0.25, fr: 0.05 }, { x: 0, y: 0, w: 400, h: 200 })).toEqual([80, 130, 120, 170]);
  });

  it("adds one page per photo, links each arrow to its spot's first photo and each photo page back", async () => {
    const doc = await PDFDocument.create(), page = doc.addPage([800, 600]);
    page.drawImage(await doc.embedJpg(JPG), { x: 0, y: 0, width: 800, height: 600 });
    const sheet = await doc.save();
    const photos = [
      { pointId: "p1", jpg: JPG, width: 1600, height: 1200, label: "001", place: "主臥" },
      { pointId: "p1", jpg: JPG, width: 1600, height: 1200, label: "001-2", place: "主臥" },
      { pointId: "p2", jpg: JPG, width: 1200, height: 1600, label: "002", place: "浴室" },
    ];
    const out = await PDFDocument.load(await linkSheetToPhotos(sheet, [{ pointId: "p1", fx: 0.5, fy: 0.5, fr: 0.02 }, { pointId: "p2", fx: 0.1, fy: 0.1, fr: 0.02 }, { pointId: "gone", fx: 0.9, fy: 0.9, fr: 0.02 }], photos));
    expect(out.getPageCount()).toBe(4);
    const annots = (i: number) => (out.getPage(i).node.lookup(PDFName.of("Annots"), PDFArray)?.asArray() ?? []).map((r) => out.context.lookup(r) as unknown as { get(n: PDFName): unknown });
    const sheetLinks = annots(0);
    expect(sheetLinks.length).toBe(2); // the spot without a photo gets no link
    const dest = (a: { get(n: PDFName): unknown }) => (a.get(PDFName.of("Dest")) as PDFArray).get(0);
    expect(dest(sheetLinks[0])).toBe(out.getPage(1).ref); // p1 → its first photo
    expect(dest(sheetLinks[1])).toBe(out.getPage(3).ref); // p2 → page 4
    for (const i of [1, 2, 3]) expect(dest(annots(i)[0])).toBe(out.getPage(0).ref); // back to the sheet
    const rect = (sheetLinks[0].get(PDFName.of("Rect")) as PDFArray).asArray().map((n) => Number(n.toString()));
    expect(rect).toEqual([384, 284, 416, 316]);
    expect(out.getPage(3).getSize().height).toBeCloseTo(842 + 40); // an upright photo: long side 842 + the top band
  });
});
