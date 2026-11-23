// Photos of a batch (spec 009): the unplaced (未定位) ones first, then the placed ones by number (用戶 2026-11-23：
// 「排序把未定位的改到最上面」). Each can get its whiteboard
// text edited, be put on the selected spot, or be deleted.
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/translations";
import { readPhotoOriginal } from "./batchStore";
import { cardLabel, cardOrder, photoLabels } from "./numbering";
import { StageTicks } from "./StageTicks";
import type { CameraBatch, PhotoRecord, ShotPoint, Whiteboard } from "./types";

const thumbs = new Map<string, string>();

/** Small preview of an original (kept for the session). */
async function thumbnail(id: string): Promise<string> {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const bmp = await createImageBitmap(await readPhotoOriginal(id));
  const w = 160, h = Math.max(1, Math.round((bmp.height / bmp.width) * w));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const url = await new Promise<string>((resolve) => c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ""), "image/jpeg", 0.7));
  thumbs.set(id, url);
  return url;
}

function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState(thumbs.get(id) ?? "");
  useEffect(() => { let live = true; if (!src) void thumbnail(id).then((u) => live && setSrc(u)).catch(() => {}); return () => { live = false; }; }, [id, src]);
  return src ? <img className="camera-thumb" src={src} alt="" /> : <span className="camera-thumb" />;
}

export function PhotoList({ points, photos, selected, onPlace, onEdit, onDelete }: {
  batch: CameraBatch; points: readonly ShotPoint[]; photos: readonly PhotoRecord[]; selected: ShotPoint | null;
  onPlace(photo: PhotoRecord): void; onEdit(photo: PhotoRecord, board: Whiteboard): void; onDelete(photo: PhotoRecord): void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const labels = photoLabels(points, photos);
  const placed = cardOrder(points, photos), loose = photos.filter((p) => !p.pointId);
  const row = (ph: PhotoRecord) => {
    const l = labels.get(ph.id);
    return (
      // a card: the number on the top-left corner of the photo, place in bold, item and date below
      // (用戶 2026-11-23 白板 #5：「去美化，並把數字改到最左上」)
      <li key={ph.id} className={"camera-photo" + (l ? "" : " loose")}>
        <div className="camera-photo-pic">
          <Thumb id={ph.id} />
          <b className="camera-photo-no">{l ? cardLabel(l) : t("camera.unplacedTag")}</b>
        </div>
        <div className="camera-photo-info">
          <strong>{ph.board.place || "—"}</strong>
          <small>{[ph.board.item, ph.board.date].filter(Boolean).join(" · ")}</small>
          {editing === ph.id ? (
            <BoardForm board={ph.board} onSave={(b) => { setEditing(null); onEdit(ph, b); }} onCancel={() => setEditing(null)} />
          ) : (
            <div className="camera-actions">
              <button type="button" onClick={() => setEditing(ph.id)}>{t("camera.editBoard")}</button>
              {selected && ph.pointId !== selected.id ? <button type="button" onClick={() => onPlace(ph)}>{t("camera.placeHere")}</button> : null}
              <button type="button" className="camera-danger" onClick={() => onDelete(ph)}>{t("camera.deletePhoto")}</button>
            </div>
          )}
        </div>
      </li>
    );
  };
  return (
    <div className="camera-body">
      {/* no 取消 button: the X in the head goes back (用戶 2026-11-23：刪除) */}
      {loose.length ? <><h3>{t("camera.unplaced", { N: loose.length })}</h3><ul className="camera-photos">{loose.map(row)}</ul></> : null}
      <ul className="camera-photos">{placed.map(row)}</ul>
    </div>
  );
}

function BoardForm({ board, onSave, onCancel }: { board: Whiteboard; onSave(b: Whiteboard): void; onCancel(): void }) {
  const { t } = useI18n();
  const [b, setB] = useState(board);
  const f = (key: "item" | "place" | "date" | "inspector", label: string) => (
    <label key={key}>{label}<input value={b[key]} onChange={(e) => setB({ ...b, [key]: e.target.value })} /></label>
  );
  return (
    <form className="camera-board-form" onSubmit={(e) => { e.preventDefault(); onSave(b); }}>
      {f("item", t("camera.board.item"))}{f("place", t("camera.board.place"))}{f("date", t("camera.board.date"))}
      <span className="camera-board-form-label">{t("camera.board.stage")}</span>
      <StageTicks value={b.stage} onChange={(stage) => setB(({ stage: _old, ...rest }) => (stage ? { ...rest, stage } : rest))} />
      {f("inspector", t("camera.board.inspector"))}
      <div className="camera-actions"><button type="submit">{t("camera.save")}</button><button type="button" onClick={onCancel}>{t("camera.cancel")}</button></div>
    </form>
  );
}
