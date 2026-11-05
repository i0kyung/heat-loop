// suitability.js — 배수열 회수 적합도 진단 (HEAT LOOP 자체 기준, 초기 가설)
// ⚠️ 서울시 건물 에너지 등급과 무관하다. 서울시 등급은 사용자가 입력한 값을 '참고'로만 보여준다.
// ⚠️ 연면적은 점수에 쓰지 않는다. 면적이 크다고 샤워 배수가 많은 것은 아니다.

import { WATER } from './factors.js';

export const BUILDING_TYPES = {
  gym: '헬스장', hotel: '호텔', dorm: '기숙사', sports: '스포츠센터', other: '기타'
};
export const PIPE_OPTIONS = {
  vertical_access: '샤워실 아래층 천장·기계실에 수직 배수관이 보임',
  horizontal_only: '바닥 아래 수평 배관만 있음(아래층 없음)',
  shared_drain: '샤워 배수가 화장실 오수와 합쳐진 뒤에만 접근 가능',
  no_access: '배관에 접근할 수 없음(매립·타 임차 구역)',
  unknown: '모름'
};
export const TIME_SLOTS = {
  morning: '아침(06~09시)', lunch: '점심(11~14시)', evening: '저녁(18~22시)', allday: '하루 종일 고르게'
};
export const EXISTING = { none: '없음', yes: '있음', unknown: '모름' };

/** 보수적 기본 가정값 — 사용자가 화면에서 수정할 수 있다 */
export const ASSUMPTIONS = {
  showerMixC: 38, // 샤워 혼합수 온도
  drainLossC: 2, // 샤워 꼭지 → 열교환기까지 배수 온도 손실
  coldInC: 15, // 상수도 연평균 급수 온도(서울, 가정)
  effectiveness: 0.35, // 진단 단계에서 쓰는 보수적 유효도 (시뮬레이션 0.40보다 낮게)
  headsPerCore: 4 // Core 1대가 담당할 동시 사용 샤워기 수 (설계 가설)
};

/** 판정 임계값 — 초기 가설, 인터뷰·실측 후 조정 */
export const THRESHOLDS = {
  highDailyL: 3000, // 하루 샤워 배수량 L 이상이면 '물량 충분'
  lowDailyL: 800 // 이 미만이면 회수할 열이 적다
};

const REQUIRED = ['type', 'showerHeads', 'dailyUsers', 'minutesPerUser', 'flowLpm', 'heatSource', 'pipe', 'existing'];
const LABELS = {
  type: '건물 유형', showerHeads: '샤워기 수', dailyUsers: '일평균 샤워 이용 인원', minutesPerUser: '1인 평균 샤워시간',
  flowLpm: '샤워 유량', heatSource: '급탕 열원', pipe: '급탕·배수 배관 위치', existing: '기존 열회수 설비'
};

const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * 하루 샤워 물 사용량과 회수 가능 열량(추정)
 * 회수 열량 kWh_th/일 = 물량(L) × ρ × cp × ε × (배수 입구 − 급수 입구) / 3600
 */
export function estimateDaily(input, a = ASSUMPTIONS) {
  const liters = input.dailyUsers * input.minutesPerUser * input.flowLpm;
  const drainIn = a.showerMixC - a.drainLossC;
  const dT = drainIn - a.coldInC;
  const showerHeatKwh = (liters * WATER.density_kg_per_L * WATER.cp_kJ_per_kgK * (a.showerMixC - a.coldInC)) / 3600;
  const recoverKwh = (liters * WATER.density_kg_per_L * WATER.cp_kJ_per_kgK * a.effectiveness * Math.max(0, dT)) / 3600;
  return { liters, showerHeatKwh, recoverKwh, drainInC: drainIn };
}

/**
 * 동시 사용 샤워기 수. 사용자가 입력하지 않으면 보수적으로 추정하고 '가정치'로 표시한다.
 * 추정: 피크 1시간에 하루 이용자의 30%가 몰린다고 보고, 그 시간 동안 동시에 켜진 평균 샤워기 수
 */
export function concurrentHeads(input) {
  if (pos(input.peakConcurrent)) return { value: Math.min(input.peakConcurrent, input.showerHeads || Infinity), estimated: false };
  if (!pos(input.dailyUsers) || !pos(input.minutesPerUser)) return { value: null, estimated: true };
  const est = Math.ceil((input.dailyUsers * 0.3 * input.minutesPerUser) / 60);
  return { value: Math.max(1, Math.min(est, input.showerHeads || est)), estimated: true };
}

