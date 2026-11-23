// Engineering camera (spec 009): batches of construction photos placed on a drawing, for 照片保存卡.

/** The whiteboard drawn onto a photo at export (定案 5): its text and where it sits. */
export type Whiteboard = {
  /** 施工項目 */
  item: string;
  /** 施工位置 (filled from the drawing, editable) */
  place: string;
  /** 查驗日期 in ROC form, e.g. "109.10.15" (was 施工日期; 用戶 2026-11-23：「施工日期改查驗日期」) */
  date: string;
  /** 查驗人員 typed name; a signer's signature is drawn instead when signerId is set */
  inspector: string;
  signerId?: string;
  /** top-left corner as a fraction of the photo width / height */
  x: number;
  y: number;
  /** board width as a fraction of the photo width */
  width: number;
  /** writing of the values: 落雁體 handwriting (default) or 黑體 (用戶 2026-11-23) */
  font?: BoardFont;
  /** how much 落雁體 is thickened (用戶 2026-11-23：原字／超細／細); 超細 when unset */
  weight?: BoardWeight;
  /** the ticked box of 施工前 / 施工中 / 施工後, none when unset (用戶 2026-11-23) */
  stage?: BoardStage;
};

export type BoardFont = "hand" | "sans";
export type BoardStage = "before" | "during" | "after";
export type BoardWeight = "plain" | "hairline" | "fine";

export type CameraBatch = {
  id: string;
  /** shown in lists and used as the ZIP / file base name, e.g. "8F室內隔間配管完成" */
  name: string;
  /** named by hand (用戶 2026-11-23：長按專案→修改名稱): 設定 keeps it instead of making it from date ＋ 施工項目 */
  nameEdited?: boolean;
  /** library entry of the drawing, when it came from the library */
  drawingId?: string;
  drawingName: string;
  /** reading-position key of the sheet the points belong to */
  viewKey: string;
  /** layout / space name ("Model" or a paper layout) */
  space: string;
  /** 公司名 (照片保存卡 heading) */
  company: string;
  /** 工程名稱 */
  project: string;
  /** 工種, e.g. "水電工程" (whiteboard title = project + trade) */
  trade: string;
  /** default 施工項目 for new photos */
  item: string;
  /** default 查驗人員 */
  inspector: string;
  signerId?: string;
  /** date printed on the 照片保存卡 heading, ROC form; empty = the day it is made */
  cardDate: string;
  /** whiteboard writing, set in 設定 (用戶 2026-11-23：「切換字體也是白板那邊設定就好」「字體粗細也是在白板設定那邊能調整」);
   * 落雁體 and 超細 when unset */
  boardFont?: BoardFont;
  boardWeight?: BoardWeight;
  /** size of the photo markers on screen and on the 對位圖 (1 = normal) */
  markerScale?: number;
  /** the demo project shipped with the app: never deleted (用戶 2026-11-23：「這專案畫面沒看到範例」) */
  demo?: true;
  createdAt: number;
  updatedAt: number;
};

/** A place on the drawing where photos were taken. */
export type ShotPoint = {
  id: string;
  batchId: string;
  /** photo number on the drawing (1, 2, …); always 1..n without gaps inside a batch */
  no: number;
  /** drawing coordinates */
  x: number;
  y: number;
  /** viewing direction in degrees, counter-clockwise from +X (drawing coordinates) */
  angle: number;
  /** 施工位置 suggested for photos taken here */
  place: string;
  /** part of the demo project: never deleted */
  demo?: true;
};

export type PhotoRecord = {
  id: string;
  batchId: string;
  /** null = not placed yet (未定位) */
  pointId: string | null;
  takenAt: number;
  width: number;
  height: number;
  /** original JPEG size in bytes */
  bytes: number;
  board: Whiteboard;
  /** part of the demo project: never deleted */
  demo?: true;
};

/** A signature kept for an inspector (定案 6): strokes in a unit box, drawn as ink at export. */
export type Signer = {
  id: string;
  name: string;
  /** width / height of the box the strokes were drawn in */
  aspect: number;
  /** strokes as flat [x0, y0, x1, y1, …] lists, 0..1 inside the box */
  strokes: number[][];
  createdAt: number;
};
