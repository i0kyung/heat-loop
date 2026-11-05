import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, estimateDaily, concurrentHeads } from '../js/suitability.js';
import { parsePayload } from '../js/sensor-adapter.js';

const gym = { type: 'gym', area: 2500, showerHeads: 10, dailyUsers: 300, minutesPerUser: 6, flowLpm: 9, heatSource: 'gas', pipe: 'vertical_access', existing: 'none', timeSlot: 'evening' };

test('헬스장 기본값 → 높음', () => {
  const r = diagnose(gym);
  assert.equal(r.level, 'high');
  assert.equal(Math.round(r.daily.liters), 16200);
});

test('정보가 빠지면 절대 높음이 나오지 않는다', () => {
  assert.equal(diagnose({ ...gym, pipe: 'unknown' }).level, 'check');
  assert.equal(diagnose({ ...gym, dailyUsers: null }).level, 'check');
  assert.equal(diagnose({ ...gym, existing: 'unknown' }).level, 'check');
  assert.equal(diagnose({}).level, 'check');
});

test('면적이 커도 샤워 배수가 적으면 높음이 아니다, 면적은 판정에 영향 없음', () => {
  const r = diagnose({ ...gym, area: 50000, dailyUsers: 20, minutesPerUser: 4 });
  assert.notEqual(r.level, 'high');
  assert.equal(diagnose({ ...gym, area: 50000 }).level, diagnose({ ...gym, area: 100 }).level);
});

test('오수 합류·기존 설비 → 낮음', () => {
  assert.equal(diagnose({ ...gym, pipe: 'shared_drain' }).level, 'low');
  assert.equal(diagnose({ ...gym, existing: 'yes' }).level, 'low');
});

test('동시 사용 샤워기는 이용 인원과 별개 변수, 미입력 시 가정치', () => {
  assert.deepEqual(concurrentHeads({ ...gym, peakConcurrent: 4 }), { value: 4, estimated: false });
  const est = concurrentHeads(gym);
  assert.equal(est.estimated, true);
  assert.equal(est.value, 9);
});

test('회수 열량 추정: 16,200 L × ε0.35 × 21℃', () => {
  const d = estimateDaily(gym);
  assert.ok(Math.abs(d.recoverKwh - (16200 * 4.186 * 0.35 * 21) / 3600) < 1e-6);
});

test('센서 페이로드 파싱: 별칭 키, 잘못된 JSON', () => {
  const ok = parsePayload('{"coldInC":15,"coldOutC":20,"warmInC":35,"warmOutC":31,"coldFlowLpm":2,"warmFlowLpm":2.5}');
  assert.equal(ok.ok, true);
  assert.equal(ok.reading.source, 'MEASURED');
  assert.equal(ok.reading.t4, 20);
  assert.equal(ok.reading.drainFlowLpm, 2.5);
  assert.equal(parsePayload('not json').ok, false);
  assert.equal(parsePayload('{"t1":"abc"}').reading.t1, null);
});
