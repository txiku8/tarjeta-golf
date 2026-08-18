"use strict";
function renderJugar() {
  if (geoState === 'idle') requestGeo(); // pide ubicación la primera vez para mostrar los más cercanos
  resumeBannerInto($('#jugarResume'));
  renderNearby();
  renderFinder();
}
const NEAR_N = 4; // nº de campos cercanos que se muestran por defecto
function renderNearby() {
  const box = $('#misCampos'); box.innerHTML = '';
  const head = el('div', 'sec-row');
  const note = geoState === 'ok' ? '<span class="geo-note">📍 los más cercanos</span>'
    : geoState === 'asking' ? '<span class="geo-note">📍 buscando ubicación…</span>' : '';
  head.innerHTML = `<h2 class="sec" style="margin:0">Campos cercanos</h2>${note}`;
  box.appendChild(head);

  // Sin ubicación: invitación a activarla (los cercanos necesitan geoposición).
  if (geoState !== 'ok' || !userPos) {
    const prompt = el('div', 'geo-prompt');
    prompt.innerHTML = `<div class="gp-ico">📍</div>
      <div class="gp-txt">${geoState === 'asking' ? 'Buscando tu ubicación…' : 'Activa la ubicación para ver los ' + NEAR_N + ' campos más cercanos.'}</div>
      ${geoState === 'asking' ? '' : '<button class="btn" data-geo>Activar ubicación</button>'}
      <div class="gp-sub">O busca cualquier campo en el buscador de arriba.</div>`;
    const b = prompt.querySelector('[data-geo]');
    if (b) b.onclick = () => requestGeo(true);
    box.appendChild(prompt);
    return;
  }

  const near = sortByDistance(GOLF_CATALOG.filter(c => c.lat != null), c => ({ lat: c.lat, lon: c.lon })).slice(0, NEAR_N);
  near.forEach(c => box.appendChild(bigCourseCard({
    name: c.n, loc: (c.t ? c.t + ' · ' : '') + c.p, par: c.par, h: c.h,
    coords: { prov: c.p, lat: c.lat, lon: c.lon }, owned: false, km: distToCoords({ lat: c.lat, lon: c.lon }),
    onPrev: () => openCoursePreview(c),
    onPlay: () => playCatalog(c),
  })));
}

/* ---------- Rounds ---------- */
// `drive` = metros de la salida, medidos con el GPS (0 = sin medir).
function blankHoles(n) { return Array.from({ length: n }, () => ({ strokes: 0, putts: 0, fir: null, pen: 0, bunker: false, drive: 0 })); }

function startRound(course, opts) {
  if (active && active.dirty) {
    if (!confirm('Tienes una ronda sin guardar. ¿Descartarla y empezar otra?')) return;
  }
  opts = opts || {};
  const nH = course.pars.length;
  // Rango de hoyos: 'front' = 1-9, 'back' = 10-18, cualquier otro = todos.
  let from = 0, to = nH;
  if (opts.range === 'front') { from = 0; to = Math.min(9, nH); }
  else if (opts.range === 'back' && nH >= 18) { from = 9; to = 18; }
  const pars = course.pars.slice(from, to);
  const si = course.si ? course.si.slice(from, to) : null;
  // Metros de cada hoyo desde la barra jugada (mismo recorte que pars/si).
  const allMts = opts.mts && opts.mts.length === nH ? opts.mts : null;
  const mts = allMts ? allMts.slice(from, to) : null;
  active = {
    id: uid(), courseId: course.id, courseName: course.name, courseLoc: course.loc,
    pars, si, mts, date: new Date().toISOString(),
    // slope y rating de la barra + par total del campo: los necesita el hándicap WHS
    sr: opts.sr != null ? opts.sr : null,
    cr: opts.cr != null ? opts.cr : null,
    coursePar: opts.coursePar != null ? opts.coursePar : null,
    holeStart: from + 1, // nº del primer hoyo (para numerar 10-18 correctamente)
    mode: opts.mode || 'medal',
    // Match play: bloque del rival con su propia tarjeta de golpes por hoyo.
    match: (opts.mode === 'match' && opts.match)
      ? Object.assign({}, opts.match, { holes: blankMatchHoles(pars.length) }) : null,
    // Fourball: tarjeta del compañero y, en match play, la mejor bola de la pareja rival.
    fb: (opts.mode === 'fourball' && opts.fb)
      ? Object.assign({}, opts.fb, {
          holes: blankFbHoles(pars.length),
          rivalHoles: opts.fb.format === 'match' ? blankMatchHoles(pars.length) : null,
        }) : null,
    hcp: opts.hcp != null ? opts.hcp : null,   // hándicap de juego (golpes) ya calculado/editado
    hcpIndex: opts.index != null ? opts.index : null, // índice exacto (informativo)
    barra: opts.barra || null,                 // barra jugada (informativo)
    holes: blankHoles(pars.length), saved: false, dirty: false,
  };
  save(LS.active, active);
  openRound();
  // Si el campo tiene datos GPS, abre directamente el mapa del hoyo al empezar la ronda.
  if (typeof gpsAvailable === 'function' && gpsAvailable()) openGps();
}
function resumeRound(r) { active = JSON.parse(JSON.stringify(r)); active.saved = true; save(LS.active, active); openRound(); }

function openRound() {
  document.querySelectorAll('main.tab').forEach(m => m.classList.add('hidden'));
  $('#tabbar').classList.add('hidden');
  $('#mapFab').classList.add('hidden');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.add('hidden');
  $('#viewRound').classList.remove('hidden');
  $('#roundBar').classList.remove('hidden');
  keepAwake(true);   // jugando, que no se apague la pantalla entre golpe y golpe
  $('#rTitle').textContent = active.courseName;
  $('#viewRound').classList.toggle('match', isMatch(active));
  $('#viewRound').classList.toggle('fourball', isFourball(active));
  const hcpLbl = isMatch(active) ? matchSubLabel(active)
    : isFourball(active) ? fbSubLabel(active)
    : (active.hcp != null ? ' · ' + active.hcp + ' golpes' + (active.barra ? ' (' + active.barra + ')' : '') : '');
  const mAll = roundMetres(active);
  const mLbl = mAll ? ' · ' + mAll.reduce((a, b) => a + b, 0) + ' m' : '';
  $('#rSub').textContent = (active.courseLoc ? active.courseLoc + ' · ' : '') + fmtDate(active.date) +
    ' · ' + active.pars.length + ' hoyos' + mLbl + ' · ' + modeName(active) + hcpLbl;
  // hoyo activo del editor: el primero sin apuntar, o el primero
  const firstEmpty = active.holes.findIndex((h, i) => !holeHasData(i));
  selHole = firstEmpty >= 0 ? firstEmpty : 0;
  // Los hoyos ya apuntados (borrador reanudado o ronda completa) se muestran desde el principio.
  shownHoles = new Set();
  active.holes.forEach((h, i) => { if (holeHasData(i)) shownHoles.add(i); });
  renderRound();
  window.scrollTo(0, 0);
}
function closeRound(toTab) {
  keepAwake(false);
  $('#viewRound').classList.add('hidden');
  $('#roundBar').classList.add('hidden');
  $('#roundSheet').classList.add('hidden'); $('#roundSheet').classList.remove('open');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.remove('hidden');
  showTab(toTab || curTab);
}

