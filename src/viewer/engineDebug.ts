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
};

export type FatcatDebug = {
  report(): { warnings: string[]; entityCount: number; spaces: string[]; space: string } | null;
  sceneStats(): { meshes: number; verts: number };
  ready(): boolean;
  /** Camera centre and visible width in drawing units (extra, for view comparisons). */
  camera(): { center: { x: number; y: number }; width: number } | null;
};

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
