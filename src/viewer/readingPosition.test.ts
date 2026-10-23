import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLayerMemory, readPosition, saveLayerMemory, savePosition, sheetKey } from "./readingPosition";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const key = (n: number) => `fatcat-reading-v1:d${n}.dxf:${n}`;

beforeEach(() => {
  const storage = new MemoryStorage();
  // Object.keys(localStorage) must list the stored keys, as in browsers.
  (globalThis as any).localStorage = new Proxy(storage, { ownKeys: () => Array.from({ length: storage.length }, (_, i) => storage.key(i)!), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
});

describe("reading position and layer memory (T14 3.6, 3.7)", () => {
  it("adds the space to the key of paper layouts only", () => {
    expect(sheetKey("fatcat-reading-v1:a.dxf:ff", "Model")).toBe("fatcat-reading-v1:a.dxf:ff");
    expect(sheetKey("fatcat-reading-v1:a.dxf:ff", "主浴 配置")).toBe("fatcat-reading-v1:a.dxf:ff:space:%E4%B8%BB%E6%B5%B4%20%E9%85%8D%E7%BD%AE");
  });

  it("keeps the 100 newest positions and never drops layer memory first (待決 A-4)", () => {
    vi.useFakeTimers();
    for (let n = 0; n < 100; n++) { vi.setSystemTime(1000 + n); savePosition(key(n), { x: n, y: 0, width: 1 }); }
    saveLayerMemory(key(99), { A: false });
    saveLayerMemory(key(0), { B: false });
    vi.setSystemTime(5000);
    savePosition(key(100), { x: 100, y: 0, width: 1 });
    vi.useRealTimers();
    expect(localStorage.getItem(key(0))).toBeNull();
    expect(readLayerMemory(key(0))).toEqual({}); // forgotten together with its position
    expect(readPosition(key(99))?.x).toBe(99);
    expect(readLayerMemory(key(99))).toEqual({ A: false });
    expect(readPosition(key(100))?.x).toBe(100);
  });

  it("reads broken layer memory as empty", () => {
    localStorage.setItem(key(1) + ":layers", "{oops");
    expect(readLayerMemory(key(1))).toEqual({});
    localStorage.setItem(key(1) + ":layers", JSON.stringify({ A: true, B: "no" }));
    expect(readLayerMemory(key(1))).toEqual({ A: true });
  });

  it("ignores invalid positions", () => {
    localStorage.setItem(key(500), JSON.stringify({ x: 1, y: 2, width: 0, time: 1 }));
    expect(readPosition(key(500))).toBeNull();
  });
});
