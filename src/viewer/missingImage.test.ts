import { expect, it } from "vitest";
import { missingRasterLabel, replaceRasterEntities } from "./rasterImages";

const image = (extra: object = {}) => ({ type: "IMAGE", handle: "A", layer: "照明", imagePath: "D:\\照片\\透視圖3.1-2.jpg", position: { x: 100, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, imageSize: { x: 1000, y: 600 }, ...extra });

// 喬瓏 頂版放樣套圖-辦公室-RF：圖片檔找不到，ZWCAD 在框內寫出存的路徑（貼齊框寬、垂直置中），App 原本只畫空框
it("writes a missing picture's path across its frame", () => {
  const t = missingRasterLabel(image())!;
  expect(t).toMatchObject({ type: "TEXT", text: "D:\\照片\\透視圖3.1-2.jpg", layer: "照明", halign: 5, valign: 2 });
  expect(t.startPoint.y).toBeCloseTo(300);
  expect(t.startPoint.x).toBeCloseTo(107);
  expect(t.endPoint.x).toBeCloseTo(1093);
  expect(t.textHeight).toBeGreaterThan(0);
});

it("leaves found, unreadable and embedded pictures alone", () => {
  expect(missingRasterLabel(image({ imageData: "data:image/png;base64,AA==" }))).toBeNull();
  expect(missingRasterLabel(image({ imageError: "只支援實際PNG/JPEG內容" }))).toBeNull();
  expect(missingRasterLabel(image({ cadOleImage: true }))).toBeNull();
});

it("keeps the path but drops the frame when the drawing turns frames off", () => {
  const on: any = { entities: [image()], blocks: {} }, off: any = { entities: [image()], blocks: {}, cadImageFrame: 0 };
  replaceRasterEntities(on); replaceRasterEntities(off);
  expect(on.entities.map((e: any) => e.type)).toEqual(["LWPOLYLINE", "TEXT"]);
  expect(off.entities.map((e: any) => e.type)).toEqual(["TEXT"]);
});
