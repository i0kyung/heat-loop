// chart.js — 외부 라이브러리 없는 SVG 선 그래프
// series: [{ key, label, color, values:[number|null], dash? }], x: [label] 동일 길이

export function lineChart({ series, xLabels, height = 200, yUnit = '', yMin, yMax, title, bands = [] }) {
  const W = 640, H = height, L = 46, R = 12, T = 14, B = 26;
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) {
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title ?? '그래프'}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#66736d" font-family="Pretendard">시연을 시작하면 그래프가 그려집니다</text></svg>`;
  }
  let lo = yMin ?? Math.min(...all);
  let hi = yMax ?? Math.max(...all);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08;
  if (yMin === undefined) lo -= pad;
  if (yMax === undefined) hi += pad;
  const n = Math.max(2, xLabels.length);
  const X = (i) => L + (i / (n - 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let s = '';
  // 모드 배경 (BYPASS 구간)
  for (const b of bands) s += `<rect x="${X(b.from)}" y="${T}" width="${Math.max(1, X(b.to) - X(b.from))}" height="${H - T - B}" fill="${b.color}"/>`;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = lo + ((hi - lo) * i) / ticks;
    const y = Y(v);
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e3e5dc"/>`;
    s += `<text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#66736d">${v.toFixed(Math.abs(hi - lo) < 5 ? 1 : 0)}</text>`;
  }
  s += `<text x="${L - 6}" y="${T - 2}" text-anchor="end" font-size="10.5" fill="#66736d">${yUnit}</text>`;
  const step = Math.ceil(n / 6);
  xLabels.forEach((lab, i) => { if (i % step === 0 || i === n - 1) s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#66736d">${lab}</text>`; });
  for (const sr of series) {
    let d = '';
    let pen = false;
    sr.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2.2" stroke-linejoin="round" ${sr.dash ? `stroke-dasharray="${sr.dash}"` : ''}/>`;
    const last = [...sr.values].reverse().findIndex((v) => Number.isFinite(v));
    if (last >= 0) {
      const i = sr.values.length - 1 - last;
      s += `<circle cx="${X(i)}" cy="${Y(sr.values[i])}" r="3.5" fill="${sr.color}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title ?? '그래프'}" font-family="Pretendard, sans-serif">${s}</svg>`;
}
