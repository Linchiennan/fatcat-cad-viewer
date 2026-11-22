// 對位箭頭動態圖塊 (用戶 2026-11-22：「這箭頭要跟範例一樣是動態圖塊，之後電腦才方便更改」).
// The example drawings mark photo points with the user's own dynamic block 「對位箭頭」 (layer 0-標示位置): attribute
// 「數字」 holds the marker text ("1x2", "4") and the dynamic rotation parameter 「角度1」 turns the wedge. Measured in
// ZWCAD on 8F-室內隔間對位圖.dwg: the wedge tip points at 角度1 + 180°, circle radius 53, tip at 53·√2 (same shape
// as ours). We do not ship the user's block; instead the export carries a LISP that, run in ZWCAD/AutoCAD on the
// original DWG, inserts that block (from the drawing, or from a DWG the user picks once) at every point.
import type { ShotPoint } from "./types";

export const ARROW_BLOCK = "對位箭頭";
export const ARROW_LAYER = "0-標示位置";
export const ARROW_TAG = "數字";
export const ARROW_ANGLE_PARAM = "角度1";

/** 角度1 (radians) for a point whose arrow tip points at `angle` degrees CCW in drawing coordinates. */
export function angleParam(angle: number): number {
  const d = (((angle + 180) % 360) + 360) % 360;
  return (d * Math.PI) / 180;
}

const num = (v: number) => (Math.round(v * 1e6) / 1e6).toString();
const str = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

/**
 * The LISP file (UTF-8 with BOM; ZWCAD and AutoCAD 2021+ read it). Loading it runs command FCARROWS once:
 * - the block comes from the drawing; if missing, the user picks a DWG that has it and its definitions are brought in;
 * - existing 「對位箭頭」 can be kept or deleted first (asked only when there are some);
 * - each point gets the block at its position, attribute 數字 = marker text, 角度1 = direction, scale = marker size;
 * - all of it is one undo step.
 */
export function arrowBlockLisp(points: readonly ShotPoint[], labels: ReadonlyMap<string, string>, opts: { scale?: number; title?: string } = {}): string {
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const data = [...points].sort((a, b) => a.no - b.no)
    .map((p) => `    (${num(p.x)} ${num(p.y)} ${str(labels.get(p.id) ?? String(p.no))} ${num(angleParam(p.angle))})`).join("\n");
  const lines = [
    `;; 大肥貓CAD看圖 工程相機：在原本的對位圖插入「${ARROW_BLOCK}」動態圖塊${opts.title ? `（${opts.title}）` : ""}`,
    ";; 用法：ZWCAD／AutoCAD 開原本的 DWG → 指令 APPLOAD（或把本檔拖進圖面）載入，會自動執行；之後可再打 FCARROWS。",
    ";; 每個位置：屬性「數字」＝編號（x 張數），動態參數「角度1」＝拍照方向，圖層「0-標示位置」。整批可用一次 U 復原。",
    "(vl-load-com)",
    "(setq fc:points (quote (",
    data,
    ")))",
    `(setq fc:block ${str(ARROW_BLOCK)} fc:layer ${str(ARROW_LAYER)} fc:tag ${str(ARROW_TAG)} fc:param ${str(ARROW_ANGLE_PARAM)} fc:scale ${num(scale)})`,
    "(defun fc:refs (/ ss i e out)",
    "  (setq out '() ss (ssget \"_X\" '((0 . \"INSERT\") (410 . \"Model\"))))",
    "  (if ss (progn (setq i 0)",
    "    (repeat (sslength ss)",
    "      (setq e (vlax-ename->vla-object (ssname ss i)) i (1+ i))",
    "      (if (= (strcase (vla-get-EffectiveName e)) (strcase fc:block)) (setq out (cons e out))))))",
    "  out)",
    "(defun fc:import (doc / f ref nm)",
    `  (alert ${str(`這張圖裡沒有「${ARROW_BLOCK}」圖塊。\n請選一個有這個圖塊的 DWG（例如以前的對位圖），只會帶入圖塊定義。`)})`,
    `  (setq f (getfiled ${str(`選擇有「${ARROW_BLOCK}」圖塊的 DWG`)} "" "dwg" 0))`,
    "  (if f (progn",
    "    (setq ref (vl-catch-all-apply 'vla-InsertBlock (list (vla-get-ModelSpace doc) (vlax-3d-point 0 0 0) f 1 1 1 0)))",
    "    (if (not (vl-catch-all-error-p ref)) (progn",
    "      (setq nm (vla-get-Name ref))",
    "      (vla-Delete ref)",
    "      (vl-catch-all-apply 'vla-Delete (list (vla-Item (vla-get-Blocks doc) nm)))))))",
    "  (tblsearch \"BLOCK\" fc:block))",
    "(defun fc:set (ref tag val param ang / )",
    "  (foreach a (vlax-invoke ref 'GetAttributes)",
    "    (if (= (strcase (vla-get-TagString a)) (strcase tag)) (vla-put-TextString a val)))",
    "  (foreach p (vlax-invoke ref 'GetDynamicBlockProperties)",
    "    (if (= (strcase (vla-get-PropertyName p)) (strcase param))",
    "      (vl-catch-all-apply 'vla-put-Value (list p (vlax-make-variant ang vlax-vbDouble))))))",
    "(defun c:FCARROWS (/ doc ms old ans n ref)",
    "  (setq doc (vla-get-ActiveDocument (vlax-get-acad-object)) ms (vla-get-ModelSpace doc))",
    "  (if (or (tblsearch \"BLOCK\" fc:block) (fc:import doc))",
    "    (progn",
    "      (vla-StartUndoMark doc)",
    "      (if (not (tblsearch \"LAYER\" fc:layer)) (vla-Add (vla-get-Layers doc) fc:layer))",
    "      (setq old (fc:refs))",
    "      (if old (progn",
    "        (initget \"Keep Delete\")",
    `        (setq ans (getkword (strcat ${str(`\n圖上已有 `)} (itoa (length old)) ${str(` 個「${ARROW_BLOCK}」，保留或先刪除？ [保留(Keep)/刪除(Delete)] <保留>: `)})))`,
    "        (if (= ans \"Delete\") (foreach e old (vla-Delete e)))))",
    "      (setq n 0)",
    "      (foreach p fc:points",
    "        (setq ref (vla-InsertBlock ms (vlax-3d-point (car p) (cadr p) 0) fc:block fc:scale fc:scale fc:scale 0))",
    "        (vla-put-Layer ref fc:layer)",
    "        (fc:set ref fc:tag (caddr p) fc:param (cadddr p))",
    "        (setq n (1+ n)))",
    "      (vla-EndUndoMark doc)",
    `      (princ (strcat ${str(`\n已插入 `)} (itoa n) ${str(` 個「${ARROW_BLOCK}」（圖層 ${ARROW_LAYER}）。`)})))`,
    `    (princ ${str(`\n沒有「${ARROW_BLOCK}」圖塊，未插入。`)}))`,
    "  (princ))",
    "(c:FCARROWS)",
    "(princ)",
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
