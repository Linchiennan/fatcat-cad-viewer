// Test hook for scripted surveys: window.__fatcatDebug, only when the page URL has debug=1
// (e.g. /?debug=1 or /?glove=1&debug=1). Without it nothing is attached and nothing runs.

/** What the hook needs from the engine on screen. */
export type DebugSource = {
  isReady(): boolean;
  isLoading(): boolean;
  report(): { warnings: string[]; entityCount: number } | null;
  spaces(): { name: string }[];
  currentSpace(): string;
  sceneStats(): { meshes: number; verts: number };
  camera(): { center: { x: number; y: number }; width: number } | null;
  renderRegion?(bounds: { minX: number; minY: number; maxX: number; maxY: number }, widthPx: number, heightPx: number): Promise<HTMLCanvasElement>;
};

export type FatcatDebug = {
  report(): { warnings: string[]; entityCount: number; spaces: string[]; space: string } | null;
  sceneStats(): { meshes: number; verts: number };
  ready(): boolean;
  /** Camera centre and visible width in drawing units (extra, for view comparisons). */
  camera(): { center: { x: number; y: number }; width: number } | null;
  /** Message and stack of the last failed load (the error screen shows only a generic line). */
  lastError(): string | null;
  /** Where each top-level entity of the sheet is drawn: handle → [minX, minY, maxX, maxY] (compare with ZWCAD). */
  xrefs(): unknown[] | null;
  entityBoxes(): Record<string, [number, number, number, number]> | null;
  /** PNG data URL of a drawing region as the export draws it (image comparison with a ZWCAD plot of the same region). */
  regionPng(minX: number, minY: number, maxX: number, maxY: number, widthPx: number, heightPx: number): Promise<string | null>;
};

let lastError: string | null = null;

/** Keep why a load failed, for lastError(). */
export function noteLoadError(error: unknown): void {
  try { lastError = error instanceof Error ? `${error.message}\n${error.stack ?? ""}`.slice(0, 2000) : String(error); } catch { /* never block the error path */ }
}

/** debug=1 in a query string. */
export function debugRequested(search: string | null | undefined): boolean {
  if (!search) return false;
  try { return new URLSearchParams(search).get("debug") === "1"; } catch { return false; }
}

let current: DebugSource | null = null;

/** The hook object, reading whichever engine is current at call time. */
export function makeDebugApi(): FatcatDebug {
  return {
    report() {
      const e = current, r = e?.report();
      if (!e || !r) return null;
      return { warnings: [...r.warnings], entityCount: r.entityCount, spaces: e.spaces().map((s) => s.name), space: e.currentSpace() };
    },
    sceneStats: () => current?.sceneStats() ?? { meshes: 0, verts: 0 },
    ready: () => !!current && current.isReady() && !current.isLoading(),
    camera: () => current?.camera() ?? null,
    lastError: () => lastError,
    xrefs: () => ((current?.report() as { xrefs?: unknown[] } | null)?.xrefs) ?? null,
    entityBoxes: () => ((current?.report() as { entityBoxes?: Record<string, [number, number, number, number]> } | null)?.entityBoxes) ?? null,
    regionPng: async (minX, minY, maxX, maxY, widthPx, heightPx) => {
      const e = current;
      if (!e?.renderRegion) return null;
      return (await e.renderRegion({ minX, minY, maxX, maxY }, widthPx, heightPx)).toDataURL("image/png");
    },
  };
}

/** Make `engine` the one the hook reports (only with debug=1). */
export function attachDebug(engine: DebugSource): void {
  const scope = globalThis as { location?: { search?: string }; __fatcatDebug?: FatcatDebug };
  if (!debugRequested(scope.location?.search)) return;
  current = engine;
  scope.__fatcatDebug ??= makeDebugApi();
}

/** Forget a disposed engine. */
export function detachDebug(engine: DebugSource): void {
  if (current === engine) current = null;
}
