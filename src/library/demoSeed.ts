// Demo drawings (web/demo) in the library: the guest gets them in a throw-away library, and the signed-in web version
// keeps them too (用戶 2026-11-23：「有登入的正式版，依樣保留範例，而且不讓客戶刪除」). They are marked demo, so the
// library never deletes or replaces them, and dated 2026-10-29 so the customer's own files sort above them.
import { DEMO_FILES } from "../auth/guestMode";
import { importDrawingToLibrary, listLibraryDrawings, migrateLegacyLibrary, ROOT_ID } from "./drawingLibrary";

/** The day the demos were made: older than anything a customer adds, so 最新優先 keeps them at the bottom. */
export const DEMO_DATE = Date.UTC(2026, 9, 29);

/**
 * Add the demo drawings that are not in the library yet; returns how many were added. A missing file is skipped.
 * `opened` puts them in 最近開啟 (the guest starts with them there).
 */
export async function seedDemoDrawings(opened = false): Promise<number> {
  // an old library moves over only into an empty one: let that happen first
  await migrateLegacyLibrary().catch(() => {});
  const have = new Set((await listLibraryDrawings()).filter((e) => e.demo).map((e) => e.name));
  let n = 0;
  for (const name of [...DEMO_FILES].reverse()) { // the plan last, so it heads 最近開啟
    if (have.has(name)) continue;
    try {
      const res = await fetch(`./demo/${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      await importDrawingToLibrary(new File([blob], name, { type: blob.type, lastModified: DEMO_DATE }), ROOT_ID, undefined, { at: DEMO_DATE, opened });
      n++;
    } catch { /* the other demos still come */ }
  }
  return n;
}
