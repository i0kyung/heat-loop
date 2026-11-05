// app.js — 라우팅, 상태, 화면 렌더링
import { evaluateReading, accumulate, modeStats, effectiveness, STATUS, MODE, LIMITS } from './thermal.js';
import { DEFAULT_SCENARIO, FAULTS, clockLabel } from './simulation.js';
import { createSimulationAdapter, createSerialAdapter, serialSupport } from './sensor-adapter.js';
import { diagnose, BUILDING_TYPES, PIPE_OPTIONS, TIME_SLOTS, EXISTING, ASSUMPTIONS } from './suitability.js';
import { analyze, sensitivity, DEFAULT_ECON } from './economics.js';
import { HEAT_SOURCES, EMISSION, factorTable, WATER } from './factors.js';
import { productIso, orthographic, internalSection, exploded, installScene, wiring } from './product-art.js';
import { buildFlowSvg, updateFlowSvg } from './flowviz.js';
import { lineChart } from './chart.js';
import { load, save } from './storage.js';
import { DEFAULT_BUILDING, measure, floorLabel } from './building-model.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const won = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString('ko-KR')}원` : '—');

const HEAT_SOURCE_CHIPS = { gas: '도시가스', electric: '전기저항', heatpump: '히트펌프', district: '지역열', other: '기타/모름' };

const EXAMPLES = {
  gym: { type: 'gym', area: 2400, showerHeads: 10, dailyUsers: 300, minutesPerUser: 6, flowLpm: 9, peakConcurrent: 6, heatSource: 'gas', pipe: 'vertical_access', existing: 'none', timeSlot: 'evening', seoulGrade: '' },
  hotel: { type: 'hotel', area: 18000, showerHeads: 120, dailyUsers: 190, minutesPerUser: 8, flowLpm: 9, peakConcurrent: null, heatSource: 'heatpump', pipe: 'unknown', existing: 'none', timeSlot: 'morning', seoulGrade: 'D' },
  partial: { type: 'other', area: 12000, showerHeads: 4, dailyUsers: null, minutesPerUser: null, flowLpm: 9, peakConcurrent: null, heatSource: 'other', pipe: 'unknown', existing: 'unknown', timeSlot: 'allday', seoulGrade: '' }
};

// ---------------- 상태 ----------------
const state = {
  diagInput: load('diag', { ...EXAMPLES.gym }),
  assumptions: load('assume', { ...ASSUMPTIONS }),
  diag: null,
  econInput: load('econ', null),
  demo: {
    adapter: null,
    srcKind: 'simulation',
    rows: [],
    acc: { kwh: 0, coveredSec: 0, skippedSec: 0 },
    prev: null,
    last: null,
    lastEval: null,
    issues: new Map(),
    autoDemo: false,
    simParams: load('sim', {}),
    fault: 'none',
    mode: MODE.ON,
    measuredEff: null
  },
  demoSummary: load('demoSummary', null)
};

// ---------------- 라우팅 ----------------
const ROUTES = ['home', 'diagnose', 'demo', 'economics', 'building', 'product', 'report'];
function route() {
  const id = (location.hash || '#home').slice(1);
  const view = ROUTES.includes(id) ? id : 'home';
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === view));
  $$('.tabbar a').forEach((a) => (a.getAttribute('href') === `#${view}` ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#pageTitle').textContent = PAGE_TITLES[view];
  document.title = view === 'home' ? 'HEAT LOOP — 샤워 배수열 회수 | Carbon Start' : `${PAGE_TITLES[view]} · HEAT LOOP`;
  if (view === 'home') renderHome();
  if (view === 'economics') renderEconomics();
  if (view === 'building') openBuilding(); else viewer3d?.stop();
  if (view === 'report') renderReport();
  // 시연은 STEP 02와 건물 3D 화면에서만 돌린다
  if (view !== 'demo' && view !== 'building' && state.demo.adapter?.kind === 'simulation' && state.demo.adapter.running) togglePlay(false);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  const h = $(`#${view} h1, #${view} h2`);
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  armReveal($(`#${view}`));
}
window.addEventListener('hashchange', route);
const PAGE_TITLES = { home: '홈', diagnose: '적합도 진단', demo: '열 회수 시연', economics: '효과·경제성', building: '건물 3D', product: '제품 구조', report: '보고서' };

// ---------------- 건물 3D ----------------
let viewer3d = null;
let viewerLoading = null;
state.building = load('building', { ...DEFAULT_BUILDING });

function initBuilding() {
  const f = $('#bform');
  const set = (id, v) => ($(id).value = v);
  set('#b-above', state.building.floorsAbove); set('#b-below', state.building.floorsBelow); set('#b-h', state.building.floorHeight);
  set('#b-w', state.building.width); set('#b-d', state.building.depth);
  fillFloorSelects();
  f.addEventListener('input', (e) => {
    const n = (id) => Number($(id).value);
    state.building = {
      floorsAbove: n('#b-above'), floorsBelow: n('#b-below'), floorHeight: n('#b-h'), width: n('#b-w'), depth: n('#b-d'),
      showerFloor: Number($('#b-shower').value), mechFloor: Number($('#b-mech').value)
    };
    if (e.target.id === 'b-above' || e.target.id === 'b-below') fillFloorSelects();
    save('building', state.building);
    clearTimeout(initBuilding.t);
    initBuilding.t = setTimeout(() => viewer3d?.build(state.building), 180);
    if (!viewer3d) renderBuildingInfo(measure(state.building));
  });
  f.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') f.dispatchEvent(new Event('input')); });
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
    $$('#viewSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    viewer3d?.setView(b.dataset.view);
  }));
  renderBuildingInfo(measure(state.building));
}

function fillFloorSelects() {
  const mm = measure({ ...state.building, floorsAbove: Number($('#b-above').value), floorsBelow: Number($('#b-below').value) });
  const opts = (sel) => mm.floors.slice().reverse().map((fl) => `<option value="${fl}" ${fl === sel ? 'selected' : ''}>${floorLabel(fl)}</option>`).join('');
  $('#b-shower').innerHTML = opts(mm.b.showerFloor);
  $('#b-mech').innerHTML = opts(mm.b.mechFloor);
}

async function openBuilding() {
  if (viewer3d) { viewer3d.start(); viewer3d.setLive(state.demo.last, state.demo.lastEval); return; }
  if (!viewerLoading) {
    viewerLoading = import('./building3d.js').then((mod) => {
      $('#b3Loading')?.remove();
      viewer3d = mod.createBuildingViewer($('#b3'), { onInfo: renderBuildingInfo });
      viewer3d.build(state.building);
      return viewer3d;
    }).catch(() => {
      $('#b3Loading').textContent = '3D 엔진(Three.js)을 불러오지 못했습니다. 인터넷 연결을 확인하세요. 치수 계산은 아래에 계속 표시됩니다.';
      viewerLoading = null;
    });
  }
  const v = await viewerLoading;
  if (v && location.hash === '#building') { v.start(); v.setLive(state.demo.last, state.demo.lastEval); }
}

