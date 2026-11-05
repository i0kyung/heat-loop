// product-art.js — HEAT LOOP 설명용 개념도(SVG). 제조 도면이 아니며 치수는 정하지 않았다.

const C = {
  white: '#f4f1ea', whiteSide: '#e2ded3', whiteTop: '#fbfaf6',
  sage: '#88a99a', sageDeep: '#3f6b5a',
  char: '#2c3330', charSide: '#1e2422', charTop: '#3b4440',
  metal: '#c9c4ba', metalDark: '#9d978c',
  copper: '#c48a5c', copperDark: '#9a6440',
  hot: '#ef7a5a', cold: '#3d7fd9', pre: '#2fa58f', ink: '#1f2a26', muted: '#66736d', line: '#cfd3c6'
};

// 아이소메트릭 투영
const K = 0.866;
const P = (ox, oy) => (x, y, z) => [ox + (x - z) * K, oy + (x + z) * 0.5 - y];
const pts = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

function isoBox(p, x, y, z, w, h, d, f) {
  const front = [p(x, y, z + d), p(x + w, y, z + d), p(x + w, y + h, z + d), p(x, y + h, z + d)];
  const side = [p(x + w, y, z), p(x + w, y, z + d), p(x + w, y + h, z + d), p(x + w, y + h, z)];
  const top = [p(x, y + h, z), p(x + w, y + h, z), p(x + w, y + h, z + d), p(x, y + h, z + d)];
  const st = `stroke="${f.stroke ?? 'rgba(0,0,0,.18)'}" stroke-width="1" stroke-linejoin="round"`;
  return `<polygon points="${pts(side)}" fill="${f.side}" ${st}/><polygon points="${pts(front)}" fill="${f.front}" ${st}/><polygon points="${pts(top)}" fill="${f.top}" ${st}/>`;
}
const frontM = (p, x, yTop, zFront) => { const [e, f] = p(x, yTop, zFront); return `matrix(${K},0.5,0,1,${e.toFixed(1)},${f.toFixed(1)})`; };
const sideM = (p, xSide, yTop, zFront) => { const [e, f] = p(xSide, yTop, zFront); return `matrix(${K},-0.5,0,1,${e.toFixed(1)},${f.toFixed(1)})`; };

function cylinderUp(cx, cy, rx, len, fill, stroke = 'rgba(0,0,0,.25)') {
  const ry = rx * 0.5;
  return `<path d="M${cx - rx},${cy} v${-len} a${rx},${ry} 0 0 0 ${2 * rx},0 v${len} a${rx},${ry} 0 0 1 ${-2 * rx},0z" fill="${fill}" stroke="${stroke}"/>` +
    `<ellipse cx="${cx}" cy="${cy - len}" rx="${rx}" ry="${ry}" fill="${C.charTop}" stroke="${stroke}"/><ellipse cx="${cx}" cy="${cy - len}" rx="${rx * 0.62}" ry="${ry * 0.62}" fill="#111"/>`;
}

