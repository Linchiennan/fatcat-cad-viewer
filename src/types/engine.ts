// Cross-group interfaces (P3 final): the CAD engine (group B implements, C and D use) and the
// drawing canvas / PDF viewer handle (group C implements, D uses). Changing them needs the P3 owner.
import type { CadSpace, DiagnosticCapture, DrawingBounds, DrawingPoint, EngineReport, LoadProgress, ViewCommand } from "./drawing";
import type { MeasurableEntity, MeasurementIndex, MeasurementSettings, SnapKind } from "../viewer/measurementGeometry";
import type { Mark } from "../viewer/markup";

/** A tap while measuring / inspecting (T14 4.9-4, T16 8-7). */
export type MeasurePick = {
  point: DrawingPoint;
  snap: SnapKind | null;
  entity: MeasurableEntity | null;
  /** Tap position in the canvas (CSS px) and the canvas height, for the info card placement. */
  screenY: number;
  canvasHeight: number;
};

/** Long-press aiming preview: crosshair position and the snap it would take. */
export type MeasurePreview = { point: DrawingPoint; snap: SnapKind | null } | null;

/** The CAD engine around dxf-viewer (T14 8.4). One instance per canvas element. */
export interface CadEngine {
  /** Load a drawable file (DXF, or the JSON-prefixed DXF from xrefs) into `space` (default model). Rejects with AppError. */
  load(file: File, onProgress: LoadProgress, space?: string, signal?: AbortSignal): Promise<void>;
  spaces(): CadSpace[];
  currentSpace(): string;
  command(command: ViewCommand): void;
  /** Show or hide a layer; resolves true when the scene had to be rebuilt. */
  showLayer(name: string, visible: boolean): Promise<boolean>;
  report(): EngineReport | null;
  /** Canvas CSS px (from the canvas top-left) → drawing point. */
  unproject(x: number, y: number): DrawingPoint;
  /** Drawing points → canvas CSS px. */
  project(points: readonly DrawingPoint[]): DrawingPoint[];
  /** CSS px per drawing unit at the current zoom. */
  pixelsPerUnit(): number;
  /** Pan by CSS px (right / down positive); redraws and fires onViewChanged. */
  panBy(dx: number, dy: number): void;
  /** Centre `view` in the free area (T14 3.5); returns where `focus` lands on the canvas, or null without a layout. */
  zoomTo(view: DrawingBounds, focus: DrawingBounds): { left: number; top: number; width: number; height: number } | null;
  measurementIndex(): MeasurementIndex | null;
  setMeasurement(settings: MeasurementSettings): void;
  /** Label height for measurements in drawing units, or null (our measureResults.labelHeight). */
  measureLabelHeight(): number | null;
  /** Reading-position key of the sheet on screen (includes the space). */
  viewKey(): string;
  /** Redraw and read the canvas PNG in the same task (T14 8.6-1). */
  captureDiagnostics(): DiagnosticCapture;
  /** Share image: screenshot + markups + caption strip (T14 8.6-2). */
  shareImage(marks: readonly Mark[], caption: string): Promise<Blob>;
  onPick(handler: (pick: MeasurePick) => void): () => void;
  onPreview(handler: (preview: MeasurePreview) => void): () => void;
  onViewChanged(handler: () => void): () => void;
  dispose(): void;
}

/** Commands the App gives the drawing canvas or the PDF viewer (T15 8-4, T17 8-2). */
export interface ViewerHandle {
  command(command: ViewCommand): void;
}

/** Extra commands of the CAD canvas (T15 8-4). */
export interface DrawingCanvasHandle extends ViewerHandle {
  addTextMark(at: DrawingPoint, text: string, width?: number): void;
  /** Empty text deletes the mark. */
  editTextMark(index: number, text: string, color?: string): void;
  undoMark(): void;
  clearMarks(): void;
  shareImage(caption: string): Promise<Blob>;
  /** Zoom to a search hit and draw the red box (textHeight and `at` 0..1 optional). */
  showSearchHit(bounds: DrawingBounds, textHeight?: number, at?: number): void;
  clearSearchHit(): void;
  switchSpace(name: string): void;
  showLayer(name: string, visible: boolean): void;
  captureDiagnostics(): DiagnosticCapture | null;
}

/** Events both viewers report so loading / toolbar code need not know the format (T15 8-5, T17 8-2). */
export type ViewerEvents = {
  onProgress: LoadProgress;
  onReady(): void;
  onError(error: unknown): void;
};

/** Extra events of the CAD canvas (T15 8-5). */
export type DrawingCanvasEvents = ViewerEvents & {
  onPick(pick: MeasurePick): void;
  onMeasurementIndex(index: MeasurementIndex): void;
  onSpaces(spaces: CadSpace[], current: string, switching: boolean): void;
  onMarkCount(count: number): void;
  onReport(report: EngineReport): void;
};