/* Panel desplegable (bottom sheet) con todos los hoyos para saltar entre ellos. */
function renderSheetHoles() {
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford' || fbIsStb(active);
  const st = anyMatchState(active);
  const box = $('#rsHoles');
  box.innerHTML = active.holes.map((h, i) => {
    const played = !!h.strokes;
    const res = st ? st.res[i] : null;
    const dots = st
      ? `<div class="sh-dots" style="color:${matchColor(res || 0)}">${res === null ? '' : res > 0 ? '▲' : res < 0 ? '▼' : '='}</div>`
      : (stb && recv[i] > 0) ? `<div class="sh-dots">${'•'.repeat(recv[i])}</div>` : `<div class="sh-dots empty"></div>`;
    return `<button class="sh-hole ${i === selHole ? 'active' : ''}" data-i="${i}">
      <div class="sh-no tnum">${holeNo(i)}</div>
      <div class="sh-score tnum" style="${played ? `background:${scoreColor(h.strokes, active.pars[i])};color:#fff;border-color:transparent` : ''}">${h.strokes || '·'}</div>
      ${dots}
    </button>`;
  }).join('');
  box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    selectHole(+b.dataset.i); closeRoundSheet(); window.scrollTo(0, 0);
  });
}
function openRoundSheet() {
  renderSheetHoles();
  const s = $('#roundSheet');
  s.classList.remove('hidden');
  requestAnimationFrame(() => s.classList.add('open'));
}
function closeRoundSheet() {
  const s = $('#roundSheet');
  s.classList.remove('open');
  setTimeout(() => s.classList.add('hidden'), 240);
}

/* ===== Pantalla de ronda: tarjeta clásica (arriba) + editor de un hoyo (abajo) ===== */
let selHole = 0;                 // índice del hoyo activo en el editor
// Hoyos cuyo resultado YA se muestra en la tarjeta/totales de arriba. Un hoyo se "revela" al salir
// de él (pasar a otro); el que se está editando no aparece arriba hasta entonces.
let shownHoles = new Set();
// Un hoyo tiene datos si hay golpes míos, del rival / del compañero, o si está concedido.
function holeHasData(i) {
  if (active.holes[i].strokes > 0) return true;
  const m = active.match, mh = m && m.holes[i];
  if (mh && (mh.strokes > 0 || mh.conc)) return true;
  const f = active.fb;
  if (f) {
    if (f.holes[i] && f.holes[i].strokes > 0) return true;
    const rh = f.rivalHoles && f.rivalHoles[i];
    if (rh && (rh.strokes > 0 || rh.conc)) return true;
  }
  return false;
}
function isHoleShown(i) { return holeHasData(i) && (i !== selHole || shownHoles.has(i)); }
// Copia de la ronda con SOLO los hoyos ya revelados (el que se edita no cuenta arriba todavía).
function shownRound() {
  const blank = { strokes: 0, putts: 0, fir: null, pen: 0, bunker: false };
  const r = Object.assign({}, active, { holes: active.holes.map((h, i) => isHoleShown(i) ? h : blank) });
  if (active.match) r.match = Object.assign({}, active.match,
    { holes: active.match.holes.map((mh, i) => isHoleShown(i) ? mh : { strokes: 0, conc: null }) });
  if (active.fb) {
    r.fb = Object.assign({}, active.fb,
      { holes: active.fb.holes.map((fh, i) => isHoleShown(i) ? fh : { strokes: 0 }) });
    if (active.fb.rivalHoles) r.fb.rivalHoles =
      active.fb.rivalHoles.map((rh, i) => isHoleShown(i) ? rh : { strokes: 0, conc: null });
  }
  return r;
}
function modeName(r) {
  if (r.mode === 'fourball') return fbIsStb(r) ? 'Fourball mejor bola' : 'Fourball match';
  return r.mode === 'stableford' ? 'Stableford' : r.mode === 'match' ? 'Match play' : 'Medal play';
}
// Nombre corto para las filas de la tarjeta (primer nombre, recortado).
function shortName(s, n) { return esc(String(s || '').split(' ')[0].slice(0, n || 7)); }
// Nombre del equipo contrario, sea match play individual o fourball.
function oppName(r) { return isMatch(r) ? r.match.rival : r.fb.rivals; }
// " vs Rival · a scratch / recibes 3 / das 2"
function matchSubLabel(r) {
  const m = r.match; if (!m) return '';
  const g = Math.round(m.give || 0);
  const v = m.scratch ? 'a scratch' : g === 0 ? 'sin ventaja' : g > 0 ? 'recibes ' + g : 'das ' + (-g);
  return ' vs ' + m.rival + ' · ' + v;
}
// " con Ana vs Los Pérez · recibes 3"
function fbSubLabel(r) {
  const f = r.fb; if (!f) return '';
  const mine = f.recvMe > 0 ? ' · recibes ' + f.recvMe : (f.format === 'match' && f.rivalScratch ? ' · a scratch' : '');
  return ' con ' + f.partner + (f.format === 'match' ? ' vs ' + f.rivals : '') + mine;
}
// Cambia de hoyo revelando el que se abandona y refrescando tarjeta + editor + totales.
function selectHole(i) {
  if (holeHasData(selHole)) shownHoles.add(selHole);
  selHole = i;
  renderRound();
}
const PICK_MIN = 1, PICK_MAX = 12, PICK_ITEM = 64; // selector de golpes deslizable
let pickEl = null, pickLock = false, pickRaf = 0;
const MP_ITEM = 34;              // ancho de cada número en los mini-selectores (putts/penal)
let puttsMP = null;              // referencia al mini-selector de putts (para reposicionarlo)

function holeNo(i) { return (active.holeStart || 1) + i; }
function holePoints(i, recv) {
  const h = active.holes[i];
  if (!h.strokes) return null;
  return Math.max(0, 2 + (active.pars[i] + recv[i]) - h.strokes);
}
function girClass(i) {
  const h = active.holes[i];
  return 'gir-circle' + (!h.strokes ? ' hidden' : (isGir(h, active.pars[i]) ? ' yes' : ' no'));
}
function scoreLabelTxt(d) {
  if (d <= -3) return 'Albatros'; if (d === -2) return 'Eagle'; if (d === -1) return 'Birdie';
  if (d === 0) return 'Par'; if (d === 1) return 'Bogey'; if (d === 2) return 'Doble'; return '+' + d;
}
function vsColor(v) { return v < 0 ? 'var(--birdie)' : v > 0 ? 'var(--bogey)' : 'var(--text)'; }

function renderRound() { renderScorecard(); renderEditor(); updateTotals(); }

// --- Tarjeta clásica ---
function renderScorecard() {
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford';
  const fbq = isFourball(active), fbStb = fbIsStb(active);
  // En fourball, qué bola de la pareja cuenta en cada hoyo (la otra se muestra atenuada).
  const fbFs = fbq ? fbStrokes(active) : null;
  const fbWho = i => !fbq || !isHoleShown(i) ? null
    : (fbStb ? fbHolePoints(active, i, fbFs).who : fbBest(active, i, fbFs).who);
  const idxs = active.holes.map((_, i) => i);
  const frontIdx = idxs.filter(i => holeNo(i) <= 9);   // primeros nueve (OUT)
  const backIdx = idxs.filter(i => holeNo(i) >= 10);    // segundos nueve (IN)
  const showOut = frontIdx.length > 0, showIn = backIdx.length > 0, showTot = showOut && showIn;
  const sumOver = (arr, fn) => arr.reduce((a, i) => a + fn(i), 0);
  const dash = v => v || '–';

  // Ensambla una fila de datos insertando las columnas OUT / IN / total. cellFn(i) da la celda del hoyo.
  const assemble = (cellFn, outVal, inVal, totVal) => {
    let s = '';
    frontIdx.forEach(i => s += cellFn(i));
    if (showOut) s += `<td class="tot subtot tnum">${outVal}</td>`;
    backIdx.forEach(i => s += cellFn(i));
    if (showIn) s += `<td class="tot subtot tnum">${inVal}</td>`;
    if (showTot) s += `<td class="tot tnum">${totVal}</td>`;
    return s;
  };

  // Cabecera con OUT / IN / T
  let head = '';
  frontIdx.forEach(i => head += `<th class="tnum">${holeNo(i)}</th>`);
  if (showOut) head += `<th class="subhead tnum">OUT</th>`;
  backIdx.forEach(i => head += `<th class="tnum">${holeNo(i)}</th>`);
  if (showIn) head += `<th class="subhead tnum">IN</th>`;
  if (showTot) head += `<th class="tnum">T</th>`;

  const fPar = i => active.pars[i];
  const fMyPar = i => active.pars[i] + recv[i];
  // Solo suman los hoyos ya revelados; el hoyo en edición no cuenta hasta salir de él.
  const fStr = i => isHoleShown(i) ? active.holes[i].strokes : 0;
  const fPts = i => isHoleShown(i) ? holePoints(i, recv) : 0;

  const parRow = `<tr class="par"><td class="rh">Par</td>${assemble(
    i => `<td class="tnum">${active.pars[i]}</td>`,
    sumOver(frontIdx, fPar), sumOver(backIdx, fPar), sumOver(idxs, fPar))}</tr>`;
  const myParRow = stb ? `<tr class="mypar"><td class="rh">Mi par</td>${assemble(
    i => `<td class="tnum">${active.pars[i] + recv[i]}</td>`,
    sumOver(frontIdx, fMyPar), sumOver(backIdx, fMyPar), sumOver(idxs, fMyPar))}</tr>` : '';
  const goRow = `<tr><td class="rh">${isMatch(active) || fbq ? 'Yo' : 'Golpes'}</td>${assemble(
    i => { const on = isHoleShown(i) && active.holes[i].strokes > 0;
      // Hoyo que concedemos (yo, o mi pareja en fourball): ✕ en nuestra fila.
      const mh = active.match ? active.match.holes[i]
        : fbIsMatch(active) ? active.fb.rivalHoles[i] : null;
      if (!on && mh && mh.conc === 'me' && isHoleShown(i))
        return `<td class="go"><button data-i="${i}" class="conc ${i === selHole ? 'sel' : ''}">✕</button></td>`;
      const dim = on && fbWho(i) === 'partner' ? ' dim' : '';
      return `<td class="go"><button data-i="${i}" class="${on ? 'has' : ''}${dim} ${i === selHole ? 'sel' : ''}" style="${on ? `background:${scoreColor(active.holes[i].strokes, active.pars[i])}` : ''}">${on ? active.holes[i].strokes : '·'}</button></td>`; },
    dash(sumOver(frontIdx, fStr)), dash(sumOver(backIdx, fStr)), dash(sumOver(idxs, fStr)))}</tr>`;
  // Puntos: los míos en Stableford individual, los de la pareja (mejor bola) en fourball.
  const fTeamPts = i => { if (!isHoleShown(i)) return 0; const p = fbHolePoints(active, i, fbFs).team; return p === null ? 0 : p; };
  const ptsRow = fbStb ? `<tr class="pts"><td class="rh">Pts pareja</td>${assemble(
      i => { const p = isHoleShown(i) ? fbHolePoints(active, i, fbFs).team : null;
        return `<td class="tnum">${p === null ? '·' : p}</td>`; },
      sumOver(frontIdx, fTeamPts), sumOver(backIdx, fTeamPts), sumOver(idxs, fTeamPts))}</tr>`
    : stb ? `<tr class="pts"><td class="rh">Pts</td>${assemble(
      i => `<td class="tnum">${isHoleShown(i) ? holePoints(i, recv) : '·'}</td>`,
      sumOver(frontIdx, fPts), sumOver(backIdx, fPts), sumOver(idxs, fPts))}</tr>` : '';

  // Fila "Match": estado acumulado tras cada hoyo (1↑, AS, 2↓…) y el vigente al cerrar cada nueve.
  const runRow = st => {
    const lastRun = arr => { let v = null; arr.forEach(i => { if (st.run[i] !== null) v = st.run[i]; }); return v; };
    const cellRun = v => v === null ? '–' : `<span style="color:${matchColor(v)}">${matchShort(v)}</span>`;
    return `<tr class="mrow"><td class="rh">Match</td>${assemble(
      i => `<td class="tnum">${st.run[i] === null ? '·' : cellRun(st.run[i])}</td>`,
      cellRun(lastRun(frontIdx)), cellRun(lastRun(backIdx)), cellRun(lastRun(idxs)))}</tr>`;
  };
  // Fila de golpes de otro jugador (compañero, rival o mejor bola de la pareja rival).
  const otherRow = (label, get, concOf, dimWhen) => `<tr><td class="rh">${label}</td>${assemble(
    i => { const on = isHoleShown(i), s = get(i);
      if (on && !s && concOf && concOf(i))
        return `<td class="go"><button data-i="${i}" class="conc ${i === selHole ? 'sel' : ''}">✕</button></td>`;
      const dim = on && s && dimWhen && dimWhen(i) ? ' dim' : '';
      return `<td class="go"><button data-i="${i}" class="${on && s ? 'has' : ''}${dim} ${i === selHole ? 'sel' : ''}" style="${on && s ? `background:${scoreColor(s, active.pars[i])}` : ''}">${on && s ? s : '·'}</button></td>`; },
    dash(sumOver(frontIdx, i => isHoleShown(i) ? get(i) : 0)),
    dash(sumOver(backIdx, i => isHoleShown(i) ? get(i) : 0)),
    dash(sumOver(idxs, i => isHoleShown(i) ? get(i) : 0)))}</tr>`;

  // --- Filas del fourball: compañero y, en match play, la mejor bola rival + el estado ---
  let fbRows = '';
  if (fbq) {
    const f = active.fb;
    fbRows = otherRow(shortName(f.partner), i => f.holes[i].strokes || 0, null, i => fbWho(i) === 'me');
    if (fbIsMatch(active)) {
      const st = fbMatchState(shownRound());
      // En su fila la ✕ es solo cuando NOS conceden el hoyo (el que concedemos va en la nuestra).
      fbRows += otherRow(shortName(f.rivals), i => f.rivalHoles[i].strokes || 0,
        i => f.rivalHoles[i].conc === 'rival') + runRow(st);
    }
  }

  // --- Filas propias del match play: ventaja, tarjeta del rival y estado del partido ---
  let matchRows = '';
  if (isMatch(active)) {
    const m = active.match, st = matchState(shownRound());
    const give = Math.round(m.give || 0);
    const rvName = esc(m.rival.split(' ')[0].slice(0, 7));
    const fRiv = i => isHoleShown(i) ? (m.holes[i].strokes || 0) : 0;
    const ventRow = (!m.scratch && give !== 0) ? (() => {
      const who = give > 0 ? 'me' : 'rival';
      const fV = i => st.ms[who][i];
      return `<tr class="mypar"><td class="rh">Vent. ${give > 0 ? 'yo' : rvName}</td>${assemble(
        i => `<td class="tnum">${st.ms[who][i] || '·'}</td>`,
        dash(sumOver(frontIdx, fV)), dash(sumOver(backIdx, fV)), dash(sumOver(idxs, fV)))}</tr>`;
    })() : '';
    const rivalRow = `<tr><td class="rh">${rvName}</td>${assemble(
      i => { const mh = m.holes[i], on = isHoleShown(i);
        if (on && !mh.strokes && mh.conc === 'rival')
          return `<td class="go"><button data-i="${i}" class="conc ${i === selHole ? 'sel' : ''}">✕</button></td>`;
        return `<td class="go"><button data-i="${i}" class="${on && mh.strokes ? 'has' : ''} ${i === selHole ? 'sel' : ''}" style="${on && mh.strokes ? `background:${scoreColor(mh.strokes, active.pars[i])}` : ''}">${on && mh.strokes ? mh.strokes : '·'}</button></td>`; },
      dash(sumOver(frontIdx, fRiv)), dash(sumOver(backIdx, fRiv)), dash(sumOver(idxs, fRiv)))}</tr>`;
    matchRows = ventRow + rivalRow + runRow(st);
  }

  $('#scGrid').innerHTML = `
    <thead><tr><th class="rh">Hoyo</th>${head}</tr></thead>
    <tbody>${parRow}${myParRow}${goRow}${fbRows}${matchRows}${ptsRow}</tbody>`;
  $('#scGrid').querySelectorAll('[data-i]').forEach(b => b.onclick = () => selectHole(+b.dataset.i));
}

// --- Etiqueta de resultado (chip + puntos del hoyo) ---
function scoreRightHtml(i, recv) {
  const h = active.holes[i], par = active.pars[i];
  const chip = h.strokes
    ? `<div class="chip" style="background:${scoreColor(h.strokes, par)}">${scoreLabelTxt(h.strokes - par)}</div>`
    : `<div class="chip" style="background:var(--muted)">Sin apuntar</div>`;
  if (isAnyMatch(active)) {
    const team = isFourball(active);
    const res = team ? fbHoleResult(active, i) : matchHoleResult(active, i);
    const txt = res === null ? '' : res > 0 ? (team ? 'Ganáis el hoyo' : 'Ganas el hoyo')
      : res < 0 ? (team ? 'Perdéis el hoyo' : 'Pierdes el hoyo') : 'Empatado';
    return chip + (res === null ? '' : `<div class="hpts"><b style="color:${matchColor(res)}">${txt}</b></div>`);
  }
  if (fbIsStb(active)) {
    const p = fbHolePoints(active, i);
    return chip + (p.team === null ? ''
      : `<div class="hpts"><b>${p.team} pt${p.team === 1 ? '' : 's'}</b> pareja</div>`);
  }
  if (!h.strokes) return chip;
  const stb = active.mode === 'stableford';
  const hp = stb ? holePoints(i, recv) : null;
  const pts = stb ? `<div class="hpts"><b>${hp} pt${hp === 1 ? '' : 's'}</b></div>` : '';
  return chip + pts;
}
function updateGir() { const el = $('#girBadge'); if (el) el.className = girClass(selHole); }

// Franja con lo que has hecho OTRAS veces en este mismo hoyo del campo. Solo aparece si ya
// lo has jugado antes; el color de la media dice si es un hoyo que se te da bien o mal.
function holeHistHtml(i) {
  const hh = holeHistory(active.courseName, holeNo(i), active.id);
  if (!hh) return '';
  const avg = hh.avg.toFixed(1).replace('.', ',');
  return `<div class="hhist">
    <span class="hh-n">${hh.n} vez${hh.n === 1 ? '' : 'es'} aquí</span>
    <span class="hh-i">media <b class="tnum" style="color:${vsColor(hh.avgVs)}">${avg}</b> <i>${fmtAvgVs(hh.avgVs)}</i></span>
    <span class="hh-i">mejor <b class="tnum">${hh.best}</b></span>
    <span class="hh-i">última <b class="tnum">${hh.last}</b></span>
  </div>`;
}

// Mini-selector deslizable (estilo Golpes, tamaño reducido) para putts y penalizaciones.
function miniPickerHtml(id, min, max) {
  let s = '';
  for (let x = min; x <= max; x++) s += `<div class="mnum tnum" data-x="${x}">${x}</div>`;
  return `<div class="mpick-wrap"><div class="mpick-sel"></div><div class="mpick" id="${id}">${s}</div></div>`;
}
function wireMiniPicker(id, min, max, initVal, onSet) {
  const el = $('#' + id);
  const clamp = n => Math.max(min, Math.min(max, n));
  let lock = true, raf = 0;
  const paint = n => el.querySelectorAll('.mnum').forEach(d => d.classList.toggle('mid', +d.dataset.x === n));
  const goTo = n => { el.scrollLeft = (n - min) * MP_ITEM; paint(n); };
  el.addEventListener('scroll', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const n = clamp(Math.round(el.scrollLeft / MP_ITEM) + min);
      paint(n);
      if (!lock) onSet(n);
    });
  });
  goTo(clamp(initVal));
  requestAnimationFrame(() => { lock = false; });
  return { set: n => { lock = true; goTo(clamp(n)); requestAnimationFrame(() => { lock = false; }); } };
}

// --- Editor del hoyo activo ---
function renderEditor() {
  const i = selHole, h = active.holes[i], par = active.pars[i];
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford';
  const mp = isMatch(active);
  const fbq = isFourball(active);
  const ms = mp ? matchStrokes(active) : null;
  const fs = fbq ? fbStrokes(active) : null;
  const r = mp ? ms.me[i] : fbq ? fs.me[i] : recv[i];
  const dots = ((stb || mp || fbq) && r > 0) ? `<div class="hdots" title="${r} golpe(s) que da el hándicap aquí">${'•'.repeat(r)}</div>` : '';
  const mts = holeMetres(active, i);   // longitud del hoyo desde la barra jugada
  const meta2 = (!stb && active.si && active.si[i]) ? `<div class="hcp none">índice ${active.si[i]}</div>` : '';
  const par3 = par <= 3;
  const calleHtml = `
    <div class="calle ${par3 ? 'dis' : ''}">
      <div class="clab">Salida (calle)</div>
      <div class="segc">
        <button data-fir="left" class="miss ${h.fir === 'left' ? 'on' : ''}" ${par3 ? 'disabled' : ''}>◄ Izq</button>
        <button data-fir="hit" class="hit ${h.fir === 'hit' ? 'on' : ''}" ${par3 ? 'disabled' : ''}>Calle ✓</button>
        <button data-fir="right" class="miss ${h.fir === 'right' ? 'on' : ''}" ${par3 ? 'disabled' : ''}>Dcha ►</button>
      </div>
    </div>
    <div class="calle">
      <div class="clab">Bunker junto al green</div>
      <div class="segc">
        <button data-bunker class="sand ${h.bunker ? 'on' : ''}">⛱ Estuve en bunker</button>
      </div>
    </div>`;
  // Bloque del rival (solo en match play): sus golpes en el hoyo y las concesiones.
  const mh = mp ? active.match.holes[i] : null;
  const mpHtml = !mp ? '' : `
    <div class="mp-block">
      <div class="sub mp-row">
        <span class="k">${esc(active.match.rival)}${ms.rival[i] > 0 ? ` <i class="rdots">${'•'.repeat(ms.rival[i])}</i>` : ''}</span>
        ${miniPickerHtml('rivalPick', 0, PICK_MAX)}
      </div>
      <div class="calle mp-conc">
        <div class="segc">
          <button data-conc="rival" class="win ${mh.conc === 'rival' ? 'on' : ''}">Me lo concede</button>
          <button data-conc="me" class="lose ${mh.conc === 'me' ? 'on' : ''}">Se lo concedo</button>
        </div>
      </div>
    </div>`;
  // Bloque del fourball: golpes del compañero y, en match play, la mejor bola de la pareja rival.
  const f = fbq ? active.fb : null;
  const fh = fbq ? f.holes[i] : null;
  const frh = fbIsMatch(active) ? f.rivalHoles[i] : null;
  const fbHtml = !fbq ? '' : `
    <div class="mp-block">
      <div class="sub mp-row">
        <span class="k">${esc(f.partner)}${fs.partner[i] > 0 ? ` <i class="rdots">${'•'.repeat(fs.partner[i])}</i>` : ''}</span>
        ${miniPickerHtml('matePick', 0, PICK_MAX)}
      </div>
      ${!frh ? '' : `
      <div class="sub mp-row mp-row2">
        <span class="k">Mejor bola · ${esc(f.rivals)}${fs.rivals[i] > 0 ? ` <i class="rdots">${'•'.repeat(fs.rivals[i])}</i>` : ''}</span>
        ${miniPickerHtml('fbRivalPick', 0, PICK_MAX)}
      </div>
      <div class="calle mp-conc">
        <div class="segc">
          <button data-fbconc="rival" class="win ${frh.conc === 'rival' ? 'on' : ''}">Nos lo conceden</button>
          <button data-fbconc="me" class="lose ${frh.conc === 'me' ? 'on' : ''}">Se lo concedemos</button>
        </div>
      </div>`}
    </div>`;
  const nums = [];
  for (let x = PICK_MIN; x <= PICK_MAX; x++) nums.push(`<div class="num tnum" data-x="${x}">${x}</div>`);
  $('#holeEditor').innerHTML = `
    <div class="ed-head">
      <div class="ed-no"><div class="lab">Hoyo</div><div class="n tnum">${holeNo(i)}</div></div>
      <div class="ed-meta"><div class="par"><b>Par ${par}</b>${mts ? ` · <span class="hm tnum">${mts} m</span>` : ''}</div>${dots}${meta2}</div>
      <div class="${girClass(i)}" id="girBadge" title="Green en regulación">GIR</div>
      <div class="ed-score">${scoreRightHtml(i, recv)}</div>
    </div>
    ${holeHistHtml(i)}
    ${gpsAvailable() ? '<button class="gps-open" id="btnGps"><span class="go-ic">📍</span> Ver mapa GPS del hoyo</button>' : ''}
    <div class="pick-lab">Golpes</div>
    <div class="hpick-wrap"><div class="hpick-sel"></div><div class="hpick" id="hpick">${nums.join('')}</div></div>
    <div class="pick-hint"><span>‹ desliza el número ›</span></div>
    <div class="sub-fields">
      <div class="sub"><span class="k">Putts</span>${miniPickerHtml('puttsPick', 0, 6)}</div>
      <div class="sub"><span class="k">Penal.</span>${miniPickerHtml('penalPick', 0, 5)}</div>
    </div>
    ${mpHtml}
    ${fbHtml}
    ${calleHtml}
    <div class="ed-nav"></div>`;

  const ed = $('#holeEditor');
  const rhc = $('#rhCur'); if (rhc) rhc.textContent = 'Hoyo ' + holeNo(i);
  pickEl = $('#hpick');
  const startNum = Math.min(PICK_MAX, Math.max(PICK_MIN, h.strokes || par));
  pickLock = true;
  pickEl.scrollLeft = (startNum - PICK_MIN) * PICK_ITEM;
  paintPick(startNum);
  requestAnimationFrame(() => { pickLock = false; });
  pickEl.addEventListener('scroll', onPickScroll);

  ed.querySelectorAll('[data-x]').forEach(nEl => nEl.onclick = () => {
    const x = +nEl.dataset.x; pickLock = true;
    pickEl.scrollTo({ left: (x - PICK_MIN) * PICK_ITEM, behavior: 'smooth' });
    setScore(x); setTimeout(() => { pickLock = false; }, 350);
  });
  puttsMP = wireMiniPicker('puttsPick', 0, 6, h.putts || 0, v => {
    const maxP = Math.max(0, (active.holes[i].strokes || 0) - 1); // putts nunca ≥ golpes
    const c = Math.min(v, maxP);
    active.holes[i].putts = c;
    if (c !== v) puttsMP.set(c);
    updateGir(); markDirty();
  });
  wireMiniPicker('penalPick', 0, 5, h.pen || 0, v => { active.holes[i].pen = v; markDirty(); });
  ed.querySelectorAll('[data-fir]').forEach(b => b.onclick = () => {
    if (par3) return;
    active.holes[i].fir = active.holes[i].fir === b.dataset.fir ? null : b.dataset.fir;
    ed.querySelectorAll('[data-fir]').forEach(x => x.classList.toggle('on', x.dataset.fir === active.holes[i].fir));
    markDirty();
  });
  const bk = ed.querySelector('[data-bunker]');
  bk.onclick = () => {
    active.holes[i].bunker = !active.holes[i].bunker;
    bk.classList.toggle('on', active.holes[i].bunker);
    markDirty();
  };
  if (mp) {
    // Refresca lo que depende del partido sin reconstruir el editor (no corta el gesto de deslizar).
    const refreshMatch = () => {
      const right = $('#holeEditor').querySelector('.ed-score');
      if (right) right.innerHTML = scoreRightHtml(i, recv);
      updateNav(); renderScorecard(); updateTotals(); markDirty(); checkMatchClose();
    };
    wireMiniPicker('rivalPick', 0, PICK_MAX, mh.strokes || 0, v => {
      mh.strokes = v;
      if (v > 0 && mh.conc) { mh.conc = null; paintConc(); } // apuntar golpes anula la concesión
      refreshMatch();
    });
    const concBtns = ed.querySelectorAll('[data-conc]');
    const paintConc = () => concBtns.forEach(b => b.classList.toggle('on', b.dataset.conc === mh.conc));
    concBtns.forEach(b => b.onclick = () => {
      mh.conc = mh.conc === b.dataset.conc ? null : b.dataset.conc;
      paintConc(); refreshMatch();
    });
  }
  if (fbq) {
    // Igual que en el match play: se refresca lo que depende de la pareja sin rehacer el editor.
    const refreshFb = () => {
      const right = $('#holeEditor').querySelector('.ed-score');
      if (right) right.innerHTML = scoreRightHtml(i, recv);
      updateNav(); renderScorecard(); updateTotals(); markDirty(); checkMatchClose();
    };
    wireMiniPicker('matePick', 0, PICK_MAX, fh.strokes || 0, v => { fh.strokes = v; refreshFb(); });
    if (frh) {
      const concBtns = ed.querySelectorAll('[data-fbconc]');
      const paintConc = () => concBtns.forEach(b => b.classList.toggle('on', b.dataset.fbconc === frh.conc));
      wireMiniPicker('fbRivalPick', 0, PICK_MAX, frh.strokes || 0, v => {
        frh.strokes = v;
        if (v > 0 && frh.conc) { frh.conc = null; paintConc(); } // apuntar su bola anula la concesión
        refreshFb();
      });
      concBtns.forEach(b => b.onclick = () => {
        frh.conc = frh.conc === b.dataset.fbconc ? null : b.dataset.fbconc;
        paintConc(); refreshFb();
      });
    }
  }
  const gp = ed.querySelector('#btnGps');
  if (gp) gp.onclick = openGps;
  updateNav();
}

// Barra Anterior/Siguiente. Si están TODOS los hoyos apuntados, "Siguiente" pasa a "Guardar partida".
function updateNav() {
  const nav = $('#holeEditor .ed-nav'); if (!nav) return;
  const i = selHole, last = active.holes.length - 1;
  // En match play (individual o fourball) el partido puede acabarse antes del 18:
  // al cerrarse, el botón pasa a guardar.
  const st = anyMatchState(active);
  const closedHere = !!(st && st.closed && i >= st.closedAt);
  const allDone = active.holes.every((x, k) => holeHasData(k)) || closedHere;
  nav.innerHTML = `
    <button data-nav="-1" ${i === 0 ? 'disabled' : ''}>‹ Anterior</button>
    ${allDone
      ? `<button class="next save" data-save>${closedHere ? 'Terminar partido ✓' : 'Guardar partida ✓'}</button>`
      : `<button class="next" data-nav="1" ${i === last ? 'disabled' : ''}>Siguiente hoyo ›</button>`}`;
  nav.querySelectorAll('[data-nav]').forEach(b => b.onclick = () =>
    selectHole(Math.max(0, Math.min(last, selHole + (+b.dataset.nav)))));
  const sb = nav.querySelector('[data-save]');
  if (sb) sb.onclick = saveRound;
}

function paintPick(centerNum) {
  // `active` puede haberse anulado al guardar mientras el selector seguía deslizándose.
  if (!pickEl || !active) return;
  const par = active.pars[selHole];
  pickEl.querySelectorAll('.num').forEach(nEl => {
    const x = +nEl.dataset.x, mid = x === centerNum;
    nEl.classList.toggle('mid', mid);
    nEl.style.color = mid ? scoreColor(x, par) : '';
  });
}
function onPickScroll() {
  if (pickRaf) cancelAnimationFrame(pickRaf);
  pickRaf = requestAnimationFrame(() => {
    if (!pickEl || !active) return; // ronda ya guardada/cerrada: no queda nada que pintar
    const idx = Math.round(pickEl.scrollLeft / PICK_ITEM);
    const num = Math.max(PICK_MIN, Math.min(PICK_MAX, idx + PICK_MIN));
    paintPick(num);
    if (!pickLock) setScore(num);
  });
}
// Fija el golpe sin reconstruir el selector (para no cortar el gesto de deslizar).
function setScore(x) {
  const i = selHole, h = active.holes[i];
  if (h.strokes === x) { paintPick(x); return; }
  h.strokes = x;
  // Si apunto mis golpes, el hoyo ya no está concedido por mí.
  const mh = active.match && active.match.holes[i];
  if (mh && mh.conc === 'me') {
    mh.conc = null;
    const cb = $('#holeEditor').querySelector('[data-conc="me"]'); if (cb) cb.classList.remove('on');
  }
  if (h.putts > x - 1) h.putts = Math.max(0, x - 1);
  paintPick(x);
  const recv = golfStrokesReceived(active);
  const right = $('#holeEditor').querySelector('.ed-score');
  if (right) right.innerHTML = scoreRightHtml(i, recv);
  updateGir();
  if (puttsMP) puttsMP.set(h.putts || 0);
  updateNav(); // por si al apuntar este hoyo ya están todos → "Guardar partida"
  renderScorecard();
  updateTotals();
  markDirty();
  checkMatchClose();
}

function markDirty() { active.dirty = true; save(LS.active, active); }
// Avisa una sola vez cuando la ventaja supera a los hoyos que quedan (el clásico "3&2").
function checkMatchClose() {
  if (!isAnyMatch(active)) return;
  const st = anyMatchState(active);
  const blk = isMatch(active) ? active.match : active.fb;
  if (st.closed && !blk.done) { blk.done = true; toast('Partido cerrado · ' + matchVerdict(st, isFourball(active))); save(LS.active, active); }
  else if (!st.closed && blk.done) { blk.done = false; save(LS.active, active); }
}

// Totales de arriba. En Stableford el hero es Puntos; en Medal, los Golpes totales.
// Junto al hero: Vs Par personal (con los golpes del hándicap) y Vs Par del campo.
function updateTotals() {
  if (!active) return;
  // Match play (individual o fourball): el hero es el estado del partido (2↑ / Iguales / 3&2).
  if (isAnyMatch(active)) {
    const sr = shownRound(), team = isFourball(active);
    const st = anyMatchState(sr);
    let mine = 0, his = 0;
    if (team) { const bt = fbBallTotals(sr); mine = bt.mine; his = bt.rivals; }
    else active.holes.forEach((h, i) => {
      if (!isHoleShown(i)) return;
      mine += h.strokes; his += active.match.holes[i].strokes || 0;
    });
    const val = st.closed ? matchFinalText(st) : (st.up === 0 ? 'Iguales' : matchShort(st.up));
    const bg = st.up > 0 ? 'var(--good)' : st.up < 0 ? 'var(--bad)' : '';
    $('#totstrip').innerHTML = [
      `<div class="ts-cell hero"${bg ? ` style="background:${bg}"` : ''}><div class="tk">Partido<small>${esc(oppName(active))}</small></div><div class="tv tnum">${val}</div></div>`,
      `<div class="ts-cell"><div class="tk">${team ? 'Mejor bola' : 'Golpes'}<small>${team ? 'nosotros · ellos' : 'yo · rival'}</small></div><div class="tv tnum">${mine}–${his}</div></div>`,
      `<div class="ts-cell"><div class="tk">Quedan<small>${st.dormie ? 'dormie' : 'hoyos'}</small></div><div class="tv tnum">${st.remaining}</div></div>`,
    ].join('');
    return;
  }
  // Fourball mejor bola: el hero son los puntos de la pareja.
  if (fbIsStb(active)) {
    const ft = fbTotals(shownRound());
    $('#totstrip').innerHTML = [
      `<div class="ts-cell hero"><div class="tk">Puntos<small>pareja</small></div><div class="tv tnum">${ft.team}</div></div>`,
      `<div class="ts-cell"><div class="tk">Míos<small>${ft.mineCount} hoyos cuentan</small></div><div class="tv tnum">${ft.me}</div></div>`,
      `<div class="ts-cell"><div class="tk">${shortName(active.fb.partner, 9)}<small>puntos</small></div><div class="tv tnum">${ft.partner}</div></div>`,
    ].join('');
    return;
  }
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford';
  const hasHcp = (active.hcp || 0) > 0;
  // Los totales de arriba solo cuentan hoyos ya revelados; el hoyo en edición aún no suma.
  let strokes = 0, par = 0, stbPts = 0, vsYo = 0;
  active.holes.forEach((h, i) => {
    if (!isHoleShown(i)) return;
    strokes += h.strokes; par += active.pars[i];
    stbPts += holePoints(i, recv);
    vsYo += h.strokes - (active.pars[i] + recv[i]);
  });
  const vsPar = strokes - par;
  const cells = [];
  cells.push(`<div class="ts-cell hero"><div class="tk">${stb ? 'Puntos' : 'Golpes'}</div><div class="tv tnum">${stb ? stbPts : strokes}</div></div>`);
  if (hasHcp) cells.push(`<div class="ts-cell"><div class="tk">Vs Par<small>yo · hcp ${fmtHcp(active.hcp)}</small></div><div class="tv tnum" style="color:${vsColor(vsYo)}">${fmtVsPar(vsYo)}</div></div>`);
  cells.push(`<div class="ts-cell"><div class="tk">Vs Par<small>campo</small></div><div class="tv tnum" style="color:${vsColor(vsPar)}">${fmtVsPar(vsPar)}</div></div>`);
  $('#totstrip').innerHTML = cells.join('');
}
function fmtHcp(h) { return Number.isInteger(h) ? String(h) : String(h).replace('.', ','); }

function saveRound() {
  const t = roundTotals(active);
  // En match play y fourball vale con que haya hoyos con datos (concedidos o del compañero).
  const anyTeam = (isAnyMatch(active) || isFourball(active)) && active.holes.some((h, i) => holeHasData(i));
  if (!t.played && !anyTeam) { toast('Apunta al menos un hoyo'); return; }
  const rec = JSON.parse(JSON.stringify(active));
  delete rec.dirty; rec.saved = true;
  const idx = rounds.findIndex(r => r.id === rec.id);
  if (idx >= 0) rounds[idx] = rec; else rounds.unshift(rec);
  save(LS.rounds, rounds);
  active = null; localStorage.removeItem(LS.active);
  toast('Ronda guardada ✓');
  showRoundSummary(rec); // pantalla de estadísticas de la partida
}

/* ===== Resumen de la partida (una pantalla con el máximo de datos) =====
   Es la MISMA pantalla que aparece al terminar la partida; también se abre al
   tocar una ronda del historial. Única diferencia: el botón de la derecha es
   "Hecho" al terminar y "Atrás" cuando se entra desde el historial. */
function showRoundSummary(r, fromHistory) {
  keepAwake(false);   // se acabó la ronda: la pantalla vuelve a apagarse sola
  document.querySelectorAll('main.tab').forEach(m => m.classList.add('hidden')); // oculta la pestaña activa (p. ej. Historial)
  $('#viewRound').classList.add('hidden');
  $('#roundBar').classList.add('hidden');
  $('#roundSheet').classList.add('hidden'); $('#roundSheet').classList.remove('open');
  $('#tabbar').classList.add('hidden');
  $('#mapFab').classList.add('hidden');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.add('hidden');
  renderSummary(r, fromHistory);
  $('#viewSummary').classList.remove('hidden');
  window.scrollTo(0, 0);
}
function closeSummary(toTab) {
  $('#viewSummary').classList.add('hidden');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.remove('hidden');
  showTab(toTab || 'historial');
}

function renderSummary(r, fromHistory) {
  const t = roundTotals(r);
  const recv = golfStrokesReceived(r);
  const stb = r.mode === 'stableford';
  const hasHcp = (r.hcp || 0) > 0;
  const hno = i => (r.holeStart || 1) + i;
  const puttsPer = t.played ? t.putts / t.played : 0;

  // Vs par personal (restando los golpes que da el hándicap)
  let vsYo = 0;
  r.holes.forEach((h, i) => { if (h.strokes > 0) vsYo += h.strokes - (r.pars[i] + recv[i]); });

  // Reparto de resultados + detalle de putts + mejor/peor hoyo
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  let onePutts = 0, threePutts = 0, best = null, bestI = -1;
  r.holes.forEach((h, i) => {
    if (!h.strokes) return;
    const d = h.strokes - r.pars[i];
    if (d <= -2) dist.eagle++; else if (d === -1) dist.birdie++; else if (d === 0) dist.par++; else if (d === 1) dist.bogey++; else dist.double++;
    if (h.putts === 1) onePutts++; if (h.putts >= 3) threePutts++;
    if (best === null || d < best) { best = d; bestI = i; }
  });
  const segs = [['Eagle+', dist.eagle, 'var(--eagle)'], ['Birdie', dist.birdie, 'var(--birdie)'],
    ['Par', dist.par, 'var(--par)'], ['Bogey', dist.bogey, 'var(--bogey)'], ['Doble+', dist.double, 'var(--double)']];
  const totH = segs.reduce((a, s) => a + s[1], 0) || 1;

  // Parciales Ida (OUT) / Vuelta (IN)
  const idxs = r.holes.map((_, i) => i);
  const frontIdx = idxs.filter(i => hno(i) <= 9 && r.holes[i].strokes > 0);
  const backIdx = idxs.filter(i => hno(i) >= 10 && r.holes[i].strokes > 0);
  const sub = arr => arr.reduce((a, i) => { a.g += r.holes[i].strokes; a.p += r.pars[i]; return a; }, { g: 0, p: 0 });
  const showSplit = frontIdx.length > 0 && backIdx.length > 0;
  const out = sub(frontIdx), inn = sub(backIdx);

  const modeLbl = modeName(r);
  const mst = anyMatchState(r);
  const team = isFourball(r);
  const hcpLbl = isMatch(r) ? matchSubLabel(r) : team ? fbSubLabel(r)
    : (hasHcp ? ' · hcp ' + fmtHcp(r.hcp) : '');

  const mut = 'var(--muted)';
  const vsChip = (lbl, v) =>
    `<div class="svs"><span class="k">${lbl}</span><span class="v tnum" style="color:${vsColor(v)}">${fmtVsPar(v)}</span></div>`;

  const bestLbl = best === null ? '—' : scoreLabelTxt(best);
  const splitRow = (lbl, o) =>
    `<tr><td class="rh">${lbl}</td><td class="tnum">${o.g}</td><td class="tnum" style="color:${vsColor(o.g - o.p)}">${fmtVsPar(o.g - o.p)}</td></tr>`;

  // Hero del match play: marcador final (3&2 / 1 arriba / Empate) y quién gana.
  let heroHtml, matchSec = '';
  if (mst) {
    const fin = mst.closed ? mst.closedUp : mst.up;
    const bg = fin > 0 ? 'var(--good)' : fin < 0 ? 'var(--bad)' : '';
    const bt = team ? fbBallTotals(r) : null;
    const myStrokes = team ? bt.mine : t.strokes;
    const rivStrokes = team ? bt.rivals : r.match.holes.reduce((a, mh) => a + (mh.strokes || 0), 0);
    const cnt = x => mst.res.filter(v => v === x).length;
    heroHtml = `
    <div class="sum-hero"${bg ? ` style="background:${bg}"` : ''}>
      <div class="sh-main">
        <div class="k">Partido</div>
        <div class="v tnum">${matchFinalText(mst)}</div>
        <div class="s">${team ? 'con ' + esc(r.fb.partner) + ' vs ' : 'vs '}${esc(oppName(r))}</div>
      </div>
      <div class="sh-vs">
        <div class="svs"><span class="k">Resultado</span><span class="v vtxt">${matchOutcomeWord(mst, team)}</span></div>
        ${vsChip('Vs par campo', t.vsPar)}
      </div>
    </div>`;
    matchSec = `
    <div class="sum-sec">Partido</div>
    <div class="mgrid2">
      ${mtile('Hoyos ganados', cnt(1), 'de ' + mst.decided + ' jugados', 'flag', 'var(--good)')}
      ${mtile('Empatados', cnt(0), 'halved', 'ring', mut)}
      ${mtile('Perdidos', cnt(-1), oppName(r), 'warn', 'var(--bad)')}
      ${mtile(team ? 'Mejor bola' : 'Golpes', myStrokes + '–' + rivStrokes,
        (team ? 'nosotros · ' : 'yo · ') + esc(oppName(r)), 'chart', 'var(--info)', mut)}
    </div>`;
  } else if (fbIsStb(r)) {
    // Fourball mejor bola: el resultado es el total de puntos de la pareja.
    const ft = fbTotals(r);
    const mate = esc(r.fb.partner);
    heroHtml = `
    <div class="sum-hero">
      <div class="sh-main">
        <div class="k">Puntos pareja</div>
        <div class="v tnum">${ft.team}</div>
        <div class="s">con ${mate}</div>
      </div>
      <div class="sh-vs">
        ${vsChip('Vs par campo', t.vsPar)}
        ${hasHcp ? vsChip('Vs par (hcp)', vsYo) : ''}
      </div>
    </div>`;
    matchSec = `
    <div class="sum-sec">Pareja</div>
    <div class="mgrid2">
      ${mtile('Puntos pareja', ft.team, 'mejor bola', 'flag', 'var(--good)')}
      ${mtile('Mis puntos', ft.me, t.strokes + ' golpes', 'chart', 'var(--indigo)')}
      ${mtile('Puntos ' + shortName(r.fb.partner, 9), ft.partner, mate, 'ball', 'var(--info)', mut)}
      ${mtile('Hoyos que aporto', ft.mineCount, 'de ' + t.played + ' jugados', 'target', ft.mineCount ? 'var(--indigo)' : mut)}
    </div>`;
  } else {
    heroHtml = `
    <div class="sum-hero">
      <div class="sh-main">
        <div class="k">${stb ? 'Puntos' : 'Golpes'}</div>
        <div class="v tnum">${stb ? t.stb : t.strokes}</div>
        <div class="s">${stb ? t.strokes + ' golpes' : t.stb + ' pts stableford'}</div>
      </div>
      <div class="sh-vs">
        ${vsChip('Vs par campo', t.vsPar)}
        ${hasHcp ? vsChip('Vs par (hcp)', vsYo) : ''}
      </div>
    </div>`;
  }

  $('#sumBody').innerHTML = `
    <div class="sum-top">
      <div class="sum-badge">${mst ? 'Partido guardado ✓' : 'Partida guardada ✓'}</div>
      <div class="sum-course">${esc(r.courseName)}</div>
      <div class="sum-meta">${(r.courseLoc ? esc(r.courseLoc) + ' · ' : '')}${fmtDate(r.date)} · ${t.played} hoyos · ${modeLbl}${hcpLbl}</div>
    </div>

    ${heroHtml}
    ${matchSec}

    <div class="sum-sec">Resultados</div>
    <div class="dist-bar">${segs.filter(s => s[1]).map(s => `<span style="width:${(s[1] / totH * 100).toFixed(1)}%;background:${s[2]}"></span>`).join('')}</div>
    <div class="dist-legend">${segs.map(s => `<span class="dl"><span class="dot" style="background:${s[2]}"></span>${s[0]} <b class="tnum">${s[1]}</b></span>`).join('')}</div>

    <div class="sum-sec">Estadísticas</div>
    <div class="mgrid2">
      ${mtile('Putts', t.putts, puttsPer.toFixed(2).replace('.', ',') + ' / hoyo', 'putter', 'var(--info)', mut)}
      ${mtile('Putts / GIR', t.gir ? t.puttsPerGir.toFixed(2).replace('.', ',') : '—', t.gir ? 'en ' + t.gir : 'sin greens', 'ball', t.gir ? 'var(--info)' : mut)}
      ${mtile('1 putt', onePutts, threePutts + ' de 3+', 'ring', onePutts ? 'var(--indigo)' : mut)}
      ${mtile('Calles', t.firPoss ? t.firPct + '%' : '—', t.firPoss ? t.firHit + ' / ' + t.firPoss : 'par 3', 'target', t.firPoss ? 'var(--indigo)' : mut)}
      ${mtile('Greens (GIR)', t.girPoss ? t.girPct + '%' : '—', t.gir + ' / ' + t.girPoss, 'green', t.girPoss ? 'var(--good)' : mut)}
      ${mtile('Scrambling', t.scrPoss ? t.scrPct + '%' : '—', t.scrPoss ? t.scr + ' / ' + t.scrPoss : 'todos', 'scramble', t.scrPoss ? 'var(--good)' : mut)}
      ${mtile('Bunkers', t.sandPoss ? t.sandPct + '%' : '—', t.sandPoss ? t.sand + ' / ' + t.sandPoss : 'ninguno', 'bunker', t.sandPoss ? 'var(--warn)' : mut)}
      ${mtile('Penaliz.', t.pen, 'golpes', 'warn', t.pen ? 'var(--bad)' : mut)}
      ${mtile('Mejor hoyo', bestI >= 0 ? 'H' + hno(bestI) : '—', bestLbl, 'flag', best !== null ? vsColor(best) : mut)}
      ${t.driveN ? mtile('Salida media', t.driveAvg + ' m',
        t.driveN + (t.driveN === 1 ? ' medida' : ' medidas') + ' · máx ' + t.driveMax + ' m', 'target', 'var(--indigo)') : ''}
    </div>

    ${showSplit ? `
    <div class="sum-sec">Parciales</div>
    <table class="sum-split">
      <thead><tr><th class="rh"></th><th>Golpes</th><th>Vs par</th></tr></thead>
      <tbody>${splitRow('Ida (OUT)', out)}${splitRow('Vuelta (IN)', inn)}</tbody>
    </table>` : ''}

    <button class="btn share" id="sumShare">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"></path><polyline points="8 8 12 4 16 8"></polyline><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"></path></svg>
      Compartir tarjeta
    </button>
    <div class="sum-actions">
      <button class="btn ghost" id="sumCard">Ver tarjeta</button>
      <button class="btn" id="sumDone">${fromHistory ? 'Atrás' : 'Hecho'}</button>
    </div>`;

  $('#sumShare').onclick = () => shareRound(r);
  $('#sumCard').onclick = () => showRoundCard(r, () => $('#viewSummary').classList.remove('hidden'));
  $('#sumDone').onclick = () => closeSummary('historial');
}

/* ===== Tarjeta apaisada de solo lectura (diseño moderno) =====
   Se muestra en horizontal: en móvil vertical la tarjeta se gira 90°; si el
   usuario pone el teléfono en horizontal, ocupa la pantalla sin girar. */
let cardBack = null; // callback para volver al pulsar cerrar

/* La tarjeta es apaisada. Al abrirla intentamos bloquear la orientación en
   horizontal para que no gire mientras se lee, y la liberamos al cerrar.
   Solo funciona donde el navegador lo permite (Android Chrome, o la app añadida
   a la pantalla de inicio); iOS Safari no deja bloquear la rotación desde una
   web, así que ahí simplemente no hace nada (todo va en try/catch). */
async function lockCardLandscape() {
  if (!(navigator.maxTouchPoints > 0)) return; // en escritorio no forzamos nada
  const v = $('#viewCard');
  try {
    if (!document.fullscreenElement) {
      if (v.requestFullscreen) await v.requestFullscreen({ navigationUI: 'hide' });
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    }
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}
function unlockCardOrientation() {
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (_) {}
}

function showRoundCard(r, back) {
  cardBack = back || null;
  $('#viewSummary').classList.add('hidden');
  renderRoundCard(r);
  $('#viewCard').classList.remove('hidden');
  lockCardLandscape();
}
function closeRoundCard() {
  unlockCardOrientation();
  $('#viewCard').classList.add('hidden');
  const b = cardBack; cardBack = null;
  if (b) b(); else closeSummary('historial');
}

function renderRoundCard(r) {
  const recv = golfStrokesReceived(r);
  const stb = r.mode === 'stableford';
  const t = roundTotals(r);
  const hno = i => (r.holeStart || 1) + i;
  const idxs = r.holes.map((_, i) => i);
  const frontIdx = idxs.filter(i => hno(i) <= 9);
  const backIdx = idxs.filter(i => hno(i) >= 10);
  const showOut = frontIdx.length > 0, showIn = backIdx.length > 0, showTot = showOut && showIn;
  const sumOver = (arr, fn) => arr.reduce((a, i) => a + fn(i), 0);
  const played = i => r.holes[i].strokes > 0;
  const pts = i => { const h = r.holes[i]; return h.strokes ? Math.max(0, 2 + (r.pars[i] + recv[i]) - h.strokes) : 0; };
  const dash = v => v || '–';

  // Inserta las columnas OUT / IN / TOT en una fila. cellFn(i) = celda de un hoyo.
  const assemble = (cellFn, outVal, inVal, totVal) => {
    let s = '';
    frontIdx.forEach(i => s += cellFn(i));
    if (showOut) s += `<td class="tk-sub tnum">${outVal}</td>`;
    backIdx.forEach(i => s += cellFn(i));
    if (showIn) s += `<td class="tk-sub tnum">${inVal}</td>`;
    if (showTot) s += `<td class="tk-tot tnum">${totVal}</td>`;
    return s;
  };

  let head = '<th class="tk-rh"></th>';
  frontIdx.forEach(i => head += `<th class="tnum">${hno(i)}</th>`);
  if (showOut) head += `<th class="tk-sub">OUT</th>`;
  backIdx.forEach(i => head += `<th class="tnum">${hno(i)}</th>`);
  if (showIn) head += `<th class="tk-sub">IN</th>`;
  if (showTot) head += `<th class="tk-tot">TOT</th>`;

  const parRow = `<tr class="tk-par"><td class="tk-rh">Par</td>${assemble(
    i => `<td class="tnum">${r.pars[i]}</td>`,
    sumOver(frontIdx, i => r.pars[i]), sumOver(backIdx, i => r.pars[i]), sumOver(idxs, i => r.pars[i]))}</tr>`;

  // Longitud de cada hoyo desde la barra jugada (si el campo la trae).
  const mtsArr = roundMetres(r);
  const mtsRow = !mtsArr ? '' : `<tr class="tk-min"><td class="tk-rh">Metros</td>${assemble(
    i => `<td class="tnum">${mtsArr[i]}</td>`,
    sumOver(frontIdx, i => mtsArr[i]), sumOver(backIdx, i => mtsArr[i]), sumOver(idxs, i => mtsArr[i]))}</tr>`;

  const mst = anyMatchState(r);
  const team = isFourball(r);
  const fbFs = team ? fbStrokes(r) : null;
  const conc = i => isMatch(r) ? r.match.holes[i].conc
    : (team && r.fb.rivalHoles) ? r.fb.rivalHoles[i].conc : null;
  const goRow = `<tr class="tk-go"><td class="tk-rh">${mst || team ? 'Yo' : 'Golpes'}</td>${assemble(
    i => played(i)
      ? `<td><span class="tk-ball" style="background:${scoreColor(r.holes[i].strokes, r.pars[i])}">${r.holes[i].strokes}</span></td>`
      : `<td><span class="tk-ball empty">${conc(i) === 'me' ? '✕' : '·'}</span></td>`,
    dash(sumOver(frontIdx, i => r.holes[i].strokes || 0)), dash(sumOver(backIdx, i => r.holes[i].strokes || 0)), dash(t.strokes))}</tr>`;

  // Fila de golpes de otro jugador (rival, compañero o mejor bola de la pareja rival).
  const tkRow = (label, get, concKey) => `<tr class="tk-go"><td class="tk-rh">${label}</td>${assemble(
    i => get(i)
      ? `<td><span class="tk-ball" style="background:${scoreColor(get(i), r.pars[i])}">${get(i)}</span></td>`
      : `<td><span class="tk-ball empty">${concKey && conc(i) === concKey ? '✕' : '·'}</span></td>`,
    dash(sumOver(frontIdx, get)), dash(sumOver(backIdx, get)), dash(sumOver(idxs, get)))}</tr>`;
  // Fila del estado del partido hoyo a hoyo.
  const tkRunRow = st => {
    const lastRun = arr => { let v = null; arr.forEach(i => { if (st.run[i] !== null) v = st.run[i]; }); return v; };
    const cellRun = v => v === null ? '–' : `<span style="color:${matchColor(v)}">${matchShort(v)}</span>`;
    return `<tr class="tk-min"><td class="tk-rh">Match</td>${assemble(
      i => `<td class="tnum">${st.run[i] === null ? '·' : cellRun(st.run[i])}</td>`,
      cellRun(lastRun(frontIdx)), cellRun(lastRun(backIdx)), cellRun(lastRun(idxs)))}</tr>`;
  };

  // Filas del rival / de la pareja y del estado del partido.
  let mRows = '';
  if (team) {
    const f = r.fb;
    mRows = tkRow(shortName(f.partner, 8), i => f.holes[i].strokes || 0);
    if (fbIsMatch(r)) mRows += tkRow(shortName(f.rivals, 8), i => f.rivalHoles[i].strokes || 0, 'rival') + tkRunRow(mst);
  } else if (mst) {
    mRows = tkRow(shortName(r.match.rival, 8), i => r.match.holes[i].strokes || 0, 'rival') + tkRunRow(mst);
  }

  const puttRow = `<tr class="tk-min"><td class="tk-rh">Putts</td>${assemble(
    i => `<td class="tnum">${played(i) ? r.holes[i].putts : '·'}</td>`,
    sumOver(frontIdx, i => r.holes[i].putts || 0), sumOver(backIdx, i => r.holes[i].putts || 0), t.putts)}</tr>`;

  // Puntos: los míos en Stableford individual, los de la pareja en fourball mejor bola.
  const teamPts = i => { const p = fbHolePoints(r, i, fbFs).team; return p === null ? 0 : p; };
  const ft = fbIsStb(r) ? fbTotals(r) : null;
  const ptsRow = ft ? `<tr class="tk-min tk-ptsrow"><td class="tk-rh">Pts pareja</td>${assemble(
      i => { const p = fbHolePoints(r, i, fbFs).team; return `<td class="tnum">${p === null ? '·' : p}</td>`; },
      sumOver(frontIdx, teamPts), sumOver(backIdx, teamPts), ft.team)}</tr>`
    : stb ? `<tr class="tk-min tk-ptsrow"><td class="tk-rh">Pts</td>${assemble(
      i => `<td class="tnum">${played(i) ? pts(i) : '·'}</td>`,
      sumOver(frontIdx, pts), sumOver(backIdx, pts), t.stb)}</tr>` : '';

  const modeLbl = modeName(r) + (team ? ' con ' + esc(r.fb.partner) : '')
    + (mst ? ' vs ' + esc(oppName(r)) : '');
  const resultVal = mst ? matchFinalText(mst) : ft ? ft.team : stb ? t.stb : t.strokes;
  const resultSub = mst ? matchOutcomeWord(mst, team) + ' · ' + t.strokes + ' golpes'
    : ft ? ft.me + ' míos · ' + t.strokes + ' golpes'
    : stb ? t.strokes + ' golpes' : t.stb + ' pts';

  const legend = [['Eagle', 'var(--eagle)'], ['Birdie', 'var(--birdie)'], ['Par', 'var(--par)'], ['Bogey', 'var(--bogey)'], ['Doble+', 'var(--double)']];

  $('#cardBody').innerHTML = `
    <div class="tk-head">
      <button class="tk-close" id="tkClose" aria-label="Cerrar">✕</button>
      <div class="tk-title">
        <div class="tk-name">${esc(r.courseName)}</div>
        <div class="tk-meta">${fmtDate(r.date)} · ${t.played} hoyos · ${modeLbl}</div>
      </div>
      <div class="tk-result">
        <div class="tk-big tnum">${resultVal}</div>
        <div class="tk-rblock">
          <div class="tk-vs tnum" style="color:${vsColor(t.vsPar)}">${fmtVsPar(t.vsPar)}</div>
          <div class="tk-rsub">${resultSub}</div>
        </div>
      </div>
    </div>
    <div class="tk-table-wrap">
      <table class="tk-grid">
        <thead><tr>${head}</tr></thead>
        <tbody>${parRow}${mtsRow}${goRow}${mRows}${puttRow}${ptsRow}</tbody>
      </table>
    </div>
    <div class="tk-legend">${legend.map(l => `<span><i style="background:${l[1]}"></i>${l[0]}</span>`).join('')}</div>`;

  $('#tkClose').onclick = closeRoundCard;
}
$('#btnFinish').onclick = saveRound;
$('#btnBackRound').onclick = () => {
  if (active && active.dirty && !active.saved) {
    if (!confirm('¿Salir sin guardar? Se conservará como borrador en curso.')) return;
  }
  closeRound();
};
$('#roundHandle').onclick = openRoundSheet;
$('#rsBackdrop').onclick = closeRoundSheet;
$('#rsClose').onclick = closeRoundSheet;

// Arrastrar hacia arriba en la barra inferior para abrir el panel.
(function initHandleDrag() {
  const bar = $('#roundBar');
  if (!bar) return;
  let startY = null, opened = false;
  bar.addEventListener('touchstart', e => { startY = e.touches[0].clientY; opened = false; }, { passive: true });
  bar.addEventListener('touchmove', e => {
    if (startY == null || opened) return;
    if (e.touches[0].clientY - startY < -24) { opened = true; openRoundSheet(); } // arrastrado hacia arriba
  }, { passive: true });
  bar.addEventListener('touchend', () => { startY = null; }, { passive: true });
})();

// Arrastrar el panel hacia abajo para cerrarlo (desde arriba del panel, sin scroll).
(function initSheetDrag() {
  const panel = $('#rsPanel');
  if (!panel) return;
  let startY = null, dy = 0;
  panel.addEventListener('touchstart', e => {
    if (panel.scrollTop > 0) { startY = null; return; } // solo si está arriba del todo
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (startY == null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) { panel.style.transition = 'none'; panel.style.transform = 'translateY(' + dy + 'px)'; }
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (startY == null) return;
    panel.style.transition = ''; panel.style.transform = '';
    if (dy > 90) closeRoundSheet();   // umbral: arrastrado lo suficiente → cerrar
    startY = null; dy = 0;
  });
})();

/* ---------- Course modal ---------- */
function openCourseModal(course, prefill) {
  const editing = !!course;
  const c = course || (prefill
    ? { name: prefill.name, loc: prefill.loc, pars: (prefill.pars && prefill.pars.length ? [...prefill.pars] : parLayout(prefill.h, prefill.par)), si: prefill.si && prefill.si.length ? [...prefill.si] : null }
    : { name: '', loc: '', pars: parArr('444444444444444444') });
  const bg = el('div', 'modal-bg');
  const holesRows = () => c.pars.map((p, i) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)">
      <span style="width:30px;color:var(--muted);font-weight:700" class="tnum">${i + 1}</span>
      <span style="flex:1;font-size:13px;color:var(--muted)">Par</span>
      <div class="par-stepper"><button data-hm="${i}">−</button><b class="tnum" data-hp="${i}">${p}</b><button data-hpl="${i}">+</button></div>
    </div>`).join('');
  bg.innerHTML = `
    <div class="modal" role="dialog">
      <h3>${editing ? 'Editar campo' : 'Nuevo campo'}</h3>
      <div id="cMap" style="height:160px;border-radius:12px;overflow:hidden;margin-bottom:14px;border:1px solid var(--line);background:var(--surface-2)"></div>
      ${editing ? '' : '<p style="margin:-6px 0 16px;color:var(--muted);font-size:13px">¿Buscas un campo de España? Usa <b>Explorar</b>. Aquí puedes darlo de alta a mano.</p>'}
      <label class="fld"><span class="t">Nombre</span><input id="cName" value="${esc(c.name)}" placeholder="Ej. Alhaurín Golf"></label>
      <label class="fld"><span class="t">Ubicación</span><input id="cLoc" value="${esc(c.loc || '')}" placeholder="Ciudad · Provincia"></label>
      <label class="fld"><span class="t">Nº de hoyos</span>
        <select id="cHoles"><option value="9">9 hoyos</option><option value="18" selected>18 hoyos</option></select></label>
      <div class="t" style="font-size:13px;font-weight:700;color:var(--muted);margin-bottom:6px">Par por hoyo</div>
      <div id="parList" style="max-height:38vh;overflow-y:auto;margin-bottom:16px">${holesRows()}</div>
      <div class="modal-actions">
        ${editing ? '<button class="btn ghost" id="cDel" style="color:var(--bad)">Borrar</button>' : ''}
        <button class="btn ghost" id="cCancel">Cancelar</button>
        <button class="btn" id="cSave">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const work = { name: c.name, loc: c.loc, pars: [...c.pars], si: c.si ? [...c.si] : null };
  $('#cHoles').value = String(work.pars.length >= 18 ? 18 : 9);
  // mini-mapa (coordenadas guardadas o resueltas desde el catálogo)
  const mc = editing ? courseCoords(c)
    : (prefill && prefill.lat != null ? { lat: prefill.lat, lon: prefill.lon, prov: prefill.prov } : null);
  if (mc) $('#cMap').innerHTML = courseMiniMap(mc.prov, mc.lat, mc.lon);
  else $('#cMap').style.display = 'none';
  const rerenderPars = () => {
    $('#parList').innerHTML = work.pars.map((p, i) =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)">
        <span style="width:30px;color:var(--muted);font-weight:700" class="tnum">${i + 1}</span>
        <span style="flex:1;font-size:13px;color:var(--muted)">Par</span>
        <div class="par-stepper"><button data-hm="${i}">−</button><b class="tnum" data-hp="${i}">${p}</b><button data-hpl="${i}">+</button></div>
      </div>`).join('');
    bindPar();
  };
  const bindPar = () => {
    $('#parList').querySelectorAll('[data-hm]').forEach(b => b.onclick = () => { const i = +b.dataset.hm; work.pars[i] = Math.max(3, work.pars[i] - 1); rerenderPars(); });
    $('#parList').querySelectorAll('[data-hpl]').forEach(b => b.onclick = () => { const i = +b.dataset.hpl; work.pars[i] = Math.min(6, work.pars[i] + 1); rerenderPars(); });
  };
  bindPar();
  $('#cHoles').onchange = e => {
    const n = +e.target.value;
    if (n === 9) { work.pars = work.pars.slice(0, 9); if (work.si) work.si = work.si.slice(0, 9); }
    else { while (work.pars.length < 18) work.pars.push(4); if (work.si) while (work.si.length < 18) work.si.push(null); }
    rerenderPars();
  };
  const close = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) close(); };
  $('#cCancel').onclick = close;
  $('#cSave').onclick = () => {
    const name = $('#cName').value.trim();
    if (!name) { toast('Pon un nombre'); return; }
    if (editing) {
      course.name = name; course.loc = $('#cLoc').value.trim(); course.pars = [...work.pars]; course.si = work.si ? [...work.si] : null;
    } else {
      courses.push({ id: uid(), name, loc: $('#cLoc').value.trim(), pars: [...work.pars], si: work.si ? [...work.si] : null, lat: prefill ? prefill.lat : null, lon: prefill ? prefill.lon : null });
    }
    save(LS.courses, courses); close(); renderHome(); toast('Campo guardado ✓');
  };
  if (editing) $('#cDel').onclick = () => {
    if (!confirm('¿Borrar este campo? No afecta a rondas ya guardadas.')) return;
    courses = courses.filter(x => x.id !== course.id); save(LS.courses, courses); close(); renderHome();
  };
}

