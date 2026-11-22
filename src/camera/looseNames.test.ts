import { describe, expect, it, vi } from "vitest";

vi.mock("./batchStore", () => ({ readPhotoOriginal: vi.fn() }));
vi.mock("./cardPdf", () => ({ buildCardPdf: vi.fn() }));
vi.mock("./composePhoto", () => ({ composePhoto: vi.fn() }));
import { looseNames } from "./exportBatch";

describe("匯出不包 ZIP 時的檔名（用戶 2026-11-22）", () => {
  it("own name when unique, folder added when the name is taken", () => {
    expect(looseNames(["照片/01.jpg", "照片/原圖/01.jpg", "對位圖/8F.pdf", "照片保存卡/8F隔間.pdf", "照片保存卡/8F隔間.docx"]))
      .toEqual(["照片-01.jpg", "原圖-01.jpg", "8F.pdf", "8F隔間.pdf", "8F隔間.docx"]);
  });
  it("no clash: plain names", () => {
    expect(looseNames(["照片/01.jpg", "照片/02.jpg", "對位圖/8F-標記.dxf"])).toEqual(["01.jpg", "02.jpg", "8F-標記.dxf"]);
  });
});
