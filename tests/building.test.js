import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, floorBase, floorList, viewAngleDeg, niceScale, floorLabel } from '../js/building-model.js';

test('층 바닥 높이: 1F=0, 2F=h, B1=-h', () => {
  assert.equal(floorBase(1, 4), 0);
  assert.equal(floorBase(2, 4), 4);
  assert.equal(floorBase(-1, 4), -4);
  assert.deepEqual(floorList({ floorsAbove: 2, floorsBelow: 1 }), [-1, 1, 2]);
  assert.equal(floorLabel(-2), 'B2');
});

test('기본 헬스장 건물: 높이 20 m, 연면적 2,400㎡, 2F→B1 수직관 4 m, Core 구간 확보', () => {
  const m = measure({ floorsAbove: 5, floorsBelow: 1, floorHeight: 4, width: 20, depth: 20, showerFloor: 2, mechFloor: -1 });
  assert.equal(m.heightAbove, 20);
  assert.equal(m.grossArea, 2400);
  assert.equal(m.riserLength, 4);
  assert.equal(m.coreFits, true);
  assert.equal(m.issues.length, 0);
});

test('기계실이 샤워실보다 위면 수직관·Core 판정을 하지 않는다', () => {
  const m = measure({ floorsAbove: 5, floorsBelow: 1, floorHeight: 4, width: 20, depth: 20, showerFloor: 2, mechFloor: 3 });
  assert.equal(m.riserLength, null);
  assert.equal(m.coreFits, null);
  assert.ok(m.issues.length > 0);
});

test('층고가 낮으면 Core 수직 구간 확인 필요', () => {
  const m = measure({ floorsAbove: 3, floorsBelow: 1, floorHeight: 2.4, width: 20, depth: 20, showerFloor: 2, mechFloor: -1 });
  assert.equal(m.coreFits, false);
});

test('범위 밖 입력은 보정하고, 없는 층은 가능한 층으로 바꾼다', () => {
  const m = measure({ floorsAbove: 500, floorsBelow: -3, floorHeight: 0, width: NaN, depth: 20, showerFloor: 99, mechFloor: -5 });
  assert.equal(m.b.floorsAbove, 80);
  assert.equal(m.b.floorsBelow, 0);
  assert.equal(m.b.floorHeight, 2.4);
  assert.equal(m.b.width, 20);
  assert.equal(m.b.showerFloor, 80);
  assert.equal(m.b.mechFloor, 1);
});

test('올려다보는 각도와 축척 막대', () => {
  assert.ok(Math.abs(viewAngleDeg(20, 23) - 38.5) < 0.5);
  assert.equal(viewAngleDeg(20, 0), null);
  assert.equal(niceScale(60), 20);
  assert.equal(niceScale(30), 10);
  assert.equal(niceScale(400), 100);
});
