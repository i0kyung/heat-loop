// economics.js — 시설 단위(설치된 샤워시설·급탕 계통) 경제성 추정. 건물 전체가 아니다.
// 모든 결과는 입력 가정에 따른 ESTIMATED 값이다.
//
// 흐름
//   회수 열량(kWh_th) → 열원 효율로 나눠 줄어든 최종에너지 → 단가로 비용, 배출계수로 탄소
//   가스 보일러: 연료 = Q_th / 효율        (MJ로 환산 → 원/MJ, Nm³ → kgCO2eq)
//   전기저항:    전력 = Q_th / 효율        (kWh_e)
//   히트펌프:    전력 = Q_th / COP         (kWh_e) ← 회수열이 그대로 전기 절감이 아니다
//   지역난방:    열   = Q_th / 열교환효율   (Mcal) — 배출계수 미확정이라 탄소는 보류

import { WATER, HEAT_SOURCES, EMISSION, MJ_PER_KWH, CITY_GAS_GCV_MJ_PER_NM3 } from './factors.js';

export const DEFAULT_ECON = Object.freeze({
  showerHeads: 10,
  concurrentFlowLpm: 54, // 피크 동시 사용 유량 (예: 6개 × 9 L/min)
  hoursPerDay: 3, // 그 유량으로 환산한 하루 사용시간
  daysPerYear: 350,
  drainInC: 36,
  coldInC: 15,
  effectiveness: 0.35,
  heatSource: 'gas',
  efficiency: 0.85,
  price: 23,
  elecPrice: 160, // 추가 전력 단가 원/kWh
  installCost: 10000000, // 가정치: Core 2대 + Sense + 설치 공사 (견적 아님)
  maintenanceCost: 300000, // 연간 점검·청소 가정치
  extraKwhPerYear: 18 // Sense+Hub 약 2 W × 8,760 h (수동형 Core는 펌프 없음)
});

const isPos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 평균 회수 열출력 kW_th (동시 사용 유량 기준, 유효도 ε 가정) */
export function avgRecoveryKw(p) {
  const dT = p.drainInC - p.coldInC;
  if (!(dT > 0) || !isPos(p.concurrentFlowLpm) || !isPos(p.effectiveness)) return 0;
  return (p.concurrentFlowLpm / 60) * WATER.density_kg_per_L * WATER.cp_kJ_per_kgK * p.effectiveness * dT;
}

/**
 * @returns 결과 객체. 계산할 수 없는 항목은 null + reason
 */
