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
function blankHoles(n) { return Array.from({ length: n }, () => ({ strokes: 0, putts: 0, fir: null, pen: 0, bunker: false })); }

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
  active = {
    id: uid(), courseId: course.id, courseName: course.name, courseLoc: course.loc,
    pars, si, date: new Date().toISOString(),
    holeStart: from + 1, // nº del primer hoyo (para numerar 10-18 correctamente)
    mode: opts.mode || 'medal',
    hcp: opts.hcp != null ? opts.hcp : null,   // hándicap de juego (golpes) ya calculado/editado
    hcpIndex: opts.index != null ? opts.index : null, // índice exacto (informativo)
    barra: opts.barra || null,                 // barra jugada (informativo)
    holes: blankHoles(pars.length), saved: false, dirty: false,
  };
  save(LS.active, active);
  openRound();
}
function resumeRound(r) { active = JSON.parse(JSON.stringify(r)); active.saved = true; save(LS.active, active); openRound(); }

function openRound() {
  document.querySelectorAll('main.tab').forEach(m => m.classList.add('hidden'));
  $('#tabbar').classList.add('hidden');
  $('#mapFab').classList.add('hidden');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.add('hidden');
  $('#viewRound').classList.remove('hidden');
  $('#roundBar').classList.remove('hidden');
  $('#rTitle').textContent = active.courseName;
  const modeLbl = active.mode === 'stableford' ? 'Stableford' : 'Medal play';
  const hcpLbl = active.hcp != null ? ' · ' + active.hcp + ' golpes' + (active.barra ? ' (' + active.barra + ')' : '') : '';
  $('#rSub').textContent = (active.courseLoc ? active.courseLoc + ' · ' : '') + fmtDate(active.date) +
    ' · ' + active.pars.length + ' hoyos · ' + modeLbl + hcpLbl;
  // hoyo activo del editor: el primero sin apuntar, o el primero
  const firstEmpty = active.holes.findIndex(h => !h.strokes);
  selHole = firstEmpty >= 0 ? firstEmpty : 0;
  renderRound();
  window.scrollTo(0, 0);
}
function closeRound(toTab) {
  $('#viewRound').classList.add('hidden');
  $('#roundBar').classList.add('hidden');
  $('#roundSheet').classList.add('hidden'); $('#roundSheet').classList.remove('open');
  const appHeader = document.querySelector('header.app'); if (appHeader) appHeader.classList.remove('hidden');
  showTab(toTab || curTab);
}