/** 3/4 아이소메트릭 제품 뷰 (Core V + Sense) */
export function productIso({ animated = false, labels = true } = {}) {
  const W = 200, D = 170, H = 560;
  const p = P(250, 690);
  const cap = 46;
  let s = '';
  // 바닥 그림자
  const sh = [p(-30, 0, -30), p(W + 30, 0, -30), p(W + 30, 0, D + 30), p(-30, 0, D + 30)];
  s += `<polygon points="${pts(sh)}" fill="rgba(31,42,38,.07)"/>`;
  // 하단 배수 출구
  const [bx, by] = p(W / 2, 0, D / 2);
  s += `<rect x="${bx - 34}" y="${by - 4}" width="68" height="60" fill="${C.char}"/><ellipse cx="${bx}" cy="${by + 56}" rx="34" ry="17" fill="${C.charSide}"/>`;
  // 본체: 하단 캡 / 몸통 / 상단 캡
  s += isoBox(p, 0, 0, 0, W, cap, D, { front: C.char, side: C.charSide, top: C.charTop });
  s += isoBox(p, 0, cap, 0, W, H - 2 * cap, D, { front: C.white, side: C.whiteSide, top: C.whiteTop });
  s += isoBox(p, 0, H - cap, 0, W, cap, D, { front: C.char, side: C.charSide, top: C.charTop });
  // 상단 배수 입구
  const [tx, ty] = p(W / 2, H, D / 2);
  s += cylinderUp(tx, ty + 2, 34, 70, C.char);

  // 정면 패널 (점검 커버)
  const body = H - 2 * cap;
  s += `<g transform="${frontM(p, 0, H - cap, D)}">`;
  s += `<rect x="14" y="16" width="${W - 28}" height="${body - 32}" rx="10" fill="none" stroke="rgba(0,0,0,.12)"/>`;
  // 내부를 보여주는 창: 브러시드 구리 코일
  s += `<defs><linearGradient id="cu" x1="0" x2="1"><stop offset="0" stop-color="${C.copperDark}"/><stop offset=".45" stop-color="#e2b48c"/><stop offset="1" stop-color="${C.copperDark}"/></linearGradient>` +
    `<clipPath id="win"><rect x="58" y="64" width="${W - 116}" height="${body - 190}" rx="${(W - 116) / 2}"/></clipPath></defs>`;
  s += `<rect x="58" y="64" width="${W - 116}" height="${body - 190}" rx="${(W - 116) / 2}" fill="#3a2a20"/>`;
  s += `<g clip-path="url(#win)">`;
  for (let y = 50; y < body - 110; y += 13) s += `<rect x="50" y="${y}" width="${W - 100}" height="8" rx="4" fill="url(#cu)" transform="rotate(-8 ${W / 2} ${y})"/>`;
  if (animated) s += `<rect x="${W / 2 - 9}" y="40" width="18" height="${body - 150}" fill="${C.hot}" opacity=".25"/>`;
  s += `</g>`;
  s += `<rect x="58" y="64" width="${W - 116}" height="${body - 190}" rx="${(W - 116) / 2}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2"/>`;
  // 세이지 밴드 + 로고 + 상태 LED
  s += `<rect x="0" y="${body - 92}" width="${W}" height="10" fill="${C.sage}"/>`;
  s += `<text x="${W / 2}" y="${body - 52}" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="800" font-size="17" letter-spacing="3" fill="${C.ink}">HEAT LOOP</text>`;
  s += `<circle cx="${W / 2}" cy="${body - 30}" r="5" fill="${C.pre}"${animated ? '><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>' : '/>'}`;
  for (const [x, y] of [[24, 26], [W - 24, 26], [24, body - 26], [W - 24, body - 26]]) s += `<circle cx="${x}" cy="${y}" r="3" fill="${C.metalDark}"/>`;
  s += `</g>`;

  // 측면: 급수 입·출구 포트 + Sense 모듈
  s += `<g transform="${sideM(p, W, H - cap, D)}">`;
  s += `<rect x="16" y="20" width="${D - 32}" height="${body - 40}" rx="8" fill="none" stroke="rgba(0,0,0,.08)"/>`;
  s += `<circle cx="${D * 0.5}" cy="54" r="15" fill="${C.char}"/><circle cx="${D * 0.5}" cy="54" r="7" fill="${C.pre}"/>`;
  s += `<circle cx="${D * 0.5}" cy="${body - 54}" r="15" fill="${C.char}"/><circle cx="${D * 0.5}" cy="${body - 54}" r="7" fill="${C.cold}"/>`;
  s += `</g>`;
  // Sense 모듈 (측면에 붙는 작은 박스)
  s += isoBox(p, W, 210, 40, 34, 120, 90, { front: C.whiteTop, side: C.white, top: '#fff' });
  s += `<g transform="${sideM(p, W + 34, 330, 130)}"><rect x="12" y="14" width="66" height="44" rx="6" fill="${C.char}"/>` +
    `<text x="45" y="34" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="11" font-weight="700" fill="#b9d5c8">kW_th</text>` +
    `<rect x="20" y="42" width="50" height="4" rx="2" fill="${C.sage}"/><circle cx="45" cy="84" r="4" fill="${C.sage}"/></g>`;
  // 급수 배관 스텁
  const [px1, py1] = p(W, H - cap - 54, D * 0.5);
  const [px2, py2] = p(W, cap + 54, D * 0.5);
  s += `<line x1="${px1}" y1="${py1}" x2="${px1 + 70}" y2="${py1 - 40}" stroke="${C.pre}" stroke-width="10" stroke-linecap="round"/>`;
  s += `<line x1="${px2}" y1="${py2}" x2="${px2 + 70}" y2="${py2 - 40}" stroke="${C.cold}" stroke-width="10" stroke-linecap="round"/>`;

  if (labels) {
    s += lab(tx - 150, ty - 70, tx - 36, ty - 52, '따뜻한 배수 입구', C.hot);
    s += lab(bx - 170, by + 70, bx - 36, by + 48, '식은 배수 → 하수', C.muted);
    s += lab(px1 + 60, py1 - 70, px1 + 66, py1 - 42, '예열된 급수 → 급탕기', C.pre, 'start');
    s += lab(px2 + 74, py2 - 6, px2 + 70, py2 - 36, '찬 급수 입구', C.cold, 'start');
  }
  return `<svg viewBox="40 40 600 880" role="img" aria-label="HEAT LOOP Core 3/4 아이소메트릭 개념도">${s}</svg>`;
}

