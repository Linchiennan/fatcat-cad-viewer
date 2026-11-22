// One-finger pan on/off for every drawing on screen. Off while the engineering camera is open (用戶 2026-11-22：
// 「我要移動箭頭時，底圖不能跟著移；底圖不能單指滑動，要雙指」): one finger then only places, moves and turns the photo
// points, two fingers still pan and zoom the drawing. dxf-viewer rebuilds its OrbitControls per load, so the setting is
// kept here and applied to each new controls object (installViewerPatches) as well as to the live ones.
import { TOUCH } from "three";

type Controls = { touches?: { ONE: number; TWO: number } };
type Viewer = { controls?: Controls };

let oneFinger = true;
const viewers = new Set<Viewer>();

/** dxf-viewer's touch map with the current one-finger setting (ONE = -1 is "nothing" in OrbitControls). */
export function touchMap(one = oneFinger): { ONE: number; TWO: number } {
  return { ONE: one ? TOUCH.PAN : -1, TWO: TOUCH.DOLLY_PAN };
}

/** Called after every _CreateControls: remember the viewer and apply the setting to its new controls. */
export function applyTouchPan(viewer: Viewer): void {
  viewers.add(viewer);
  if (viewer.controls) viewer.controls.touches = touchMap();
}

/** Whether one finger pans the drawing (default yes). */
export function setOneFingerPan(on: boolean): void {
  oneFinger = on;
  for (const v of viewers) {
    if (!v.controls) { viewers.delete(v); continue; }
    v.controls.touches = touchMap(on);
  }
}

export function oneFingerPan(): boolean {
  return oneFinger;
}
