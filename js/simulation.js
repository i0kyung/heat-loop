// simulation.js — 헬스장 샤워실 저녁 집중 시간(19:00~21:00) 가상 데이터 생성기
// 여기서 나오는 값은 모두 SIMULATED다. 실측값으로 표시하면 안 된다.

import { MODE, STATUS } from './thermal.js';
import { WATER } from './factors.js';

/** 시나리오 기본값 — 모두 가정치 */
export const DEFAULT_SCENARIO = Object.freeze({
  startClock: 19 * 60, // 19:00 (분)
  durationMin: 120, // 21:00까지
  heads: 8, // 샤워기 수
  peakConcurrent: 5, // 피크 동시 사용 샤워기 수 (일평균 이용 인원과 별개 변수)
  flowPerHeadLpm: 9, // 샤워기 1개 유량
  drainInC: 36, // 샤워 혼합수 38℃ → 배수관까지 약 2℃ 손실 가정
  coldInC: 15, // 상수도 급수 온도 (계절에 따라 5~25℃)
  effectiveness: 0.4, // 열교환 유효도 ε — 설계 목표 가설, 검증 안 됨
  ambientLoss: 0.06, // 배수 쪽 열 중 주변으로 새는 비율 (열수지 차이의 원인)
  lagSec: 25, // 열교환기 열용량 때문에 출구 온도가 따라오는 시간상수
  noiseC: 0.05, // 온도 센서 잡음 ±℃
  seed: 7
});

/** 재현 가능한 의사난수 (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시간(분, 0~120)별 동시 사용 비율 0~1 — 19:40~20:20에 몰리는 종 모양 */
export function occupancyShape(min, durationMin = 120) {
  const x = min / durationMin;
  const bump = Math.exp(-Math.pow((x - 0.5) / 0.24, 2));
  return Math.max(0, Math.min(1, bump));
}

/**
 * 정상상태 온도 (향류 열교환, 유효도 ε 고정 가정)
 *   q = ε · Cmin · (T1 − T3)
 *   T4 = T3 + q / Ccold,   T2 = T1 − q·(1+loss) / Cdrain
 */
export function steadyState({ t1, t3, drainFlowLpm, coldFlowLpm, effectiveness, ambientLoss = 0, mode }) {
  if (mode === MODE.BYPASS || drainFlowLpm <= 0 || coldFlowLpm <= 0) {
    return { t1, t2: t1, t3, t4: t3, q: 0 };
  }
  const cp = WATER.cp_kJ_per_kgK;
  const cCold = (coldFlowLpm / 60) * cp;
  const cDrain = (drainFlowLpm / 60) * cp;
  const q = effectiveness * Math.min(cCold, cDrain) * (t1 - t3);
  return { t1, t2: t1 - (q * (1 + ambientLoss)) / cDrain, t3, t4: t3 + q / cCold, q };
}

export const FAULTS = Object.freeze({
  none: '정상',
  sensor_missing: 'T3 센서 끊김',
  negative_dt: 'T3·T4 센서 뒤바뀜',
  balance: '급수 유량 센서 오차(+60%)',
  bypass_leak: 'BYPASS 밸브 누설'
});

/** 시뮬레이션 엔진. step(dtSec)마다 측정값 1건을 돌려준다. */
export function createSimulation(opts = {}) {
  const p = { ...DEFAULT_SCENARIO, ...opts };
  const rand = rng(p.seed);
  const st = {
    t: 0, // 시나리오 시작 후 경과 초
    mode: MODE.ON,
    fault: 'none',
    active: 0,
    nextChange: 0,
    t2: p.drainInC,
    t4: p.coldInC
  };

  function setMode(m) { st.mode = m; }
  function setFault(f) { st.fault = f in FAULTS ? f : 'none'; }
  function setParams(next) { Object.assign(p, next); }
  function reset() { st.t = 0; st.active = 0; st.nextChange = 0; st.t2 = p.drainInC; st.t4 = p.coldInC; }

  function step(dtSec) {
    st.t = Math.min(st.t + dtSec, p.durationMin * 60);
    const min = st.t / 60;

    // 1~3분마다 동시 사용 샤워기 수가 바뀐다
    if (st.t >= st.nextChange) {
      const target = occupancyShape(min, p.durationMin) * p.peakConcurrent;
      const jitter = (rand() - 0.5) * 2;
      st.active = Math.max(0, Math.min(p.heads, Math.round(target + jitter)));
      st.nextChange = st.t + 60 + rand() * 120;
    }

    const flow = st.active * p.flowPerHeadLpm;
    // 동일유량 배관: 예열된 급수가 샤워 혼합 밸브(찬물 쪽)와 급탕기로 가므로 급수 유량 ≈ 배수 유량
    const ss = steadyState({
      t1: p.drainInC, t3: p.coldInC, drainFlowLpm: flow, coldFlowLpm: flow,
      effectiveness: p.effectiveness, ambientLoss: p.ambientLoss, mode: st.mode
    });
    const k = 1 - Math.exp(-dtSec / p.lagSec);
    st.t4 += (ss.t4 - st.t4) * k;
    st.t2 += (ss.t2 - st.t2) * k;

    const n = () => (rand() - 0.5) * 2 * p.noiseC;
    const reading = {
      source: STATUS.SIMULATED,
      mode: st.mode,
      t: st.t,
      clockMin: p.startClock + min,
      active: st.active,
      t1: round(p.drainInC + n()),
      t2: round(st.t2 + n()),
      t3: round(p.coldInC + n()),
      t4: round(st.t4 + n()),
      drainFlowLpm: round(flow),
      coldFlowLpm: round(flow)
    };

    // 오류 주입 (시연용)
    if (st.fault === 'sensor_missing') reading.t3 = null;
    if (st.fault === 'negative_dt') [reading.t3, reading.t4] = [reading.t4, reading.t3];
    if (st.fault === 'balance') reading.coldFlowLpm = round(reading.coldFlowLpm * 1.6);
    if (st.fault === 'bypass_leak' && st.mode === MODE.BYPASS && flow > 0) reading.t4 = round(reading.t4 + 1.2);
    return reading;
  }

  return {
    step, setMode, setFault, setParams, reset,
    get params() { return { ...p }; },
    get state() { return { ...st }; },
    get done() { return st.t >= p.durationMin * 60; }
  };
}

const round = (v) => Math.round(v * 100) / 100;

export function clockLabel(clockMin) {
  const h = Math.floor(clockMin / 60) % 24;
  const m = Math.floor(clockMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
