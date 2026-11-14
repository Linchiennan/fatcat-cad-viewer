// Pan inertia for dxf-viewer's OrbitControls.
// While a finger is down the drawing follows it 1:1 (the controls are untouched). After a one-finger
// flick the drawing keeps gliding at the release speed and slows down (iOS-like ~325ms decay).
// No glide after: a pinch, a zoom, a finger that stopped before lifting, prefers-reduced-motion,
// or when the controls are disabled (measuring / precise mode). Any new touch or the wheel stops it.

type Vec = { x: number; y: number };
type Controls = { target: Vec; enabled: boolean; update(): void; addEventListener(type: string, fn: () => void): void };
type Sample = { t: number; x: number; y: number };
type State = { frame: number; maxPointers: number; pts: Sample[]; stop(): void };
export type InertiaHost = { camera?: { position: Vec; zoom: number }; canvas?: HTMLCanvasElement; controls?: unknown; fatcatInertia?: State };

export const INERTIA_DECAY_MS = 325;
/** Window (ms) of movement before release used for the release speed. */
const WINDOW_MS = 80;
/** Finger slower than this (screen px per ms) at release: no glide. */
const MIN_FLICK_PX_MS = 0.3;
/** Glide ends below this speed (screen px per ms). */
const STOP_PX_MS = 0.02;

function trim(list: Sample[], now: number): void { while (list.length && now - list[0].t > 100) list.shift(); }

/** Call after every dxf-viewer _CreateControls (controls are rebuilt per load; the canvas is kept). */
export function installPanInertia(host: InertiaHost): void {
  const controls = host.controls as Controls | undefined, canvas = host.canvas, cam = host.camera;
  if (!controls || !canvas || !cam || typeof requestAnimationFrame !== "function") return;
  if (!host.fatcatInertia) {
    const active = new Set<number>();
    const st: State = { frame: 0, maxPointers: 0, pts: [], stop() { if (st.frame) { cancelAnimationFrame(st.frame); st.frame = 0; } } };
    canvas.addEventListener("pointerdown", (e) => { st.stop(); if (!active.size) { st.maxPointers = 0; st.pts = []; } active.add(e.pointerId); st.maxPointers = Math.max(st.maxPointers, active.size); }, true);
    canvas.addEventListener("pointermove", (e) => { if (!active.has(e.pointerId)) return; const t = performance.now(); st.pts.push({ t, x: e.clientX, y: e.clientY }); trim(st.pts, t); }, true);
    canvas.addEventListener("pointerup", (e) => { active.delete(e.pointerId); }, true);
    canvas.addEventListener("pointercancel", (e) => { active.delete(e.pointerId); st.maxPointers = 99; }, true);
    canvas.addEventListener("wheel", () => st.stop(), { passive: true });
    host.fatcatInertia = st;
  }
  const st = host.fatcatInertia;
  let samples: Sample[] = [], zoom0 = 0, dragging = false;
  controls.addEventListener("start", () => { st.stop(); dragging = true; samples = []; zoom0 = cam.zoom; });
  controls.addEventListener("change", () => {
    if (!dragging) return;
    const t = performance.now();
    samples.push({ t, x: cam.position.x, y: cam.position.y }); trim(samples, t);
  });
  controls.addEventListener("end", () => {
    dragging = false;
    const now = performance.now();
    if (st.maxPointers !== 1 || cam.zoom !== zoom0 || !controls.enabled) return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const world = samples.filter((s) => now - s.t <= WINDOW_MS), screen = st.pts.filter((s) => now - s.t <= WINDOW_MS);
    if (world.length < 2 || screen.length < 2 || now - world[world.length - 1].t > 40) return;
    const a = world[0], b = world[world.length - 1], dt = b.t - a.t;
    const pa = screen[0], pb = screen[screen.length - 1];
    const pxSpeed = Math.hypot(pb.x - pa.x, pb.y - pa.y) / Math.max(1, pb.t - pa.t);
    if (dt < 8 || pxSpeed < MIN_FLICK_PX_MS) return;
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; // world units per ms
    const pxPerWorld = pxSpeed / Math.max(1e-12, Math.hypot(vx, vy));
    let last = now;
    const step = (t: number) => {
      const ms = Math.min(32, Math.max(0, t - last)); last = t;
      const dx = vx * ms, dy = vy * ms;
      cam.position.x += dx; cam.position.y += dy; controls.target.x += dx; controls.target.y += dy;
      controls.update();
      const k = Math.exp(-ms / INERTIA_DECAY_MS); vx *= k; vy *= k;
      st.frame = Math.hypot(vx, vy) * pxPerWorld > STOP_PX_MS ? requestAnimationFrame(step) : 0;
    };
    st.frame = requestAnimationFrame(step);
  });
}
