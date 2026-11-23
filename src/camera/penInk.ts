// Fountain-pen ink for the inspector's signature (用戶 2026-11-23：「電子簽名的筆觸改成鋼筆」). The stroke is kept as
// points only (no time), so speed is read from the spacing of the samples: slow = wide, fast = thin. Smoothed through
// the midpoints, tapered at the start and flicked thin at the end, a little wider across the nib (45°) than along it.
// The same drawing is used on the pad, on the whiteboard and in the exports, for old and new signatures alike.

type P = { x: number; y: number };

/** Width factor for a sample spacing `dn` (distance / box height): slow strokes swell, fast ones thin out. */
export function speedWidth(dn: number): number {
  return Math.min(1.3, Math.max(0.5, 1.3 / (1 + dn * 30)));
}

/** Nib factor for a stroke direction (radians): an italic-leaning nib held at 45°. */
export function nibWidth(theta: number): number {
  return 0.78 + 0.22 * Math.abs(Math.sin(theta - Math.PI / 4));
}

/** Points along the stroke smoothed through segment midpoints (quadratic curves), each with its width. */
export function penOutline(pts: readonly P[], boxH: number, base: number): { x: number; y: number; w: number }[] {
  const n = pts.length;
  if (n < 2) return n ? [{ ...pts[0], w: base }] : [];
  // raw widths: speed and nib, eased so a single fast sample does not pinch the line
  const raw: number[] = [];
  let w = speedWidth(0.01);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b.x - a.x, b.y - a.y) / (i === 0 || i === n - 1 ? 1 : 2);
    const target = speedWidth(d / Math.max(boxH, 1)) * nibWidth(Math.atan2(b.y - a.y, b.x - a.x));
    w = i === 0 ? target : w + (target - w) * 0.4;
    raw.push(w);
  }
  // taper: the pen lands (start) and lifts with a flick (end)
  const ramp = (i: number) => Math.min(1, 0.45 + 0.55 * (i / Math.min(3, n - 1)), 0.25 + 0.75 * ((n - 1 - i) / Math.min(4, n - 1)));
  const widths = raw.map((v, i) => v * ramp(i) * base);
  // smooth: quadratic curves from midpoint to midpoint with the sample as control point
  const out: { x: number; y: number; w: number }[] = [{ ...pts[0], w: widths[0] }];
  for (let i = 1; i < n - 1; i++) {
    const p0 = i === 1 ? pts[0] : mid(pts[i - 1], pts[i]), p1 = pts[i], p2 = mid(pts[i], pts[i + 1]);
    const w0 = i === 1 ? widths[0] : (widths[i - 1] + widths[i]) / 2, w2 = (widths[i] + widths[i + 1]) / 2;
    const steps = Math.max(2, Math.min(12, Math.ceil(Math.hypot(p2.x - p0.x, p2.y - p0.y) / 2)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      out.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        w: u * u * w0 + 2 * u * t * widths[i] + t * t * w2,
      });
    }
  }
  out.push({ ...pts[n - 1], w: widths[n - 1] });
  return out;
}

const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Fill one stroke as ink: the band between the left and right edges, with round ends. */
export function drawPenStroke(ctx: CanvasRenderingContext2D, pts: readonly P[], boxH: number, base: number): void {
  const line = penOutline(pts, boxH, base);
  if (!line.length) return;
  ctx.beginPath();
  if (line.length === 1) { ctx.arc(line[0].x, line[0].y, line[0].w / 2, 0, Math.PI * 2); ctx.fill(); return; }
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, h = line[i].w / 2;
    left.push({ x: line[i].x + nx * h, y: line[i].y + ny * h }); right.push({ x: line[i].x - nx * h, y: line[i].y - ny * h });
  }
  ctx.moveTo(left[0].x, left[0].y);
  for (const q of left) ctx.lineTo(q.x, q.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
  for (const end of [line[0], line[line.length - 1]]) { ctx.beginPath(); ctx.arc(end.x, end.y, end.w / 2, 0, Math.PI * 2); ctx.fill(); }
}

/** All strokes of a signature (flat [x0, y0, x1, y1, …] lists, 0..1 in a w × h box at x, y) in pen ink. */
export function drawPenSignature(ctx: CanvasRenderingContext2D, strokes: readonly number[][], x: number, y: number, w: number, h: number, base: number, ink = "#10105a"): void {
  ctx.save();
  ctx.fillStyle = ink;
  for (const s of strokes) {
    const pts: P[] = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push({ x: x + s[i] * w, y: y + s[i + 1] * h });
    drawPenStroke(ctx, pts, h, base);
  }
  ctx.restore();
}
