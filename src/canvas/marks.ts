// Text markup changes asked by the App (T15 2.3-7/8, 8-4): add a text, change or delete one.
import type { DrawingPoint } from "../types/drawing";
import type { Mark } from "../viewer/markup";

export type MarkEdit =
  | { add: { at: DrawingPoint; text: string; width?: number; color: string; size: number } }
  /** Empty text deletes the mark. */
  | { edit: { index: number; text: string; color?: string; size?: number } };

/** The new list, or the same list when nothing changes (blank text, bad index, camera not ready). */
export function applyMarkEdit(marks: readonly Mark[], change: MarkEdit): Mark[] {
  const list = marks as Mark[];
  if ("add" in change) {
    const { at, width, color, size } = change.add, text = change.add.text.trim();
    if (!text || !(size > 0) || !Number.isFinite(size) || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return list;
    const mark: Mark = { kind: "text", color, at: { x: at.x, y: at.y }, text, size, ...(width && width > 0 ? { width } : {}) };
    return [...marks, mark];
  }
  const { index, text } = change.edit, old = marks[index];
  if (!old || old.kind !== "text") return list;
  const trimmed = text.trim();
  if (!trimmed) return marks.filter((_, i) => i !== index);
  const color = change.edit.color ?? old.color;
  const size = change.edit.size && change.edit.size > 0 && Number.isFinite(change.edit.size) ? change.edit.size : old.size;
  if (trimmed === old.text && color === old.color && size === old.size) return list;
  return marks.map((m, i) => (i === index ? { ...old, text: trimmed, color, size } : m));
}
