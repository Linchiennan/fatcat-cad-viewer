// 訪客試用（用戶 2026-10-29）：網頁版不登入也能進，但只能開內建示範圖；量測、註記、輸出照常，關掉分頁就清空。
// The choice lives in this tab's sessionStorage and takes effect on a reload, so every module starts clean on the
// guest's in-memory storage and nothing from the signed-in library is ever open in the same page.
import { IS_WEB_BUILD } from "../app/platform";

const FLAG = "fatcat:guest";

function flagged(): boolean {
  try { return sessionStorage.getItem(FLAG) === "1"; } catch { return false; }
}

/** This page runs as a guest (web build only; the APK never has a guest mode). */
export const IS_GUEST = IS_WEB_BUILD && flagged();

/** Bundled demo drawings under ./demo/, opened in this order. The frame is the plan's external reference. */
export const DEMO_FILES = ["示範-住宅平面.dwg", "示範-圖框.dwg", "示範-住宅平面.pdf"] as const;

export function enterGuest(): void {
  try { sessionStorage.setItem(FLAG, "1"); } catch { /* No session storage: stays on the sign-in page. */ }
  location.reload();
}

/** Back to the sign-in page; the guest's drawings, marks and exports go with the reload. */
export function leaveGuest(): void {
  try { sessionStorage.removeItem(FLAG); } catch { /* reload anyway */ }
  location.reload();
}
