import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, steadyState, occupancyShape } from '../js/simulation.js';
import { evaluateReading, accumulate, STATUS } from '../js/thermal.js';

test('정상상태: ε=0.4, 동일유량 → T4 = T3 + 0.4×(T1−T3)', () => {
  const s = steadyState({ t1: 36, t3: 15, drainFlowLpm: 9, coldFlowLpm: 9, effectiveness: 0.4, mode: 'ON' });
  assert.ok(Math.abs(s.t4 - 23.4) < 1e-9);
  const b = steadyState({ t1: 36, t3: 15, drainFlowLpm: 9, coldFlowLpm: 9, effectiveness: 0.4, mode: 'BYPASS' });
  assert.equal(b.t4, 15);
});

test('시나리오는 저녁 피크에 몰린다', () => {
  assert.ok(occupancyShape(60) > occupancyShape(5));
  assert.ok(occupancyShape(60) > occupancyShape(115));
});

test('시뮬레이션 출력은 항상 SIMULATED, 같은 seed면 재현 가능', () => {
  const a = createSimulation({ seed: 3 });
  const b = createSimulation({ seed: 3 });
  for (let i = 0; i < 50; i++) {
    const ra = a.step(15);
    const rb = b.step(15);
    assert.deepEqual(ra, rb);
    assert.equal(ra.source, STATUS.SIMULATED);
  }
});

function run(mode) {
  const sim = createSimulation({ seed: 1 });
  sim.setMode(mode);
  const acc = { kwh: 0, coveredSec: 0, skippedSec: 0 };
  let prev = null;
  let sumDt = 0;
  let n = 0;
  while (!sim.done) {
    const r = sim.step(10);
    const ev = evaluateReading(r);
    const cur = { t: r.t, kw: ev.kw };
    if (prev) accumulate(acc, prev, cur, 30);
    prev = cur;
    if (r.coldFlowLpm > 0) { sumDt += r.t4 - r.t3; n++; }
  }
  return { kwh: acc.kwh, dT: sumDt / n };
}

test('BYPASS보다 ON의 급수 출구 온도가 높고, 누적 열량이 양수', () => {
  const on = run('ON');
  const by = run('BYPASS');
  assert.ok(on.dT > 3, `ON dT ${on.dT}`);
  assert.ok(Math.abs(by.dT) < 0.3, `BYPASS dT ${by.dT}`);
  assert.ok(on.kwh > 1);
  assert.equal(by.kwh, 0);
});

test('오류 주입: 센서 끊김 → INVALID, 누설 → BYPASS 경고', () => {
  const sim = createSimulation({ seed: 2 });
  for (let i = 0; i < 300; i++) sim.step(10);
  sim.setFault('sensor_missing');
  assert.equal(evaluateReading(sim.step(5)).status, STATUS.INVALID);
  sim.setFault('bypass_leak');
  sim.setMode('BYPASS');
  let r;
  let guard = 0;
  do { r = sim.step(5); } while (r.coldFlowLpm === 0 && ++guard < 500);
  assert.ok(evaluateReading(r).issues.some((i) => i.code === 'BYPASS_NONZERO'));
});
