// flowviz.js — STEP 02 흐름 시각화. 배수(위→아래)와 급수(아래→위)가 금속 벽을 사이에 두고 열만 주고받는 모습.

const COL = { hot: '#ef7a5a', hotPale: '#f8c3b3', cold: '#3d7fd9', pre: '#2fa58f', char: '#2c3330', line: '#cfd3c6', muted: '#66736d', ink: '#1f2a26', copper: '#b87a4b' };
const CX = 190, RX = 50, RY = 9, Y_BOT = 340, Y_TOP = 150, TURNS = 8;

function helix() {
  const pitch = (Y_BOT - Y_TOP) / TURNS;
  const back = [];
  const front = [];
  const steps = 18;
  for (let k = 0; k < TURNS * 2; k++) {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const th = (k + i / steps) * Math.PI;
      const x = CX + RX * Math.cos(th);
      const y = Y_BOT - (th / (2 * Math.PI)) * pitch + RY * Math.sin(th);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    (k % 2 === 0 ? front : back).push(d);
  }
  return { back: back.join(''), front: front.join('') };
}

export function buildFlowSvg() {
  const h = helix();
  const sensor = (id, x, y, color, label, side = 'right') => {
    const tx = side === 'right' ? x + 22 : x - 22;
    const anchor = side === 'right' ? 'start' : 'end';
    return `<g id="s-${id}"><circle cx="${x}" cy="${y}" r="13" fill="#fff" stroke="${color}" stroke-width="3"/>` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${color}">${id.toUpperCase()}</text>` +
      `<text x="${tx}" y="${y - 3}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="${COL.muted}">${label}</text>` +
      `<text id="v-${id}" x="${tx}" y="${y + 15}" text-anchor="${anchor}" font-size="16" font-weight="800" fill="${COL.ink}" class="num">—</text></g>`;
  };
  let particles = '';
  for (let i = 0; i < 10; i++) {
    const y = Y_TOP + 12 + i * ((Y_BOT - Y_TOP - 24) / 9);
    const dir = i % 2 ? 1 : -1;
    particles += `<circle class="heat-p" cx="${CX + dir * 16}" cy="${y.toFixed(0)}" r="3.2" fill="${COL.hot}" style="--hx:${dir * 30}px;animation-delay:${(i * 0.17).toFixed(2)}s"/>`;
  }
  return `<svg viewBox="0 0 600 470" role="img" aria-labelledby="vizTitle" font-family="Pretendard, sans-serif">
  <title id="vizTitle">배수열 회수 흐름도: 따뜻한 배수는 위에서 아래로, 찬 급수는 코일을 따라 아래에서 위로 흐르며 금속 벽을 통해 열만 이동합니다.</title>
  <defs>
    <linearGradient id="gDrain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COL.hot}"/><stop id="gDrainEnd" offset="1" stop-color="${COL.hotPale}"/></linearGradient>
    <linearGradient id="gCoil" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${COL.cold}"/><stop offset="1" stop-color="${COL.pre}"/></linearGradient>
  </defs>
  <!-- 샤워 -->
  <g id="shower"><path d="M${CX - 70},36 h40 v12" stroke="${COL.char}" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="${CX - 50}" y="46" width="40" height="8" rx="4" fill="${COL.char}"/>
    <g id="drops">${[0, 1, 2, 3, 4].map((i) => `<line class="flow" x1="${CX - 44 + i * 7}" y1="58" x2="${CX - 46 + i * 8}" y2="84" stroke="${COL.cold}" stroke-width="2" opacity=".5" style="--dur:.6s"/>`).join('')}</g>
    <text id="v-active" x="${CX - 90}" y="28" font-size="12" font-weight="700" fill="${COL.muted}">샤워기 0개 사용 중</text></g>
  <!-- 배수관 -->
  <path d="M${CX - 30},88 H${CX}" stroke="${COL.hot}" stroke-width="10" fill="none"/>
  <path id="coilBack" d="${h.back}" stroke="url(#gCoil)" stroke-width="7" fill="none" opacity=".35" stroke-linecap="round"/>
  <rect x="${CX - 20}" y="84" width="40" height="350" rx="6" fill="url(#gDrain)" stroke="${COL.copper}" stroke-width="3"/>
  <path id="drainFlow" class="flow" d="M${CX},90 V430" stroke="#fff" stroke-width="3" opacity=".75" fill="none" style="--dur:1.2s"/>
  <g id="heat">${particles}</g>
  <path id="coilFront" d="${h.front}" stroke="url(#gCoil)" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path id="coilFlow" class="flow rev" d="${h.front}" stroke="#fff" stroke-width="2.4" fill="none" opacity=".7"/>
  <!-- Core 외곽 -->
  <rect x="${CX - 76}" y="${Y_TOP - 26}" width="152" height="${Y_BOT - Y_TOP + 52}" rx="16" fill="none" stroke="${COL.muted}" stroke-dasharray="5 6"/>
  <text x="${CX - 84}" y="${(Y_TOP + Y_BOT) / 2}" transform="rotate(-90 ${CX - 84} ${(Y_TOP + Y_BOT) / 2})" text-anchor="middle" font-size="12" font-weight="800" fill="${COL.ink}" letter-spacing="1">HEAT LOOP Core</text>
  <!-- 급수 배관 -->
  <g id="pathOn">
    <path d="M370,420 H300 V${Y_BOT} H${CX + RX}" stroke="${COL.cold}" stroke-width="8" fill="none"/>
    <path d="M${CX + RX},${Y_TOP} H300 V110 H370" stroke="${COL.pre}" stroke-width="8" fill="none"/>
    <path class="flow cf" d="M370,420 H300 V${Y_BOT} H${CX + RX}" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
    <path class="flow cf" d="M${CX + RX},${Y_TOP} H300 V110 H370" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
  </g>
  <g id="pathBy">
    <path d="M370,420 V110" stroke="${COL.cold}" stroke-width="8" fill="none"/>
    <path class="flow cf" d="M370,420 V110" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
    <text x="380" y="270" font-size="12" font-weight="700" fill="${COL.cold}">BYPASS</text>
  </g>
  <path id="inMain" d="M590,420 H370" stroke="${COL.cold}" stroke-width="8" fill="none"/>
  <path id="outMain" d="M370,110 H590" stroke="${COL.pre}" stroke-width="8" fill="none"/>
  <path class="flow cf" d="M590,420 H370" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
  <path class="flow cf" d="M370,110 H590" stroke="#fff" stroke-width="2.4" fill="none" opacity=".8"/>
  <circle cx="370" cy="420" r="9" fill="${COL.char}"/><circle cx="370" cy="110" r="9" fill="${COL.char}"/>
  <text x="590" y="96" text-anchor="end" font-size="12" font-weight="700" fill="${COL.pre}">→ 급탕기 · 샤워 혼합밸브</text>
  <text x="590" y="456" text-anchor="end" font-size="12" font-weight="700" fill="${COL.cold}">← 상수도 급수</text>
  <text x="${CX}" y="462" text-anchor="middle" font-size="12" font-weight="700" fill="${COL.muted}">↓ 식은 배수 → 하수</text>
  ${sensor('t1', CX, 104, COL.hot, '배수 입구', 'left')}
  ${sensor('t2', CX, 400, COL.hot, '배수 출구', 'left')}
  ${sensor('t3', 480, 420, COL.cold, '급수 입구', 'right')}
  ${sensor('t4', 480, 110, COL.pre, '급수 출구', 'right')}
</svg>`;
}

