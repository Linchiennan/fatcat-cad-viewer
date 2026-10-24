// Props the App gives the lazily loaded viewers of group C, and the loaders themselves (T10 6-3: the canvas
// and the PDF viewer are only downloaded on the first open, so the home screen stays light). Owner: P4 group D.
// The modules are looked up with import.meta.glob so a module missing from a build becomes a normal
// "can't draw" error screen instead of a build failure; a failed download is a real error (ErrorBoundary).
import type { ComponentType, RefAttributes } from "react";
import type { DrawingPoint } from "../types/drawing";
import type { CadEngine, DrawingCanvasEvents, DrawingCanvasHandle, MeasurePreview, ViewerEvents, ViewerHandle } from "../types/engine";
import type { MeasurableEntity, MeasurementSettings, MeasurementUnit } from "../viewer/measurementGeometry";
import type { MarkTool } from "../viewer/markup";

/** What the App hands src/canvas/DrawingCanvas.tsx (export `DrawingCanvas`, forwardRef → DrawingCanvasHandle). */
export type DrawingCanvasProps = DrawingCanvasEvents & {
  /** Drawable file: DXF (converted DWG) or the xref-assembled file. A new File object = load again. */
  file: File;
  /** Group B's engine factory (viewer/cadEngine createCadEngine); stable for the App's lifetime. */
  createEngine?(host: HTMLDivElement): CadEngine;
  /** Measuring / info state; `enabled` false when neither is on. */
  measurement: MeasurementSettings;
  selectionTool?: 'single' | 'box' | null;
  onSelectionCount?(count: number): void;
  onDeleteMeasurements?(indices: number[]): void;
  /** Markup tool and colour while marking, else null; `textAnchor` is the spot being typed into. */
  markup: { tool: MarkTool; color: string; editingIndex?: number; textAnchor: { at: DrawingPoint; width?: number } | null } | null;
  /** A text tool tapped a spot (or dragged a box) → the App asks for the text, then calls addTextMark. */
  onMarkText(at: DrawingPoint, width?: number): void;
  /** An existing text mark was tapped → the App asks for the new text, then calls editTextMark. */
  onEditMarkText(index: number, current: string, color: string): void;
  /** Long-press aiming preview (optional). */
  onPreview?(preview: MeasurePreview): void;
  /** The engine of this canvas once created (null when disposed); the App uses it for export (spec 005). */
  onEngine?(engine: CadEngine | null): void;
};

/** What the App hands src/pdf/PdfViewer.tsx (export `PdfViewer`, forwardRef → ViewerHandle). */
export type PdfViewerProps = ViewerEvents & { file: File };

/** What the App hands src/measure/MeasurePanel.tsx (export `MeasurePanel`): the full measuring panel (T16 2.4). */
export type MeasurePanelProps = {
  settings: MeasurementSettings;
  onSettings(next: MeasurementSettings): void;
  sourceUnit: MeasurementUnit;
  displayUnit: MeasurementUnit;
  onUnits(source: MeasurementUnit, display: MeasurementUnit): void;
  decimals: number;
  onDecimals(decimals: number): void;
  /** The file has no unit and centimetres are assumed. */
  unitAssumed: boolean;
  /** Object snap limited on a large drawing. */
  snapLimited: boolean;
  /** Last object picked in object mode. */
  picked: MeasurableEntity | null;
  format(value: number, area?: boolean): string;
  /** Asks first (the App shows the confirm), then clears points and kept results. */
  onClearAll(): void;
  /** ✕: desktop ends measuring, phone folds back to the one-line strip. */
  onClose(): void;
  glove: boolean;
};

export type DrawingCanvasComponent = ComponentType<DrawingCanvasProps & RefAttributes<DrawingCanvasHandle>>;
export type PdfViewerComponent = ComponentType<PdfViewerProps & RefAttributes<ViewerHandle>>;
export type MeasurePanelComponent = ComponentType<MeasurePanelProps>;

type Loader<T> = () => Promise<T>;
const canvasModules = import.meta.glob<{ DrawingCanvas?: DrawingCanvasComponent }>("../canvas/DrawingCanvas.tsx");
const engineModules = import.meta.glob<{ createCadEngine?: (host: HTMLElement) => CadEngine }>("../viewer/cadEngine.ts");
const pdfModules = import.meta.glob<{ PdfViewer?: PdfViewerComponent }>("../pdf/PdfViewer.tsx");
const panelModules = import.meta.glob<{ MeasurePanel?: MeasurePanelComponent }>("../measure/MeasurePanel.tsx");

/** Thrown when a viewer module is not in this build at all (not a download failure). */
export class MissingModuleError extends Error {
  constructor(what: string) { super(`viewer module missing: ${what}`); this.name = "MissingModuleError"; }
}

function pick<M, K extends keyof M>(modules: Record<string, Loader<M>>, path: string, name: K): Loader<NonNullable<M[K]>> {
  return async () => {
    const load = modules[path];
    if (!load) throw new MissingModuleError(path);
    const value = (await load())[name];
    if (!value) throw new MissingModuleError(`${path}#${String(name)}`);
    return value as NonNullable<M[K]>;
  };
}

export type CadViewerParts = { Canvas: DrawingCanvasComponent; createEngine(host: HTMLDivElement): CadEngine };

/** The CAD canvas (group C) with group B's engine factory, loaded together on the first open. */
export async function loadCadViewer(): Promise<CadViewerParts> {
  const [Canvas, create] = await Promise.all([
    pick(canvasModules, "../canvas/DrawingCanvas.tsx", "DrawingCanvas")(),
    pick(engineModules, "../viewer/cadEngine.ts", "createCadEngine")(),
  ]);
  return { Canvas, createEngine: (host) => create(host) };
}
export const loadPdfViewer = pick(pdfModules, "../pdf/PdfViewer.tsx", "PdfViewer");
export const loadMeasurePanel = pick(panelModules, "../measure/MeasurePanel.tsx", "MeasurePanel");
