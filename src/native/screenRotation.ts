// Turning the phone sideways while the camera is open (用戶 2026-11-23：「進到拍照模式下，支援螢幕橫向自動轉向」).
// Everywhere else a phone stays upright: the APP is locked to portrait (MainActivity) and the web shows the "turn it
// upright" notice (RotateNotice). While the camera screen is open both let go: the APP asks Android to follow the
// sensor (ScreenRotationPlugin), the web hides the notice.
import { Capacitor, registerPlugin } from "@capacitor/core";

export const ROTATE_ALLOW_EVENT = "fatcat-rotate-allow";

interface ScreenRotationPlugin {
  allow(options: { on: boolean }): Promise<void>;
}
const plugin = registerPlugin<ScreenRotationPlugin>("ScreenRotation");

let allowed = false;

/** Whether the phone may be sideways now (the camera is open). */
export function rotationAllowed(): boolean {
  return allowed;
}

/** Let the phone turn sideways (true) or back to upright only (false). */
export function allowRotation(on: boolean): void {
  allowed = on;
  if (typeof dispatchEvent === "function") dispatchEvent(new Event(ROTATE_ALLOW_EVENT));
  if (Capacitor.isNativePlatform()) void plugin.allow({ on }).catch(() => { /* older APP without the plugin: stays upright */ });
}