function lab(x, y, lx, ly, text, color, anchor = 'start') {
  return `<line x1="${lx}" y1="${ly}" x2="${x + (anchor === 'start' ? 0 : 0)}" y2="${y}" stroke="${color}" stroke-width="1.2"/>` +
    `<circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/>` +
    `<text x="${x}" y="${y - 6}" text-anchor="${anchor}" font-family="Pretendard, sans-serif" font-size="13" font-weight="700" fill="${color === C.muted ? C.ink : color}">${text}</text>`;
}

// ---------- 다면도 ----------
const T = (x, y, t, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a ?? 'middle'}" font-family="Pretendard, sans-serif" font-size="${o.s ?? 12}" font-weight="${o.w ?? 600}" fill="${o.c ?? C.muted}">${t}</text>`;

function bodyRect(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="20" fill="${C.char}"/>` +
    `<rect x="${x}" y="${y + 20}" width="${w}" height="${h - 40}" fill="${C.white}" stroke="${C.line}"/>` +
    `<rect x="${x}" y="${y + h - 20}" width="${w}" height="20" fill="${C.char}"/>` +
    `<rect x="${x + w / 2 - 14}" y="${y - 30}" width="28" height="30" fill="${C.char}"/>` +
    `<rect x="${x + w / 2 - 14}" y="${y + h}" width="28" height="26" fill="${C.char}"/>`;
}

export function orthographic() {
  const w = 90, h = 260, y = 70;
  const views = [];
  // 정면
  let x = 30;
  views.push(bodyRect(x, y, w, h) +
    `<rect x="${x + 28}" y="${y + 50}" width="34" height="130" rx="17" fill="${C.copper}"/>` +
    `<rect x="${x}" y="${y + h - 66}" width="${w}" height="5" fill="${C.sage}"/>` +
    `<circle cx="${x + w / 2}" cy="${y + h - 34}" r="3.5" fill="${C.pre}"/>` +
    T(x + w / 2, y + h - 46, 'HEAT LOOP', { s: 8, w: 800, c: C.ink }) + T(x + w / 2, y + h + 50, '정면', { c: C.ink, w: 700 }) + T(x + w / 2, y + h + 66, '점검 커버·관찰창'));
  // 후면
  x = 160;
  views.push(bodyRect(x, y, w, h) +
    `<rect x="${x + 14}" y="${y + 34}" width="8" height="${h - 68}" fill="${C.metal}"/><rect x="${x + w - 22}" y="${y + 34}" width="8" height="${h - 68}" fill="${C.metal}"/>` +
    [60, 130, 200].map((d) => `<rect x="${x + 8}" y="${y + d}" width="${w - 16}" height="10" rx="3" fill="${C.metalDark}"/>`).join('') +
    T(x + w / 2, y + h + 50, '후면', { c: C.ink, w: 700 }) + T(x + w / 2, y + h + 66, '벽 고정 레일·배관 클램프'));
  // 좌측
  x = 290;
  views.push(bodyRect(x, y, 76, h) +
    `<rect x="${x + 76}" y="${y + 120}" width="18" height="70" rx="4" fill="${C.whiteTop}" stroke="${C.line}"/>` +
    T(x + 38, y + h + 50, '좌측', { c: C.ink, w: 700 }) + T(x + 38, y + h + 66, 'Sense 모듈(측면 부착)'));
  // 우측
  x = 420;
  views.push(bodyRect(x, y, 76, h) +
    `<circle cx="${x + 38}" cy="${y + 52}" r="11" fill="${C.char}"/><circle cx="${x + 38}" cy="${y + 52}" r="5" fill="${C.pre}"/>` +
    `<circle cx="${x + 38}" cy="${y + h - 52}" r="11" fill="${C.char}"/><circle cx="${x + 38}" cy="${y + h - 52}" r="5" fill="${C.cold}"/>` +
    `<path d="M${x + 6},${y + h - 22} h64 l-6,10 h-52z" fill="${C.metal}"/>` +
    T(x + 38, y + h + 50, '우측', { c: C.ink, w: 700 }) + T(x + 38, y + h + 66, '급수 입·출구, 물받이'));
  // 상단
  x = 560;
  views.push(`<rect x="${x}" y="${y + 60}" width="${w}" height="76" rx="10" fill="${C.charTop}"/>` +
    `<circle cx="${x + w / 2}" cy="${y + 98}" r="20" fill="${C.char}" stroke="#555"/><circle cx="${x + w / 2}" cy="${y + 98}" r="12" fill="#111"/>` +
    `<circle cx="${x + w + 6}" cy="${y + 80}" r="7" fill="${C.pre}"/><circle cx="${x + w + 6}" cy="${y + 116}" r="7" fill="${C.cold}"/>` +
    T(x + w / 2, y + h + 50, '상단', { c: C.ink, w: 700 }) + T(x + w / 2, y + h + 66, '배수관 관통 구조'));
  const dim = `<g stroke="${C.muted}" stroke-width="1"><line x1="14" y1="${y}" x2="14" y2="${y + h}"/><line x1="10" y1="${y}" x2="18" y2="${y}"/><line x1="10" y1="${y + h}" x2="18" y2="${y + h}"/></g>` +
    `<text x="8" y="${y + h / 2}" transform="rotate(-90 8 ${y + h / 2})" text-anchor="middle" font-size="11" fill="${C.muted}" font-family="Pretendard">높이: 배관 길이에 따라 결정(미정)</text>`;
  return `<svg viewBox="0 0 690 420" role="img" aria-label="정면·후면·좌측·우측·상단 다면도">${views.join('')}${dim}</svg>`;
}

/** 내부 열교환 구조 단면 */
export function internalSection() {
  const cx = 300;
  let s = `<defs><pattern id="ins" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f1efe7"/><line x1="0" y1="0" x2="0" y2="8" stroke="#d7d2c4" stroke-width="3"/></pattern>` +
    `<linearGradient id="dr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hot}"/><stop offset="1" stop-color="#f6b7a3"/></linearGradient>` +
    `<linearGradient id="cw" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.cold}"/><stop offset="1" stop-color="${C.pre}"/></linearGradient></defs>`;
  // 외장 커버
  s += `<rect x="${cx - 150}" y="40" width="300" height="420" rx="18" fill="${C.white}" stroke="${C.line}"/>`;
  // 단열층
  s += `<rect x="${cx - 128}" y="62" width="256" height="376" rx="10" fill="url(#ins)"/>`;
  // 이중벽 배수관
  s += `<rect x="${cx - 62}" y="20" width="124" height="460" fill="${C.copperDark}"/>`;
  s += `<rect x="${cx - 54}" y="20" width="108" height="460" fill="#fff"/>`; // 누수 감지 틈
  s += `<rect x="${cx - 50}" y="20" width="100" height="460" fill="${C.copper}"/>`;
  s += `<rect x="${cx - 44}" y="20" width="88" height="460" fill="url(#dr)"/>`;
  // 배수 흐름 화살표 (벽면을 타고 흐르는 막)
  for (let y = 60; y < 460; y += 70) s += `<path d="M${cx - 30},${y} l8,18 l8,-18" fill="none" stroke="#fff" stroke-width="2.5" opacity=".8"/><path d="M${cx + 14},${y + 30} l8,18 l8,-18" fill="none" stroke="#fff" stroke-width="2.5" opacity=".8"/>`;
  // 외측 코일 단면 (좌·우)
  for (let i = 0; i < 12; i++) {
    const y = 440 - i * 32;
    const t = i / 11;
    const col = mix(C.cold, C.pre, t);
    s += `<rect x="${cx - 92}" y="${y - 12}" width="28" height="24" rx="8" fill="${col}" stroke="${C.copperDark}" stroke-width="3"/>`;
    s += `<rect x="${cx + 64}" y="${y - 12 - 16}" width="28" height="24" rx="8" fill="${col}" stroke="${C.copperDark}" stroke-width="3"/>`;
  }
  // 열 이동 화살표
  for (const y of [140, 260, 380]) {
    s += `<path d="M${cx - 48},${y} h-14" stroke="${C.hot}" stroke-width="3"/><path d="M${cx + 48},${y - 16} h14" stroke="${C.hot}" stroke-width="3"/>`;
  }
  // 라벨
  const L = (x, y, t, c = C.ink, a = 'start') => T(x, y, t, { a, c, w: 700, s: 13 });
  s += `<line x1="${cx}" y1="8" x2="${cx}" y2="20" stroke="${C.hot}"/>` + L(cx, 0 + 12, '따뜻한 샤워 배수 ↓', C.hot, 'middle');
  s += L(cx + 170, 70, '① 외장 커버 (Warm White)');
  s += L(cx + 170, 110, '② 단열층 — 결로·열손실 방지');
  s += L(cx + 170, 150, '③ 급수 코일 (구리, 바깥쪽)');
  s += L(cx + 170, 190, '④ 이중벽 + 누수 감지 틈');
  s += L(cx + 170, 230, '⑤ 배수관 (구리, 안쪽)');
  s += L(cx + 170, 290, '두 물길은 금속 벽으로 분리,', C.sageDeep);
  s += L(cx + 170, 308, '열만 바깥으로 이동합니다.', C.sageDeep);
  s += L(cx + 170, 360, '급수는 아래→위 (향류)', C.cold);
  s += L(cx + 170, 380, '배수는 위→아래', C.hot);
  s += `<line x1="${cx + 166}" y1="66" x2="${cx + 150}" y2="66" stroke="${C.muted}"/><line x1="${cx + 166}" y1="106" x2="${cx + 128}" y2="106" stroke="${C.muted}"/>` +
    `<line x1="${cx + 166}" y1="146" x2="${cx + 92}" y2="146" stroke="${C.muted}"/><line x1="${cx + 166}" y1="186" x2="${cx + 58}" y2="186" stroke="${C.muted}"/><line x1="${cx + 166}" y1="226" x2="${cx + 44}" y2="226" stroke="${C.muted}"/>`;
  return `<svg viewBox="0 0 680 490" role="img" aria-label="내부 열교환 구조 단면 개념도">${s}</svg>`;
}