export function analyze(input) {
  const p = { ...DEFAULT_ECON, ...input };
  const src = HEAT_SOURCES[p.heatSource] ?? HEAT_SOURCES.other;
  const notes = [];

  const kw = avgRecoveryKw(p);
  // 평균 열출력이 일정하다고 보고 시간을 곱한다 — 시설 단위 1차 추정용 근사
  const dailyKwh = kw * (isPos(p.hoursPerDay) ? p.hoursPerDay : 0);
  const annualKwh = dailyKwh * (isPos(p.daysPerYear) ? p.daysPerYear : 0);
  const monthlyKwh = annualKwh / 12;

  let saved = null; // 줄어든 최종에너지 {value, unit}
  let costSaved = null;
  let co2Kg = null;
  let co2Reason = '';
  const eff = p.efficiency;

  if (p.heatSource === 'other' || !isPos(eff)) {
    co2Reason = '급탕 열원과 효율을 알아야 계산할 수 있습니다.';
  } else if (p.heatSource === 'gas') {
    const mj = (annualKwh / eff) * MJ_PER_KWH;
    saved = { value: mj, unit: 'MJ', alt: { value: mj / CITY_GAS_GCV_MJ_PER_NM3, unit: 'Nm³' } };
    if (isPos(p.price)) costSaved = mj * p.price;
    co2Kg = (mj / CITY_GAS_GCV_MJ_PER_NM3) * EMISSION.city_gas.value;
    notes.push('도시가스는 고지서 기준 총발열량 42.7 MJ/Nm³로 부피를 환산했습니다. 보일러 효율이 순발열량 기준이면 결과가 약 10% 달라질 수 있습니다.');
  } else if (p.heatSource === 'electric' || p.heatSource === 'heatpump') {
    const kwhE = annualKwh / eff;
    saved = { value: kwhE, unit: 'kWh_e' };
    if (isPos(p.price)) costSaved = kwhE * p.price;
    co2Kg = kwhE * EMISSION.electricity.value;
    if (p.heatSource === 'heatpump') notes.push(`히트펌프는 회수열 ${fmt(annualKwh)} kWh_th가 전력 ${fmt(kwhE)} kWh_e(÷COP ${eff})로 줄어듭니다.`);
  } else if (p.heatSource === 'district') {
    const mcal = (annualKwh / eff) * 0.86;
    saved = { value: mcal, unit: 'Mcal' };
    if (isPos(p.price)) costSaved = mcal * p.price;
    co2Reason = '지역난방 배출계수의 단위와 최신값이 확인되지 않아 탄소 감소량을 산정하지 않았습니다.';
  }

  const extraKwh = isPos(p.extraKwhPerYear) ? p.extraKwhPerYear : 0;
  const extraCost = extraKwh * (isPos(p.elecPrice) ? p.elecPrice : 0);
  const extraCo2 = extraKwh * EMISSION.electricity.value;
  if (co2Kg !== null) co2Kg -= extraCo2;

  const maint = isPos(p.maintenanceCost) ? p.maintenanceCost : 0;
  const netSaving = costSaved === null ? null : costSaved - extraCost - maint;

  let payback = null;
  let paybackReason = '';
  if (!isPos(p.installCost)) paybackReason = '설치비를 입력해야 회수기간을 계산할 수 있습니다.';
  else if (netSaving === null) paybackReason = '에너지 단가 또는 열원 정보가 없어 절감액을 계산할 수 없습니다.';
  else if (netSaving <= 0) paybackReason = '연간 순절감액이 0 이하라 투자비를 회수할 수 없습니다.';
  else payback = p.installCost / netSaving;

  return {
    params: p,
    sourceLabel: src.label,
    kw, dailyKwh, monthlyKwh, annualKwh,
    saved, costSaved, extraKwh, extraCost, maintenance: maint, netSaving,
    co2Kg, co2Reason,
    payback, paybackReason,
    notes
  };
}

/** 민감도: 주요 변수 ±20%일 때 순절감액·회수기간 */
export function sensitivity(input, delta = 0.2) {
  const base = analyze(input);
  const vars = [
    ['effectiveness', '열교환 유효도 ε'],
    ['hoursPerDay', '하루 사용시간'],
    ['coldInC', '급수 온도(계절)'],
    ['price', '에너지 단가'],
    ['installCost', '설치비']
  ];
  const rows = vars.map(([key, label]) => {
    const p = { ...DEFAULT_ECON, ...input };
    const lowIn = { ...p, [key]: p[key] * (1 - delta) };
    const highIn = { ...p, [key]: p[key] * (1 + delta) };
    // 급수 온도는 ±3℃로 본다(겨울 낮음·여름 높음)
    if (key === 'coldInC') { lowIn.coldInC = p.coldInC - 3; highIn.coldInC = p.coldInC + 3; }
    const lo = analyze(lowIn);
    const hi = analyze(highIn);
    return {
      key, label,
      lowLabel: key === 'coldInC' ? `${lowIn.coldInC}℃` : '−20%',
      highLabel: key === 'coldInC' ? `${highIn.coldInC}℃` : '+20%',
      low: { payback: lo.payback, net: lo.netSaving },
      high: { payback: hi.payback, net: hi.netSaving }
    };
  });
  return { base, rows };
}

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
