// Export (PNG / PDF, spec 005) as the App shell sees it: the choices it remembers, and the other groups'
// functions it calls. Owner: P4 group D.
// The shapes below mirror the shared contract (docs/輸出成果-介面.md, group C's src/export/types.ts);
// group C's exportDrawing and group A's saveExport are looked up at run time so the shell builds and runs
// while they are being written ("export isn't ready yet" until then).
import type { CadEngine } from "../types/engine";
import type { Mark } from "../viewer/markup";

export type ExportRange = "view" | "sheet" | "box";
export type ExportFormat = "png" | "pdf";
export type PaperSize = "A4" | "A3";
/** Screen box (canvas CSS px) of a 框選 export. */
export type ScreenBox = { x0: number; y0: number; x1: number; y1: number };
export type ExportRequest = { range: ExportRange; format: ExportFormat; paper?: PaperSize; box?: ScreenBox; title: string; sheet: string };
export type ExportResult = {
  blob: Blob; mime: string; fileName: string; widthPx: number; heightPx: number; dpi: number; downscaled: boolean; thumbnail: Blob;
};
export type ExportChoice = { range: ExportRange; format: ExportFormat; paper: PaperSize };

const CHOICE_KEY = "fatcat:export-choice";
export const DEFAULT_CHOICE: ExportChoice = { range: "view", format: "png", paper: "A4" };

/** Last choice (range, format, paper), or the defaults: current view, PNG, A4. */
export function loadExportChoice(): ExportChoice {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null") as Partial<ExportChoice> | null;
    return {
      range: v?.range === "sheet" || v?.range === "box" ? v.range : "view",
      format: v?.format === "pdf" ? "pdf" : "png",
      paper: v?.paper === "A3" ? "A3" : "A4",
    };
  } catch { return { ...DEFAULT_CHOICE }; }
}

export function saveExportChoice(choice: ExportChoice): void {
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode: remembered for this visit only */ }
}

/** A drag from (x0, y0) to (x1, y1) as a normalised box; null when it is too small to mean anything. */
export function normaliseBox(x0: number, y0: number, x1: number, y1: number, minPx = 12): ScreenBox | null {
  const box = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  return box.x1 - box.x0 < minPx || box.y1 - box.y0 < minPx ? null : box;
}

/** The request for the current drawing: title = file name without extension. */
export function exportRequest(choice: ExportChoice, fileName: string, sheet: string, box?: ScreenBox): ExportRequest {
  return {
    range: choice.range, format: choice.format, paper: choice.format === "pdf" ? choice.paper : undefined,
    box: choice.range === "box" ? box : undefined, title: fileName.replace(/\.[^.]+$/, ""), sheet,
  };
}

export class ExportNotReadyError extends Error {
  constructor(what: string) { super(`export not ready: ${what}`); this.name = "ExportNotReadyError"; }
}

type ExportFn = (engine: CadEngine, request: ExportRequest, marks: readonly Mark[]) => Promise<ExportResult>;
type SaveFn = (result: ExportResult) => Promise<unknown>;

const exportModules = import.meta.glob<Record<string, unknown>>(["../export/*.ts", "!../export/*.test.ts"]);
const libraryModules = import.meta.glob<Record<string, unknown>>(["../library/*.ts", "!../library/*.test.ts"]);

async function findFunction<T>(modules: Record<string, () => Promise<Record<string, unknown>>>, name: string): Promise<T> {
  for (const load of Object.values(modules)) {
    const fn = (await load())[name];
    if (typeof fn === "function") return fn as T;
  }
  throw new ExportNotReadyError(name);
}

/** Group C's exportDrawing(engine, request, marks). */
export const loadExportDrawing = () => findFunction<ExportFn>(exportModules, "exportDrawing");
/** Group A's saveExport(result): keeps the file in the 輸出成果 area. */
export const loadSaveExport = () => findFunction<SaveFn>(libraryModules, "saveExport");