/* Panel desplegable (bottom sheet) con todos los hoyos para saltar entre ellos. */
function renderSheetHoles() {
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford';
  const box = $('#rsHoles');
  box.innerHTML = active.holes.map((h, i) => {
    const played = !!h.strokes;
    const dots = (stb && recv[i] > 0) ? `<div class="sh-dots">${'•'.repeat(recv[i])}</div>` : `<div class="sh-dots empty"></div>`;
    return `<button class="sh-hole ${i === selHole ? 'active' : ''}" data-i="${i}">
      <div class="sh-no tnum">${holeNo(i)}</div>
      <div class="sh-score tnum" style="${played ? `background:${scoreColor(h.strokes, active.pars[i])};color:#fff;border-color:transparent` : ''}">${h.strokes || '·'}</div>
      ${dots}
    </button>`;
  }).join('');
  box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    selHole = +b.dataset.i; renderEditor(); highlightSel(); closeRoundSheet(); window.scrollTo(0, 0);
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
  const t = roundTotals(active);
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
  const fStr = i => active.holes[i].strokes || 0;
  const fPts = i => active.holes[i].strokes ? holePoints(i, recv) : 0;

  const parRow = `<tr class="par"><td class="rh">Par</td>${assemble(
    i => `<td class="tnum">${active.pars[i]}</td>`,
    sumOver(frontIdx, fPar), sumOver(backIdx, fPar), sumOver(idxs, fPar))}</tr>`;
  const myParRow = stb ? `<tr class="mypar"><td class="rh">Mi par</td>${assemble(
    i => `<td class="tnum">${active.pars[i] + recv[i]}</td>`,
    sumOver(frontIdx, fMyPar), sumOver(backIdx, fMyPar), sumOver(idxs, fMyPar))}</tr>` : '';
  const goRow = `<tr><td class="rh">Golpes</td>${assemble(
    i => `<td class="go"><button data-i="${i}" class="${active.holes[i].strokes ? 'has' : ''} ${i === selHole ? 'sel' : ''}" style="${active.holes[i].strokes ? `background:${scoreColor(active.holes[i].strokes, active.pars[i])}` : ''}">${active.holes[i].strokes || '·'}</button></td>`,
    dash(sumOver(frontIdx, fStr)), dash(sumOver(backIdx, fStr)), dash(t.strokes))}</tr>`;
  const ptsRow = stb ? `<tr class="pts"><td class="rh">Pts</td>${assemble(
    i => `<td class="tnum">${active.holes[i].strokes ? holePoints(i, recv) : '·'}</td>`,
    sumOver(frontIdx, fPts), sumOver(backIdx, fPts), t.stb)}</tr>` : '';

  $('#scGrid').innerHTML = `
    <thead><tr><th class="rh">Hoyo</th>${head}</tr></thead>
    <tbody>${parRow}${myParRow}${goRow}${ptsRow}</tbody>`;
  $('#scGrid').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { selHole = +b.dataset.i; renderEditor(); highlightSel(); });
}
function highlightSel() {
  $('#scGrid').querySelectorAll('[data-i]').forEach(b => b.classList.toggle('sel', +b.dataset.i === selHole));
}

// --- Etiqueta de resultado (chip + puntos del hoyo) ---
function scoreRightHtml(i, recv) {
  const h = active.holes[i], par = active.pars[i];
  if (!h.strokes) return `<div class="chip" style="background:var(--muted)">Sin apuntar</div>`;
  const stb = active.mode === 'stableford';
  const hp = stb ? holePoints(i, recv) : null;
  const pts = stb ? `<div class="hpts"><b>${hp} pt${hp === 1 ? '' : 's'}</b></div>` : '';
  return `<div class="chip" style="background:${scoreColor(h.strokes, par)}">${scoreLabelTxt(h.strokes - par)}</div>${pts}`;
}
function updateGir() { const el = $('#girBadge'); if (el) el.className = girClass(selHole); }

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
  const r = recv[i];
  const dots = (stb && r > 0) ? `<div class="hdots" title="${r} golpe(s) que da el hándicap aquí">${'•'.repeat(r)}</div>` : '';
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
  const nums = [];
  for (let x = PICK_MIN; x <= PICK_MAX; x++) nums.push(`<div class="num tnum" data-x="${x}">${x}</div>`);
  $('#holeEditor').innerHTML = `
    <div class="ed-head">
      <div class="ed-no"><div class="lab">Hoyo</div><div class="n tnum">${holeNo(i)}</div></div>
      <div class="ed-meta"><div class="par"><b>Par ${par}</b></div>${dots}${meta2}</div>
      <div class="${girClass(i)}" id="girBadge" title="Green en regulación">GIR</div>
      <div class="ed-score">${scoreRightHtml(i, recv)}</div>
    </div>
    <div class="pick-lab">Golpes</div>
    <div class="hpick-wrap"><div class="hpick-sel"></div><div class="hpick" id="hpick">${nums.join('')}</div></div>
    <div class="pick-hint"><span>‹ desliza el número ›</span></div>
    <div class="sub-fields">
      <div class="sub"><span class="k">Putts</span>${miniPickerHtml('puttsPick', 0, 6)}</div>
      <div class="sub"><span class="k">Penal.</span>${miniPickerHtml('penalPick', 0, 5)}</div>
    </div>
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
  updateNav();
}

// Barra Anterior/Siguiente. Si están TODOS los hoyos apuntados, "Siguiente" pasa a "Guardar partida".
function updateNav() {
  const nav = $('#holeEditor .ed-nav'); if (!nav) return;
  const i = selHole, last = active.holes.length - 1;
  const allDone = active.holes.every(x => x.strokes > 0);
  nav.innerHTML = `
    <button data-nav="-1" ${i === 0 ? 'disabled' : ''}>‹ Anterior</button>
    ${allDone
      ? `<button class="next save" data-save>Guardar partida ✓</button>`
      : `<button class="next" data-nav="1" ${i === last ? 'disabled' : ''}>Siguiente hoyo ›</button>`}`;
  nav.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    selHole = Math.max(0, Math.min(last, selHole + (+b.dataset.nav)));
    renderEditor(); highlightSel();
  });
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
}

