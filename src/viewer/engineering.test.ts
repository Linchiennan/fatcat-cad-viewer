import { describe, it, expect } from 'vitest';
import { resolveCadColor, dashSegments, perpendicularSnap, intersectionSnap } from './engineering';
describe('九項工程數值fixture（非施工圖）',()=>{
 it('TrueColor優先；BYBLOCK及圖層0繼承',()=>{
  const layers:any={A:{color:0x123456},'0':{color:0xffffff}};
  expect(resolveCadColor({colorIndex:256,trueColor:0xabcdef},layers,'A',0x654321)).toBe(0xabcdef);
  expect(resolveCadColor({colorIndex:0},layers,'A',0x654321)).toBe(0x654321);
  expect(resolveCadColor({layer:'0'},layers,'A',0x654321)).toBe(0x123456);
 });
 it('虛線pattern與比例長度',()=>{
  const seg=dashSegments([{x:0,y:0},{x:20,y:0}],[3,-2],2,false);
  expect(seg).toEqual([[{x:0,y:0},{x:6,y:0}],[{x:10,y:0},{x:16,y:0}]]);
 });
 it('垂足及交點具有已知座標',()=>{
  expect(perpendicularSnap({x:3,y:4},{x:0,y:0},{x:10,y:0})).toEqual({x:3,y:0,kind:'perpendicular'});
  expect(intersectionSnap({x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0})).toEqual({x:5,y:5,kind:'intersection'});
  expect(intersectionSnap({x:0,y:0},{x:1,y:0},{x:2,y:1},{x:2,y:2})).toBeNull();
 });
});

describe('dense line types (PARK B4F 柱牆套圖)', () => {
  it('draws a line whose pattern is far finer than the line as continuous instead of failing the drawing', () => {
    const seg = dashSegments([{ x: 0, y: 0 }, { x: 1e7, y: 0 }], [0.5, -0.25], 0.01, false);
    expect(seg).toEqual([[{ x: 0, y: 0 }, { x: 1e7, y: 0 }]]);
  });
  it('draws a line shorter than one whole pattern solid, as ZWCAD does (碁創潭子 肆層弱電 9F8A)', () => {
    // HIDDENX2 0.5,-0.25 × LTSCALE 50 = 37.5 per pattern; the line is 35.3
    expect(dashSegments([{ x: 0, y: 0 }, { x: 0, y: 35.3 }], [0.5, -0.25], 50, false)).toEqual([[{ x: 0, y: 0 }, { x: 0, y: 35.3 }]]);
    expect(dashSegments([{ x: 0, y: 0 }, { x: 0, y: 40 }], [0.5, -0.25], 50, false).length).toBe(2);
  });
  it('draws a closed outline on a pattern under a thousandth of its size solid (貝拉婚紗 樹 DOT2 × 0.2)', () => {
    const tree = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }];
    expect(dashSegments(tree, [0, -0.125], 0.2, true)).toHaveLength(4);
    // the same dots on a 2-wide outline stay dots
    expect(dashSegments(tree.map((p) => ({ x: p.x / 20, y: p.y / 20 })), [0, -0.125], 0.2, true).length).toBeGreaterThan(100);
  });
  // 點線（DOT 類）以前每個點是極短線段，一個像素都蓋不到，整條線看不見
  it('gives each dot of a DOT line type as a zero-length pair at its place, for drawing as a point', () => {
    const seg = dashSegments([{ x: 0, y: 0 }, { x: 100, y: 0 }], [0, -5], 1, false);
    expect(seg).toHaveLength(20);
    expect(seg.every(([a, b]) => a === b)).toBe(true);
    expect(seg.map(([a]) => a.x)).toEqual(Array.from({ length: 20 }, (_, i) => i * 5));
    // dash-dot: the dash, then the dot after the gap
    expect(dashSegments([{ x: 0, y: 0 }, { x: 20, y: 0 }], [6, -2, 0, -2], 1, false).slice(0, 2)).toEqual([[{ x: 0, y: 0 }, { x: 6, y: 0 }], [{ x: 8, y: 0 }, { x: 8, y: 0 }]]);
  });
});