function renderBuildingInfo(mm, vi) {
  if (!mm) return;
  const da = state.diagInput?.area;
  const kpi = (k, v, s) => `<div class="kpi"><div class="k">${k}</div><b class="num">${v}</b>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  $('#bldKpis').innerHTML =
    kpi('건물 높이 (지상)', `${mm.heightAbove.toFixed(1)}<small>m</small>`, `지상 ${mm.b.floorsAbove}층 × ${mm.h} m${mm.b.floorsBelow ? ` · 지하 ${mm.depthBelow.toFixed(1)} m` : ''}`) +
    kpi('개략 연면적', `${nf(mm.grossArea)}<small>㎡</small>`, da ? `진단 입력 ${nf(da)}㎡와 ${Math.abs(mm.grossArea - da) / da < 0.15 ? '비슷합니다' : '차이가 있습니다 — 치수 확인'}` : '가로 × 세로 × 층수') +
    kpi('배수 수직관 길이', mm.riserLength === null ? '—' : `${mm.riserLength.toFixed(1)}<small>m</small>`, `샤워실 ${floorLabel(mm.b.showerFloor)} → 기계실 ${floorLabel(mm.b.mechFloor)}`) +
    kpi('Core 설치 구간', mm.coreFits === null ? '—' : mm.coreFits ? '확보 가능<small>추정</small>' : '확인 필요', `수직 직선 ${mm.coreLength.toFixed(1)} m 기준(가정)`);
  const iss = $('#bldIssues');
  iss.hidden = !mm.issues.length;
  iss.className = 'note warn';
  iss.innerHTML = mm.issues.map(esc).join('<br>');
  const hint = $('#viewHint');
  if (vi?.kind === 'ground') hint.textContent = `눈높이 1.6 m · ${vi.dist.toFixed(0)} m 거리 · 올려다보는 각 ${vi.angle.toFixed(0)}°`;
  else if (vi?.kind === 'front') hint.textContent = '정면 입면 · 왼쪽 아래 축척 막대';
  else if (vi?.kind === 'section') hint.textContent = '벽을 걷어낸 단면 · 샤워실 → Core 배수 경로';
  else if (vi) hint.textContent = '드래그로 회전 · 핀치로 확대';
}

// ---------------- 스크롤 리빌: 카드가 아래에서 위로 올라온다 ----------------
const REVEAL_SEL = '.card, .kpi, .qcard, .answer, .sensor';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const io = 'IntersectionObserver' in window && !reduceMotion
  ? new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.setProperty('--rd', `${Math.min(k++, 6) * 60}ms`);
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 })
  : null;
let armedAt = 0;
function armReveal(view) {
  if (!io || !view) return;
  armedAt = performance.now();
  $$(REVEAL_SEL, view).forEach((el) => {
    if (el.closest('.todaycard, .apphome .launcher')) return;
    el.classList.remove('in');
    el.classList.add('reveal');
    io.observe(el);
  });
}
// 화면 안에서 다시 그려지는 요소(입력할 때마다 갱신되는 결과 등)는 화면 전환 직후에만 움직이고, 그 뒤엔 바로 보인다
new MutationObserver((muts) => {
  if (!io) return;
  const fresh = performance.now() - armedAt < 900;
  for (const m of muts) for (const n of m.addedNodes) {
    if (!(n instanceof Element)) continue;
    const els = n.matches?.(REVEAL_SEL) ? [n, ...$$(REVEAL_SEL, n)] : $$(REVEAL_SEL, n);
    for (const el of els) {
      if (!el.closest('.view.on')) continue;
      if (fresh) { el.classList.add('reveal'); io.observe(el); } else el.classList.remove('reveal');
    }
  }
}).observe(document.getElementById('main'), { childList: true, subtree: true });

// ---------------- 앱 홈 ----------------
function renderHome() {
  const now = new Date();
  $('#greetDate').textContent = `${now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · 시설관리자`;
  if (!state.diag) runDiagnosis(false);
  const d = state.diag;
  const ds = state.demoSummary;
  const econ = analyze(state.econInput ?? econDefaults());
  const status = !ds ? { t: '시연 기록 없음', c: 'gray' } : ds.issues.length ? { t: '확인 필요', c: 'est' } : { t: '정상 작동', c: 'ok' };
  $('#todayCard').innerHTML = `
    <div class="row" style="position:relative;z-index:1"><span class="k">누적 회수 열량</span><div class="spacer"></div>${ds ? statusBadge(ds.source) : '<span class="badge gray">데이터 없음</span>'}</div>
    <div class="big" style="position:relative;z-index:1">${ds ? ds.kwh.toFixed(1) : '0.0'}<small>kWh_th</small></div>
    <div class="row2">
      <div class="mini"><span>적합도</span><b>${esc(d.label)}</b></div>
      <div class="mini"><span>장치 상태</span><b>${status.t}</b></div>
      <div class="mini"><span>연 절감 추정</span><b>${econ.costSaved === null ? '—' : `${nf(econ.costSaved / 10000)}만원`}</b></div>
    </div>`;
  const steps = [
    { done: d.level !== 'check', t: '설치 가치 확인', s: d.missing.length ? `빠진 정보 ${d.missing.length}개` : `적합도 ${d.label} · ${BUILDING_TYPES[state.diagInput.type] ?? ''}`, to: '#diagnose', b: '진단' },
    { done: !!ds && ds.stats?.ON?.n > 0 && ds.stats?.BYPASS?.n > 0, t: '열 회수 확인', s: ds ? `ON 평균 ΔT ${ds.stats.ON.n ? `+${ds.stats.ON.dT.toFixed(1)}℃` : '—'}` : 'BYPASS와 ON을 비교하세요', to: '#demo', b: '시연' },
    { done: false, t: '절감 효과 공유', s: econ.payback === null ? '회수기간 산정 불가 — 입력 확인' : `회수기간 약 ${econ.payback.toFixed(1)}년 (가정치)`, to: '#report', b: '보고서' }
  ];
  const nowIdx = steps.findIndex((x) => !x.done);
  $('#todoCard').innerHTML = `<h3>${I3('calendar', '', 'ico') }현장 점검 순서</h3>
    <ol>${steps.map((x, i) => `<li class="${x.done ? 'done' : i === nowIdx ? 'now' : ''}"><span class="num">${x.done ? '✓' : i + 1}</span><span><span class="t">${x.t}</span><br><span class="s">${esc(x.s)}</span></span><a class="btn sm ${i === nowIdx ? '' : 'ghost'}" href="${x.to}">${x.b}</a></li>`).join('')}</ol>`;
}

// ---------------- 앱 설치(PWA) ----------------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'installBtn' || !installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; $('#installBtn').hidden = true;
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------- 랜딩 ----------------
function initHome() {
  $('#heroArt').innerHTML = productIso({ animated: true }) +
    '<span class="tag" style="top:18px;left:18px">개념 렌더링 · 치수 미정</span>';
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'play') { togglePlay(); return; }
    if (t.dataset.act === 'quick-demo' || t.dataset.act === 'auto-demo') {
      if (location.hash !== '#demo') location.hash = '#demo';
      setTimeout(startAutoDemo, 50);
    }
  });
}

// ---------------- STEP 01 ----------------
function chips(container, name, options, type = 'chip') {
  container.innerHTML = Object.entries(options).map(([v, label]) => type === 'chip'
    ? `<label class="chip"><input type="radio" name="${name}" value="${v}"><span>${esc(label)}</span></label>`
    : `<label class="radio"><input type="radio" name="${name}" value="${v}"><span>${esc(label)}</span></label>`).join('');
}

function initDiagnose() {
  const f = $('#dform');
  chips($('[data-name="type"]', f), 'type', BUILDING_TYPES);
  chips($('[data-name="timeSlot"]', f), 'timeSlot', TIME_SLOTS);
  chips($('[data-name="heatSource"]', f), 'heatSource', HEAT_SOURCE_CHIPS);
  chips($('[data-name="pipe"]', f), 'pipe', PIPE_OPTIONS, 'radio');
  chips($('[data-name="existing"]', f), 'existing', EXISTING);
  fillDiagForm(state.diagInput, state.assumptions);
  f.addEventListener('submit', (e) => { e.preventDefault(); runDiagnosis(true); });
  $$('[data-example]').forEach((b) => b.addEventListener('click', () => {
    fillDiagForm(EXAMPLES[b.dataset.example], ASSUMPTIONS);
    runDiagnosis(true);
  }));
  // 저장된 입력이 있으면 결과까지 준비해 둔다 (STEP 02·03이 이 값을 쓴다)
  runDiagnosis(false);
}

function fillDiagForm(d, a) {
  const f = $('#dform');
  const setR = (name, v) => $$(`input[name="${name}"]`, f).forEach((i) => (i.checked = i.value === v));
  setR('type', d.type); setR('timeSlot', d.timeSlot); setR('heatSource', d.heatSource); setR('pipe', d.pipe); setR('existing', d.existing);
  const setN = (id, v) => ($(id).value = v ?? '');
  setN('#d-area', d.area); setN('#d-heads', d.showerHeads); setN('#d-users', d.dailyUsers); setN('#d-minutes', d.minutesPerUser);
  setN('#d-flow', d.flowLpm); setN('#d-peak', d.peakConcurrent); $('#d-grade').value = d.seoulGrade ?? '';
  setN('#a-mix', a.showerMixC); setN('#a-cold', a.coldInC); setN('#a-loss', a.drainLossC); setN('#a-eff', a.effectiveness);
}

function readDiagForm() {
  const f = $('#dform');
  const r = (name) => $(`input[name="${name}"]:checked`, f)?.value ?? '';
  const n = (id) => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
  return {
    input: {
      type: r('type'), area: n('#d-area'), showerHeads: n('#d-heads'), dailyUsers: n('#d-users'), minutesPerUser: n('#d-minutes'),
      flowLpm: n('#d-flow'), peakConcurrent: n('#d-peak'), heatSource: r('heatSource'), pipe: r('pipe'), existing: r('existing'),
      timeSlot: r('timeSlot'), seoulGrade: $('#d-grade').value
    },
    assumptions: {
      showerMixC: n('#a-mix') ?? ASSUMPTIONS.showerMixC, coldInC: n('#a-cold') ?? ASSUMPTIONS.coldInC,
      drainLossC: n('#a-loss') ?? ASSUMPTIONS.drainLossC, effectiveness: n('#a-eff') ?? ASSUMPTIONS.effectiveness,
      headsPerCore: ASSUMPTIONS.headsPerCore
    }
  };
}

function runDiagnosis(show) {
  const { input, assumptions } = readDiagForm();
  state.diagInput = input;
  state.assumptions = assumptions;
  save('diag', input); save('assume', assumptions);
  state.diag = diagnose(input, assumptions);
  // 진단이 바뀌면 경제성 입력도 새 진단값으로 다시 채운다
  if (show) { state.econInput = null; save('econ', null); applyDiagToSim(); }
  if (show) {
    renderDiagResult();
    $('#diagForm').hidden = true;
    $('#diagResult').hidden = false;
    $('#diagResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 3D 아이콘 (assets/icons3d — 팀 제공 아이콘 그리드에서 잘라냄)
const I3 = (name, alt = '', cls = 'ico') => `<img class="${cls}" src="assets/icons3d/${name}.png" alt="${alt}">`;
const ICON = { ok: I3('check', '충족'), no: I3('warning', '불리'), q: I3('info', '확인 필요') };

function renderDiagResult() {
  const d = state.diag;
  const a = state.assumptions;
  const el = $('#diagResult');
  const daily = d.daily;
  el.innerHTML = `
  <div class="card">
    <div class="verdict">
      <div class="ring ${d.level}" role="img" aria-label="적합도 ${d.label}">${d.label.replace(' ', '<br>')}</div>
      <div>
        <div class="row"><span class="eyebrow" style="margin:0">배수열 회수 적합도</span><span class="badge est">자체 기준 · 가설</span></div>
        <h3 style="font-size:24px;margin-top:6px">${esc(BUILDING_TYPES[state.diagInput.type] ?? '시설')} — ${d.label}</h3>
        <p class="muted small" style="margin:0">서울시 공식 등급 아님</p>
      </div>
    </div>
    <hr>
    <div class="grid g3">
      <div class="kpi">${I3('drop', '', 'kico')}<div class="k">샤워 온수 사용량 <span class="badge est">추정</span></div><b class="num">${daily ? nf(daily.liters) : '—'}<small>L/일</small></b></div>
      <div class="kpi">${I3('heat', '', 'kico')}<div class="k">회수 가능 열량 <span class="badge est">가정치</span></div><b class="num">${daily ? nf(daily.recoverKwh, 0) : '—'}<small>kWh_th/일</small></b><div class="s">ε ${a.effectiveness} · ${nf(daily?.drainInC ?? a.showerMixC - a.drainLossC, 0)}→${a.coldInC}℃</div></div>
      <div class="kpi">${I3('gauge', '', 'kico')}<div class="k">피크 동시 사용 ${d.concurrent.estimated ? '<span class="badge est">추정</span>' : ''}</div><b class="num">${d.concurrent.value ?? '—'}<small>개</small></b></div>
    </div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>판단 근거</h3><ul class="reasons">${d.reasons.map((r) => `<li>${r.ok === true ? ICON.ok : r.ok === false ? ICON.no : ICON.q}<span>${esc(r.text)}</span></li>`).join('')}</ul>
      ${d.areaNote ? `<p class="note mt-s">${esc(d.areaNote)}</p>` : ''}${d.seoulGradeNote ? `<p class="note info mt-s">${esc(d.seoulGradeNote)}</p>` : ''}</div>
    <div class="card"><h3>배관 확인</h3><ol class="checklist">${d.pipeChecks.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>제안 구성 <span class="badge est">가정치</span></h3>
      <div class="grid g3 mt-s">
        <div class="kpi">${I3('exchange', '', 'kico')}<div class="k">${esc(d.product.coreType)}</div><b class="num">${d.product.cores ?? '—'}<small>대</small></b></div>
        <div class="kpi">${I3('thermo', '', 'kico')}<div class="k">Sense</div><b class="num">${d.product.sense ?? '—'}<small>대</small></b></div>
        <div class="kpi">${I3('bars', '', 'kico')}<div class="k">Dashboard</div><b class="num">1<small>식</small></b></div>
      </div></div>
    <div class="card"><h3>다음 행동</h3><ul class="actions">${d.actions.filter((x) => x.kind !== 'go').map((x) => `<li><span class="chipst ${x.kind}">${{ input: '입력 필요', check: '확인 필요' }[x.kind]}</span><span style="flex:1">${esc(x.text)}</span></li>`).join('')}</ul></div>
  </div>
  <div class="row mt noprint"><button class="btn ghost" type="button" id="editDiag">입력 수정</button><a class="btn ghost" href="#building">${I3('building', '', 'ico3d')}건물 3D</a><a class="btn" href="#demo">STEP 02 →</a></div>`;
  $('#editDiag').addEventListener('click', () => { $('#diagResult').hidden = true; $('#diagForm').hidden = false; $('#d-heads').focus(); });
}

// ---------------- STEP 02 ----------------
const SIM_FIELDS = [
  ['peakConcurrent', '피크 동시 사용 샤워기', '개', 1, 1, 20],
  ['flowPerHeadLpm', '샤워기 1개 유량', 'L/min', 0.5, 4, 15],
  ['drainInC', '배수 입구 온도 T1', '℃', 0.5, 25, 45],
  ['coldInC', '급수 입구 온도 T3', '℃', 0.5, 4, 25],
  ['effectiveness', '열교환 유효도 ε (가설)', '', 0.01, 0.1, 0.7]
];

function simDefaultsFromDiag() {
  const d = state.diag;
  const a = state.assumptions;
  const p = {};
  if (d?.concurrent?.value) p.peakConcurrent = Math.min(20, d.concurrent.value);
  if (state.diagInput.flowLpm > 0) p.flowPerHeadLpm = state.diagInput.flowLpm;
  if (state.diagInput.showerHeads > 0) p.heads = Math.max(state.diagInput.showerHeads, p.peakConcurrent ?? 1);
  p.drainInC = a.showerMixC - a.drainLossC;
  p.coldInC = a.coldInC;
  return p;
}

function applyDiagToSim() {
  state.demo.simParams = simDefaultsFromDiag();
  save('sim', state.demo.simParams);
  if (state.demo.adapter?.kind === 'simulation') {
    state.demo.adapter.sim.setParams(state.demo.simParams);
    renderSimParams();
  }
}

function initDemo() {
  $('#viz').innerHTML = buildFlowSvg();
  $('#faultSel').innerHTML = Object.entries(FAULTS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#faultSel').addEventListener('change', (e) => {
    state.demo.fault = e.target.value;
    state.demo.adapter?.sim?.setFault(state.demo.fault);
  });
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.demo.autoDemo = false; setMode(b.dataset.mode); }));
  $('#playBtn').addEventListener('click', () => togglePlay());
  $('#resetBtn').addEventListener('click', () => resetDemo());
  $('#srcSel').addEventListener('change', (e) => switchSource(e.target.value));
  $('#csvBtn').addEventListener('click', downloadCsv);
  if (!Object.keys(state.demo.simParams).length) state.demo.simParams = simDefaultsFromDiag();
  useSimulation();
  renderDemo();
}

function useSimulation() {
  state.demo.adapter?.stop?.();
  const ad = createSimulationAdapter({ ...state.demo.simParams });
  ad.setSpeed(60); // 실제 1초 = 시나리오 1분 → 2시간 시나리오가 2분
  ad.sim.setMode(state.demo.mode);
  ad.sim.setFault(state.demo.fault);
  state.demo.adapter = ad;
  state.demo.srcKind = 'simulation';
  renderSimParams();
  $('#srcNote').hidden = true;
  $('#clockSub').textContent = '시뮬레이션 시각';
  $('#playBtn').disabled = false;
}

function renderSimParams() {
  const p = state.demo.adapter?.sim?.params ?? { ...DEFAULT_SCENARIO, ...state.demo.simParams };
  $('#simParams').innerHTML = SIM_FIELDS.map(([k, label, unit, step, min, max]) =>
    `<div class="field"><label for="sp-${k}">${label} <b class="num" id="spv-${k}">${p[k]}</b> ${unit}</label><input id="sp-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${p[k]}" data-k="${k}"></div>`).join('');
  $$('#simParams input').forEach((i) => i.addEventListener('input', () => {
    const v = Number(i.value);
    $(`#spv-${i.dataset.k}`).textContent = v;
    state.demo.simParams[i.dataset.k] = v;
    if (i.dataset.k === 'peakConcurrent') state.demo.simParams.heads = Math.max(v, state.demo.simParams.heads ?? v);
    state.demo.adapter?.sim?.setParams(state.demo.simParams);
    save('sim', state.demo.simParams);
  }));
}

