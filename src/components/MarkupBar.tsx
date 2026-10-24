import React, { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ComponentType, SVGProps } from "react";
import { MARK_COLORS, type MarkTool } from "../viewer/markup";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { IconTile } from "./IconTile";
import { ArrowIcon, ArrowLeftIcon, CheckIcon, CircleIcon, EllipseIcon, HandIcon, LineIcon, PenIcon, RectIcon, ShareIcon, TextBoxIcon, TextIcon, TrashIcon } from "./Icons";

type ToolFace = { tool: MarkTool; Icon: ComponentType<SVGProps<SVGSVGElement>> };
// Each slot holds one tool or a pair; tapping the pressed slot again switches to its other tool.
const SLOTS: ToolFace[][] = [
  [{ tool: "pen", Icon: PenIcon }, { tool: "line", Icon: LineIcon }, { tool: "arrow", Icon: ArrowIcon }],
  [{ tool: "rect", Icon: RectIcon }, { tool: "circle", Icon: CircleIcon }, { tool: "ellipse", Icon: EllipseIcon }],
  [{ tool: "text", Icon: TextIcon }, { tool: "mtext", Icon: TextBoxIcon }],
  [{ tool: "move", Icon: HandIcon }],
];
/** Dictionary key of a colour's name (MARK_COLORS names are zh-TW). */
const COLOR_KEYS: Record<string, TranslationKey> = {
  紅: "markup.color.red", 綠: "markup.color.green", 藍: "markup.color.blue", 黃: "markup.color.yellow", 橘: "markup.color.orange",
  紫: "markup.color.purple", 粉紅: "markup.color.pink", 白: "markup.color.white", 黑: "markup.color.black",
};
const COLORS_PER_PAGE = 3;

/** Markup tools under the header, icon-first: tools and colours on top, actions below. */
export function MarkupBar({ tool, color, count, sharing, onTool, onColor, onUndo, onClear, onShare, onDone }: {
  tool: MarkTool; color: string; count: number; sharing: boolean;
  onTool(t: MarkTool): void; onColor(c: string): void; onUndo(): void; onClear(): void; onShare(): void; onDone(): void;
}) {
  const { t } = useI18n();
  const toolText = (tool: MarkTool, part: "" | "Short" | "Tip") => t(`markup.tool.${tool}${part}` as TranslationKey);
  // Which face each paired slot shows when it is not selected (the last one used).
  const [faces, setFaces] = useState<number[]>(() => SLOTS.map(() => 0));
  return (
    <div className="markup-bar" role="toolbar" aria-label={t("markup.toolsLabel")}>
      <div className="markup-row">
        {SLOTS.map((slot, s) => {
          const active = slot.findIndex((f) => f.tool === tool);
          const face = slot[active >= 0 ? active : faces[s]];
          const pick = () => {
            const next = active >= 0 && slot.length > 1 ? (active + 1) % slot.length : (active >= 0 ? active : faces[s]);
            setFaces((list) => list.map((v, i) => (i === s ? next : v)));
            onTool(slot[next].tool);
          };
          return <IconTile key={s} name={toolText(face.tool, "")} label={toolText(face.tool, "Short")} tip={toolText(face.tool, "Tip")} pressed={active >= 0} onClick={pick}><face.Icon /></IconTile>;
        })}
        <span className="markup-sep" aria-hidden="true" />
        <ColorStrip color={color} onColor={onColor} />
      </div>
      <div className="markup-row">
        <IconTile name={t("markup.undo")} label={t("markup.undoShort")} tip={t("markup.undoTip")} disabled={!count} onClick={onUndo}><ArrowLeftIcon /></IconTile>
        <IconTile name={t("markup.clear")} label={t("markup.clearShort")} tip={t("markup.clearTip")} disabled={!count} onClick={onClear}><TrashIcon /></IconTile>
        <IconTile name={t("markup.share")} label={sharing ? t("markup.sharing") : t("markup.shareShort")} tip={t("markup.shareTip")} className="icon-tile markup-share" disabled={sharing} onClick={onShare}><ShareIcon /></IconTile>
        <IconTile name={t("markup.done")} label={t("markup.doneShort")} tip={t("markup.doneTip")} onClick={onDone}><CheckIcon /></IconTile>
      </div>
    </div>
  );
}

/**
 * Nine colours, three at a time. Swipe the strip left or right for the next three (a mouse can drag it);
 * dots under it show which three are on screen.
 */
