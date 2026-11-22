import { describe, expect, it, vi } from "vitest";
import { releaseCamera } from "./CameraScreen";
import { MARKER_RADIUS_PX, ARROW_TIP, moveGripRadius, turnGripRadius } from "./PhotoMarkerLayer";

function fakeStream(torch: boolean, answer: "ok" | "never") {
  const log: string[] = [];
  const track = {
    readyState: "live",
    getCapabilities: () => ({ torch }),
    applyConstraints: vi.fn((c: { advanced: { torch: boolean }[] }) => { log.push(`torch:${c.advanced[0].torch}`); return answer === "ok" ? Promise.resolve() : new Promise(() => {}); }),
    stop: vi.fn(() => log.push("stop")),
  };
  return { log, track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
}

describe("相機關閉時閃光燈要關（用戶 2026-11-22：APP關閉 閃光燈一樣開著）", () => {
  it("turns the torch off before stopping the track", async () => {
    const f = fakeStream(true, "ok");
    releaseCamera(f.stream);
    await Promise.resolve(); await Promise.resolve();
    expect(f.log).toEqual(["torch:false", "stop"]);
  });
  it("still stops when the phone never answers", () => {
    vi.useFakeTimers();
    const f = fakeStream(true, "never");
    releaseCamera(f.stream);
    expect(f.track.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(f.log).toEqual(["torch:false", "stop"]);
    vi.useRealTimers();
  });
  it("stops at once without a torch", () => {
    const f = fakeStream(false, "ok");
    releaseCamera(f.stream);
    expect(f.log).toEqual(["stop"]);
  });
});

describe("符號的手指抓取範圍（用戶 2026-11-22：箭頭在手機上移動困難）", () => {
  it("move grip at least a fingertip, turn grip reaches past the arrow tip", () => {
    for (const k of [0.5, 1, 3]) {
      expect(moveGripRadius(k) * 2).toBeGreaterThanOrEqual(44);
      expect(moveGripRadius(k)).toBeGreaterThan(MARKER_RADIUS_PX * k);
      expect(turnGripRadius(k)).toBeGreaterThan(MARKER_RADIUS_PX * k * ARROW_TIP);
      expect(turnGripRadius(k) - moveGripRadius(k)).toBeGreaterThanOrEqual(22);
    }
  });
});
