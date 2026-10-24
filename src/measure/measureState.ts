// Measuring state and its rules (T16 2.1, 3.2, 4): modes, picks, keeping, undo, clearing.
// Pure: the App keeps a MeasureState (e.g. with useReducer(measureReducer, …)) and hands
// `settings` to the canvas, MeasureStrip and the toolbar.
import type { MeasurePick } from "../types/engine";
import type { TranslationKey } from "../i18n/translations";
import type { KeptMeasurement, MeasurableEntity, MeasurementMode, MeasurementSettings, SnapKind } from "../viewer/measurementGeometry";
import { isComplete } from "../viewer/measureResults";

export const ALL_SNAP_KINDS: SnapKind[] = ["endpoint", "midpoint", "center", "quadrant", "intersection", "perpendicular"];
/** Kept results on screen (oldest dropped first). */
export const MAX_KEPT = 50;
/** Points of a total length or an area. */
export const MAX_PATH_POINTS = 256;

/** Status line of the full panel: default 2D measure, a snap that was taken, or no object found. */
export type MeasureStatus = "plane" | "noObject" | SnapKind;

export type MeasureState = {
  settings: MeasurementSettings;
  /** Object picked in object / info mode. */
  entity: MeasurableEntity | null;
  status: MeasureStatus;
  /** Top snap note (SnapToast): kind and serial, +1 on every snapped measuring tap. */
  toast: { kind: SnapKind; serial: number } | null;
  /** Mode before info mode was switched on, restored when it is switched off. */
  beforeInfo: MeasurementMode;
};

export type MeasureAction =
  | { type: "toggle-measure" }
  | { type: "toggle-info" }
  | { type: "close" }
  | { type: "mode"; mode: MeasurementMode }
  | { type: "pick"; pick: MeasurePick }
  | { type: "keep" }
  /** Phone toolbar 復原: last point, or the last kept result when there is no point. */
  | { type: "undo" }
  /** Panel 復原上一點: last point only (or the picked object). */
  | { type: "undo-point" }
  /** Panel 這次重來: this measurement's points, kept results stay. */
  | { type: "restart" }
  /** After the 全部清除 confirmation. */
  | { type: "clear-all" }
  | { type: "snap"; on: boolean }
  | { type: "snap-kinds"; kinds: SnapKind[] }
  /** A sheet became ready (open, layout switch, layer rebuild, xref reload): points, object and kept results go (待決 A-1). */
  | { type: "sheet-ready" }
  /** Settings were changed in the panel: status back to the default. */
  | { type: "status-reset" }
  /** A new file: everything back to the start. */
  | { type: "reset" };

export function initialMeasureState(): MeasureState {
  return {
    settings: { enabled: false, mode: "distance", points: [], snap: true, snapKinds: [...ALL_SNAP_KINDS], info: false, kept: [] },
    entity: null,
    status: "plane",
    toast: null,
    beforeInfo: "distance",
  };
}

const keepOne = (kept: readonly KeptMeasurement[], r: KeptMeasurement): KeptMeasurement[] => [...kept, r].slice(-MAX_KEPT);
const current = (s: MeasurementSettings): KeptMeasurement | null =>
  s.mode === "object" ? null : { mode: s.mode, points: s.points };

/** Whether the current points make a result 保留 can keep. */
export function canKeep(s: MeasurementSettings): boolean {
  const r = current(s);
  return !!r && isComplete(r);
}

function withSettings(state: MeasureState, patch: Partial<MeasurementSettings>, extra: Partial<MeasureState> = {}): MeasureState {
  return { ...state, ...extra, settings: { ...state.settings, ...patch } };
}

/** End input, commit only a complete result, and discard unfinished points. */
function finish(state: MeasureState): MeasureState {
  const s = state.settings;
  let r = current(s);
  if (s.mode === "object" && state.entity && !state.entity.propertiesOnly && state.entity.points.length) {
    const e = state.entity;
    r = { mode: "object", points: e.points.map(p => ({ x: p.x, y: p.y })), object: { length: e.length, area: e.area, approximate: e.approximate } };
  }
  const kept = !s.info && s.enabled && r && isComplete(r) ? keepOne(s.kept, r) : s.kept;
  return withSettings(state, { enabled: false, info: false, points: [], kept, mode: s.info ? state.beforeInfo : s.mode }, { entity: null, status: "plane", toast: null });
}

