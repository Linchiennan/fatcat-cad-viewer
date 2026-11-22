// 施工位置 suggested for a photo point (spec 009 定案 5): floor from the drawing name, unit and room from the nearest
// texts on the drawing — "8F-A 戶 主浴" as written on the 8F 隔間請款 whiteboards. Always editable by the user.

export type PlaceText = { text: string; x: number; y: number };

const FLOOR = /(?:^|[^A-Za-z0-9])(B\d{1,2}F|\d{1,3}F|R\d?F|PRF)(?![A-Za-z0-9])/i;
/** room names on Taiwanese plans (longest first so 主臥 wins over 臥) */
const ROOM = /(工作陽台|客餐廳|更衣室|儲藏室|梯廳|主臥|主浴|公浴|次浴|客廳|餐廳|廚房|陽台|玄關|書房|和室|浴室|走道|機房|臥\s*\d?|浴|廁)/;
/** unit labels such as "8A", "12C" (floor number + letter) */
const UNIT = /^\s*(\d{1,3})\s*([A-Z])\s*$/;

/** "8F" from "8F-室內隔間對位圖", "B2F" from "B2F施工圖"; "" when the name has no floor. */
export function floorOf(drawingName: string): string {
  return FLOOR.exec(drawingName.replace(/\.[^.]+$/, ""))?.[1].toUpperCase() ?? "";
}

function nearest(texts: readonly PlaceText[], at: { x: number; y: number }, radius: number, pick: (t: string) => string | null): string {
  let best = "", dist = radius;
  for (const t of texts) {
    const v = pick(t.text);
    if (!v) continue;
    const d = Math.hypot(t.x - at.x, t.y - at.y);
    if (d <= dist) { dist = d; best = v; }
  }
  return best;
}

/**
 * Place text for a point. Radii are in drawing units (centimetres on most Taiwanese plans): a room label within
 * 8 m, a unit label within 30 m.
 */
export function placeName(drawingName: string, at: { x: number; y: number }, texts: readonly PlaceText[], radius = { room: 800, unit: 3000 }): string {
  const floor = floorOf(drawingName);
  const room = nearest(texts, at, radius.room, (t) => {
    const s = t.replace(/\s+/g, "");
    if (s.length > 6) return null; // notes, not labels
    return ROOM.exec(s)?.[1].replace(/\s+/g, "") ?? null;
  });
  const unit = nearest(texts, at, radius.unit, (t) => {
    const m = UNIT.exec(t);
    if (!m) return null;
    return !floor || `${m[1]}F` === floor ? m[2] : null; // "8A" belongs to 8F
  });
  const head = floor && unit ? `${floor}-${unit} 戶` : floor || (unit ? `${unit} 戶` : "");
  return [head, room].filter(Boolean).join(" ");
}
