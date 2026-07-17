"use strict";
const REND_N = 20; // nº de rondas recientes que entran en el resumen

// Media de golpes sobre el par por hoyo: siempre con signo y 2 decimales ("+0,42", "-0,10", "0,00").
function fmtAvgVs(n) {
  const s = Math.abs(n).toFixed(2).replace('.', ',');
  return n > 0 ? '+' + s : n < 0 ? '−' + s : s;
}

// Recorre los hoyos de las rondas para lo que roundTotals no cubre:
// detalle de putts, sesgo de la salida y rendimiento por par.
function rendHoleAgg(list) {
  const a = { onePutt: 0, threePutt: 0, birdie: 0, left: 0, right: 0, byPar: new Map() };
  list.forEach(r => r.holes.forEach((h, i) => {
    if (!h.strokes) return;
    const p = r.pars[i];
    if (h.putts === 1) a.onePutt++;
    if (h.putts >= 3) a.threePutt++;
    if (h.strokes - p <= -1) a.birdie++;
    if (p >= 4) { if (h.fir === 'left') a.left++; else if (h.fir === 'right') a.right++; }
    const bp = a.byPar.get(p) || { holes: 0, vs: 0 };
    bp.holes++; bp.vs += h.strokes - p;
    a.byPar.set(p, bp);
  }));
  return a;
}

function renderRendimiento() {
  const last = rounds.slice(0, REND_N);
  const agg = last.reduce((a, r) => {
    const t = roundTotals(r);
    a.strokes += t.strokes; a.par += t.par; a.putts += t.putts; a.played += t.played;
    a.firHit += t.firHit; a.firPoss += t.firPoss; a.gir += t.gir; a.girPoss += t.girPoss;
    a.scr += t.scr; a.scrPoss += t.scrPoss; a.girPutts += t.girPutts; a.pen += t.pen;
    a.sand += t.sand; a.sandPoss += t.sandPoss;
    return a;
  }, { strokes: 0, par: 0, putts: 0, played: 0, firHit: 0, firPoss: 0, gir: 0, girPoss: 0,
       scr: 0, scrPoss: 0, girPutts: 0, pen: 0, sand: 0, sandPoss: 0 });
  const withHoles = last.filter(r => roundTotals(r).played > 0);
  const puttsPer = agg.played ? (agg.putts / agg.played) : 0;

  const mediaVs = agg.played ? Math.round((agg.strokes - agg.par) / (last.length || 1)) : null;
  $('#homeStats').innerHTML = [
    mtile('Rondas', rounds.length, '', 'flag', null, 'var(--good)'),
    mtile('Media vs Par', mediaVs != null ? fmtVsPar(mediaVs) : '—', 'por ronda', 'chart',
      mediaVs != null ? vsColor(mediaVs) : 'var(--muted)', 'var(--indigo)'),
    mtile('Putts / hoyo', agg.played ? puttsPer.toFixed(2).replace('.', ',') : '—', '', 'putter',
      agg.played ? 'var(--info)' : 'var(--muted)', 'var(--muted)'),
    mtile('Calles', agg.firPoss ? Math.round(agg.firHit / agg.firPoss * 100) + '%' : '—', '', 'target',
      agg.firPoss ? 'var(--indigo)' : 'var(--muted)'),
  ].join('');

  const ha = rendHoleAgg(withHoles);
  renderRendStats(agg, ha, withHoles.length);
  renderRendPar(ha);
  renderRendDrive(agg, ha);
  renderProgress();
}