function markDirty() { active.dirty = true; save(LS.active, active); }

// Totales de arriba. En Stableford el hero es Puntos; en Medal, los Golpes totales.
// Junto al hero: Vs Par personal (con los golpes del hándicap) y Vs Par del campo.
function updateTotals() {
  if (!active) return;
  const t = roundTotals(active);
  const recv = golfStrokesReceived(active);
  const stb = active.mode === 'stableford';
  const hasHcp = (active.hcp || 0) > 0;
  let vsYo = 0;
  active.holes.forEach((h, i) => { if (h.strokes > 0) vsYo += h.strokes - (active.pars[i] + recv[i]); });
  const cells = [];
  cells.push(`<div class="ts-cell hero"><div class="tk">${stb ? 'Puntos' : 'Golpes'}</div><div class="tv tnum">${stb ? t.stb : (t.strokes || 0)}</div></div>`);
  if (hasHcp) cells.push(`<div class="ts-cell"><div class="tk">Vs Par<small>yo · hcp ${fmtHcp(active.hcp)}</small></div><div class="tv tnum" style="color:${vsColor(vsYo)}">${fmtVsPar(vsYo)}</div></div>`);
  cells.push(`<div class="ts-cell"><div class="tk">Vs Par<small>campo</small></div><div class="tv tnum" style="color:${vsColor(t.vsPar)}">${fmtVsPar(t.vsPar)}</div></div>`);
  $('#totstrip').innerHTML = cells.join('');
}
function fmtHcp(h) { return Number.isInteger(h) ? String(h) : String(h).replace('.', ','); }

function saveRound() {
  const t = roundTotals(active);
  if (!t.played) { toast('Apunta al menos un hoyo'); return; }
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

  const modeLbl = stb ? 'Stableford' : 'Medal play';
  const hcpLbl = hasHcp ? ' · hcp ' + fmtHcp(r.hcp) : '';

  const tile = (k, v, s, color) =>
    `<div class="sum-tile"><div class="k">${k}</div><div class="v tnum"${color ? ` style="color:${color}"` : ''}>${v}${s ? ` <small>${s}</small>` : ''}</div></div>`;
  const vsChip = (lbl, v) =>
    `<div class="svs"><span class="k">${lbl}</span><span class="v tnum" style="color:${vsColor(v)}">${fmtVsPar(v)}</span></div>`;

  const bestLbl = best === null ? '—' : scoreLabelTxt(best);
  const splitRow = (lbl, o) =>
    `<tr><td class="rh">${lbl}</td><td class="tnum">${o.g}</td><td class="tnum" style="color:${vsColor(o.g - o.p)}">${fmtVsPar(o.g - o.p)}</td></tr>`;

  $('#sumBody').innerHTML = `
    <div class="sum-top">
      <div class="sum-badge">Partida guardada ✓</div>
      <div class="sum-course">${esc(r.courseName)}</div>
      <div class="sum-meta">${(r.courseLoc ? esc(r.courseLoc) + ' · ' : '')}${fmtDate(r.date)} · ${t.played} hoyos · ${modeLbl}${hcpLbl}</div>
    </div>

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
    </div>

    <div class="sum-sec">Resultados</div>
    <div class="dist-bar">${segs.filter(s => s[1]).map(s => `<span style="width:${(s[1] / totH * 100).toFixed(1)}%;background:${s[2]}"></span>`).join('')}</div>
    <div class="dist-legend">${segs.map(s => `<span class="dl"><span class="dot" style="background:${s[2]}"></span>${s[0]} <b class="tnum">${s[1]}</b></span>`).join('')}</div>

    <div class="sum-sec">Estadísticas</div>
    <div class="sum-grid">
      ${tile('Putts', t.putts, puttsPer.toFixed(2).replace('.', ',') + '/hoyo')}
      ${tile('Putts / GIR', t.gir ? t.puttsPerGir.toFixed(2).replace('.', ',') : '—', t.gir ? 'en ' + t.gir : 'sin greens')}
      ${tile('1 putt', onePutts, threePutts + ' de 3+')}
      ${tile('Calles', t.firPoss ? t.firPct + '%' : '—', t.firPoss ? t.firHit + '/' + t.firPoss : 'par 3')}
      ${tile('Greens (GIR)', t.girPoss ? t.girPct + '%' : '—', t.gir + '/' + t.girPoss)}
      ${tile('Scrambling', t.scrPoss ? t.scrPct + '%' : '—', t.scrPoss ? t.scr + '/' + t.scrPoss : 'todos los greens')}
      ${tile('Bunkers', t.sandPoss ? t.sandPct + '%' : '—', t.sandPoss ? t.sand + '/' + t.sandPoss : 'ninguno')}
      ${tile('Penaliz.', t.pen)}
      ${tile('Mejor hoyo', bestI >= 0 ? 'H' + hno(bestI) : '—', bestLbl, best !== null ? vsColor(best) : null)}
    </div>

    ${showSplit ? `
    <div class="sum-sec">Parciales</div>
    <table class="sum-split">
      <thead><tr><th class="rh"></th><th>Golpes</th><th>Vs par</th></tr></thead>
      <tbody>${splitRow('Ida (OUT)', out)}${splitRow('Vuelta (IN)', inn)}</tbody>
    </table>` : ''}

    <div class="sum-actions">
      <button class="btn ghost" id="sumCard">Ver tarjeta</button>
      <button class="btn" id="sumDone">${fromHistory ? 'Atrás' : 'Hecho'}</button>
    </div>`;

  $('#sumCard').onclick = () => showRoundCard(r, () => $('#viewSummary').classList.remove('hidden'));
  $('#sumDone').onclick = () => closeSummary('historial');
}