function pick(state: MeasureState, p: MeasurePick): MeasureState {
  const s = state.settings;
  if (!s.enabled) return state;
  if (s.info || s.mode === "object") {
    return { ...state, entity: p.entity, status: p.entity ? "plane" : "noObject" };
  }
  if (!Number.isFinite(p.point.x) || !Number.isFinite(p.point.y)) return state;
  const restarting = (s.mode === 'distance' && s.points.length >= 2) || (s.mode === 'angle' && s.points.length >= 3);
  const anchor = !restarting ? s.points.at(-1) : undefined;
  const point = { x: p.point.x, y: p.point.y, ...(p.snap === 'perpendicular' && anchor ? { perpendicularFrom: { x: anchor.x, y: anchor.y } } : {}) };
  let points = s.points, kept = s.kept;
  if (s.mode === "distance" || s.mode === "angle") {
    const full = s.mode === "distance" ? 2 : 3;
    if (points.length >= full) {
      // The finished one is kept automatically and the new point starts the next.
      const r = current(s);
      if (r && isComplete(r)) kept = keepOne(kept, r);
      points = [point];
    } else points = [...points, point];
  } else if (points.length < MAX_PATH_POINTS) points = [...points, point];
  const toast = p.snap ? { kind: p.snap, serial: (state.toast?.serial ?? 0) + 1 } : state.toast;
  return withSettings(state, { points, kept }, { status: p.snap ?? "plane", toast });
}

export function measureReducer(state: MeasureState, action: MeasureAction): MeasureState {
  const s = state.settings;
  switch (action.type) {
    case "toggle-measure":
      if (s.info) return withSettings(state, { enabled: true, info: false, mode: "distance", points: [] }, { entity: null, status: "plane" });
      if (s.enabled) return finish(state);
      return withSettings(state, { enabled: !s.enabled, info: false }, { status: "plane" });
    case "toggle-info":
      if (s.info) return withSettings(state, { enabled: false, info: false, mode: state.beforeInfo }, { entity: null, status: "plane" });
      return withSettings(finish(state), { enabled: true, info: true, mode: "object", points: [] },
        { entity: null, status: "plane", beforeInfo: s.mode });
    case "close":
      if (!s.enabled && !s.info) return state;
      return finish(state);
    case "mode":
      if (action.mode === s.mode) return state;
      return withSettings(state, { mode: action.mode, points: [] }, { entity: null, status: "plane" });
    case "pick":
      return pick(state, action.pick);
    case "keep": {
      const r = current(s);
      if (!r || !isComplete(r)) return state;
      return withSettings(state, { kept: keepOne(s.kept, r), points: [] });
    }
    case "undo":
      if (s.points.length) return withSettings(state, { points: s.points.slice(0, -1) });
      if (s.kept.length) return withSettings(state, { kept: s.kept.slice(0, -1) });
      return state;
    case "undo-point":
      if (s.points.length) return withSettings(state, { points: s.points.slice(0, -1) });
      return state.entity ? { ...state, entity: null } : state;
    case "restart":
      return withSettings(state, { points: [] }, { entity: null });
    case "clear-all":
      return withSettings(state, { points: [], kept: [] }, { entity: null, status: "plane" });
    case "snap":
      return withSettings(state, { snap: action.on }, { status: "plane" });
    case "snap-kinds":
      return withSettings(state, { snapKinds: ALL_SNAP_KINDS.filter((k) => action.kinds.includes(k)) }, { status: "plane" });
    case "sheet-ready":
      return withSettings(state, { points: [], kept: [] }, { entity: null });
    case "status-reset":
      return state.status === "plane" ? state : { ...state, status: "plane" };
    case "reset":
      return initialMeasureState();
  }
}

/** Phone toolbar: 全部清除 / 復原 work when there is a point or a kept result. */
export const hasAnything = (s: MeasurementSettings) => s.points.length > 0 || s.kept.length > 0;

/** Panel status line key (T16 2.6-1). */
export function statusKey(status: MeasureStatus): TranslationKey {
  switch (status) {
    case "plane": return "measure.plane";
    case "noObject": return "measure.noObject";
    default: return `measure.snapped.${status}` as TranslationKey;
  }
}

/** Top snap note key (T16 2.6-2). */
export const toastKey = (kind: SnapKind): TranslationKey => `snap.toast.${kind}` as TranslationKey;

/** Names of the measuring modes. */
export const MODE_KEYS: Record<MeasurementMode, TranslationKey> = {
  distance: "measure.mode.distance", path: "measure.mode.path", area: "measure.mode.area", angle: "measure.mode.angle", object: "measure.mode.object",
};
