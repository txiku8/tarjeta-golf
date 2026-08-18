"use strict";
const REND_OPTS = [5, 10, 20, 0]; // nº de rondas del resumen (0 = todas)

/* ---------- Filtros: cuántas rondas y de qué campo ----------
   La elección se guarda en el perfil, así la pantalla se abre como la dejaste. */
function rendN() { const v = profile.rendN; return REND_OPTS.includes(v) ? v : 20; }
function rendCourse() { return profile.rendCourse || ''; }
// Rondas que entran en la pantalla: primero el filtro de campo, luego el recorte por número.
function rendRounds() {
  const c = rendCourse();
  const list = c ? rounds.filter(r => r.courseName === c) : rounds;
  const n = rendN();
  return n ? list.slice(0, n) : list;
}
function renderRendFilters() {
  const box = $('#rendFilters');
  // campos con rondas guardadas, del más jugado al que menos
  const cnt = new Map();
  rounds.forEach(r => cnt.set(r.courseName, (cnt.get(r.courseName) || 0) + 1));
  const cursos = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  const cur = rendCourse();
  const chip = n => `<button class="rf-chip${n === rendN() ? ' on' : ''}" data-n="${n}">${n || 'Todas'}</button>`;
  box.innerHTML = `
    <div class="rf-row">${REND_OPTS.map(chip).join('')}</div>
    ${cursos.length > 1 ? `<select class="rf-sel" id="rfCourse">
      <option value="">Todos los campos</option>
      ${cursos.map(([n, c]) => `<option value="${esc(n)}"${n === cur ? ' selected' : ''}>${esc(n)} (${c})</option>`).join('')}
    </select>` : ''}`;
  box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    profile.rendN = +b.dataset.n; save(LS.profile, profile); renderRendimiento();
  });
  const sel = $('#rfCourse');
  if (sel) sel.onchange = () => { profile.rendCourse = sel.value; save(LS.profile, profile); renderRendimiento(); };
}

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
  renderRendFilters();
  const last = rendRounds();
  const cur = rendCourse(), n = rendN();
  $('#rendCap').textContent = !last.length ? 'Aún no hay rondas guardadas.'
    : (n ? 'Tus últimas ' + Math.min(n, last.length) + ' rondas' : 'Todas tus rondas')
      + (cur ? ' en ' + cur : '') + ' · ' + last.length + (last.length === 1 ? ' ronda' : ' rondas');
  const agg = last.reduce((a, r) => {
    const t = roundTotals(r);
    a.strokes += t.strokes; a.par += t.par; a.putts += t.putts; a.played += t.played;
    a.firHit += t.firHit; a.firPoss += t.firPoss; a.gir += t.gir; a.girPoss += t.girPoss;
    a.scr += t.scr; a.scrPoss += t.scrPoss; a.girPutts += t.girPutts; a.pen += t.pen;
    a.sand += t.sand; a.sandPoss += t.sandPoss;
    a.driveSum += t.driveAvg * t.driveN; a.driveN += t.driveN;
    if (t.driveMax > a.driveMax) a.driveMax = t.driveMax;
    return a;
  }, { strokes: 0, par: 0, putts: 0, played: 0, firHit: 0, firPoss: 0, gir: 0, girPoss: 0,
       scr: 0, scrPoss: 0, girPutts: 0, pen: 0, sand: 0, sandPoss: 0, driveSum: 0, driveN: 0, driveMax: 0 });
  const withHoles = last.filter(r => roundTotals(r).played > 0);
  const puttsPer = agg.played ? (agg.putts / agg.played) : 0;

  const mediaVs = agg.played ? Math.round((agg.strokes - agg.par) / (last.length || 1)) : null;
  $('#homeStats').innerHTML = [
    mtile('Rondas', last.length, rendCourse() ? 'en este campo' : 'de ' + rounds.length + ' en total', 'flag', null, 'var(--good)'),
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
  renderRendHoyos(withHoles);
  renderProgress(withHoles);
}

/* Hoyos: con un campo elegido, la tabla hoyo a hoyo de ese campo; con todos los campos,
   los que más se te atragantan. Solo cuentan los jugados al menos dos veces cuando hay
   material suficiente: con una sola vuelta el "hoyo que más cuesta" no dice nada. */
