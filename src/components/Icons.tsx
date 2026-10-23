// Line icons, 24×24, stroke 1.8, round caps and joins, colour = currentColor (T18 8-2). Owner: P4 group D.
// Names are fixed by our components; shapes are drawn fresh for this app.
import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

/** Shared frame: decorative unless the caller gives it a name. */
function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

/** 關閉 ✕ */
export function CloseIcon(props: IconProps) { return <Svg {...props}><path d="M6 6l12 12M18 6L6 18" /></Svg>; }
/** 眼睛加斜線（隱藏圖層） */
export function EyeOffIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12z" /><circle cx="12" cy="12" r="2.6" /><path d="M4 4l16 16" /></Svg>;
}
/** 向左箭頭 */
export function ArrowLeftIcon(props: IconProps) { return <Svg {...props}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>; }
/** 向右 › */
export function ChevronRightIcon(props: IconProps) { return <Svg {...props}><path d="M9 5l7 7-7 7" /></Svg>; }
/** 加號 */
export function PlusIcon(props: IconProps) { return <Svg {...props}><path d="M12 4.5v15M4.5 12h15" /></Svg>; }
/** 垃圾桶 */
export function TrashIcon(props: IconProps) {
  return <Svg {...props}><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.5h9l1-12.5M10.2 10.5v5.8M13.8 10.5v5.8" /></Svg>;
}
/** 橡皮擦 */
export function EraserIcon(props: IconProps) {
  return <Svg {...props}><path d="M14.5 4.5l5 5-8.5 8.5H6.8l-2.6-2.6a1.4 1.4 0 010-2z" /><path d="M9.6 9.4l5 5M11 18h8.5" /></Svg>;
}
/** 勾 */
export function CheckIcon(props: IconProps) { return <Svg {...props}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>; }
/** 滑鼠箭頭 */
export function PointerIcon(props: IconProps) {
  return <Svg {...props}><path d="M6 3.8l12 7.4-5.3 1.3 3.1 5.6-2.4 1.3-3.1-5.6L6.4 17.6z" /></Svg>;
}
/** 直尺（量測） */
export function RulerIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.6 16.4L16.4 3.6l4 4L7.6 20.4z" /><path d="M7.2 12.8l2 2M9.9 10.1l1.4 1.4M12.6 7.4l2 2M15.3 4.7l1.4 1.4" /></Svg>;
}
/** 放大鏡（搜尋） */
export function SearchIcon(props: IconProps) { return <Svg {...props}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Svg>; }
/** 圓內 i（資訊） */
export function InfoIcon(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.6" /><circle cx="12" cy="7.8" r="0.4" fill="currentColor" /></Svg>;
}
/** 齒輪（單位設定） */
export function GearIcon(props: IconProps) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    return `M${(12 + 6.4 * c).toFixed(2)} ${(12 + 6.4 * s).toFixed(2)}L${(12 + 8.8 * c).toFixed(2)} ${(12 + 8.8 * s).toFixed(2)}`;
  }).join("");
  return <Svg {...props}><circle cx="12" cy="12" r="6.2" /><circle cx="12" cy="12" r="2.6" /><path d={teeth} strokeWidth={2.4} /></Svg>;
}
/** 標註線 |↔|（距離） */
export function DistanceIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 7v10M20.5 7v10M6.5 12h11M9 9.5L6.5 12 9 14.5M15 9.5l2.5 2.5-2.5 2.5" /></Svg>;
}
/** 折線過點（總長） */
export function PathIcon(props: IconProps) {
  return <Svg {...props}><path d="M4.5 17.5l5-8 5 6 5-9" /><circle cx="4.5" cy="17.5" r="1.6" fill="currentColor" /><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor" /><circle cx="14.5" cy="15.5" r="1.6" fill="currentColor" /><circle cx="19.5" cy="6.5" r="1.6" fill="currentColor" /></Svg>;
}
/** 多邊形斜線（面積） */
export function AreaIcon(props: IconProps) {
  return <Svg {...props}><path d="M5 8.5L11 4l8 4.5-1.5 10.5H6.5z" /><path d="M8 14.5l5-5M9.5 17.5l7-7M12.5 18.5l4.6-4.6" /></Svg>;
}
/** 角＋弧（角度） */
export function AngleIcon(props: IconProps) {
  return <Svg {...props}><path d="M19.5 19H4.5L15.5 5" /><path d="M10.5 19a6 6 0 00-2.3-4.7" /></Svg>;
}
/** 鉛筆 */
export function PenIcon(props: IconProps) {
  return <Svg {...props}><path d="M15.5 4.5l4 4L8.5 19.5 3.8 20.2l.7-4.7z" /><path d="M13.5 6.5l4 4" /></Svg>;
}
/** 直線（兩端圓點） */
export function LineIcon(props: IconProps) {
  return <Svg {...props}><path d="M6.4 17.6L17.6 6.4" /><circle cx="5.2" cy="18.8" r="1.8" fill="currentColor" /><circle cx="18.8" cy="5.2" r="1.8" fill="currentColor" /></Svg>;
}
/** 箭頭（斜向右上） */
export function ArrowIcon(props: IconProps) { return <Svg {...props}><path d="M5 19L18.5 5.5M10 5.5h8.5V14" /></Svg>; }
/** 方框 */
export function RectIcon(props: IconProps) { return <Svg {...props}><rect x="4" y="6" width="16" height="12" rx="1.2" /></Svg>; }
/** 正圓 */
export function CircleIcon(props: IconProps) { return <Svg {...props}><circle cx="12" cy="12" r="8" /></Svg>; }
/** 橢圓 */
export function EllipseIcon(props: IconProps) { return <Svg {...props}><ellipse cx="12" cy="12" rx="9" ry="5.6" /></Svg>; }
/** 文字 T */
export function TextIcon(props: IconProps) { return <Svg {...props}><path d="M5 6.5V4.8h14v1.7M12 4.8v14.4M9 19.2h6" /></Svg>; }
/** 虛線框內三行字（多行文字） */
export function TextBoxIcon(props: IconProps) {
  return <Svg {...props}><rect x="3.5" y="4" width="17" height="16" rx="1.5" strokeDasharray="2.4 2.2" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" /></Svg>;
}
/** 手掌（移動） */
export function HandIcon(props: IconProps) {
  return <Svg {...props}><path d="M8 12.5V6.2a1.4 1.4 0 012.8 0V11M10.8 10.5V4.8a1.4 1.4 0 012.8 0v5.7M13.6 10.5V6a1.4 1.4 0 012.8 0v5.5M16.4 11V8.6a1.4 1.4 0 012.8 0v5.9c0 3.6-2.6 6-6.2 6h-1.2c-2.2 0-3.6-.9-4.9-2.5l-3.1-4a1.5 1.5 0 012.3-1.9L8 14" /></Svg>;
}
/** 分享（三圓點兩連線） */
export function ShareIcon(props: IconProps) {
  return <Svg {...props}><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9" /></Svg>;
}
/** 資料夾內含勾 */
export function FolderCheckIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 7.5V18a1.5 1.5 0 001.5 1.5h14a1.5 1.5 0 001.5-1.5V9a1.5 1.5 0 00-1.5-1.5h-7L10 5H5a1.5 1.5 0 00-1.5 1.5z" /><path d="M8.8 13.4l2.2 2.2 4.2-4.2" /></Svg>;
}
/** 打開的資料夾 */
export function FolderOpenIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 18V6.5A1.5 1.5 0 015 5h5l2 2.5h6a1.5 1.5 0 011.5 1.5v1.5" /><path d="M3.5 18l2.6-6.6a1.5 1.5 0 011.4-.9h13.3a1 1 0 01.9 1.4L19 18.6a1.5 1.5 0 01-1.4.9H5a1.5 1.5 0 01-1.5-1.5z" /></Svg>;
}
/** 一般資料夾 */
export function FolderIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 7.5V18a1.5 1.5 0 001.5 1.5h14a1.5 1.5 0 001.5-1.5V9a1.5 1.5 0 00-1.5-1.5h-7L10 5H5a1.5 1.5 0 00-1.5 1.5z" /></Svg>;
}
/** 圖檔 */
export function FileIcon(props: IconProps) {
  return <Svg {...props}><path d="M6 3.5h8l4.5 4.5v11A1.5 1.5 0 0117 20.5H6A1.5 1.5 0 014.5 19V5A1.5 1.5 0 016 3.5z" /><path d="M13.5 3.5V8.5h5M8 12.5h7M8 16h5" /></Svg>;
}
/** ⋯更多 */
export function MoreIcon(props: IconProps) {
  return <Svg {...props}><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></Svg>;
}
/** 匯入 */
export function ImportIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" /><path d="M4.5 15.5V19a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-3.5" /></Svg>;
}
/** 重新命名 */
export function RenameIcon(props: IconProps) {
  return <Svg {...props}><path d="M4 19.5h16" /><path d="M14.5 4.5l3.5 3.5-8.5 8.5H6v-3.5z" /></Svg>;
}
/** 複製 */
export function CopyIcon(props: IconProps) {
  return <Svg {...props}><rect x="8.5" y="8.5" width="11" height="11" rx="1.6" /><path d="M15.5 8.5V6A1.5 1.5 0 0014 4.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5" /></Svg>;
}
/** 移動 */
export function MoveIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 8V18a1.5 1.5 0 001.5 1.5h7" /><path d="M3.5 8V6.5A1.5 1.5 0 015 5h4.5l2 2.5H19a1.5 1.5 0 011.5 1.5v3" /><path d="M14.5 16.5h6.5M18 13.5l3 3-3 3" /></Svg>;
}
/** 盾牌含勾 */
export function ShieldIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 3.5l7 2.6v5.3c0 4.5-3 7.8-7 9.1-4-1.3-7-4.6-7-9.1V6.1z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.2" /></Svg>;
}
/** 放大 */
export function ZoomInIcon(props: IconProps) { return <Svg {...props}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5M8 10.5h5M10.5 8v5" /></Svg>; }
/** 縮小 */
export function ZoomOutIcon(props: IconProps) { return <Svg {...props}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5M8 10.5h5" /></Svg>; }
/** 符合螢幕 */
export function FitIcon(props: IconProps) {
  return <Svg {...props}><path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" /><rect x="9" y="9" width="6" height="6" rx="1" /></Svg>;
}
/** 重設 */
export function ResetIcon(props: IconProps) {
  return <Svg {...props}><path d="M5.2 9.5A7.5 7.5 0 1 1 4.5 13" /><path d="M4.5 4.5v5h5" /></Svg>;
}
/** 圖紙疊放（模型／配置） */
export function SheetsIcon(props: IconProps) {
  return <Svg {...props}><rect x="7.5" y="3.5" width="12" height="15" rx="1.4" /><path d="M7.5 6.5H5.9a1.4 1.4 0 00-1.4 1.4v11.2a1.4 1.4 0 001.4 1.4h9.2a1.4 1.4 0 001.4-1.4v-.6M10.5 8h6M10.5 11h6M10.5 14h4" /></Svg>;
}
/** 房子 */
export function HomeIcon(props: IconProps) {
  return <Svg {...props}><path d="M3.5 11.5L12 4l8.5 7.5" /><path d="M6 9.8v9.7h12V9.8" /><path d="M10 19.5v-5h4v5" /></Svg>;
}
/** 門框加箭頭（結束） */
export function ExitIcon(props: IconProps) {
  return <Svg {...props}><path d="M10 4.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5h4" /><path d="M10.5 12h10M16.5 8l4 4-4 4" /></Svg>;
}
/** 輸出（托盤加向上箭頭） */
export function ExportIcon(props: IconProps) {
  return <Svg {...props}><path d="M12 15V3.8M7.5 8.2L12 3.8l4.5 4.4" /><path d="M4.5 13.5V19a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-5.5" /></Svg>;
}
