import { describe, expect, it } from "vitest";
import { layerStateDiff, readLayerStates } from "./layerStateTable";

const dxf = (...pairs: (string | number)[]) => pairs.join("\n") + "\n";

// The shape LibreDWG writes for 廚具參考.dwg: layers by handle (330), the state dictionary named in another dictionary.
const libredwg = dxf(
  0, "SECTION", 2, "TABLES",
  0, "LAYER", 5, "10", 2, "0", 62, 7,
  0, "LAYER", 5, "2D6", 2, "A-OPEN", 62, -4,
  0, "LAYER", 5, "2BD", 2, "銷-圖框", 62, 8,
  0, "ENDSEC", 0, "SECTION", 2, "OBJECTS",
  0, "DICTIONARY", 5, "FA", 100, "AcDbDictionary", 3, "ACAD_LAYERSTATES", 360, "FB",
  0, "DICTIONARY", 5, "FB", 330, "FA", 100, "AcDbDictionary", 281, 1, 3, "1", 350, "3E1", 3, "2", 350, "3E2",
  0, "XRECORD", 5, "3E1", 330, "FB", 100, "AcDbXrecord", 280, 1, 91, 67583, 301, "", 290, 0, 302, 0,
  330, "10", 90, 8, 62, 7, 370, -3, 331, "16", 1, "顏色_7", 440, 0,
  330, "2D6", 90, 9, 62, 4, 370, -3, 331, "16", 1, "顏色_4", 440, 0,
  330, "2BD", 90, 8, 62, 8, 370, -3, 331, "16", 1, "顏色_8", 440, 0,
  0, "XRECORD", 5, "3E2", 330, "FB", 100, "AcDbXrecord", 280, 1, 91, 2047, 301, "", 290, 0, 302, 0,
  330, "10", 90, 8, 62, 7, 370, -3,
  330, "2D6", 90, 9, 62, -4, 370, -3,
  330, "2BD", 90, 9, 62, -8, 370, -3,
  0, "ENDSEC", 0, "EOF",
);

describe("named layer states (圖層狀態管理員, 用戶 2026-10-27)", () => {
  it("reads LibreDWG's records: layer handles to names, off by flag or negative colour", () => {
    const states = readLayerStates(libredwg);
    expect(states.map((s) => s.name)).toEqual(["1", "2"]);
    const off = (i: number) => Object.entries(states[i].layers).filter(([, l]) => !l.visible).map(([n]) => n);
    expect(off(0)).toEqual(["A-OPEN"]);
    expect(off(1)).toEqual(["A-OPEN", "銷-圖框"]);
    // the colour is the layer's saved colour, positive, with its RGB
    expect(states[1].layers["A-OPEN"]).toMatchObject({ colorIndex: 4, color: 0x00ffff });
    expect(states[0].layers["銷-圖框"]).toMatchObject({ visible: true, colorIndex: 8 });
  });

  it("reads AutoCAD's records (layer names in group 8), frozen layers and true colours", () => {
    const states = readLayerStates(dxf(
      0, "DICTIONARY", 5, "A", 3, "ACAD_LAYERSTATES", 360, "B",
      0, "DICTIONARY", 5, "B", 3, "平面", 350, "C",
      0, "XRECORD", 5, "C", 330, "B", 100, "AcDbXrecord", 91, 2047, 301, "",
      8, "牆", 90, 2, 62, 1, 8, "傢俱", 90, 0, 62, 3, 420, 0x123456,
      0, "EOF",
    ));
    expect(states).toHaveLength(1);
    expect(states[0].name).toBe("平面");
    expect(states[0].layers["牆"]).toMatchObject({ visible: false, colorIndex: 1 });
    expect(states[0].layers["傢俱"]).toMatchObject({ visible: true, colorIndex: 3, color: 0x123456 });
  });

  it("no states: an empty list, also for broken data", () => {
    expect(readLayerStates(dxf(0, "SECTION", 2, "TABLES", 0, "ENDSEC", 0, "EOF"))).toEqual([]);
    expect(readLayerStates(dxf(0, "DICTIONARY", 5, "A", 3, "ACAD_LAYERSTATES", 360, "ZZ", 0, "EOF"))).toEqual([]);
  });

  it("tells whether the current layers match a state: on/off and colour of the layers it lists", () => {
    const [one, two] = readLayerStates(libredwg);
    const now = [
      { name: "0", visible: true, color: 0xffffff }, { name: "A-OPEN", visible: false, color: 0x00ffff }, { name: "銷-圖框", visible: true, color: 0x808080 },
      { name: "未列入", visible: false, color: 0x123456 },
    ];
    expect(layerStateDiff(one, now)).toEqual([]);
    expect(layerStateDiff(two, now)).toEqual(["銷-圖框"]);
    // a colour change alone is a difference too
    expect(layerStateDiff(one, now.map((l) => (l.name === "0" ? { ...l, color: 0xff0000 } : l)))).toEqual(["0"]);
  });
});
