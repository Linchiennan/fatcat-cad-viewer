// Export photo (spec 009 定案 5/10): the original with its whiteboard (and signature) drawn on, as JPEG at quality
// 0.85 and the original resolution — about half the bytes, the difference only shows when zoomed far in.
import type { Signer, Whiteboard } from "./types";
import { drawBoard, type BoardText } from "./whiteboard";

export const EXPORT_JPEG_QUALITY = 0.85;

/** Load the board's font in the weights it uses (no-op where the Font Loading API is missing). */
export async function boardFontsReady(): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return;
  try { await Promise.all(["400", "500", "700"].map((w) => fonts.load(`${w} 32px "FatCat Sans"`, "施工項目示範"))); } catch { /* draw with what there is */ }
}

export async function composePhoto(original: Blob, board: Whiteboard, text: BoardText, signer?: Signer | null, withBoard = true): Promise<Blob> {
  const bmp = await createImageBitmap(original);
  try {
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    ctx.drawImage(bmp, 0, 0);
    // the board's font must be loaded first: a canvas draws with a wider fallback until then, and the title got cut
    // ("…水電…") on a photo exported right after the camera was used
    if (withBoard) { await boardFontsReady(); drawBoard(ctx, c.width, c.height, board, text, signer); }
    const out = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", EXPORT_JPEG_QUALITY));
    if (!out) throw new Error("JPEG encoding failed");
    c.width = c.height = 0; // free the pixels on phones
    return out;
  } finally {
    bmp.close();
  }
}