// Misma rejilla de casillas que el resumen de una partida, pero agregada.
function renderRendStats(agg, ha, nRounds) {
  const sec = $('#rendStatsSec'), box = $('#rendStats');
  if (!agg.played) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  const pct = (n, d) => d ? Math.round(n / d * 100) + '%' : '—';
  const holes = n => n + (n === 1 ? ' hoyo' : ' hoyos');
  const mut = 'var(--muted)';
  box.innerHTML = [
    mtile('Greens (GIR)', pct(agg.gir, agg.girPoss), agg.gir + ' / ' + agg.girPoss, 'green', agg.girPoss ? 'var(--good)' : mut),
    mtile('Scrambling', agg.scrPoss ? pct(agg.scr, agg.scrPoss) : '—', agg.scrPoss ? agg.scr + ' / ' + agg.scrPoss : 'todos', 'scramble', agg.scrPoss ? 'var(--good)' : mut),
    mtile('Bunkers', agg.sandPoss ? pct(agg.sand, agg.sandPoss) : '—', agg.sandPoss ? agg.sand + ' / ' + agg.sandPoss : 'sin datos', 'bunker', agg.sandPoss ? 'var(--warn)' : mut),
    mtile('Putts / GIR', agg.gir ? (agg.girPutts / agg.gir).toFixed(2).replace('.', ',') : '—', agg.gir ? 'en ' + agg.gir : 'sin greens', 'ball', agg.gir ? 'var(--info)' : mut),
    mtile('1 putt', pct(ha.onePutt, agg.played), holes(ha.onePutt), 'ring', ha.onePutt ? 'var(--indigo)' : mut),
    mtile('3 putts', pct(ha.threePutt, agg.played), holes(ha.threePutt), 'ring', ha.threePutt ? 'var(--bad)' : mut),
    mtile('Birdies+', nRounds ? (ha.birdie / nRounds).toFixed(1).replace('.', ',') : '—', 'por ronda', 'bird', 'var(--good)'),
    mtile('Penaliz.', nRounds ? (agg.pen / nRounds).toFixed(1).replace('.', ',') : '—', 'por ronda', 'warn', agg.pen ? 'var(--bad)' : mut),
  ].join('');
}

// Dónde se van los golpes: media sobre el par en los par 3, par 4 y par 5.
function renderRendPar(ha) {
  const sec = $('#rendParSec'), box = $('#rendPar');
  const pars = [...ha.byPar.keys()].sort((a, b) => a - b);
  if (!pars.length) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  const rows = pars.map(p => {
    const d = ha.byPar.get(p), avg = d.vs / d.holes;
    return `<tr><td class="rh">Par ${p}</td><td class="tnum">${d.holes}</td>
      <td class="tnum" style="color:${vsColor(avg)}">${fmtAvgVs(avg)}</td></tr>`;
  }).join('');
  box.innerHTML = `<table class="sum-split">
    <thead><tr><th class="rh"></th><th>Hoyos</th><th>Media vs par</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// Sesgo de la salida: de los par 4 y 5, cuántas calles y hacia dónde se falla.
function renderRendDrive(agg, ha) {
  const sec = $('#rendDriveSec'), box = $('#rendDrive');
  const marked = agg.firHit + ha.left + ha.right; // solo los hoyos donde se apuntó la salida
  if (!marked) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  const segs = [['Izquierda', ha.left, 'var(--bogey)'], ['Calle', agg.firHit, 'var(--good)'], ['Derecha', ha.right, 'var(--eagle)']];
  const miss = ha.left + ha.right;
  const tilt = !miss ? 'sin fallos de calle'
    : ha.left === ha.right ? 'fallos repartidos'
    : `tiendes a fallar a la ${ha.left > ha.right ? 'izquierda' : 'derecha'} (${Math.round(Math.max(ha.left, ha.right) / miss * 100)}% de los fallos)`;
  box.innerHTML = `
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Salidas apuntadas</span>
        <span class="prog-cur tnum">${Math.round(agg.firHit / marked * 100)}%</span></div>
      <div class="dist-bar">${segs.filter(s => s[1]).map(s => `<span style="width:${(s[1] / marked * 100).toFixed(1)}%;background:${s[2]}"></span>`).join('')}</div>
      <div class="dist-legend">${segs.map(s => `<span class="dl"><span class="dot" style="background:${s[2]}"></span>${s[0]} <b class="tnum">${s[1]}</b></span>`).join('')}</div>
      <div class="prog-sub">${marked} salida${marked === 1 ? '' : 's'} apuntada${marked === 1 ? '' : 's'} · ${tilt}</div>
    </div>`;
}

/* ---------- TAB: Jugar ---------- */
