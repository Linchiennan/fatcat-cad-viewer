// LibreDWG sometimes writes a string value that contains line breaks (a long MTEXT read past its end
// into ACIS data, material XML). DXF is strict code/value line pairs, so the next line is taken as a
// group code and the whole drawing fails to open. Drop the stray lines until the pairs line up again.
const GROUP_CODE = /^\s*-?\d{1,4}\s*$/;

export function repairDxfText(text: string): { text: string; dropped: number } {
  const trailing = /\r?\n$/.test(text);
  const lines = (trailing ? text.replace(/\r?\n$/, "") : text).split(/\r?\n/), out: string[] = [];
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
