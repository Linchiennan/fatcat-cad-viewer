// Panel status line after each measuring tap (T16 2.6-1), for an App that keeps only
// MeasurementSettings: the canvas publishes what the last tap snapped to (or that no object was
// found) and the panel shows it until a setting changes.
import { useSyncExternalStore } from "react";
import type { MeasurePick } from "../types/engine";
import type { MeasurementSettings } from "../viewer/measurementGeometry";
import type { MeasureStatus } from "./measureState";

let current: MeasureStatus = "plane";
const listeners = new Set<() => void>();

export function publishPickStatus(status: MeasureStatus): void {
  if (status === current) return;
  current = status;
  for (const f of listeners) f();
}

/** Status for a tap: object / info mode → found or not; measuring → the snap kind, else the default. */
export function statusForPick(settings: MeasurementSettings, pick: MeasurePick): MeasureStatus {
  if (settings.info || settings.mode === "object") return pick.entity ? "plane" : "noObject";
  return pick.snap ?? "plane";
}

export const readPickStatus = () => current;

export function usePickStatus(): MeasureStatus {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, readPickStatus, readPickStatus);
}
