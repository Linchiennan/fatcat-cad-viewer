import { describe, expect, it } from "vitest";
import { floorOf, placeName } from "./placeName";

describe("placeName (施工位置 as on the 8F whiteboards)", () => {
  it("reads the floor from the drawing name", () => {
    expect(floorOf("8F-室內隔間對位圖.dwg")).toBe("8F");
    expect(floorOf("13F_拍照對位圖.dwg")).toBe("13F");
    expect(floorOf("B2F施工圖")).toBe("B2F");
    expect(floorOf("RF 屋頂層")).toBe("RF");
    expect(floorOf("給水平面圖")).toBe("");
  });

  const texts = [
    { text: "8A", x: 3000, y: 0 }, { text: "8C", x: 0, y: 9000 },
    { text: "主浴", x: 100, y: 50 }, { text: "臥 3", x: 900, y: 0 }, { text: "公浴", x: 2000, y: 0 },
    { text: "本平面圖R.C.牆皆未畫打底粉光線", x: 10, y: 10 },
  ];

  it("joins floor, unit and the nearest room", () => {
    expect(placeName("8F-室內隔間對位圖", { x: 0, y: 0 }, texts)).toBe("8F-A 戶 主浴");
    expect(placeName("8F-室內隔間對位圖", { x: 950, y: 0 }, texts)).toBe("8F-A 戶 臥3");
    expect(placeName("8F-室內隔間對位圖", { x: 0, y: 8500 }, texts)).toBe("8F-C 戶");
  });

  it("leaves out what it cannot find", () => {
    expect(placeName("給水平面圖", { x: 0, y: 0 }, texts)).toBe("A 戶 主浴");
    expect(placeName("13F 平面", { x: 0, y: 0 }, texts)).toBe("13F 主浴"); // 8A is not on 13F
    expect(placeName("8F", { x: 99999, y: 0 }, texts)).toBe("8F");
  });
});