/** 분해도 */
export function exploded() {
  // 앞(왼쪽)에서 뒤(오른쪽) 순서로 펼친 측면 분해도. 점선은 조립 축.
  const mid = 230;
  let s = `<line x1="20" y1="${mid}" x2="880" y2="${mid}" stroke="${C.muted}" stroke-dasharray="6 6"/>`;
  const label = (x, n, t1, t2) => T(x, 430, n, { c: C.sageDeep, w: 800, s: 13 }) + T(x, 450, t1, { c: C.ink, w: 700, s: 12.5 }) + (t2 ? T(x, 468, t2, { s: 11.5 }) : '');
  // ① Sense
  s += `<rect x="40" y="${mid - 55}" width="70" height="110" rx="10" fill="${C.whiteTop}" stroke="${C.line}"/><rect x="50" y="${mid - 40}" width="50" height="34" rx="5" fill="${C.char}"/><circle cx="75" cy="${mid + 30}" r="5" fill="${C.sage}"/>`;
  s += label(75, '①', 'Sense 모듈', '먼저 분리해 점검');
  // ② 점검 커버
  s += `<rect x="160" y="${mid - 160}" width="22" height="320" rx="6" fill="${C.white}" stroke="${C.line}"/><rect x="160" y="${mid + 80}" width="22" height="8" fill="${C.sage}"/><rect x="164" y="${mid - 100}" width="14" height="140" rx="7" fill="#3a2a20" opacity=".7"/>`;
  s += label(171, '②', '점검 커버', '관찰창 · 공구로 분리');
  // ③ 단열 셸 앞쪽
  s += `<path d="M240,${mid - 150} h40 a14,14 0 0 1 14,14 v272 a14,14 0 0 1 -14,14 h-40z" fill="url(#hatch)" stroke="${C.line}"/>`;
  s += label(266, '③', '단열 셸(앞)', '결로·열손실 방지');
  // ④ Core: 이중벽 배수관 + 코일
  s += `<rect x="370" y="${mid - 200}" width="60" height="400" fill="${C.copper}"/><rect x="380" y="${mid - 200}" width="40" height="400" fill="${C.hot}" opacity=".55"/>`;
  for (let i = 0; i < 11; i++) {
    const y = mid + 150 - i * 30;
    s += `<rect x="350" y="${y - 8}" width="100" height="14" rx="7" fill="${mix(C.cold, C.pre, i / 10)}" stroke="${C.copperDark}" stroke-width="2" transform="rotate(-7 400 ${y})"/>`;
  }
  s += label(400, '④', 'Core 열교환부', '이중벽 배수관 + 급수 코일');
  // ⑤ 단열 셸 뒤쪽
  s += `<path d="M530,${mid - 150} h-40 a14,14 0 0 0 -14,14 v272 a14,14 0 0 0 14,14 h40z" fill="url(#hatch)" stroke="${C.line}"/>`;
  s += label(505, '⑤', '단열 셸(뒤)');
  // ⑥ 후면 프레임
  s += `<rect x="600" y="${mid - 170}" width="16" height="340" fill="${C.metal}" stroke="${C.metalDark}"/>` + [-110, 0, 110].map((d) => `<rect x="592" y="${mid + d - 6}" width="32" height="12" rx="3" fill="${C.metalDark}"/>`).join('');
  s += label(608, '⑥', '후면 프레임', '벽 고정 레일·클램프');
  // ⑦ 상·하단 캡
  s += `<rect x="690" y="${mid - 120}" width="110" height="34" rx="6" fill="${C.char}"/><rect x="730" y="${mid - 150}" width="30" height="30" fill="${C.char}"/>`;
  s += `<rect x="690" y="${mid + 86}" width="110" height="34" rx="6" fill="${C.char}"/><rect x="730" y="${mid + 120}" width="30" height="30" fill="${C.char}"/><path d="M700,${mid + 160} h90 l-10,14 h-70z" fill="${C.metal}"/>`;
  s += label(745, '⑦', '상·하단 캡', '배수 커플링 · 물받이');
  const defs = `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f1efe7"/><line x1="0" y1="0" x2="0" y2="8" stroke="#d7d2c4" stroke-width="3"/></pattern></defs>`;
  s += T(20, 24, '앞 ← 조립 순서 → 뒤', { a: 'start', c: C.muted, w: 700, s: 12 });
  return `<svg viewBox="0 0 900 480" role="img" aria-label="분해도 개념: Sense, 점검 커버, 단열 셸, Core, 후면 프레임, 상하단 캡">${defs}${s}</svg>`;
}

