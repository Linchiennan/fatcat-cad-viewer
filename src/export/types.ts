// Shared types of the output feature (005 輸出成果). Owner: P4 group C; groups A and D import them.
import type { DrawingBounds, DrawingPoint } from "../types/drawing";

/** What to output: the current view (default), the whole sheet, or a box dragged on screen. */
export type ExportRange = "view" | "sheet" | "box";
export type ExportFormat = "png" | "pdf";
/** PDF paper; orientation follows the shape of the range. Default A4. */
export type PaperSize = "A4" | "A3";

/** A box in canvas CSS pixels (any two opposite corners). */
export type ScreenBox = { x0: number; y0: number; x1: number; y1: number };

export type ExportRequest = {
  range: ExportRange;
  format: ExportFormat;
  paper?: PaperSize;
  /** Required for range "box". */
  box?: ScreenBox;
  /** Drawing name (file name without extension is fine). */
  title: string;
  /** Sheet name ("模型" for model space, or the layout name). */
  sheet: string;
};

export type ExportResult = {
  blob: Blob;
  mime: "image/png" | "application/pdf";
  /** 圖名_圖紙_YYYYMMDD-HHmm.png / .pdf */
  fileName: string;
  /** Size of the picture itself (inside the PDF for PDFs). */
  widthPx: number;
  heightPx: number;
  /** 200 for sheet / box / PDF; for a PNG of the view, 2 × the screen (reported as 192). */
  dpi: number;
  /** The device could not draw the full size, so a smaller picture was made. */
  downscaled: boolean;
  /** Small PNG preview (longest side 240 px). */
  thumbnail: Blob;
};

/** What exportDrawing needs from the CAD engine (group B's FatcatCadEngine has all of it). */
export type ExportEngine = {
  renderRegion(bounds: DrawingBounds, widthPx: number, heightPx: number): Promise<HTMLCanvasElement>;
  sheetBounds(): DrawingBounds | null;
  viewBounds(): DrawingBounds | null;
  screenToDrawing(x: number, y: number): DrawingPoint;
  /** CSS px per drawing unit on screen (sizes markup strokes like on screen). */
  pixelsPerUnit(): number;
};

/** Error codes of the output feature (screen text comes from the dictionary). */
export type ExportErrorCode = "EXPORT_NOT_READY" | "EXPORT_EMPTY_RANGE" | "EXPORT_TOO_LARGE" | "EXPORT_FAILED";

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  constructor(code: ExportErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ExportError";
    this.code = code;
  }
}

/** The CAD canvas handle also offers this (src/canvas/DrawingCanvas): output with the sheet's markups. */
export type ExportCapable = { exportDrawing(request: ExportRequest): Promise<ExportResult> };
