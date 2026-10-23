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
});