/** 설치 시나리오: 2층 샤워실 → 1층 천장/기계실 수직 배수관 */
export function installScene() {
  let s = '';
  // 층 구분
  s += `<rect x="0" y="0" width="760" height="220" fill="#f6f4ee"/><rect x="0" y="220" width="760" height="22" fill="#d9d5ca"/><rect x="0" y="242" width="760" height="258" fill="#eef0e8"/>`;
  s += T(20, 30, '2F 헬스장 샤워실', { a: 'start', c: C.ink, w: 800, s: 15 }) + T(20, 270, '1F 기계실 / 천장 속 배관 구간', { a: 'start', c: C.ink, w: 800, s: 15 });
  // 샤워 부스
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 90;
    s += `<rect x="${x}" y="60" width="74" height="150" rx="6" fill="#fff" stroke="${C.line}"/><path d="M${x + 37},70 v16 m-14,0 h28" stroke="${C.charSide}" stroke-width="4" stroke-linecap="round"/>`;
    for (let k = 0; k < 4; k++) s += `<line x1="${x + 27 + k * 6}" y1="92" x2="${x + 24 + k * 7}" y2="118" stroke="${C.cold}" stroke-width="1.5" opacity=".5"/>`;
    s += `<line x1="${x + 37}" y1="210" x2="${x + 37}" y2="228" stroke="${C.hot}" stroke-width="5"/>`;
  }
  // 수평 모음관 → 수직 배수관
  s += `<path d="M157,228 H520 V470" fill="none" stroke="${C.hot}" stroke-width="10" stroke-linejoin="round" class="flow" style="--dur:1.6s"/>`;
  // Core V (수직관에 설치)
  s += `<rect x="496" y="300" width="48" height="130" rx="8" fill="${C.white}" stroke="${C.charSide}" stroke-width="2"/><rect x="496" y="300" width="48" height="12" fill="${C.char}"/><rect x="496" y="418" width="48" height="12" fill="${C.char}"/><rect x="496" y="390" width="48" height="4" fill="${C.sage}"/>`;
  s += `<rect x="546" y="340" width="14" height="34" rx="3" fill="#fff" stroke="${C.line}"/>`;
  // 급수 → Core → 급탕기 → 샤워
  s += `<path d="M740,450 H600 V410 H544" fill="none" stroke="${C.cold}" stroke-width="7" class="flow" style="--dur:1.8s"/>`;
  s += `<path d="M544,320 H640 V300" fill="none" stroke="${C.pre}" stroke-width="7" class="flow" style="--dur:1.8s"/>`;
  s += `<rect x="610" y="250" width="60" height="50" rx="8" fill="${C.charSide}"/>` + T(640, 280, '급탕기', { c: '#fff', w: 700 });
  s += `<path d="M640,250 V200 H600" fill="none" stroke="${C.hot}" stroke-width="5" stroke-dasharray="2 6"/>`;
  s += T(668, 470, '찬 급수', { c: C.cold, w: 700 }) + T(600, 335, '예열수', { c: C.pre, w: 700 });
  s += T(410, 330, 'HEAT LOOP Core V', { c: C.ink, w: 800 }) + T(410, 348, '수직 배수관 구간에 설치', { s: 11.5 });
  s += T(520, 492, '↓ 하수', { c: C.muted });
  // 작업 공간 표시
  s += `<rect x="470" y="288" width="110" height="156" rx="10" fill="none" stroke="${C.sageDeep}" stroke-dasharray="4 5"/>` + T(525, 460, '점검·청소 작업 공간 확보', { c: C.sageDeep, s: 11 });
  return `<svg viewBox="0 0 760 500" role="img" aria-label="설치 시나리오 개념도">${s}</svg>`;
}

