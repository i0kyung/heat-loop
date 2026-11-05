// building-model.js — 건물 개략 치수 계산 (순수 함수, Three.js 없음 → node 테스트 가능)
// 층 번호: 1 = 지상 1층, 2 = 2층 … / -1 = 지하 1층(B1), -2 = B2
// 모든 길이 단위는 m. 입력 치수로 만든 개략 매스 모델이며 실측 도면이 아니다.

export const DEFAULT_BUILDING = Object.freeze({
  floorsAbove: 5,
  floorsBelow: 1,
  floorHeight: 4.0,
  width: 20, // 정면 가로
  depth: 20, // 측면 세로
  showerFloor: 2,
  mechFloor: -1
});

/** Core V가 들어갈 수직 직선 구간 최소 길이 — 상용 수직형(예: 48인치 ≈ 1.2 m) 참고 가정 */
export const CORE_MIN_STRAIGHT_M = 1.2;
/** 기계실 천장 속 배관·보 공간 등 수직 배관에 못 쓰는 높이 (가정) */
export const CEILING_RESERVE_M = 0.6;
/** 바닥 쪽 배수 꺾임·점검 여유 높이 (가정) */
export const FLOOR_CLEAR_M = 0.4;
const SLAB_M = 0.3;

export const floorLabel = (f) => (f > 0 ? `${f}F` : `B${-f}`);

/** 층 바닥 높이(m). 지상 1층 바닥 = 0 */
export function floorBase(f, h) {
  return f > 0 ? (f - 1) * h : f * h;
}

/** 선택 가능한 층 목록 (아래층부터) */
export function floorList(b) {
  const out = [];
  for (let i = b.floorsBelow; i >= 1; i--) out.push(-i);
  for (let i = 1; i <= b.floorsAbove; i++) out.push(i);
  return out;
}

const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** 입력 정리 + 파생 치수 */
export function measure(input) {
  const b = {
    floorsAbove: Math.round(clamp(input.floorsAbove, 1, 80, DEFAULT_BUILDING.floorsAbove)),
    floorsBelow: Math.round(clamp(input.floorsBelow, 0, 8, DEFAULT_BUILDING.floorsBelow)),
    floorHeight: clamp(input.floorHeight, 2.4, 8, DEFAULT_BUILDING.floorHeight),
    width: clamp(input.width, 5, 300, DEFAULT_BUILDING.width),
    depth: clamp(input.depth, 5, 300, DEFAULT_BUILDING.depth),
    showerFloor: Math.round(input.showerFloor ?? DEFAULT_BUILDING.showerFloor),
    mechFloor: Math.round(input.mechFloor ?? DEFAULT_BUILDING.mechFloor)
  };
  const floors = floorList(b);
  if (!floors.includes(b.showerFloor)) b.showerFloor = floors[floors.length - 1];
  if (!floors.includes(b.mechFloor)) b.mechFloor = floors[0];

  const h = b.floorHeight;
  const heightAbove = b.floorsAbove * h;
  const depthBelow = b.floorsBelow * h;
  const grossArea = b.width * b.depth * (b.floorsAbove + b.floorsBelow);
  const showerBase = floorBase(b.showerFloor, h);
  const mechBase = floorBase(b.mechFloor, h);

  const issues = [];
  let riserLength = null;
  let coreFits = null;
  if (mechBase >= showerBase) {
    issues.push('기계실이 샤워실보다 아래층에 있어야 샤워 배수가 내려가는 수직 배수관에 Core를 설치할 수 있습니다.');
  } else {
    // 샤워실 바닥에서 기계실 천장까지 내려오는 배수 수직관 길이 (개략)
    riserLength = showerBase - (mechBase + h);
    if (riserLength < 0) riserLength = 0;
    // Core를 놓을 수 있는 기계실 안 수직 직선 구간
    const straightInMech = h - SLAB_M - CEILING_RESERVE_M - FLOOR_CLEAR_M;
    coreFits = straightInMech >= CORE_MIN_STRAIGHT_M;
    if (!coreFits) issues.push(`기계실 층고로는 Core 수직 구간(가정 ${CORE_MIN_STRAIGHT_M} m 이상)을 확보하기 어렵습니다. 천장 속 공간을 현장에서 확인하세요.`);
  }
  return {
    b, floors, h, heightAbove, depthBelow, totalHeight: heightAbove + depthBelow, grossArea,
    showerBase, mechBase, riserLength, coreFits,
    coreLength: Math.min(CORE_MIN_STRAIGHT_M, Math.max(0.6, h - SLAB_M - CEILING_RESERVE_M - FLOOR_CLEAR_M)),
    issues
  };
}

/** 지상 눈높이에서 건물 꼭대기를 올려다보는 각도(°) */
export function viewAngleDeg(heightAbove, distance, eye = 1.6) {
  if (!(distance > 0)) return null;
  return (Math.atan((heightAbove - eye) / distance) * 180) / Math.PI;
}

/** 정면 화면 축척 막대: 대략 화면 폭의 1/5에 맞는 깔끔한 길이(1·2·5×10ⁿ m) */
export function niceScale(metersAcross) {
  const target = metersAcross / 5;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}