/** 측정값으로 시각화를 갱신한다 */
export function updateFlowSvg(root, r, ev) {
  if (!root || !r) return;
  const q = (s) => root.querySelector(s);
  const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}℃` : '—');
  for (const k of ['t1', 't2', 't3', 't4']) {
    const el = q(`#v-${k}`);
    if (el) el.textContent = fmt(r[k]);
    const g = q(`#s-${k} circle`);
    if (g) g.setAttribute('stroke-dasharray', r[k] == null ? '3 3' : '');
  }
  const on = r.mode === 'ON';
  const flowing = (r.coldFlowLpm ?? 0) > 0.2 && (r.drainFlowLpm ?? 0) > 0.2;
  const dur = flowing ? Math.max(0.45, 2.6 - (r.coldFlowLpm ?? 0) / 30) : 2;
  root.style.setProperty('--dur', `${dur.toFixed(2)}s`);
  q('#pathOn').setAttribute('class', on ? 'lit' : 'dim');
  q('#pathBy').setAttribute('class', on ? 'dim' : 'lit');
  q('#coilFlow').classList.toggle('paused', !(on && flowing));
  q('#drainFlow').classList.toggle('paused', !flowing);
  root.querySelectorAll('.cf').forEach((e) => e.classList.toggle('paused', !flowing));
  q('#heat').style.display = on && flowing && ev?.kw > 0 ? '' : 'none';
  q('#drops').style.display = flowing ? '' : 'none';
  q('#gDrainEnd').setAttribute('stop-color', on && flowing ? '#f8c3b3' : COL.hot);
  const act = q('#v-active');
  if (act) act.textContent = r.active != null ? `샤워기 ${r.active}개 사용 중` : flowing ? '배수 흐름 감지' : '흐름 없음';
}