async function switchSource(kind) {
  togglePlay(false);
  if (kind === 'simulation') { useSimulation(); resetDemo(); return; }
  const sup = serialSupport();
  const note = $('#srcNote');
  note.hidden = false;
  if (!sup.ok) {
    note.className = 'note warn';
    note.textContent = `${sup.reason} 시뮬레이션 모드로 계속 시연할 수 있습니다. (대안: 로컬 PC에서 http://localhost로 열고 Chrome 사용)`;
    $('#srcSel').value = 'simulation';
    useSimulation();
    note.hidden = false;
    return;
  }
  state.demo.adapter?.stop?.();
  const ad = createSerialAdapter();
  ad.setMode(state.demo.mode);
  state.demo.adapter = ad;
  state.demo.srcKind = 'serial';
  resetDemo(true);
  note.className = 'note info';
  note.textContent = 'ESP32(HEAT LOOP Sense)를 USB로 연결하고 포트를 고르세요. 115200bps, 한 줄에 JSON 1건. 센서 값이 들어오기 전까지 MEASURED로 표시하지 않습니다.';
  $('#clockSub').textContent = '측정 경과 시간';
  $('#playBtn').disabled = true;
  const ok = await ad.start(onReading, (msg) => {
    note.className = 'note err';
    note.textContent = `${msg} 시뮬레이션으로 돌아가려면 데이터를 '시뮬레이션'으로 바꾸세요.`;
  });
  if (!ok) { $('#srcSel').value = 'simulation'; useSimulation(); note.hidden = false; }
}