function renderRendHoyos(list) {
  const sec = $('#rendHoyosSec'), box = $('#rendHoyos');
  const all = holeAggregate(list);
  if (!all.length) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  const curso = rendCourse();
  sec.style.display = '';

  if (curso) {
    const filas = all.filter(e => e.course === curso).sort((a, b) => a.no - b.no);
    if (!filas.length) { sec.style.display = 'none'; box.innerHTML = ''; return; }
    const peor = filas.reduce((a, b) => b.avgVs > a.avgVs ? b : a);
    box.innerHTML = `<table class="sum-split hoyos">
      <thead><tr><th class="rh">Hoyo</th><th>Par</th><th>Veces</th><th>Media</th><th>Vs par</th></tr></thead>
      <tbody>${filas.map(e => `<tr${e === peor && filas.length > 1 ? ' class="peor"' : ''}>
        <td class="rh"><b class="tnum">${e.no}</b>${e.mts ? ` <small class="tnum">${e.mts} m</small>` : ''}</td>
        <td class="tnum">${e.par}</td>
        <td class="tnum">${e.n}</td>
        <td class="tnum">${e.avg.toFixed(1).replace('.', ',')}</td>
        <td class="tnum" style="color:${vsColor(e.avgVs)}">${fmtAvgVs(e.avgVs)}</td></tr>`).join('')}</tbody></table>
      <p class="hoyos-note">El hoyo marcado es el que más golpes te cuesta sobre el par.</p>`;
    return;
  }

  // Todos los campos: ranking de los que peor se te dan (y los tres mejores).
  const rep = all.filter(e => e.n >= 2);
  const base = (rep.length >= 4 ? rep : all).slice();
  const peores = base.slice().sort((a, b) => b.avgVs - a.avgVs).slice(0, 5);
  const mejores = base.slice().sort((a, b) => a.avgVs - b.avgVs).slice(0, 3);
  const fila = e => `<div class="hrow">
      <span class="hno tnum">${e.no}</span>
      <span class="hnm"><b>${esc(e.course)}</b><small>par ${e.par}${e.mts ? ' · ' + e.mts + ' m' : ''} · ${e.n} ${e.n === 1 ? 'vez' : 'veces'}</small></span>
      <span class="hvs tnum" style="color:${vsColor(e.avgVs)}">${fmtAvgVs(e.avgVs)}</span>
    </div>`;
  box.innerHTML = `
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Los que más te cuestan</span>
        <span class="prog-sub">media sobre el par</span></div>
      ${peores.map(fila).join('')}
    </div>
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Los que mejor se te dan</span></div>
      ${mejores.map(fila).join('')}
    </div>
    <p class="hoyos-note">Elige un campo arriba para ver su tabla hoyo a hoyo.</p>`;
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
  if (!marked && !agg.driveN) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  // Distancia de las salidas medidas con el GPS (las que no se midieron no cuentan).
  const distCard = !agg.driveN ? '' : `
    <div class="mgrid2">
      ${mtile('Salida media', Math.round(agg.driveSum / agg.driveN) + ' m',
        agg.driveN + (agg.driveN === 1 ? ' medida' : ' medidas'), 'target', 'var(--indigo)')}
      ${mtile('La más larga', agg.driveMax + ' m', 'medida con el GPS', 'flag', 'var(--good)')}
    </div>`;
  if (!marked) { box.innerHTML = distCard; return; }
  const segs = [['Izquierda', ha.left, 'var(--bogey)'], ['Calle', agg.firHit, 'var(--good)'], ['Derecha', ha.right, 'var(--eagle)']];
  const miss = ha.left + ha.right;
  const tilt = !miss ? 'sin fallos de calle'
    : ha.left === ha.right ? 'fallos repartidos'
    : `tiendes a fallar a la ${ha.left > ha.right ? 'izquierda' : 'derecha'} (${Math.round(Math.max(ha.left, ha.right) / miss * 100)}% de los fallos)`;
  box.innerHTML = `
    ${distCard}
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Salidas apuntadas</span>
        <span class="prog-cur tnum">${Math.round(agg.firHit / marked * 100)}%</span></div>
      <div class="dist-bar">${segs.filter(s => s[1]).map(s => `<span style="width:${(s[1] / marked * 100).toFixed(1)}%;background:${s[2]}"></span>`).join('')}</div>
      <div class="dist-legend">${segs.map(s => `<span class="dl"><span class="dot" style="background:${s[2]}"></span>${s[0]} <b class="tnum">${s[1]}</b></span>`).join('')}</div>
      <div class="prog-sub">${marked} salida${marked === 1 ? '' : 's'} apuntada${marked === 1 ? '' : 's'} · ${tilt}</div>
    </div>`;
}

/* ---------- TAB: Jugar ---------- */
