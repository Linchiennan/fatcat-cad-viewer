// Shared drawing types (P3 final). Every P4 group imports from here; only the P3 owner changes it.
// Coordinates are drawing (world) units unless a name says "screen" / "css".
import type { CadReport } from "../viewer/engineering";

/** A point in drawing coordinates (or CSS pixels where a function says so). */
export type DrawingPoint = { x: number; y: number };

/** Axis-aligned bounds in drawing coordinates. */
export type DrawingBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Name of model space; layouts use their own names. */
export const MODEL_SPACE = "Model";

/** One sheet of a drawing: model space or a paper layout (T14 8.1-2). */
export type CadSpace = { name: string; order: number; owner?: string };

/** View commands shared by the CAD canvas and the PDF viewer (T14 3.4, T17 8). */
export type ViewCommand = "zoom-in" | "zoom-out" | "fit" | "reset" | "home";

/** Loading stages shown on the loading screen (T20 2.1-4). */
export type LoadStage = "reading" | "converting" | "loading" | "parsing" | "preparing" | "fonts";

/** Progress callback: stage, items done, total items (total 0 = unknown). */
export type LoadProgress = (stage: LoadStage, done: number, total: number) => void;

/** Drawing check report as the engine hands it to CadPanel / cadWarnings / App (T14 8.2). */
export type EngineReport = CadReport & {
  /** Font routing diagnostics from cadFontsScene, or null. */
  fontDiagnostics?: unknown;
  /** External raster images: path and IMAGE handle. */
  images?: { path: string; handle: string }[];
  embeddedImageCount?: number;
  shownImageCount?: number;
  /** Name of the space this report belongs to. */
  space?: string;
};

/** View info attached to a diagnostic / share screenshot (T14 8.6). */
export type ViewSnapshot = {
  center: DrawingPoint;
  width: number;
  height: number;
  zoom: number;
  canvasPixels: { width: number; height: number };
  viewKey: string;
  loadSerial: number;
  textCandidateTotal: number;
  textCandidateLimit: 500;
  selection: string;
};

/** Diagnostic screenshot: PNG taken in the same task as a redraw (T14 8.6-1). */
export type DiagnosticCapture = {
  png: string;
  capturedAt: string;
  view: ViewSnapshot;
  textCandidates: { kind: string; layer: string; bounds: DrawingBounds; properties?: Record<string, unknown> }[];
  fontDiagnostics: unknown;
  /** Parse audit identity of the drawing on screen (DiagnosticsPanel checks sourceSHA256). */
  source: { sourceSHA256: string } & Record<string, unknown>;
};
