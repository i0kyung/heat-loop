// thermal.js — 열량 계산과 측정값 검증 (순수 함수, DOM 없음)
//
// 단위 규칙
//   온도 ℃, 유량 L/min, 열출력 kW_th, 열량 kWh_th
//   'th'는 열에너지. 전기에너지(kWh_e)와 절대 섞지 않는다.

import { WATER } from './factors.js';

export const STATUS = Object.freeze({
  SIMULATED: 'SIMULATED',
  MEASURED: 'MEASURED',
  INVALID: 'INVALID'
});

export const MODE = Object.freeze({ BYPASS: 'BYPASS', ON: 'ON' });

/** 검증 기준값. 프로토타입용 초기 가설이며 실험 후 조정한다. */
export const LIMITS = Object.freeze({
  tempMin: 0, // ℃ 이하이면 센서 이상으로 본다 (실험 장치는 결빙 조건 없음)
  tempMax: 70, // ℃ 초과 시 센서 이상 또는 화상 위험
  flowMax: 150, // L/min 초과 시 유량 센서 이상 (샤워기 10개 × 15 L/min 기준)
  minFlow: 0.2, // L/min 미만은 '흐름 없음'
  bypassDeltaMax: 0.3, // ℃ BYPASS인데 급수 온도가 이만큼 넘게 오르면 경고
  balanceTolerance: 0.25, // 급수가 얻은 열과 배수가 잃은 열의 차이 허용 비율
  balanceMinKw: 0.2, // 이보다 작은 열출력에서는 수지 비교를 하지 않음(센서 분해능 한계)
  maxGapSec: 10 // 실측 표본 간격이 이보다 길면 적분하지 않는다
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 질량유량 kg/s */
export function massFlowKgS(flowLpm, density = WATER.density_kg_per_L) {
  return (flowLpm * density) / 60;
}

/**
 * 열출력 kW_th = 질량유량(kg/s) × 비열(kJ/kg·K) × 온도차(K)
 * 부호를 그대로 돌려준다(음수 판단은 호출하는 쪽에서).
 */
export function heatRateKw(flowLpm, tIn, tOut, cp = WATER.cp_kJ_per_kgK) {
  return massFlowKgS(flowLpm) * cp * (tOut - tIn);
}

/** 급수(차가운 쪽)가 얻은 열 = 회수 열출력 */
export function recoveredKw(r) {
  return heatRateKw(r.coldFlowLpm, r.t3, r.t4);
}

/** 배수(따뜻한 쪽)가 잃은 열 (양수) */
export function drainLossKw(r) {
  return heatRateKw(r.drainFlowLpm, r.t2, r.t1);
}

/**
 * 측정값 1건을 검사한다.
 * @param {object} r { t1,t2,t3,t4, drainFlowLpm, coldFlowLpm, mode, source }
 *   source: 'SIMULATED' | 'MEASURED' (어댑터가 붙인 원래 출처)
 * @returns {{ status, kw, drainKw, issues:[{code,level,msg}] }}
 *   kw는 INVALID이면 null. '0으로 대체'하지 않는다.
 */
export function evaluateReading(r) {
  const issues = [];
  const add = (code, level, msg) => issues.push({ code, level, msg });
  const src = r && r.source === STATUS.MEASURED ? STATUS.MEASURED : STATUS.SIMULATED;

  if (!r) return { status: STATUS.INVALID, kw: null, drainKw: null, issues: [{ code: 'NO_DATA', level: 'error', msg: '수신된 데이터가 없습니다.' }] };

  const temps = { t1: 'T1 배수 입구', t2: 'T2 배수 출구', t3: 'T3 급수 입구', t4: 'T4 급수 출구' };
  for (const [k, label] of Object.entries(temps)) {
    if (!isNum(r[k])) add('SENSOR_MISSING', 'error', `${label} 센서 값이 없습니다.`);
    else if (r[k] < LIMITS.tempMin || r[k] > LIMITS.tempMax) add('TEMP_RANGE', 'error', `${label} 값 ${r[k]}℃가 허용 범위(${LIMITS.tempMin}~${LIMITS.tempMax}℃)를 벗어났습니다.`);
  }
  for (const [k, label] of [['drainFlowLpm', '배수 유량'], ['coldFlowLpm', '급수 유량']]) {
    if (!isNum(r[k])) add('FLOW_MISSING', 'error', `${label} 값이 없습니다.`);
    else if (r[k] < 0) add('FLOW_NEGATIVE', 'error', `${label}이 음수(${r[k]} L/min)입니다.`);
    else if (r[k] > LIMITS.flowMax) add('FLOW_RANGE', 'error', `${label} ${r[k]} L/min이 측정 범위를 벗어났습니다.`);
  }
  if (issues.some((i) => i.level === 'error')) {
    return { status: STATUS.INVALID, kw: null, drainKw: null, issues };
  }

  const noFlow = r.coldFlowLpm < LIMITS.minFlow || r.drainFlowLpm < LIMITS.minFlow;
  if (noFlow) {
    // 샤워가 없는 시간: 회수할 열이 없다. 측정 자체는 정상이다.
    add('NO_FLOW', 'info', '급수 또는 배수 흐름이 없어 열 회수가 일어나지 않습니다.');
    return { status: src, kw: 0, drainKw: 0, issues };
  }

  const kw = recoveredKw(r);
  const dKw = drainLossKw(r);
  const dT = r.t4 - r.t3;

  if (r.mode === MODE.BYPASS) {
    if (Math.abs(dT) > LIMITS.bypassDeltaMax) {
      add('BYPASS_NONZERO', 'warn', `BYPASS인데 급수 온도가 ${dT.toFixed(2)}℃ 변했습니다. 밸브 누설·센서 위치·주변 열을 확인하세요.`);
    }
    // BYPASS에서는 장치가 회수한 열이 없다고 본다. 측정 오차를 회수량으로 집계하지 않는다.
    return { status: src, kw: 0, drainKw: dKw, rawKw: kw, issues };
  }

  if (dT < -0.05) {
    add('NEGATIVE_DT', 'error', `급수 출구(T4)가 입구(T3)보다 ${Math.abs(dT).toFixed(2)}℃ 낮습니다. 센서 위치가 바뀌었거나 역류일 수 있습니다.`);
    return { status: STATUS.INVALID, kw: null, drainKw: dKw, issues };
  }
  if (r.t1 <= r.t3) {
    add('NO_GRADIENT', 'warn', '배수 입구가 급수 입구보다 따뜻하지 않아 열이 이동할 조건이 아닙니다.');
  }

  const bal = energyBalance(kw, dKw);
  if (bal.checked && !bal.ok) {
    add('BALANCE_MISMATCH', 'warn', `급수가 얻은 열(${kw.toFixed(2)} kW_th)과 배수가 잃은 열(${dKw.toFixed(2)} kW_th)의 차이가 ${(bal.ratio * 100).toFixed(0)}%입니다. 유량 센서 보정과 배관 단열을 확인하세요.`);
  }
  return { status: src, kw, drainKw: dKw, issues, balance: bal };
}

/** 열수지: 차이 비율 = |급수 획득 − 배수 손실| / max(둘) */
export function energyBalance(coldGainKw, drainLossKwV, tol = LIMITS.balanceTolerance) {
  const big = Math.max(Math.abs(coldGainKw), Math.abs(drainLossKwV));
  if (big < LIMITS.balanceMinKw) return { checked: false, ok: true, ratio: 0 };
  const ratio = Math.abs(coldGainKw - drainLossKwV) / big;
  return { checked: true, ok: ratio <= tol, ratio };
}

/**
 * 누적 열량 kWh_th — 사다리꼴 적분.
 * samples: [{ t: 초(sec), kw: number|null }] 시간 오름차순
 * kw가 null(INVALID)인 구간과 간격이 maxGapSec를 넘는 구간은 더하지 않는다.
 * @returns {{ kwh, coveredSec, skippedSec }}
 */
export function integrateKwh(samples, maxGapSec = LIMITS.maxGapSec) {
  const acc = { kwh: 0, coveredSec: 0, skippedSec: 0 };
  for (let i = 1; i < samples.length; i++) accumulate(acc, samples[i - 1], samples[i], maxGapSec);
  return acc;
}

/** 표본 두 개 사이 구간을 누적값(acc)에 더한다. 실시간 화면에서 한 표본씩 적분할 때 쓴다. */
export function accumulate(acc, a, b, maxGapSec = LIMITS.maxGapSec) {
  const dt = b.t - a.t;
  if (!(dt > 0)) return acc;
  if (!isNum(a.kw) || !isNum(b.kw) || dt > maxGapSec) {
    acc.skippedSec += dt;
    return acc;
  }
  acc.kwh += (((a.kw + b.kw) / 2) * dt) / 3600; // kW × s = kJ → /3600 = kWh
  acc.coveredSec += dt;
  return acc;
}

/** 열출력이 일정할 때만 쓰는 단순 계산 (kW × h) */
export function constantPowerKwh(kw, hours) {
  return kw * hours;
}

/** 모드별 통계 (BYPASS / ON 비교 화면용) */
export function modeStats(rows) {
  const out = {};
  for (const m of [MODE.BYPASS, MODE.ON]) {
    const valid = rows.filter((r) => r.mode === m && r.status !== STATUS.INVALID && r.coldFlowLpm >= LIMITS.minFlow);
    const n = valid.length;
    const avg = (f) => (n ? valid.reduce((s, r) => s + f(r), 0) / n : null);
    out[m] = {
      n,
      t3: avg((r) => r.t3),
      t4: avg((r) => r.t4),
      dT: avg((r) => r.t4 - r.t3),
      kw: avg((r) => r.kw ?? 0),
      flow: avg((r) => r.coldFlowLpm)
    };
  }
  return out;
}

/** 열교환 유효도 ε = 실제 열전달 / 최대 가능 열전달 (측정값으로 역산, 참고용) */
export function effectiveness(r) {
  const cCold = massFlowKgS(r.coldFlowLpm) * WATER.cp_kJ_per_kgK;
  const cDrain = massFlowKgS(r.drainFlowLpm) * WATER.cp_kJ_per_kgK;
  const cMin = Math.min(cCold, cDrain);
  const qMax = cMin * (r.t1 - r.t3);
  if (!(qMax > 0)) return null;
  return recoveredKw(r) / qMax;
}