/* ---------- Datos de ejemplo ---------- */
function loadDemo() {
  const defs = [
    { name: 'Alhaurín Golf', loc: 'Alhaurín el Grande · Málaga', par: 72 },
    { name: 'Mijas Golf - Los Lagos', loc: 'Mijas · Málaga', par: 72 },
    { name: 'Real Club Valderrama', loc: 'San Roque · Cádiz', par: 71 },
    { name: 'La Cala Resort - Campo Asia', loc: 'Mijas · Málaga', par: 72 },
  ];
  const cs = defs.map(d => {
    let c = courses.find(x => x.name === d.name);
    if (!c) {
      const cat = GOLF_CATALOG.find(x => x.n === d.name);
      c = { id: uid(), name: d.name, loc: d.loc, pars: parLayout(18, d.par), lat: cat ? cat.lat : null, lon: cat ? cat.lon : null };
      courses.push(c);
    }
    return c;
  });
  save(LS.courses, courses);

  const rnd = (a, b) => a + Math.random() * (b - a);
  function genRound(course, vsTarget, dateIso) {
    const pars = course.pars, n = pars.length;
    const holes = pars.map(() => ({ strokes: 0, putts: 0, fir: null, pen: 0, bunker: false }));
    let remaining = vsTarget;
    for (let i = 0; i < n; i++) {
      let d = Math.round(remaining / (n - i) + rnd(-1, 1.2));
      d = Math.max(-1, Math.min(3, d));
      remaining -= d;
      const strokes = Math.max(2, pars[i] + d);
      let putts = d <= 0 ? 2 : (Math.random() < 0.5 ? 2 : 3);
      // 1 putt también en algunos pares: green fallado, chip cerca y embocado (up & down).
      if (d <= 0 && Math.random() < 0.35) putts = 1;
      putts = Math.max(1, Math.min(putts, strokes - 1));
      holes[i].strokes = strokes; holes[i].putts = putts;
      if (pars[i] >= 4) { const r = Math.random(); holes[i].fir = r < 0.55 ? 'hit' : (r < 0.78 ? 'left' : 'right'); }
      if (Math.random() < 0.08) holes[i].pen = 1;
      // Bunker solo tiene sentido en hoyos donde se falló el green (los que cuentan para el scrambling).
      if (!isGir(holes[i], pars[i]) && Math.random() < 0.3) holes[i].bunker = true;
    }
    let guard = 0;
    while (remaining !== 0 && guard++ < 60) {
      const i = Math.floor(Math.random() * n);
      if (remaining > 0 && holes[i].strokes - pars[i] < 3) { holes[i].strokes++; remaining--; }
      else if (remaining < 0 && holes[i].strokes - pars[i] > -1) { holes[i].strokes--; remaining++; holes[i].putts = Math.min(holes[i].putts, holes[i].strokes - 1); }
    }
    return { id: uid(), courseId: course.id, courseName: course.name, courseLoc: course.loc, pars: [...pars], date: dateIso, holes, saved: true };
  }

  const dayMs = 86400000, now = Date.now();
  const plan = [
    { ago: 66, ci: 0, vs: 19 }, { ago: 59, ci: 1, vs: 17 }, { ago: 52, ci: 2, vs: 16 },
    { ago: 45, ci: 0, vs: 15 }, { ago: 38, ci: 3, vs: 14 }, { ago: 31, ci: 1, vs: 12 },
    { ago: 24, ci: 2, vs: 13 }, { ago: 17, ci: 0, vs: 10 }, { ago: 9, ci: 1, vs: 9 }, { ago: 3, ci: 3, vs: 8 },
  ];
  const gen = plan.map(p => genRound(cs[p.ci], p.vs, new Date(now - p.ago * dayMs).toISOString()));
  gen.reverse();
  rounds = gen.concat(rounds);
  save(LS.rounds, rounds);
  renderHome();
  toast('4 campos + 10 rondas de ejemplo ✓');
}

/* ---------- TAB: Yo (perfil + datos) ---------- */
