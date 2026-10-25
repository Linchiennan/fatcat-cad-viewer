// @vitest-environment jsdom
// 註記模式也要能縮放：滾輪以滑鼠位置縮放；雙指捏合縮放＋平移，且不留下第一指起的筆畫、不開文字框。
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { MarkupLayer } from './MarkupLayer';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function setup(tool: string) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const props: any = { marks: [], tool, color: '#f00', ppu: 2, project: (ps: any[]) => ps.map((p) => ({ x: p.x * 2, y: p.y * 2 })), unproject: (x: number, y: number) => ({ x: x / 2, y: y / 2 }),
    onAdd: vi.fn(), onText: vi.fn(), onPan: vi.fn(), onZoom: vi.fn() };
  act(() => root.render(<MarkupLayer {...props} />));
  const svg = host.querySelector('svg')!; (svg as any).setPointerCapture = () => {}; (svg as any).releasePointerCapture = () => {}; (svg as any).hasPointerCapture = () => false;
  const ev = (type: string, id: number, x: number, y: number, pointerType = 'touch') => act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(e, { pointerId: { value: id }, pointerType: { value: pointerType } }); svg.dispatchEvent(e);
  });
  return { svg, props, ev, close: () => { act(() => root.unmount()); host.remove(); } };
}
it('滾輪往前＝放大、往後＝縮小，以滑鼠位置為中心', () => {
  const s = setup('pen');
  act(() => { s.svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 40, clientY: 60 })); });
  act(() => { s.svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, clientX: 40, clientY: 60 })); });
  const [[x, y, f1], [, , f2]] = s.props.onZoom.mock.calls;
  expect([x, y]).toEqual([40, 60]);
  expect(f1).toBeGreaterThan(1); expect(f2).toBeLessThan(1);
  s.close();
});
for (const tool of ['pen', 'rect', 'text', 'mtext', 'move']) {
  it(`雙指張開放大（${tool}），不畫線、不開文字框`, () => {
    const s = setup(tool);
    s.ev('pointerdown', 1, 100, 100); s.ev('pointermove', 1, 105, 100);
    s.ev('pointerdown', 2, 200, 100);
    s.ev('pointermove', 2, 260, 100); s.ev('pointermove', 1, 60, 100);
    s.ev('pointerup', 1, 60, 100); s.ev('pointermove', 2, 300, 120); s.ev('pointerup', 2, 300, 120);
    const factors = s.props.onZoom.mock.calls.map((c: number[]) => c[2]);
    expect(factors.length).toBeGreaterThan(0);
    expect(factors.reduce((a: number, b: number) => a * b, 1)).toBeCloseTo(200 / 95, 1);
    expect(s.props.onAdd).not.toHaveBeenCalled();
    expect(s.props.onText).not.toHaveBeenCalled();
    s.close();
  });
}
it('文字工具單指點一下仍在點的位置放文字（手指離開時）', () => {
  const s = setup('text');
  s.ev('pointerdown', 1, 80, 40);
  expect(s.props.onText).not.toHaveBeenCalled();
  s.ev('pointerup', 1, 81, 41);
  expect(s.props.onText).toHaveBeenCalledWith({ x: 40, y: 20 });
  s.close();
});