function setMode(m) {
  state.demo.mode = m;
  state.demo.adapter?.setMode?.(m);
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}

function togglePlay(force) {
  const ad = state.demo.adapter;
  if (!ad || ad.kind !== 'simulation') return;
  const run = force ?? !ad.running;
  if (run) {
    if (ad.sim.done) resetDemo();
    ad.start(onReading);
  } else ad.stop();
  $$('#playBtn, .playToggle').forEach((b) => (b.textContent = run ? '❚❚ 일시정지' : '▶ 재생'));
}

function resetDemo(keepAdapter = false) {
  const d = state.demo;
  if (!keepAdapter && d.adapter?.kind === 'simulation') {
    const wasRunning = d.adapter.running;
    d.adapter.stop();
    d.adapter.sim.reset();
    d.adapter.sim.setParams(d.simParams);
    if (wasRunning) d.adapter.start(onReading);
  }
  d.rows = []; d.prev = null; d.last = null; d.lastEval = null; d.issues.clear(); d.measuredEff = null;
  d.acc = { kwh: 0, coveredSec: 0, skippedSec: 0 };
  d.autoDemo = false;
  renderDemo();
}

function startAutoDemo() {
  if (state.demo.srcKind !== 'simulation') { $('#srcSel').value = 'simulation'; useSimulation(); }
  togglePlay(false);
  resetDemo();
  setMode(MODE.BYPASS);
  state.demo.autoDemo = true;
  togglePlay(true);
}

function onReading(r) {
  const d = state.demo;
  const ev = evaluateReading(r);
  if (r.parseError) ev.issues.push({ code: 'PARSE', level: 'error', msg: `수신 데이터 형식 오류: ${r.parseError}` });
  if (r.deviceFault) ev.issues.push({ code: 'DEVICE', level: 'error', msg: `장치가 보고한 센서 상태: ${r.deviceFault}` });
  if (r.deviceFault) { ev.status = STATUS.INVALID; ev.kw = null; }
  const row = { ...r, status: ev.status, kw: ev.kw, drainKw: ev.drainKw, codes: ev.issues.map((i) => i.code).join('|') };
  const cur = { t: r.t, kw: r.mode === MODE.ON ? ev.kw : (ev.kw === null ? null : 0) };
  const maxGap = d.srcKind === 'simulation' ? (d.adapter.speed * 0.25 * 3) : LIMITS.maxGapSec;
  if (d.prev) accumulate(d.acc, d.prev, cur, maxGap);
  d.prev = cur;
  d.rows.push(row);
  if (d.rows.length > 2000) d.rows.shift();
  d.last = r; d.lastEval = ev;
  // 경고는 코드별 최신 1건 유지, 해당 상황이 끝나면 지운다
  const active = new Set(ev.issues.map((i) => i.code));
  for (const k of [...d.issues.keys()]) if (!active.has(k) && k !== 'NO_FLOW') d.issues.delete(k);
  d.issues.delete('NO_FLOW');
  for (const i of ev.issues) d.issues.set(i.code, i);
  // 실측(또는 시뮬레이션) 유효도: ON + 흐름 + 유효 표본 평균
  const valid = d.rows.filter((x) => x.mode === MODE.ON && x.status !== STATUS.INVALID && x.coldFlowLpm >= 1 && x.kw > 0);
  if (valid.length > 5) {
    const recent = valid.slice(-200);
    const effs = recent.map(effectiveness).filter(Number.isFinite);
    d.measuredEff = effs.length ? { value: effs.reduce((s, v) => s + v, 0) / effs.length, source: recent.some((x) => x.status === STATUS.MEASURED) ? STATUS.MEASURED : STATUS.SIMULATED, n: effs.length } : null;
  }
  if (d.autoDemo && d.srcKind === 'simulation' && r.t >= 20 * 60 && d.mode === MODE.BYPASS) { setMode(MODE.ON); d.autoDemo = false; }
  if (d.srcKind === 'simulation' && d.adapter.sim.done) { togglePlay(false); }
  if (viewer3d && location.hash === '#building') {
    viewer3d.setLive(r, ev);
    $('#bldLive').innerHTML = `${d.srcKind === 'simulation' ? clockLabel(r.clockMin) : `${Math.round(r.t)}s`} · ${ev.kw === null ? '측정 불가' : `${ev.kw.toFixed(1)} kW_th`} · 누적 ${d.acc.kwh.toFixed(1)} kWh_th`;
    $('#bldStatus').innerHTML = statusBadge(ev.status);
  }
  scheduleRender();
}

