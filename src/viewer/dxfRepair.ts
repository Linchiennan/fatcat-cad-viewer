// LibreDWG sometimes writes a string value that contains line breaks (a long MTEXT read past its end
// into ACIS data, material XML). DXF is strict code/value line pairs, so the next line is taken as a
// group code and the whole drawing fails to open. Drop the stray lines until the pairs line up again.
const GROUP_CODE = /^\s*-?\d{1,4}\s*$/;
// Lines are split exactly as the parser splits them (dxf-viewer DxfParser: \r\n, \r or \n). A lone \r inside a
// string read past its end (上晴 A 區大廳: a block name followed by control bytes) made the parser see a line this
// repair did not, so the drawing still failed to open after the repair.
const LINE_BREAK = /\r\n|\r|\n/;

export function repairDxfText(text: string): { text: string; dropped: number } {
  const trailing = /(\r\n|\r|\n)$/.test(text);
  const lines = (trailing ? text.replace(/(\r\n|\r|\n)$/, "") : text).split(LINE_BREAK), out: string[] = [];
  let dropped = 0;
  for (let i = 0; i < lines.length;) {
    if (!GROUP_CODE.test(lines[i])) {
      dropped++;
      i++;
      continue;
    }
    out.push(lines[i], lines[i + 1] ?? "");
    i += 2;
  }
  return { text: out.join("\n") + (trailing ? "\n" : ""), dropped };
}

export const repairWarning = (dropped: number) =>
  `DWG 解析時有 ${dropped} 行資料損壞已略過（多為長文字或材質資料），相關文字可能不完整，請回電腦 CAD 核對`;
