import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, sensitivity, avgRecoveryKw, DEFAULT_ECON } from '../js/economics.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('평균 열출력: 54 L/min × ε0.35 × 21℃', () => {
  near(avgRecoveryKw(DEFAULT_ECON), (54 / 60) * 4.186 * 0.35 * 21, 1e-9);
});

test('가스: 회수열 → 연료 MJ → Nm³ → kgCO2eq (추가 전력 차감)', () => {
  const r = analyze({});
  const mj = (r.annualKwh / 0.85) * 3.6;
  near(r.saved.value, mj, 1e-6);
  near(r.co2Kg, (mj / 42.7) * 2.1663 - 18 * 0.4173, 1e-6);
  assert.ok(r.payback > 0);
});

test('히트펌프는 같은 회수열에서 절감 전력이 1/COP', () => {
  const e = analyze({ heatSource: 'electric', efficiency: 1, price: 160 });
  const h = analyze({ heatSource: 'heatpump', efficiency: 3, price: 160 });
  near(h.saved.value * 3, e.saved.value, 1e-6);
});

test('지역난방은 탄소를 확정하지 않는다', () => {
  const r = analyze({ heatSource: 'district', efficiency: 0.95, price: 110 });
  assert.equal(r.co2Kg, null);
  assert.ok(r.co2Reason.length > 0);
});

test('회수기간 산정 불가 조건에서는 숫자를 내지 않는다', () => {
  assert.equal(analyze({ installCost: 0 }).payback, null);
  assert.equal(analyze({ heatSource: 'other' }).payback, null);
  const neg = analyze({ maintenanceCost: 1e9 });
  assert.equal(neg.payback, null);
  assert.match(neg.paybackReason, /0 이하/);
});

test('민감도 표는 5개 변수, ε가 크면 회수기간이 짧다', () => {
  const s = sensitivity({});
  assert.equal(s.rows.length, 5);
  const eff = s.rows.find((r) => r.key === 'effectiveness');
  assert.ok(eff.high.payback < eff.low.payback);
});