/**
 * 적합도 판정
 * @returns {{ level:'high'|'check'|'low', label, reasons:[{ok, text}], missing:[], daily, concurrent, pipeChecks:[], product:{}, actions:[] }}
 */
export function diagnose(input, a = ASSUMPTIONS) {
  const missing = REQUIRED.filter((k) => {
    const v = input[k];
    if (['showerHeads', 'dailyUsers', 'minutesPerUser', 'flowLpm'].includes(k)) return !pos(v);
    return v === undefined || v === null || v === '';
  });
  const reasons = [];
  const daily = missing.some((k) => ['dailyUsers', 'minutesPerUser', 'flowLpm'].includes(k)) ? null : estimateDaily(input, a);
  const concurrent = concurrentHeads(input);

  // 1) 물량
  let volume = 'unknown';
  if (daily) {
    if (daily.liters >= THRESHOLDS.highDailyL) { volume = 'high'; reasons.push({ ok: true, text: `하루 샤워 배수량 약 ${fmt(daily.liters)} L — 회수할 열이 충분한 편입니다 (기준 ${fmt(THRESHOLDS.highDailyL)} L 이상).` }); }
    else if (daily.liters >= THRESHOLDS.lowDailyL) { volume = 'mid'; reasons.push({ ok: null, text: `하루 샤워 배수량 약 ${fmt(daily.liters)} L — 중간 수준입니다. 이용 인원 기록으로 확인이 필요합니다.` }); }
    else { volume = 'low'; reasons.push({ ok: false, text: `하루 샤워 배수량 약 ${fmt(daily.liters)} L — 회수할 열이 적어 투자 대비 효과가 작을 수 있습니다.` }); }
  }

  // 2) 배관
  const pipe = input.pipe;
  const pipeScore = { vertical_access: 'good', horizontal_only: 'mid', shared_drain: 'bad', no_access: 'bad', unknown: 'unknown' }[pipe] ?? 'unknown';
  if (pipe === 'vertical_access') reasons.push({ ok: true, text: '수직 배수관에 접근할 수 있어 상용 제품에서 널리 쓰는 수직형 열교환 구조를 검토할 수 있습니다.' });
  if (pipe === 'horizontal_only') reasons.push({ ok: null, text: '수평 배관만 있으면 수평형 모듈을 써야 하고, 수직형보다 효율이 낮을 수 있습니다.' });
  if (pipe === 'shared_drain') reasons.push({ ok: false, text: '오수와 합쳐진 배수는 온도가 낮고 오염·막힘 위험이 커서 권장하지 않습니다.' });
  if (pipe === 'no_access') reasons.push({ ok: false, text: '배관에 접근할 수 없으면 설치 공사가 어렵습니다.' });
  if (pipe === 'unknown') reasons.push({ ok: null, text: '배관 위치를 모르면 판정할 수 없습니다. 설비 도면이나 현장 확인이 필요합니다.' });

  // 3) 기존 설비
  if (input.existing === 'yes') reasons.push({ ok: false, text: '이미 배수열 회수 설비가 있으면 추가 설치 효과가 작습니다.' });
  if (input.existing === 'unknown') reasons.push({ ok: null, text: '기존 열회수 설비 여부를 확인해야 합니다.' });

  // 4) 열원 (적합도가 아니라 경제성에 영향)
  if (input.heatSource === 'heatpump') reasons.push({ ok: null, text: '히트펌프 급탕은 절감되는 전력이 회수열의 1/COP 수준이라 비용 효과가 작아질 수 있습니다.' });
  if (input.heatSource === 'district') reasons.push({ ok: null, text: '지역난방은 배출계수가 확인되지 않아 탄소 감소량을 확정할 수 없습니다.' });
  if (input.heatSource === 'other') reasons.push({ ok: null, text: '급탕 열원을 알아야 절감 비용을 계산할 수 있습니다.' });

  if (concurrent.estimated && concurrent.value) reasons.push({ ok: null, text: `피크 동시 사용 샤워기 수를 ${concurrent.value}개로 추정했습니다(가정치). 실제 값을 넣으면 제품 구성이 정확해집니다.` });

  // 판정 — 정보가 부족하면 절대 '높음'을 주지 않는다
  let level;
  if (missing.length || pipeScore === 'unknown' || input.existing === 'unknown') level = 'check';
  else if (pipeScore === 'bad' || input.existing === 'yes' || volume === 'low') level = 'low';
  else if (volume === 'high' && pipeScore === 'good') level = 'high';
  else level = 'check';

  const label = { high: '높음', check: '추가 확인 필요', low: '낮음' }[level];
  if (missing.length) reasons.unshift({ ok: null, text: `입력되지 않은 항목이 있어 판정을 보류했습니다: ${missing.map((k) => LABELS[k]).join(', ')}` });

  return {
    level, label, reasons, missing: missing.map((k) => LABELS[k]), daily, concurrent,
    pipeChecks: pipeChecks(input),
    product: productConfig(input, concurrent, a),
    actions: nextActions(level, input, missing, concurrent),
    areaNote: pos(input.area) ? `연면적 ${fmt(input.area)}㎡는 판정 점수에 쓰지 않았습니다. 샤워 배수량과 배관 조건이 판정 기준입니다.` : null,
    seoulGradeNote: input.seoulGrade ? `입력한 서울시 건물 에너지 등급: ${input.seoulGrade} (참고용. HEAT LOOP 적합도와 별개입니다.)` : null
  };
}

