// How length numbers sit on measuring lines (用戶指定可在齒輪選單選 D／E／F). One setting for the whole app, kept on
// this device; the overlay re-renders when it changes.
import { useSyncExternalStore } from "react";

/** angle: turned with the line, just above it; box: in place on a dark box; gap: the line breaks around the number. */
export type MeasureLabelStyle = "angle" | "box" | "gap";
export const LABEL_STYLES: readonly MeasureLabelStyle[] = ["angle", "box", "gap"];
export const DEFAULT_LABEL_STYLE: MeasureLabelStyle = "box";
const KEY = "fatcat:measure-label-style";

export function loadLabelStyle(): MeasureLabelStyle {
  try {
    const v = localStorage.getItem(KEY);
    return (LABEL_STYLES as readonly string[]).includes(v ?? "") ? (v as MeasureLabelStyle) : DEFAULT_LABEL_STYLE;
  } catch { return DEFAULT_LABEL_STYLE; }
}

let current: MeasureLabelStyle | null = null;
const listeners = new Set<() => void>();

export function setLabelStyle(style: MeasureLabelStyle): void {
  current = style;
  try { localStorage.setItem(KEY, style); } catch { /* Private mode: the choice lasts for this visit. */ }
  listeners.forEach((l) => l());
}

export function useLabelStyle(): MeasureLabelStyle {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (current ??= loadLabelStyle()),
    () => (current ??= loadLabelStyle()),
  );
}

// Whether numbers on the drawing carry their unit ("15.6 cm" or "15.6"). Off by default (用戶指定); the result panel
// always shows the unit.
const UNIT_KEY = "fatcat:measure-label-unit";
let unitOn: boolean | null = null;
const loadLabelUnit = (): boolean => { try { return localStorage.getItem(UNIT_KEY) === "1"; } catch { return false; } };

export function setLabelUnit(on: boolean): void {
  unitOn = on;
  try { localStorage.setItem(UNIT_KEY, on ? "1" : "0"); } catch { /* Private mode: the choice lasts for this visit. */ }
  listeners.forEach((l) => l());
}

export function useLabelUnit(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (unitOn ??= loadLabelUnit()),
    () => (unitOn ??= loadLabelUnit()),
  );
}