let raf = 0;
function scheduleRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; renderDemo(); });
}

function statusBadge(status) {
  if (status === STATUS.MEASURED) return '<span class="badge meas"><i class="dot"></i>MEASURED · 실측</span>';
  if (status === STATUS.INVALID) return '<span class="badge inv"><i class="dot"></i>INVALID · 측정 불가</span>';
  return '<span class="badge sim"><i class="dot"></i>SIMULATED · 실측 아님</span>';
}

function renderDemo() {
  const d = state.demo;
  const r = d.last;
  const ev = d.lastEval;
  const fmtT = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}℃` : '—');
  const fmtF = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} L/min` : '—');
  if (d.srcKind === 'serial' && !r) {
    $('#statusLine').innerHTML = '<span class="badge gray">센서 대기 중 · 데이터 없음</span>';
  } else {
    $('#statusLine').innerHTML = (r ? statusBadge(ev.status) : statusBadge(d.srcKind === 'serial' ? STATUS.INVALID : STATUS.SIMULATED)) +
      `<span class="badge ${d.mode === MODE.ON ? 'ok' : 'e'}">${d.mode === MODE.ON ? 'HEAT RECOVERY ON' : 'BYPASS'}</span>`;
  }
  $('#clock').textContent = r ? (d.srcKind === 'simulation' ? clockLabel(r.clockMin) : `${Math.floor(r.t / 60)}분 ${Math.floor(r.t % 60)}초`) : (d.srcKind === 'simulation' ? '19:00' : '—');
  for (const k of ['t1', 't2', 't3', 't4']) $(`#m-${k}`).textContent = r ? fmtT(r[k]) : '—';
  $('#m-fd').textContent = r ? fmtF(r.drainFlowLpm) : '—';
  $('#m-fc').textContent = r ? fmtF(r.coldFlowLpm) : '—';
  if (!r) $('#k-kw').innerHTML = '—';
  else if (ev.kw === null) $('#k-kw').innerHTML = '—<small>측정 불가</small>';
  else $('#k-kw').innerHTML = `${ev.kw.toFixed(2)}<small>kW_th</small>`;
  $('#k-kw-s').textContent = r && d.mode === MODE.BYPASS ? 'BYPASS → 회수 0' : `급수 유량 × ${WATER.cp_kJ_per_kgK} × (T4 − T3)`;
  $('#k-acc').innerHTML = `${d.acc.kwh.toFixed(2)}<small>kWh_th</small>`;
  const srcStat = d.rows.some((x) => x.status === STATUS.MEASURED) ? STATUS.MEASURED : STATUS.SIMULATED;
  $('#k-acc-b').innerHTML = d.rows.length ? statusBadge(srcStat) : '';
  $('#k-acc-s').textContent = d.acc.skippedSec > 0 ? `측정 불가 ${Math.round(d.acc.skippedSec)}초 제외` : '시간 적분 · ON만 집계';
  updateFlowSvg($('#vizCard'), r ?? { mode: d.mode, coldFlowLpm: 0, drainFlowLpm: 0 }, ev);

  // 비교
  const st = modeStats(d.rows);
  const col = (m, title) => {
    const s = st[m];
    return `<div class="col ${m === MODE.ON ? 'on' : ''}"><b>${title}</b><dl>
      <dt>급수 입구 T3</dt><dd>${s.n ? `${s.t3.toFixed(1)}℃` : '—'}</dd>
      <dt>급수 출구 T4</dt><dd>${s.n ? `${s.t4.toFixed(1)}℃` : '—'}</dd>
      <dt>온도 상승 ΔT</dt><dd>${s.n ? `${s.dT >= 0 ? '+' : ''}${s.dT.toFixed(2)}℃` : '—'}</dd>
      <dt>평균 회수 열출력</dt><dd>${s.n ? `${s.kw.toFixed(2)} kW_th` : '—'}</dd>
      <dt>유효 표본</dt><dd>${s.n}</dd></dl></div>`;
  };
  $('#compare').innerHTML = col(MODE.BYPASS, 'BYPASS') + col(MODE.ON, 'HEAT RECOVERY ON') +
    `<p class="small muted" style="grid-column:1/-1;margin:0">${st.ON.n && st.BYPASS.n ? `ON이 BYPASS보다 급수 출구 <b>+${(st.ON.t4 - st.BYPASS.t4).toFixed(1)}℃</b>${srcStat === STATUS.SIMULATED ? ' (시뮬레이션)' : ''}` : '자동 비교: 20분 BYPASS 후 ON'}${d.measuredEff ? ` · ε ≈ ${d.measuredEff.value.toFixed(2)}` : ''}</p>`;

  // 경고
  const issues = [...d.issues.values()];
  $('#issues').innerHTML = issues.length
    ? issues.map((i) => `<li class="note ${i.level === 'error' ? 'err' : i.level === 'warn' ? 'warn' : 'info'}">${esc(i.msg)}</li>`).join('')
    : `<li class="note okline">${r ? `${I3('shield', '', 'ico')}정상` : '재생하면 센서를 검사합니다.'}</li>`;

  // 그래프 (최근 240 표본)
  const rows = d.rows.slice(-240);
  const lbl = rows.map((x) => (d.srcKind === 'simulation' ? clockLabel(x.clockMin) : `${Math.round(x.t)}s`));
  const bands = [];
  rows.forEach((x, i) => { if (x.mode === MODE.BYPASS) { const b = bands[bands.length - 1]; if (b && b.to === i - 1) b.to = i; else bands.push({ from: i, to: i, color: '#dce9fb' }); } });
  $('#chartT').innerHTML = lineChart({ title: '온도 그래프', yUnit: '℃', xLabels: lbl, bands, series: [
    { label: 'T1', color: '#ef7a5a', values: rows.map((x) => x.t1) },
    { label: 'T2', color: '#f6b7a3', values: rows.map((x) => x.t2), dash: '4 4' },
    { label: 'T3', color: '#3d7fd9', values: rows.map((x) => x.t3) },
    { label: 'T4', color: '#2fa58f', values: rows.map((x) => x.t4) }
  ] });
  $('#chartK').innerHTML = lineChart({ title: '회수 열출력 그래프', yUnit: 'kW_th', yMin: 0, xLabels: lbl, bands, height: 150, series: [
    { label: 'kW', color: '#ef7a5a', values: rows.map((x) => (x.kw === null ? null : x.kw)) }
  ] });

  // 로그 (최근 12건)
  const last = d.rows.slice(-12).reverse();
  $('#logTbl tbody').innerHTML = last.length ? last.map((x) => `<tr><td>${d.srcKind === 'simulation' ? clockLabel(x.clockMin) : `${x.t.toFixed(1)}s`}</td><td>${x.mode}</td><td>${statusBadge(x.status).replace(/ · .+?</, '<')}</td>
    ${['t1', 't2', 't3', 't4'].map((k) => `<td class="n">${Number.isFinite(x[k]) ? x[k].toFixed(1) : '—'}</td>`).join('')}
    <td class="n">${Number.isFinite(x.coldFlowLpm) ? x.coldFlowLpm.toFixed(1) : '—'}</td><td class="n">${x.kw === null ? '—' : x.kw.toFixed(2)}</td></tr>`).join('')
    : '<tr><td colspan="9" class="muted">기록이 없습니다.</td></tr>';

  saveDemoSummary();
}