export function pipeChecks(input) {
  const list = [
    '샤워 배수가 다른 배수(화장실·주방)와 합쳐지기 전 구간이 있는지',
    '열교환 모듈을 설치할 직선 배관 길이와 작업 공간(분해·청소용 여유 포함)',
    '급수 인입관이 같은 기계실·샤프트로 지나가는지 (예열수를 보낼 경로)',
    '예열수를 급탕기로 보낼지, 샤워 혼합 밸브 찬물 쪽으로 보낼지, 둘 다로 보낼지',
    '역류방지·차단 밸브 위치와 급수 위생 기준 (전문 설비업체 검토 필수)',
    '배관 단열·결로 처리와 누수 시 물받이·배수 경로'
  ];
  if (input.pipe === 'horizontal_only') list.splice(1, 0, '바닥 아래 설치 높이와 배수 경사(수평형 모듈은 압력손실·막힘 점검 필요)');
  return list;
}

export function productConfig(input, concurrent, a = ASSUMPTIONS) {
  const conc = concurrent.value;
  const horizontal = input.pipe === 'horizontal_only';
  const cores = conc ? Math.max(1, Math.ceil(conc / a.headsPerCore)) : null;
  return {
    coreType: horizontal ? 'Core H (수평형, 차기 모델 검토)' : 'Core V (수직형)',
    cores,
    sense: cores,
    hub: 1,
    estimated: true,
    note: `Core 1대당 동시 사용 샤워기 ${a.headsPerCore}개를 맡는다는 설계 가설로 계산했습니다. 실제 용량은 시험 후 정합니다.`
  };
}

function nextActions(level, input, missing, concurrent) {
  const acts = [];
  if (missing.length) acts.push({ kind: 'input', text: '빠진 항목을 입력해 판정을 완료하세요.', to: '#diagnose' });
  if (input.pipe === 'unknown' || !input.pipe) acts.push({ kind: 'check', text: '설비 도면 또는 현장 사진으로 샤워 배수관 위치를 확인하세요.' });
  if (concurrent.estimated) acts.push({ kind: 'check', text: '피크 시간대 동시 사용 샤워기 수를 1주일 동안 기록하세요.' });
  if (level === 'high') acts.push({ kind: 'go', text: 'STEP 02에서 저녁 피크 시간 열 회수 시연을 확인하세요.', to: '#demo' });
  if (level === 'check') acts.push({ kind: 'go', text: '가정값으로 STEP 02 시연을 먼저 볼 수 있습니다. 결과는 가정치로 표시됩니다.', to: '#demo' });
  if (level === 'low') acts.push({ kind: 'check', text: '설치 효과가 작을 수 있습니다. 샤워 이용이 많은 다른 시설부터 검토하세요.' });
  acts.push({ kind: 'check', text: '실제 급탕·급수 배관 연결은 전문 설비업체와 관련 인증 검토가 필요합니다.' });
  return acts;
}

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
