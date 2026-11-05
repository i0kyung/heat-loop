// sensor-adapter.js — 데이터 출처를 어댑터로 분리한다.
//   SimulationAdapter : 내부 시뮬레이터 → source=SIMULATED
//   SerialAdapter     : ESP32(HEAT LOOP Sense) USB 직렬 → source=MEASURED
//   parsePayload      : Invalid Data Handler. 형식이 틀리면 MEASURED로 올리지 않는다.
//
// 공통 인터페이스: { kind, label, start(onReading, onError), stop(), setMode(mode) }

import { STATUS, MODE } from './thermal.js';
import { createSimulation } from './simulation.js';

/** 브라우저 지원 여부 */
export function serialSupport(nav = globalThis.navigator, ctx = globalThis) {
  const hasApi = !!(nav && 'serial' in nav);
  const secure = !!(ctx && ctx.isSecureContext);
  let reason = '';
  if (!hasApi) reason = '이 브라우저는 Web Serial을 지원하지 않습니다. 데스크톱 Chrome 또는 Edge(89+)를 쓰세요. Safari·Firefox·모바일은 미지원입니다.';
  else if (!secure) reason = 'Web Serial은 HTTPS 또는 localhost에서만 동작합니다.';
  return { ok: hasApi && secure, reason };
}

/**
 * ESP32가 보낸 한 줄(JSON)을 측정값으로 바꾼다. (순수 함수)
 * 허용 키: t1..t4 또는 drainInC/drainOutC/coldInC/coldOutC, drainFlowLpm/warmFlowLpm, coldFlowLpm, sensorStatus
 * @returns {{ ok:true, reading } | { ok:false, error }}
 */
export function parsePayload(line, uiMode = MODE.ON, nowSec = 0) {
  let obj;
  try {
    obj = typeof line === 'string' ? JSON.parse(line) : line;
  } catch {
    return { ok: false, error: '형식이 JSON이 아닙니다.' };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: '빈 데이터입니다.' };

  const pick = (...keys) => {
    for (const k of keys) if (k in obj) return toNum(obj[k]);
    return null;
  };
  const reading = {
    source: STATUS.MEASURED,
    mode: obj.mode === MODE.BYPASS || obj.mode === MODE.ON ? obj.mode : uiMode,
    t: typeof obj.t === 'number' ? obj.t : nowSec,
    deviceId: String(obj.deviceId ?? 'unknown').slice(0, 40),
    t1: pick('t1', 'drainInC', 'warmInC'),
    t2: pick('t2', 'drainOutC', 'warmOutC'),
    t3: pick('t3', 'coldInC'),
    t4: pick('t4', 'coldOutC'),
    drainFlowLpm: pick('drainFlowLpm', 'warmFlowLpm'),
    coldFlowLpm: pick('coldFlowLpm')
  };
  if (obj.sensorStatus && obj.sensorStatus !== 'OK') {
    reading.deviceFault = String(obj.sensorStatus).slice(0, 60);
  }
  return { ok: true, reading };
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 내부 시뮬레이터 어댑터 */
export function createSimulationAdapter(params = {}) {
  const sim = createSimulation(params);
  let timer = null;
  let speed = 60; // 실제 1초 = 시나리오 60초
  const tickMs = 250;
  return {
    kind: 'simulation',
    label: '시뮬레이션',
    sim,
    setSpeed(s) { speed = s; },
    get speed() { return speed; },
    setMode: (m) => sim.setMode(m),
    start(onReading) {
      if (timer) return;
      timer = setInterval(() => {
        if (sim.done) return;
        onReading(sim.step((tickMs / 1000) * speed));
      }, tickMs);
    },
    stop() { clearInterval(timer); timer = null; },
    get running() { return !!timer; }
  };
}

/**
 * Web Serial 어댑터 (HEAT LOOP Sense, 115200bps, 줄마다 JSON 1건)
 * 사용자가 버튼을 눌러야 포트 선택 창이 열린다(브라우저 보안 규칙).
 */
export function createSerialAdapter({ baudRate = 115200 } = {}) {
  let port = null;
  let reader = null;
  let keepReading = false;
  let uiMode = MODE.ON;
  const t0 = performance.now();
  return {
    kind: 'serial',
    label: 'USB 센서 (Web Serial)',
    setMode(m) { uiMode = m; },
    async start(onReading, onError) {
      const sup = serialSupport();
      if (!sup.ok) { onError?.(sup.reason); return false; }
      try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate });
      } catch (e) {
        onError?.(e?.name === 'NotFoundError' ? '포트를 선택하지 않았습니다.' : `포트를 열 수 없습니다: ${e?.message ?? e}`);
        return false;
      }
      keepReading = true;
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable).catch(() => {});
      reader = decoder.readable.getReader();
      let buf = '';
      (async () => {
        try {
          while (keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line) continue;
              const res = parsePayload(line, uiMode, (performance.now() - t0) / 1000);
              if (res.ok) onReading(res.reading);
              else onReading({ source: STATUS.MEASURED, mode: uiMode, t: (performance.now() - t0) / 1000, parseError: res.error });
            }
            if (buf.length > 4096) buf = ''; // 줄바꿈 없는 쓰레기 데이터 방지
          }
        } catch (e) {
          onError?.(`연결이 끊겼습니다: ${e?.message ?? e}`);
        }
      })();
      return true;
    },
    async stop() {
      keepReading = false;
      try { await reader?.cancel(); } catch {}
      try { await port?.close(); } catch {}
      port = null; reader = null;
    }
  };
}