function ColorStrip({ color, onColor }: { color: string; onColor(c: string): void }) {
  const { t } = useI18n();
  const colorName = (zh: string) => (COLOR_KEYS[zh] ? t(COLOR_KEYS[zh]) : zh);
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const pages = Math.ceil(MARK_COLORS.length / COLORS_PER_PAGE);
  const [page, setPage] = useState(0);
  const pageWidth = () => (row.current?.clientWidth ?? 0) + 6; // three swatches plus the 6 px gap after them
  const goTo = (p: number, smooth = true) => row.current?.scrollTo({ left: Math.max(0, Math.min(pages - 1, p)) * pageWidth(), behavior: smooth ? "smooth" : "auto" });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    // Open on the page that holds the colour in use.
    const at = MARK_COLORS.findIndex((c) => c.value === color);
    if (at >= 0) goTo(Math.floor(at / COLORS_PER_PAGE), false);
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, pageWidth())));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !row.current) return; // fingers scroll natively
    drag.current = { x: e.clientX, left: row.current.scrollLeft, moved: false };
    row.current.classList.add("dragging");
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = row.current;
    if (!d || !el) return;
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    el.scrollLeft = d.left - (e.clientX - d.x);
  };
  const up = () => {
    const d = drag.current, el = row.current;
    if (!d || !el) return;
    el.classList.remove("dragging");
    goTo(Math.round(el.scrollLeft / Math.max(1, pageWidth())));
    if (d.moved) {
      const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 300);
    }
    drag.current = null;
  };
  return (
    <div className="markup-color-wrap">
      <div className="markup-colors" ref={row} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        {MARK_COLORS.map((c) => (
          <button key={c.value} type="button" className="markup-color" aria-pressed={color === c.value} aria-label={t("markup.colorName", { name: colorName(c.name) })} title={t("markup.colorLabel", { name: colorName(c.name) })} onClick={() => onColor(c.value)}>
            <i style={{ background: c.value }} />
          </button>
        ))}
      </div>
      <div className="markup-color-dots" aria-hidden="true">
        {Array.from({ length: pages }, (_, i) => <span key={i} className={i === page ? "on" : undefined} />)}
      </div>
    </div>
  );
}

/** Smallest height of the 多行 text box when dragged down. */
const MTEXT_MIN_HEIGHT = 150;

/** Box to type the text of a 字 / 多行 markup. */
/**
 * `initial` set: editing a text already on the drawing (OK replaces it; emptied, the button deletes it).
 * `multiline`: a 多行 text box — opens at half the screen with the white drag bar to resize it;
 * Enter starts a new line, 確定 (or Ctrl+Enter) finishes.
 */
export function MarkupTextDialog({ onOk, onCancel, initial, multiline, color }: { onOk(text: string): void; onCancel(): void; initial?: string; multiline?: boolean; color?: string }) {
  const { t } = useI18n();
  const editing = initial !== undefined;
  const [text, setText] = useState(initial ?? "");
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  // Tallest: the top edge stops at the bottom of the markup toolbar above (never covers its buttons).
  const maxHeight = () => {
    const d = box.current?.getBoundingClientRect(), bar = document.querySelector(".markup-bar")?.getBoundingClientRect();
    return Math.max(MTEXT_MIN_HEIGHT, d && bar ? d.bottom - bar.bottom : window.innerHeight - 200);
  };
  // Drag the bar up for a taller box, down to see more of the drawing.
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!box.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: box.current.getBoundingClientRect().height };
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) setHeight(Math.min(maxHeight(), Math.max(MTEXT_MIN_HEIGHT, drag.current.h - (e.clientY - drag.current.y))));
  };
  const endDrag = () => { drag.current = null; };
  useEffect(() => { input.current?.focus(); if (editing) input.current?.select(); }, [editing]);
  // Half the screen to start, but never over the toolbar on a short screen.
  useEffect(() => { if (multiline && box.current && box.current.getBoundingClientRect().height > maxHeight()) setHeight(maxHeight()); }, [multiline]);
  const buttons = <>
    <button type="button" className="markup-dialog-ok" disabled={!text.trim() && !editing} onClick={() => onOk(text)}>{editing && !text.trim() ? t("markup.delete") : t("markup.ok")}</button>
    <button type="button" className="markup-dialog-cancel" aria-label={t("markup.cancel")} onClick={onCancel}>✕</button>
  </>;
  return (
    // Two rows sitting right on the bottom buttons: the title, then the text box with 確定 and ✕.
    <div ref={box} className={`markup-dialog${multiline ? " multiline" : ""}`} role="dialog" aria-label={editing ? t("markup.editTitle") : t("markup.inputTitle")} style={multiline && height ? { height } : undefined}>
      {multiline ? <div className="panel-drag" role="separator" aria-orientation="horizontal" aria-label={t("markup.dragLabel")} title={t("markup.dragLabel")}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span /></div> : null}
      {multiline
        // 多行: 確定 and ✕ ride on the title line so the text area below gets all the room.
        ? <div className="markup-dialog-head"><strong className="markup-dialog-title">{editing ? t("markup.editTitle") : t("markup.inputMultiTitle")}</strong>{buttons}</div>
        : <strong className="markup-dialog-title">{editing ? t("markup.editTitle") : t("markup.inputTitle")}</strong>}
      <div className="markup-dialog-row">
        {multiline
          ? <textarea ref={input} value={text} style={{ color }} maxLength={400} placeholder={t("markup.placeholderMulti")} aria-label={t("markup.textLabel")}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && (text.trim() || editing)) onOk(text); }} />
          : <input ref={input} value={text} style={{ color }} maxLength={80} placeholder={t("markup.placeholder")} aria-label={t("markup.textLabel")}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (text.trim() || editing)) onOk(text); }} />}
        {multiline ? null : buttons}
      </div>
    </div>
  );
}
