// factors.js — 물성값·배출계수·환산값을 한 곳에서 관리한다.
// 모든 값에는 출처·연도·확인 상태를 붙인다. verified:false 값은 화면에서 '확인 필요'로 표시하고
// 확정 수치처럼 쓰지 않는다.

/** 물 물성 (모델 가정) */
export const WATER = {
  cp_kJ_per_kgK: 4.186, // 비열. 15~40℃ 범위에서 약 4.18 kJ/kg·K로 거의 일정 → 근사값
  density_kg_per_L: 1.0, // 밀도. 실제 15℃ 0.999, 40℃ 0.992 → 최대 약 0.8% 과대 추정
  note: '비열 4.186 kJ/kg·K, 밀도 1.0 kg/L 근사 (15~40℃에서 오차 1% 이내)'
};

export const KWH_PER_GCAL = 1163; // 1 Gcal = 1,163 kWh (정의값)
export const MJ_PER_KWH = 3.6; // 정의값

/**
 * 탄소배출계수. 기존 탄소첫걸음 factors.js(2026-11-05 조사)에서 가져왔다.
 * 단위를 반드시 함께 쓴다.
 */
export const EMISSION = {
  electricity: {
    value: 0.4173,
    unit: 'kgCO2eq/kWh',
    source: '국가 전력배출계수(2023년 기준), 기후에너지환경부 2025.12.18 공표',
    year: 2023,
    verified: true
  },
  city_gas: {
    // 순발열량 38.5 MJ/Nm³ × IPCC 2006 상업/공공 고정연소 계수(CO2 56,100 / CH4 5 / N2O 0.1 kg/TJ), GWP AR5(28, 265)
    value: 2.1663,
    unit: 'kgCO2eq/Nm³',
    source: '에너지법 시행규칙 별표 순발열량(2022.11.21) × IPCC 2006 GL Vol.2 Ch.2 Table 2.4, GWP AR5',
    year: 2022,
    verified: true
  },
  district_heat: {
    value: 0.1226,
    unit: 'tCO2eq/Gcal (단위 추정)',
    source: '국토교통부 탄소공간지도 건물 산정방법론. 원문에 단위 표기 없음',
    year: null,
    verified: false // ⚠️ 경제성 화면에서 확정 수치로 쓰지 않는다
  }
};

/** 도시가스 고지서(MJ, 총발열량 기준) → Nm³ 환산 */
export const CITY_GAS_GCV_MJ_PER_NM3 = 42.7;

/**
 * 급탕 열원 기본값. 모두 '가정치(ESTIMATED)'이며 사용자가 바꿀 수 있다.
 * efficiency: 회수열 1 kWh_th가 줄여주는 최종에너지 = 1 / efficiency (히트펌프는 COP)
 */
export const HEAT_SOURCES = {
  gas: {
    label: '도시가스 보일러',
    efficiencyLabel: '보일러 효율',
    efficiency: 0.85,
    priceUnit: '원/MJ',
    price: 23,
    energyUnit: 'MJ',
    emissionKey: 'city_gas',
    note: '효율·단가 모두 가정치. 실제 고지서 단가(원/MJ)와 보일러 사양으로 바꾸세요.'
  },
  electric: {
    label: '전기저항 온수기',
    efficiencyLabel: '온수기 효율',
    efficiency: 0.95,
    priceUnit: '원/kWh',
    price: 160,
    energyUnit: 'kWh',
    emissionKey: 'electricity',
    note: '단가는 가정치. 실제 요금제(계약종별·시간대)를 넣어야 합니다.'
  },
  heatpump: {
    label: '히트펌프 급탕기',
    efficiencyLabel: '평균 COP',
    efficiency: 3.0,
    priceUnit: '원/kWh',
    price: 160,
    energyUnit: 'kWh',
    emissionKey: 'electricity',
    note: 'COP는 계절·급탕 온도에 따라 크게 변합니다. 히트펌프는 회수열 대비 절감 전력이 1/COP로 줄어듭니다.'
  },
  district: {
    label: '지역난방(열)',
    efficiencyLabel: '열교환 효율',
    efficiency: 0.95,
    priceUnit: '원/Mcal',
    price: 110,
    energyUnit: 'Mcal',
    emissionKey: 'district_heat',
    note: '지역난방 배출계수는 단위·최신값이 확인되지 않아 탄소 감소량을 확정하지 않습니다.'
  },
  other: {
    label: '기타/모름',
    efficiencyLabel: '효율',
    efficiency: null,
    priceUnit: '원/kWh',
    price: null,
    energyUnit: 'kWh',
    emissionKey: null,
    note: '열원을 알아야 절감 에너지·비용·탄소를 계산할 수 있습니다.'
  }
};

/** 열원 + 출처 목록 (보고서·근거 보기용) */
export function factorTable() {
  return [
    { name: '물 비열', value: WATER.cp_kJ_per_kgK, unit: 'kJ/kg·K', source: '물성 근사값', verified: true },
    { name: '물 밀도', value: WATER.density_kg_per_L, unit: 'kg/L', source: '물성 근사값(15~40℃)', verified: true },
    ...Object.entries(EMISSION).map(([k, f]) => ({
      name: { electricity: '전력 배출계수', city_gas: '도시가스 배출계수', district_heat: '지역난방 배출계수' }[k],
      value: f.value,
      unit: f.unit,
      source: f.source + (f.year ? ` (${f.year})` : ' (연도 미상)'),
      verified: f.verified
    })),
    { name: '도시가스 총발열량', value: CITY_GAS_GCV_MJ_PER_NM3, unit: 'MJ/Nm³', source: '도시가스 고지서 기준(총발열량)', verified: true }
  ];
}