/* ===== Tarjeta apaisada de solo lectura (diseño moderno) =====
   Se muestra en horizontal: en móvil vertical la tarjeta se gira 90°; si el
   usuario pone el teléfono en horizontal, ocupa la pantalla sin girar. */
let cardBack = null; // callback para volver al pulsar cerrar
function showRoundCard(r, back) {
  cardBack = back || null;
  $('#viewSummary').classList.add('hidden');
  renderRoundCard(r);
  $('#viewCard').classList.remove('hidden');
}
function closeRoundCard() {
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

  const goRow = `<tr class="tk-go"><td class="tk-rh">Golpes</td>${assemble(
    i => played(i)
      ? `<td><span class="tk-ball" style="background:${scoreColor(r.holes[i].strokes, r.pars[i])}">${r.holes[i].strokes}</span></td>`
      : `<td><span class="tk-ball empty">·</span></td>`,
    dash(sumOver(frontIdx, i => r.holes[i].strokes || 0)), dash(sumOver(backIdx, i => r.holes[i].strokes || 0)), dash(t.strokes))}</tr>`;

  const puttRow = `<tr class="tk-min"><td class="tk-rh">Putts</td>${assemble(
    i => `<td class="tnum">${played(i) ? r.holes[i].putts : '·'}</td>`,
    sumOver(frontIdx, i => r.holes[i].putts || 0), sumOver(backIdx, i => r.holes[i].putts || 0), t.putts)}</tr>`;

  const ptsRow = stb ? `<tr class="tk-min tk-ptsrow"><td class="tk-rh">Pts</td>${assemble(
    i => `<td class="tnum">${played(i) ? pts(i) : '·'}</td>`,
    sumOver(frontIdx, pts), sumOver(backIdx, pts), t.stb)}</tr>` : '';

  const modeLbl = stb ? 'Stableford' : 'Medal play';
  const resultVal = stb ? t.stb : t.strokes;
  const resultSub = stb ? t.strokes + ' golpes' : t.stb + ' pts';

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
        <tbody>${parRow}${goRow}${puttRow}${ptsRow}</tbody>
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
