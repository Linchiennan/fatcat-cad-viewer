// English for the drawing messages (缺件警告, notes, xref states). The engine keeps writing them in Chinese, because
// other code reads them (splitCadWarnings, xrefApplied, the 3D note); only what is shown is translated, at display
// time (用戶 2026-11-15「翻譯成英文」). File, layer and block names inside a message are kept as they are.
import type { Locale } from "../i18n/translations";

type Rule = [RegExp, string | ((...m: string[]) => string)];

// Longer / more specific sentences first: later rules see the already translated text.
const RULES: Rule[] = [
  // engine (engineering.ts)
  [/字型以內附 Latin／繁中字型替代；SHX／原字型字寬未保證相同/g, "Fonts are replaced by the bundled Latin / Traditional Chinese fonts; widths may differ from the SHX / original fonts"],
  [/裁切物件僅提供完整可見物件的整體量測；跨界物件不回報隱藏段全長。反向／多層裁切仍需原CAD核對/g, "Clipped objects: only fully visible objects are measured; objects crossing the clip edge do not report their hidden length. Check inverted / nested clips in the original CAD"],
  [/缺少線型定義：(.+?)，暫以實線顯示/g, "Missing linetype definition: $1, shown as continuous for now"],
  [/弧段寬度按弧長漸變、徑向偏移；繪製每段不超過(\d+)度，弧線交接仍須原CAD核對/g, "Arc segment widths taper along the arc with a radial offset, drawn in steps of at most $1°; check arc joints in the original CAD"],
  [/直段採偏移邊精確交點；曲線接角求實際偏移曲線交點，退化或超界採斜角，未宣稱所有CAD同形/g, "Straight segments meet at exact offset-edge intersections; curved joints use the real offset-curve intersection, with a bevel when degenerate or out of range; not claimed identical to every CAD"],
  [/部分尺寸標註由引擎重建；箭頭／樣式未逐件核對/g, "Some dimensions were rebuilt by the engine; arrows / styles were not checked one by one"],
  [/循環或過深圖塊已略過：/g, "Skipped a circular or too deeply nested block: "],
  [/缺少圖塊：/g, "Missing block: "],
  [/未支援物件 (\S+)：(\d+)（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）/g, "Unsupported objects $1: $2 (ACIS solids; the DWG library gives no shape data, view them in desktop CAD)"],
  [/：未支援物件 (\S+) (\d+) 筆/g, ": unsupported objects $1: $2"],
  [/未支援物件 (\S+)：(\d+)/g, "Unsupported objects $1: $2"],
  [/外部參考 (\d+) 筆未載入：請在外參面板選檔套用/g, (_, n) => `${n} external reference${n === "1" ? "" : "s"} not loaded: pick the file${n === "1" ? "" : "s"} in the Xrefs tab`],
  [/剖面線 (\d+) 個的圖樣過密，以實心色塊繪製/g, (_, n) => `${n} hatch${n === "1" ? " has" : "es have"} too dense a pattern; drawn as solid fill`],
  [/剖面線 (\d+) 個的圖樣過密或超過整張圖的繪製量，只畫外框/g, (_, n) => `${n} hatch${n === "1" ? " is" : "es are"} too dense or over the drawing's line budget; only the outline is drawn`],
  [/剖面線 (\d+) 個超過整張圖的繪製量，只畫外框/g, (_, n) => `${n} hatch${n === "1" ? "" : "es"} exceed${n === "1" ? "s" : ""} the drawing's line budget; only the outline is drawn`],
  [/雲形線 (\d+) 條的節點資料不完整，已改用近似形狀繪製/g, (_, n) => `${n} spline${n === "1" ? " has" : "s have"} incomplete knot data; drawn with an approximate shape`],
  [/部分文字缺字，請勿視為完整圖面/g, "Some characters are missing from the text; do not treat the drawing as complete"],
  [/複合線型 (.+?) 的文字／形狀尚未繪製，僅顯示線段pattern/g, "Complex linetype $1: text / shapes are not drawn yet, only the dash pattern"],
  [/DWG解析引擎傳回 (\d+) 筆診斷；可能含缺件或資料越界，未視為完整/g, "The DWG engine returned $1 diagnostics; parts may be missing or out of range, so the drawing is not treated as complete"],
  [/^(?:(.+?)：)?DWG解析傳回 (\d+) 筆診斷/, (_, f, n) => `${f ? f + ": " : ""}the DWG engine returned ${n} diagnostics`],
  [/^(?:(.+?)：)?解析時有 (\d+) 則內部提醒，通常不影響畫面；若圖面有缺漏請回 CAD 核對/, (_, f, n) => `${f ? f + ": " : ""}${n} internal parser note${n === "1" ? "" : "s"}, usually harmless; if something is missing, check it in CAD`],
  [/DWG 解析時有 (\d+) 行資料損壞已略過（多為長文字或材質資料），相關文字可能不完整，請回電腦 CAD 核對/g, "$1 damaged data lines were skipped while reading the DWG (mostly long text or material data); related text may be incomplete, check it in desktop CAD"],
  // leaders and multilines
  [/此版本 DWG 的引線箭頭開關解析不可靠，已依 CAD 預設畫出，請與 CAD 核對/g, "Leader arrow on/off is unreliable in this DWG version; drawn with the CAD default, check it against CAD"],
  [/舊式引線 (\S+) 箭頭樣式 (.+?) 以實心箭頭近似/g, "Leader $1: arrowhead $2 approximated by a solid arrow"],
  [/舊式引線 (\S+) 為曲線引線，以通過各點的平滑曲線近似/g, "Leader $1 is a spline leader; approximated by a smooth curve through its points"],
  [/透視／非俯視投影尚未支援/g, "perspective / non-plan views are not supported yet"],
  [/多線 (\S+) 含斷開段，依參數分段繪製/g, "Multiline $1 has breaks; drawn in segments from its parameters"],
  [/多線 (\S+) 的內弧端蓋尚未支援，未繪製/g, "Multiline $1: inner arc end caps are not supported yet, not drawn"],
  [/多重引線 (\S+) 為曲線引線，以直線近似/g, "Multileader $1 is a spline leader; approximated with straight lines"],
  [/多重引線 (\S+) 的圖塊內容尚未支援，只顯示引線/g, "Multileader $1: block content is not supported yet, only the leader is shown"],
  // layouts, wipeouts, images (cadDocument.ts, rasterImages.ts)
  [/配置 (.+?) 視埠 (\S+) 未顯示：/g, "Layout $1 viewport $2 not shown: "],
  [/無法開啟3D（3D／透視視埠不顯示）/g, "3D cannot be opened (3D / perspective viewports are not shown)"],
  [/裁切邊界 (\S+) 尚未支援/g, "clip boundary $1 is not supported yet"],
  [/找不到裁切邊界物件/g, "clip boundary object not found"],
  [/比例或尺寸無效/g, "invalid scale or size"],
  [/遮罩下方可能有 (\S+) (\d+) 個未遮蔽（陣列、鏡射或超過遮罩上限的圖塊尚未遮蔽）/g, "$2 $1 objects under wipeouts may not be masked (arrayed, mirrored or over-limit blocks are not masked yet)"],
  [/找不到附件；請在外部參考選檔／資料夾並套用/g, "attachment not found; pick its file / folder in the Xrefs tab and apply"],
  [/^圖片 (.+?)：/, "Image $1: "],
  [/^圖片 (\S+)$/, "Image $1"],
  // backup reader (xrefs.ts)
  [/(\d+) 個圖塊在 DWG 轉檔時遺漏，已改用備援讀取補回/g, (_, n) => `${n} block${n === "1" ? " was" : "s were"} dropped in DWG conversion; restored with the backup reader`],
  [/(\d+) 個線型在 DWG 轉檔時遺漏，已改用備援讀取補回/g, (_, n) => `${n} linetype${n === "1" ? " was" : "s were"} dropped in DWG conversion; restored with the backup reader`],
  [/(\d+) 段文字在 DWG 轉檔時解碼錯誤，已改用備援讀取修正/g, (_, n) => `${n} text${n === "1" ? " was" : "s were"} mis-decoded in DWG conversion; fixed with the backup reader`],
  [/漏寫圖塊或文字的備援讀取失敗：/g, "Backup reading of dropped blocks or text failed: "],
  [/補回的圖塊中有 (\d+) 個 (\S+) 尚未支援顯示/g, "$1 $2 objects in the restored blocks cannot be shown yet"],
  // xref states (xrefs.ts, xrefAutoFind.ts)
  [/^已自動載入（(.+?)）：/, (_, origin: string) => `Loaded automatically (${xrefOrigin(origin)}): `],
  [/^已載入：/, "Loaded: "],
  [/（存檔時標為卸載，依選的檔載入）/g, " (saved as unloaded; loaded from the picked file)"],
  [/^未載入$/, "Not loaded"],
  [/^已關閉$/, "Turned off"],
  [/^找不到或同名衝突，請逐檔對應/, "Not found, or several files share the name; pick the file for each"],
  [/^存檔時已卸載（CAD 開圖也不顯示）/, "Saved as unloaded (CAD does not show it either)"],
  [/^巢狀覆疊不傳遞/, "Nested overlay, not carried up"],
  [/^循環／深度上限已阻擋/, "Blocked: circular or nested too deep"],
  [/^外參檔超過64個安全上限，未載入/, "Over the 64-file safety limit; not loaded"],
  [/外參超過64檔或128MB安全上限/g, "References exceed the 64-file or 128 MB safety limit"],
  [/讀取失敗：/g, "Read failed: "],
  [/；圖中未使用/g, "; not used in the drawing"],
  [/；用在圖紙「(.+)」，請在下方 Dock 切換配置查看/g, (_, sheets: string) => `; used on sheet${sheets.includes("」「") ? "s" : ""} “${sheets.split("」「").join("” “")}”, switch layouts at the bottom to see it`],
];

function xrefOrigin(origin: string): string {
  if (origin === "圖面庫") return "drawing library";
  if (origin === "記住的外參") return "remembered references";
  const folder = /^記住的資料夾「(.+)」$/.exec(origin);
  return folder ? `remembered folder “${folder[1]}”` : origin;
}

/** The message as shown in `locale`: unchanged in Chinese, translated sentence by sentence in English. */
export function cadMessageText(message: string, locale: Locale): string {
  if (locale !== "en") return message;
  let out = message;
  for (const [pattern, to] of RULES) out = out.replace(pattern, to as never);
  return out;
}
