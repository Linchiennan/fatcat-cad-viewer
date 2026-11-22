// Export photo (spec 009 定案 5/10): the original with its whiteboard (and signature) drawn on, as JPEG at quality
// 0.85 and the original resolution — about half the bytes, the difference only shows when zoomed far in.
import type { Signer, Whiteboard } from "./types";
import { drawBoard, type BoardText } from "./whiteboard";

export const EXPORT_JPEG_QUALITY = 0.85;

export async function composePhoto(original: Blob, board: Whiteboard, text: BoardText, signer?: Signer | null, withBoard = true): Promise<Blob> {
  const bmp = await createImageBitmap(original);
  try {
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    ctx.drawImage(bmp, 0, 0);
    if (withBoard) drawBoard(ctx, c.width, c.height, board, text, signer);
    const out = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", EXPORT_JPEG_QUALITY));
    if (!out) throw new Error("JPEG encoding failed");
    c.width = c.height = 0; // free the pixels on phones
    return out;
  } finally {
    bmp.close();
  }
}
