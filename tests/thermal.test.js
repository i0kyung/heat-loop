import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatRateKw, recoveredKw, evaluateReading, integrateKwh, energyBalance, STATUS, MODE, modeStats, effectiveness } from '../js/thermal.js';

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { source: 'SIMULATED', mode: MODE.ON, t1: 36, t2: 31.98, t3: 15, t4: 20, drainFlowLpm: 2.5, coldFlowLpm: 2 };

test('문서 예시: 2 L/min, 5℃ 상승 → 약 0.70 kW_th', () => {
  near(heatRateKw(2, 15, 20), 0.6977, 1e-4);
  near(recoveredKw(base), 0.6977, 1e-4);
});

test('정상 측정은 원래 출처(SIMULATED)를 유지하고 kW를 낸다', () => {
  const r = evaluateReading(base);
  assert.equal(r.status, STATUS.SIMULATED);
  near(r.kw, 0.6977, 1e-4);
});

test('MEASURED 출처만 MEASURED, 출처가 없으면 SIMULATED (실측으로 올리지 않음)', () => {
  assert.equal(evaluateReading({ ...base, source: 'MEASURED' }).status, STATUS.MEASURED);
  assert.equal(evaluateReading({ ...base, source: undefined }).status, STATUS.SIMULATED);
});

test('센서 누락 → INVALID, 열출력은 0이 아니라 null', () => {
  const r = evaluateReading({ ...base, t3: null });
  assert.equal(r.status, STATUS.INVALID);
  assert.equal(r.kw, null);
  assert.ok(r.issues.some((i) => i.code === 'SENSOR_MISSING'));
});

test('음수 유량·NaN·범위 밖 온도 → INVALID', () => {
  assert.equal(evaluateReading({ ...base, coldFlowLpm: -1 }).status, STATUS.INVALID);
  assert.equal(evaluateReading({ ...base, t1: NaN }).status, STATUS.INVALID);
  assert.equal(evaluateReading({ ...base, t4: 95 }).status, STATUS.INVALID);
});

test('ON에서 T4 < T3 (음수 온도차) → INVALID', () => {
  const r = evaluateReading({ ...base, t3: 20, t4: 15 });
  assert.equal(r.status, STATUS.INVALID);
  assert.ok(r.issues.some((i) => i.code === 'NEGATIVE_DT'));
});

test('BYPASS는 회수량 0, 급수 온도가 변하면 경고', () => {
  const ok = evaluateReading({ ...base, mode: MODE.BYPASS, t4: 15.1 });
  assert.equal(ok.kw, 0);
  assert.ok(!ok.issues.some((i) => i.code === 'BYPASS_NONZERO'));
  const leak = evaluateReading({ ...base, mode: MODE.BYPASS, t4: 16.5 });
  assert.equal(leak.kw, 0);
  assert.ok(leak.issues.some((i) => i.code === 'BYPASS_NONZERO'));
});

test('흐름 없음 → 정상 상태, 회수 0 (INVALID 아님)', () => {
  const r = evaluateReading({ ...base, coldFlowLpm: 0, drainFlowLpm: 0 });
  assert.equal(r.status, STATUS.SIMULATED);
  assert.equal(r.kw, 0);
});

test('열수지 차이 과다 → BALANCE_MISMATCH 경고', () => {
  const r = evaluateReading({ ...base, coldFlowLpm: 4 });
  assert.ok(r.issues.some((i) => i.code === 'BALANCE_MISMATCH'));
  assert.equal(energyBalance(1, 1.1).ok, true);
  assert.equal(energyBalance(1, 2).ok, false);
  assert.equal(energyBalance(0.05, 0.1).checked, false);
});

test('적분: 0.7 kW 일정 1시간 → 0.7 kWh_th', () => {
  const s = Array.from({ length: 3601 }, (_, i) => ({ t: i, kw: 0.7 }));
  near(integrateKwh(s).kwh, 0.7, 1e-9);
});

test('적분: 선형 증가는 사다리꼴로 정확, INVALID 구간과 큰 간격은 제외', () => {
  near(integrateKwh([{ t: 0, kw: 0 }, { t: 3600, kw: 2 }], 1e9).kwh, 1, 1e-9);
  const r = integrateKwh([{ t: 0, kw: 1 }, { t: 5, kw: null }, { t: 10, kw: 1 }, { t: 15, kw: 1 }, { t: 60, kw: 1 }]);
  near(r.kwh, 5 / 3600, 1e-12);
  assert.equal(r.skippedSec, 55);
});

test('모드별 통계와 유효도', () => {
  const rows = [
    { ...base, mode: 'BYPASS', t4: 15, kw: 0, status: 'SIMULATED' },
    { ...base, mode: 'ON', kw: 0.7, status: 'SIMULATED' },
    { ...base, mode: 'ON', kw: null, status: 'INVALID' }
  ];
  const s = modeStats(rows);
  assert.equal(s.BYPASS.n, 1);
  assert.equal(s.ON.n, 1);
  near(s.ON.dT, 5);
  near(effectiveness(base), 5 / 21, 1e-6);
});