let lastSummarySave = 0;
function saveDemoSummary() {
  const now = Date.now();
  if (now - lastSummarySave < 2000) return;
  lastSummarySave = now;
  const d = state.demo;
  if (!d.rows.length) return;
  const st = modeStats(d.rows);
  state.demoSummary = {
    kwh: d.acc.kwh, coveredSec: d.acc.coveredSec, skippedSec: d.acc.skippedSec,
    source: d.rows.some((x) => x.status === STATUS.MEASURED) ? STATUS.MEASURED : STATUS.SIMULATED,
    stats: st, eff: d.measuredEff, issues: [...d.issues.values()].filter((i) => i.level !== 'info'),
    samples: d.rows.length, invalid: d.rows.filter((x) => x.status === STATUS.INVALID).length, at: new Date().toISOString()
  };
  save('demoSummary', state.demoSummary);
}

function downloadCsv() {
  const d = state.demo;
  if (!d.rows.length) { alert('기록이 없습니다. 시연을 먼저 실행하세요.'); return; }
  const head = ['time', 'elapsed_s', 'mode', 'source', 'status', 'T1_drain_in_C', 'T2_drain_out_C', 'T3_cold_in_C', 'T4_cold_out_C', 'drain_flow_Lpm', 'cold_flow_Lpm', 'recovered_kW_th', 'drain_loss_kW_th', 'issues'];
  const lines = d.rows.map((x) => [d.srcKind === 'simulation' ? clockLabel(x.clockMin) : '', x.t.toFixed(1), x.mode, x.source, x.status, x.t1, x.t2, x.t3, x.t4, x.drainFlowLpm, x.coldFlowLpm, x.kw === null ? '' : x.kw.toFixed(4), Number.isFinite(x.drainKw) ? x.drainKw.toFixed(4) : '', x.codes].map((v) => (v ?? '')).join(','));
  const src = d.rows.some((x) => x.status === STATUS.MEASURED) ? 'MEASURED' : 'SIMULATED';
  const meta = `# HEAT LOOP v3 experiment log, data=${src}, cumulative_kWh_th=${d.acc.kwh.toFixed(4)}, cp=4.186kJ/kgK, density=1.0kg/L (approx)`;
  const blob = new Blob(['﻿' + [meta, head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `heatloop_log_${src}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- STEP 03 ----------------
function econDefaults() {
  const di = state.diagInput;
  const d = state.diag;
  const a = state.assumptions;
  const src = HEAT_SOURCES[di.heatSource] ? di.heatSource : 'gas';
  const conc = d?.concurrent?.value ?? 6;
  const flow = di.flowLpm > 0 ? di.flowLpm : 9;
  const concFlow = conc * flow;
  const liters = d?.daily?.liters;
  const hours = liters ? Math.round((liters / (concFlow * 60)) * 10) / 10 : DEFAULT_ECON.hoursPerDay;
  const cores = d?.product?.cores ?? 2;
  return {
    ...DEFAULT_ECON,
    showerHeads: di.showerHeads ?? DEFAULT_ECON.showerHeads,
    concurrentFlowLpm: concFlow, hoursPerDay: hours,
    drainInC: a.showerMixC - a.drainLossC, coldInC: a.coldInC, effectiveness: a.effectiveness, effSource: 'assumed',
    heatSource: src, efficiency: HEAT_SOURCES[src].efficiency ?? DEFAULT_ECON.efficiency, price: HEAT_SOURCES[src].price ?? 0,
    installCost: cores * 5000000 // 가정치: Core 1대당 장치+센서+배관 공사 500만원 (견적 아님)
  };
}

const ECON_FIELDS = [
  ['showerHeads', '샤워기 수', '개', 1],
  ['concurrentFlowLpm', '동시 사용 유량', 'L/min', 1],
  ['hoursPerDay', '일 사용시간', 'h/일', 0.1],
  ['daysPerYear', '연간 운영일수', '일', 1],
  ['drainInC', '배수 입구 온도', '℃', 0.5],
  ['coldInC', '급수 입구 온도', '℃', 0.5],
  ['efficiency', '급탕 설비 효율', '', 0.01, ''],
  ['price', '에너지 단가', '', 0.1, ''],
  ['installCost', '설치비', '원', 100000, '가정 · 견적 아님'],
  ['maintenanceCost', '유지관리비', '원/년', 10000],
  ['extraKwhPerYear', '추가 전력', 'kWh_e/년', 1],
  ['elecPrice', '추가 전력 단가', '원/kWh', 1]
];

function renderEconomics() {
  if (!state.diag) runDiagnosis(false);
  if (!state.econInput) state.econInput = econDefaults();
  const p = state.econInput;
  const src = HEAT_SOURCES[p.heatSource] ?? HEAT_SOURCES.other;
  const effM = state.demo.measuredEff ?? state.demoSummary?.eff ?? null;
  const f = $('#eform');
  f.innerHTML = `
    <div class="row"><h3 style="margin:0">${I3('sliders', '', 'ico')} 입력 조건</h3></div>
    <div class="field"><label for="e-src">급탕 열원</label><select id="e-src">${Object.entries(HEAT_SOURCES).map(([k, v]) => `<option value="${k}" ${k === p.heatSource ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">유효도 ε</span>
      <label class="radio"><input type="radio" name="effSrc" value="assumed" ${p.effSource !== 'step2' ? 'checked' : ''}><span>가정값 <b class="num">${state.assumptions.effectiveness}</b></span></label>
      <label class="radio"><input type="radio" name="effSrc" value="step2" ${p.effSource === 'step2' ? 'checked' : ''} ${effM ? '' : 'disabled'}><span>STEP 02 결과 ${effM ? `<b class="num">${effM.value.toFixed(2)}</b> ${statusBadge(effM.source)}` : '(시연 후)'}</span></label></div>
    <div class="fgrid">${ECON_FIELDS.map(([k, label, unit, step, hint]) => {
      const u = k === 'efficiency' ? (src.efficiencyLabel === '평균 COP' ? 'COP' : '0~1') : k === 'price' ? src.priceUnit : unit;
      const l = k === 'efficiency' ? src.efficiencyLabel : label;
      return `<div class="field"><label for="e-${k}">${l}</label><div class="unitwrap"><input id="e-${k}" type="number" step="${step}" min="0" value="${p[k] ?? ''}" data-k="${k}"><span>${u}</span></div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    }).join('')}</div>
    <button class="btn ghost sm" type="button" id="econReset">↺ 진단값으로</button>`;
  $('#e-src').addEventListener('change', (e) => {
    const s = HEAT_SOURCES[e.target.value];
    Object.assign(state.econInput, { heatSource: e.target.value, efficiency: s.efficiency ?? null, price: s.price ?? null });
    save('econ', state.econInput); renderEconomics();
  });
  $$('input[name="effSrc"]', f).forEach((i) => i.addEventListener('change', () => {
    state.econInput.effSource = i.value;
    state.econInput.effectiveness = i.value === 'step2' && effM ? Math.round(effM.value * 100) / 100 : state.assumptions.effectiveness;
    save('econ', state.econInput); renderEconomics();
  }));
  $$('input[data-k]', f).forEach((i) => i.addEventListener('input', () => {
    const v = i.value.trim() === '' ? null : Number(i.value);
    state.econInput[i.dataset.k] = v;
    save('econ', state.econInput);
    renderEconOut();
  }));
  $('#econReset').addEventListener('click', () => { state.econInput = econDefaults(); save('econ', state.econInput); renderEconomics(); });
  renderEconOut();
}

function renderEconOut() {
  const p = state.econInput;
  const r = analyze(p);
  const sens = sensitivity(p);
  const ds = state.demoSummary;
  const src = HEAT_SOURCES[p.heatSource] ?? HEAT_SOURCES.other;
  const em = EMISSION[src.emissionKey];
  const statusTxt = !ds ? '시연 기록 없음' : ds.issues.length ? '확인 필요' : '정상';
  const saved = r.saved ? `${nf(r.saved.value)}<small>${r.saved.unit}/년</small>` : '—<small>열원 정보 필요</small>';
  const pb = r.payback !== null ? `${r.payback.toFixed(1)}<small>년</small>` : '<span style="font-size:18px">산정 불가</span>';
  $('#econOut').innerHTML = `
  <div class="row"><span class="badge est">ESTIMATED · 가정치</span><span class="badge gray">${esc(r.sourceLabel)}</span></div>
  <div class="grid g4 mt-s">
    <div class="kpi">${I3('flame', '', 'kico')}<div class="k">에너지 절감</div><b class="num">${saved}</b></div>
    <div class="kpi">${I3('coins', '', 'kico')}<div class="k">비용 절감</div><b class="num">${r.costSaved === null ? '—' : nf(r.costSaved / 10000)}<small>만원/년</small></b><div class="s">순절감 ${r.netSaving === null ? '—' : `${nf(r.netSaving / 10000)}만원`}</div></div>
    <div class="kpi">${I3('co2', '', 'kico')}<div class="k">탄소 감소</div><b class="num">${r.co2Kg === null ? '—' : nf(r.co2Kg / 1000, 2)}<small>tCO₂eq/년</small></b><div class="s">${r.co2Kg === null ? esc(r.co2Reason) : `계수 ${em?.value ?? ''} ${esc(em?.unit ?? '')}`}</div></div>
    <div class="kpi">${I3('hourglass', '', 'kico')}<div class="k">회수기간</div><b class="num">${pb}</b><div class="s">${r.payback !== null ? `설치비 ${nf(p.installCost / 10000)}만원 기준` : esc(r.paybackReason)}</div></div>
  </div>
  <div class="card mt">
    <h3>회수 열량 <span class="badge th">kWh_th</span></h3>
    <div class="grid g4 mt-s">
      <div class="kpi"><div class="k">평균 열출력</div><b class="num">${nf(r.kw, 1)}<small>kW_th</small></b></div>
      <div class="kpi"><div class="k">일간</div><b class="num">${nf(r.dailyKwh)}<small>kWh_th</small></b></div>
      <div class="kpi"><div class="k">월간</div><b class="num">${nf(r.monthlyKwh)}<small>kWh_th</small></b></div>
      <div class="kpi"><div class="k">연간</div><b class="num">${nf(r.annualKwh)}<small>kWh_th</small></b></div>
    </div>
    <div class="flowline mt-s" aria-label="환산 흐름">
      <div class="box">회수 열량<b>${nf(r.annualKwh)} kWh_th</b></div><div class="arrow">÷ ${src.efficiencyLabel} ${p.efficiency ?? '—'}</div>
      <div class="box">줄어든 급탕 에너지<b>${r.saved ? `${nf(r.saved.value)} ${r.saved.unit}` : '—'}</b>${r.saved?.alt ? `<span class="muted">${nf(r.saved.alt.value)} ${r.saved.alt.unit}</span>` : ''}</div><div class="arrow">× 단가</div>
      <div class="box">비용 절감<b>${won(r.costSaved)}</b>/년</div>
    </div>
    <p class="small muted mt-s">회수열(kWh_th) ≠ 전기 절감 — 열원 효율로 환산</p>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>${I3(statusTxt === '정상' ? 'shield' : 'warning', '', 'ico')} 장치 상태</h3>
      <p><span class="badge ${statusTxt === '정상' ? 'ok' : statusTxt === '확인 필요' ? 'est' : 'gray'}">${statusTxt}</span> ${ds ? statusBadge(ds.source) : ''}</p>
      <p class="small muted">${ds ? `표본 ${ds.samples} · 측정 불가 ${ds.invalid} · 누적 ${ds.kwh.toFixed(2)} kWh_th` : 'STEP 02를 실행하면 반영됩니다.'}</p>
      ${ds?.issues?.length ? `<ul class="issues">${ds.issues.map((i) => `<li class="note warn">${esc(i.msg)}</li>`).join('')}</ul>` : ''}</div>
    <div class="card"><h3>민감도 (±20%)</h3>
      <div class="scroll-x"><table class="tbl sens"><thead><tr><th>변수</th><th class="n">낮을 때</th><th class="n">기준</th><th class="n">높을 때</th></tr></thead><tbody>
      ${sens.rows.map((x) => `<tr><td>${x.label}</td><td class="n">${pbTxt(x.low.payback)}<br><span class="muted small">${x.lowLabel}</span></td><td class="n">${pbTxt(r.payback)}</td><td class="n">${pbTxt(x.high.payback)}<br><span class="muted small">${x.highLabel}</span></td></tr>`).join('')}
      </tbody></table></div><p class="small muted mt-s">단순 회수기간 · 급수 온도는 ±3℃</p></div>
  </div>
  <div class="card mt"><h3>계산 근거</h3>
    <ul class="checklist small">
      <li>평균 회수 열출력 = 동시 사용 유량(${nf(p.concurrentFlowLpm)} L/min) ÷ 60 × 밀도 1.0 kg/L × 비열 4.186 kJ/kg·K × ε ${p.effectiveness} × (${p.drainInC} − ${p.coldInC})℃</li>
      <li>일간 열량 = 평균 열출력 × ${p.hoursPerDay} h (평균 열출력이 일정하다고 본 1차 근사). STEP 02의 누적 열량은 시간 적분으로 구합니다.</li>
      <li>연간 순절감액 = 비용 절감 ${won(r.costSaved)} − 추가 전력비 ${won(r.extraCost)} − 유지관리비 ${won(r.maintenance)}</li>
      <li>단순 회수기간은 금융비용·설비 수명·성능 저하·공사 중단 비용을 반영하지 않습니다.</li>
      ${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
    </ul>
    ${factorTableHtml()}
  </div>
  <div class="row mt noprint"><a class="btn" href="#report">결과 보고서 보기 →</a></div>`;
}
const pbTxt = (v) => (v === null ? '산정 불가' : `${v.toFixed(1)}년`);

function factorTableHtml() {
  return `<div class="scroll-x mt-s"><table class="tbl"><thead><tr><th>항목</th><th class="n">값</th><th>단위</th><th>출처·기준연도</th><th>상태</th></tr></thead><tbody>
  ${factorTable().map((f) => `<tr><td>${f.name}</td><td class="n">${f.value}</td><td>${esc(f.unit)}</td><td class="small">${esc(f.source)}</td><td>${f.verified ? '<span class="badge ok">확인</span>' : '<span class="badge est">확인 필요</span>'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------------- 제품 ----------------
const DRAWINGS = [
  ['iso', '3/4 아이소메트릭', () => productIso({ animated: false })],
  ['ortho', '다면도', orthographic],
  ['section', '내부 열교환 구조', internalSection],
  ['explode', '분해도', exploded],
  ['install', '설치 시나리오', installScene],
  ['wiring', '센서·배관 연결', wiring]
];
function initProduct() {
  const tabs = $('#prodTabs');
  tabs.innerHTML = DRAWINGS.map(([k, l], i) => `<button role="tab" type="button" id="tab-${k}" aria-selected="${i === 0}" aria-controls="drawing" data-k="${k}">${l}</button>`).join('');
  const show = (k) => {
    const d = DRAWINGS.find((x) => x[0] === k);
    $$('#prodTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    $('#drawing').innerHTML = `<span class="stamp badge est">설명용 · 제조 도면 아님</span>${d[2]()}`;
    $('#drawing').setAttribute('aria-labelledby', `tab-${k}`);
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.k); });
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const bs = $$('#prodTabs button');
    const i = bs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length];
    n.focus(); show(n.dataset.k);
  });
  show('iso');
}

// ---------------- 보고서 ----------------
function buildReport() {
  if (!state.diag) runDiagnosis(false);
  if (!state.econInput) state.econInput = econDefaults();
  const d = state.diag;
  const di = state.diagInput;
  const ds = state.demoSummary;
  const e = analyze(state.econInput);
  return { d, di, ds, e, p: state.econInput };
}

function renderReport() {
  const { d, di, ds, e, p } = buildReport();
  const src = HEAT_SOURCES[p.heatSource] ?? HEAT_SOURCES.other;
  $('#reportBody').innerHTML = `
    <p class="small muted">${new Date().toLocaleString('ko-KR')} · ${ds ? statusBadge(ds.source) : '<span class="badge gray">STEP 02 미실행</span>'} <span class="badge est">경제성 ESTIMATED</span></p>
    <div class="answer"><div class="n">${I3('clipboard', '', 'aico')}</div><div><h4>설치할 가치가 있나? → <b>${d.label}</b></h4>
      <p class="small">${esc(BUILDING_TYPES[di.type] ?? '-')} · 샤워기 ${nf(di.showerHeads)}개 · 하루 ${nf(di.dailyUsers)}명 · 온수 ${d.daily ? nf(d.daily.liters) : '—'} L/일 · 회수 가능 ${d.daily ? nf(d.daily.recoverKwh) : '—'} kWh_th/일</p>
      <p class="small muted">자체 기준(가설) · 서울시 등급 아님${di.seoulGrade ? ` · 입력 등급 ${esc(di.seoulGrade)}` : ''}</p></div></div>
    <div class="answer"><div class="n">${I3('exchange', '', 'aico')}</div><div><h4>열을 회수하나?</h4>
      ${ds ? `<p class="small">BYPASS ΔT ${ds.stats.BYPASS.n ? `${ds.stats.BYPASS.dT.toFixed(2)}℃` : '—'} → ON ΔT ${ds.stats.ON.n ? `+${ds.stats.ON.dT.toFixed(2)}℃` : '—'} · 평균 ${ds.stats.ON.n ? ds.stats.ON.kw.toFixed(2) : '—'} kW_th · 누적 ${ds.kwh.toFixed(2)} kWh_th</p>
      <p class="small muted">${ds.source === 'SIMULATED' ? '시뮬레이션 결과 · 실측은 저전압 실험 장치로 예정' : `실측 · 표본 ${ds.samples} · 측정 불가 ${ds.invalid}`}</p>` : '<p class="small">STEP 02 미실행</p>'}</div></div>
    <div class="answer"><div class="n">${I3('coins', '', 'aico')}</div><div><h4>얼마나 아끼나?</h4>
      <p class="small">연 ${nf(e.annualKwh)} kWh_th → ${esc(src.label)} ${e.saved ? `${nf(e.saved.value)} ${e.saved.unit}` : '—'} → ${won(e.costSaved)}/년 · 탄소 ${e.co2Kg === null ? '산정 보류' : `${nf(e.co2Kg / 1000, 2)} tCO₂eq/년`} · 회수기간 ${e.payback === null ? '산정 불가' : `${e.payback.toFixed(1)}년`}</p>
      <p class="small muted">ε ${p.effectiveness} · ${nf(p.concurrentFlowLpm)} L/min × ${p.hoursPerDay} h × ${p.daysPerYear}일 · ${src.efficiencyLabel} ${p.efficiency} · ${p.price} ${src.priceUnit} · 설치비 ${nf(p.installCost / 10000)}만원(가정)</p></div></div>
    <h3 class="mt">적용 계수</h3>${factorTableHtml()}
    <h3 class="mt">검증 전</h3>
    <ul class="checklist small"><li>실제 유효도·압력손실·세척 주기</li><li>시설별 동시 사용 패턴, 계절별 급수 온도</li><li>설치비 견적·지불 의향</li><li>급수 위생·역류방지·인증</li><li>지역난방 배출계수</li></ul>
    <p class="disclaimer">기초 추정 · 제3자 검증 전 · kWh_th ≠ kWh_e · 실제 설치는 전문업체·인증 필요</p>`;
}

function reportText() {
  const { d, di, ds, e, p } = buildReport();
  const src = HEAT_SOURCES[p.heatSource] ?? HEAT_SOURCES.other;
  return [
    `[HEAT LOOP 검토 요약] ${new Date().toLocaleDateString('ko-KR')}`,
    `① 설치 가치: 적합도 ${d.label} (HEAT LOOP 자체 기준·초기 가설, 서울시 등급 아님) — ${BUILDING_TYPES[di.type] ?? '-'}, 샤워기 ${di.showerHeads ?? '-'}개, 하루 ${di.dailyUsers ?? '-'}명`,
    `② 열 회수: ${ds ? `ON 평균 ΔT +${ds.stats.ON.n ? ds.stats.ON.dT.toFixed(2) : '-'}℃, 누적 ${ds.kwh.toFixed(2)} kWh_th [${ds.source}${ds.source === 'SIMULATED' ? ' · 실측 아님' : ''}]` : 'STEP 02 미실행'}`,
    `③ 절감 가능성 [ESTIMATED]: 연 ${nf(e.annualKwh)} kWh_th → ${src.label} ${e.saved ? `${nf(e.saved.value)} ${e.saved.unit}` : '-'}, ${won(e.costSaved)}/년, 탄소 ${e.co2Kg === null ? '산정 보류' : `${nf(e.co2Kg / 1000, 2)} tCO2eq/년`}, 회수기간 ${e.payback === null ? '산정 불가' : `${e.payback.toFixed(1)}년`}`,
    '※ 기초 추정이며 제3자 검증 전. 실제 배관 설치는 전문 설비업체·인증 검토 필요.'
  ].join('\n');
}

function initReport() {
  const btn = $('#copyBtn');
  const original = btn.innerHTML;
  btn.addEventListener('click', async () => {
    const text = reportText();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = '복사했습니다';
      setTimeout(() => (btn.innerHTML = original), 1800);
    } catch {
      const ta = $('#copyFallback');
      ta.style.display = 'block'; ta.value = text; ta.focus(); ta.select();
    }
  });
  $('#printBtn').addEventListener('click', () => window.print());
}

// ---------------- 시작 ----------------
initHome();
initDiagnose();
initDemo();
initProduct();
initReport();
initBuilding();
route();