/** 센서·배관 연결 관계 */
export function wiring() {
  let s = '';
  const box = (x, y, w, h, t, sub, fill = '#fff') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${C.line}"/>` + T(x + w / 2, y + h / 2 - 2, t, { c: C.ink, w: 800, s: 13 }) + (sub ? T(x + w / 2, y + h / 2 + 15, sub, { s: 11 }) : '');
  const sensor = (x, y, t, c) => `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="${c}" stroke-width="3"/>` + T(x, y + 4, t, { c, w: 800, s: 11.5 });
  // 배수
  s += `<path d="M110,30 V430" stroke="${C.hot}" stroke-width="12"/>` + T(110, 22, '샤워 배수', { c: C.hot, w: 700 });
  s += box(70, 170, 80, 120, 'Core', '열교환', C.whiteTop);
  s += sensor(110, 110, 'T1', C.hot) + sensor(110, 350, 'T2', C.hot) + `<rect x="94" y="384" width="32" height="20" rx="4" fill="#fff" stroke="${C.metalDark}" stroke-width="2"/>` + T(110, 398, 'F1', { c: C.charSide, w: 800, s: 11 });
  // 급수
  s += `<path d="M420,420 H260 V300 H150" fill="none" stroke="${C.cold}" stroke-width="8"/>`;
  s += `<path d="M150,180 H260 V60 H420" fill="none" stroke="${C.pre}" stroke-width="8"/>`;
  s += `<path d="M300,420 V60" fill="none" stroke="${C.cold}" stroke-width="5" stroke-dasharray="6 6"/>` + T(318, 240, 'BYPASS 배관', { a: 'start', c: C.cold, s: 11.5, w: 700 });
  s += `<path d="M290,232 l20,16 m-20,0 l20,-16" stroke="${C.charSide}" stroke-width="3"/>`;
  s += sensor(230, 420, 'T3', C.cold) + sensor(360, 60, 'T4', C.pre) + `<rect x="368" y="410" width="32" height="20" rx="4" fill="#fff" stroke="${C.metalDark}" stroke-width="2"/>` + T(384, 424, 'F2', { c: C.charSide, w: 800, s: 11 });
  s += `<rect x="198" y="406" width="20" height="28" rx="3" fill="${C.charSide}"/>` + T(208, 452, '역류방지·차단(전문 설계)', { s: 10.5 });
  s += T(440, 64, '→ 급탕기', { a: 'start', c: C.pre, w: 700 }) + T(440, 424, '← 상수도 급수', { a: 'start', c: C.cold, w: 700 });
  // Sense / Hub / 대시보드
  s += box(520, 170, 130, 70, 'Sense', 'ESP32 · 센서 6개');
  s += box(520, 290, 130, 60, 'USB 직렬', 'Web Serial (115200)');
  s += box(690, 170, 120, 180, 'Dashboard', '브라우저');
  for (const [x, y] of [[125, 110], [125, 350], [126, 394], [245, 420], [375, 60], [400, 420]]) s += `<path d="M${x},${y} C${x + 120},${y} 440,205 520,205" fill="none" stroke="${C.sage}" stroke-width="1.5" stroke-dasharray="3 4"/>`;
  s += `<path d="M585,240 V290 M650,320 H690 M650,205 H690" stroke="${C.charSide}" stroke-width="2"/>`;
  return `<svg viewBox="0 0 830 470" role="img" aria-label="센서와 배관 연결 관계도">${s}</svg>`;
}

function mix(a, b, t) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [h(a), h(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
