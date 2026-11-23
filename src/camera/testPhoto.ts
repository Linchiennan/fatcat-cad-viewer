// Test photo for the computer version (用戶 2026-11-22「電腦版的你內建一張測試用照片」): a computer has no back camera,
// so the camera screen shows this picture and the shutter "takes" it, to try the whole flow on a PC. Drawn here (a
// concrete wall with pipes and steel studs, 3264 × 1840 like a phone photo) so no real site photo is shipped.

export const TEST_PHOTO_SIZE = { width: 3264, height: 1840 } as const;

/** Computers (fine pointer, not the Android app) use the test photo instead of a camera. */
export function usesTestPhoto(native: boolean): boolean {
  if (native) return false;
  try { return typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches && !matchMedia("(pointer: coarse)").matches; } catch { return false; }
}

/** Paint the test scene; `shot` (1, 2, …) moves the view a little so every photo differs. */
export function paintTestScene(ctx: CanvasRenderingContext2D, w: number, h: number, shot = 1): void {
  // concrete wall with soft shading and speckles (seeded, so the picture is the same each time)
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#9c9a94"); g.addColorStop(1, "#7d7b76");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 10, 2 + rnd() * 10);
  }
  const dx = ((shot - 1) % 4) * w * 0.03;
  // floor slab
  ctx.fillStyle = "#6e6c68"; ctx.fillRect(0, h * 0.86, w, h * 0.14);
  // light gauge steel studs
  for (let i = 0; i < 6; i++) {
    const x = w * (0.42 + i * 0.09) + dx;
    const sg = ctx.createLinearGradient(x, 0, x + w * 0.018, 0);
    sg.addColorStop(0, "#c9ced3"); sg.addColorStop(0.5, "#eef1f4"); sg.addColorStop(1, "#a9afb6");
    ctx.fillStyle = sg; ctx.fillRect(x, 0, w * 0.018, h * 0.86);
  }
  // orange drain pipes and red / green water pipes
  const pipe = (y: number, thick: number, color: string, shade: string) => {
    const pg = ctx.createLinearGradient(0, y, 0, y + thick);
    pg.addColorStop(0, shade); pg.addColorStop(0.45, color); pg.addColorStop(1, shade);
    ctx.fillStyle = pg; ctx.fillRect(0, y, w, thick);
  };
  pipe(h * 0.08, h * 0.07, "#f07a32", "#b8521c");
  pipe(h * 0.22, h * 0.06, "#f07a32", "#b8521c");
  pipe(h * 0.36, h * 0.022, "#2f8f4e", "#1d5e32");
  pipe(h * 0.42, h * 0.022, "#d8342a", "#931e17");
  // a riser down to the floor
  ctx.fillStyle = "#d8342a"; ctx.fillRect(w * 0.63 + dx, h * 0.42, h * 0.022, h * 0.44);
  ctx.fillStyle = "#2f8f4e"; ctx.fillRect(w * 0.66 + dx, h * 0.36, h * 0.022, h * 0.5);
  // label so nobody mistakes it for a real site photo
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(w * 0.70, h * 0.03, w * 0.28, h * 0.07);
  ctx.fillStyle = "#fff"; ctx.font = `700 ${h * 0.04}px "FatCat Sans", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`測試照片 ${shot}`, w * 0.84, h * 0.065);
}

/** The test photo as a JPEG, at phone-photo size. */
export function testPhoto(shot: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = TEST_PHOTO_SIZE.width; c.height = TEST_PHOTO_SIZE.height;
  paintTestScene(c.getContext("2d")!, c.width, c.height, shot);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("test photo failed"))), "image/jpeg", 0.92));
}

/** Guests (訪客試用, no sign-in) shoot the bundled demo site photos in turn instead of a camera (用戶 2026-11-23：「要加
 * 預設照片」): no camera permission, the same pictures for everyone. Drawn, not real site photos (the site is public). */
export const GUEST_PHOTOS = [1, 2, 3, 4].map((n) => `./demo/camera/demo-photo-${n}.jpg`);
export async function guestPhoto(shot: number): Promise<Blob> {
  const res = await fetch(GUEST_PHOTOS[(Math.max(1, shot) - 1) % GUEST_PHOTOS.length]);
  if (!res.ok) return testPhoto(shot); // missing on this build: fall back to the drawn test scene
  return res.blob();
}
