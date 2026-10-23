// Split the report's messages into real gaps (something not drawn, or drawn wrongly) and notes that only
// explain how a thing was drawn. Only gaps count in the top strip; notes sit in a collapsed section.
export type SplitWarnings = { missing: string[]; notes: string[] };

const NOTE_PATTERNS: RegExp[] = [
  /^字型以內附/,
  /^裁切物件僅提供/,
  /^弧段寬度按弧長/,
  /^直段採偏移邊/,
  /^部分尺寸標註由引擎重建/,
  /為曲線引線，以直線近似$/,
  /含斷開段，依參數分段繪製$/,
  /以實心箭頭近似$/,
  /引線箭頭開關解析不可靠/,
  /圖塊在 DWG 轉檔時遺漏，已改用備援讀取補回$/,
  /段文字在 DWG 轉檔時解碼錯誤，已改用備援讀取修正$/,
  /的節點資料不完整，已改用近似形狀繪製$/,
];
const DIAGNOSTIC = /^(?:(.+?)：)?DWG解析(?:引擎)?傳回 (\d+) 筆診斷/;

export function splitCadWarnings(warnings: readonly string[]): SplitWarnings {
  const missing: string[] = [], notes: string[] = [];
  const diagnostics = new Map<string, number>();
  for (const w of warnings) {
    const d = DIAGNOSTIC.exec(w);
    if (d) {
      // The same file can be reported by the converter and the parser; keep one plain-language line per file.
      const file = d[1] ?? "";
      diagnostics.set(file, Math.max(diagnostics.get(file) ?? 0, Number(d[2])));
      continue;
    }
    (NOTE_PATTERNS.some((p) => p.test(w)) ? notes : missing).push(w);
  }
  const named = [...diagnostics.keys()].filter(Boolean);
  for (const [file, n] of diagnostics) {
    if (!file && named.length) continue; // the unnamed converter line duplicates the main file's
    notes.push(`${file ? file + "：" : ""}解析時有 ${n} 則內部提醒，通常不影響畫面；若圖面有缺漏請回 CAD 核對`);
  }
  return { missing, notes };
}
