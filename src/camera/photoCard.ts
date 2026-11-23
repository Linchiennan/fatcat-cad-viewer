// 照片保存卡 (spec 009 定案 8), laid out like the user's 8F室內隔間配管完成.doc (measured on its PDF): A4 portrait,
// two photos a page; heading = company (標楷體 28 pt), 「照 片 保 存 卡」 (24 pt), 工程名稱 and 日期 (16 pt); each photo in
// a heavy-ruled box whose left column holds 照片編號 / number / 施工說明 / description (16 pt). The layout is computed
// once (points, 1/72 inch) and drawn into both the .docx and the PDF.

export type CardEntry = {
  /** "01-1" */
  label: string;
  /** 施工說明 lines: 施工項目 then 施工位置 */
  description: string[];
  photoId: string;
  /** photo size in pixels (for the crop) */
  width: number;
  height: number;
};

export type CardHeading = { company: string; project: string; date: string };

export const A4 = { w: 595.32, h: 841.92 };
/** geometry of the user's card (points) */
export const CARD = {
  left: 50, right: 550, labelRight: 143,
  companyTop: 47, companyPt: 28, titleTop: 83, titlePt: 24, infoTop: 113, textPt: 16,
  boxTops: [151, 469] as const, boxH: 308,
  /** heights of the 照片編號 / number / 施工說明 rows; the description takes the rest */
  rows: [27, 27, 26] as const,
};

export const pages = <T,>(list: readonly T[], perPage = 2): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += perPage) out.push(list.slice(i, i + perPage));
  return out;
};

/** Where a photo of w × h goes in a cell: as large as fits, its own proportions kept, centred — stretched to the 4:3
 * cell, a 16:9 phone photo squashed its whiteboard (用戶 2026-11-23：「為啥發布的照片，白板會變形?」「白板都要固定尺寸!」). */
export function fitInCell(cell: { x: number; y: number; w: number; h: number }, w: number, h: number): { x: number; y: number; w: number; h: number } {
  if (!(w > 0 && h > 0)) return cell;
  const k = Math.min(cell.w / w, cell.h / h), fw = w * k, fh = h * k;
  return { x: cell.x + (cell.w - fw) / 2, y: cell.y + (cell.h - fh) / 2, w: fw, h: fh };
}

/** The photo cell of a box (right of the label column). */
export function photoCell(boxTop: number): { x: number; y: number; w: number; h: number } {
  const x = CARD.labelRight + 1, y = boxTop + 2;
  return { x, y, w: CARD.right - 1 - x, h: CARD.boxH - 4 };
}

/** 工程名稱 line as on the card. */
/** The line under the title: 工程名稱 from the left, 日期 against the right edge of the boxes, wherever the name ends
 * (用戶 2026-11-23：「日期固定在右邊」; it used to follow the name after three spaces). */
export const infoParts = (h: CardHeading): { project: string; date: string } => ({ project: `工程名稱：${h.project}`, date: `日期：${h.date}` });
/** 「照 片 保 存 卡」 with the spacing of the user's card */
export const CARD_TITLE = "照 片 保 存 卡";
