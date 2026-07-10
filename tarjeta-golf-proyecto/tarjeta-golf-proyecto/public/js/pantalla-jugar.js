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
function blankHoles(n) { return Array.from({ length: n }, () => ({ strokes: 0, putts: 0, fir: null, pen: 0 })); }

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
    lat: course.lat != null ? course.lat : null, lon: course.lon != null ? course.lon : null,
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
  $('#viewRound').classList.remove('hidden');
  $('#roundBar').classList.remove('hidden');
  $('#rTitle').textContent = active.courseName;
  const modeLbl = active.mode === 'stableford' ? 'Stableford' : 'Medal play';
  const hcpLbl = active.hcp != null ? ' · ' + active.hcp + ' golpes' + (active.barra ? ' (' + active.barra + ')' : '') : '';
  $('#rSub').textContent = (active.courseLoc ? active.courseLoc + ' · ' : '') + fmtDate(active.date) +
    ' · ' + active.pars.length + ' hoyos · ' + modeLbl + hcpLbl;
  $('#totbar').classList.toggle('stb', active.mode === 'stableford');
  strokesShowStb = false; // al abrir la ronda, la casilla Golpes muestra golpes
  // Empezar en el primer hoyo sin apuntar (para retomar una ronda en curso donde se dejó)
  curHole = active.holes.findIndex(h => !h.strokes);
  if (curHole < 0) curHole = active.holes.length - 1;
  holeGeom = null;
  renderHoles();
  loadHoleGeom();
  openScoreSheet();
  window.scrollTo(0, 0);
}
function closeRound(toTab) {
  $('#scoreSheetBg').classList.add('hidden');
  $('#scoreSheetBg').classList.remove('show');
  $('#viewRound').classList.add('hidden');
  $('#roundBar').classList.add('hidden');
  showTab(toTab || curTab);
}

// Un hoyo a la vez: la zona principal muestra el hoyo en satélite; la hoja de resultados
// sube sola al cambiar de hoyo. La barra inferior navega entre hoyos.
let curHole = 0, holeMap = null, holeGeoLayer = null, holeGeom = null;

function renderHoles() {
  curHole = Math.max(0, Math.min(curHole, active.holes.length - 1));
  showHoleMap();
  updateHoleNav();
  updateTotals();
}
function goHole(d) {
  curHole = Math.max(0, Math.min(active.holes.length - 1, curHole + d));
  renderHoles();
  openScoreSheet(); // al cambiar de hoyo, pedir los resultados
}
function updateHoleNav() {
  const n = active.holes.length;
  $('#navHoleNo').textContent = (active.holeStart || 1) + curHole;
  $('#navHolePar').textContent = active.pars[curHole];
  const si = active.si && active.si[curHole] ? active.si[curHole] : null;
  $('#navHoleSi').parentElement.style.display = si ? '' : 'none';
  if (si) $('#navHoleSi').textContent = si;
  $('#holePrev').disabled = curHole === 0;
  $('#holeNext').disabled = curHole === n - 1;
}

/* ---- Visor satélite del hoyo (imágenes Esri, gratis) + trazado real desde OSM ---- */
function courseCoords() {
  if (active && active.lat != null) return { lat: active.lat, lon: active.lon };
  const c = GOLF_CATALOG.find(x => x.n === (active && active.courseName));
  return c && c.lat != null ? { lat: c.lat, lon: c.lon } : null;
}
function ensureHoleMap() {
  if (holeMap) return;
  holeMap = L.map('holeMap', { zoomControl: false, attributionControl: false, scrollWheelZoom: false, tap: true }).setView([40.2, -3.7], 15);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }).addTo(holeMap);
  holeGeoLayer = L.layerGroup().addTo(holeMap);
}
function holeMeters(g) {
  let m = 0;
  for (let i = 1; i < g.length; i++) m += haversineKm(g[i-1][0], g[i-1][1], g[i][0], g[i][1]) * 1000;
  return m;
}
function showHoleMap() {
  const num = (active.holeStart || 1) + curHole;
  $('#hvTitle').textContent = 'Hoyo ' + num;
  ensureHoleMap();
  holeGeoLayer.clearLayers();
  const g = holeGeom && holeGeom[num];
  setTimeout(() => { if (holeMap) holeMap.invalidateSize(); }, 30);
  if (g && g.length >= 2) {
    const line = L.polyline(g, { color: '#fff', weight: 4, opacity: .95 }).addTo(holeGeoLayer);
    L.circleMarker(g[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#5b5be6', fillOpacity: 1 }).addTo(holeGeoLayer);        // tee
    L.circleMarker(g[g.length-1], { radius: 7, color: '#fff', weight: 2, fillColor: '#e6483d', fillOpacity: 1 }).addTo(holeGeoLayer); // green
    setTimeout(() => { holeMap.invalidateSize(); holeMap.fitBounds(line.getBounds().pad(0.45)); }, 45);
    $('#hvDist').textContent = Math.round(holeMeters(g)) + ' m';
  } else {
    const c = courseCoords();
    if (c) holeMap.setView([c.lat, c.lon], 16);
    $('#hvDist').textContent = '';
  }
}
// Descarga (una vez por campo, cacheada) el trazado de cada hoyo desde OpenStreetMap.
function loadHoleGeom() {
  holeGeom = null;
  const c = courseCoords(); if (!c) return;
  const key = 'golf_hg_' + (active.courseName || '').replace(/[^\w]+/g, '_');
  const cached = load(key, null);
  if (cached && Object.keys(cached).length) { holeGeom = cached; showHoleMap(); return; }
  const d = 0.02;
  const q = '[out:json][timeout:25];way["golf"="hole"](' + (c.lat-d) + ',' + (c.lon-d) + ',' + (c.lat+d) + ',' + (c.lon+d) + ');out tags geom;';
  const eps = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  (async () => {
    for (const ep of eps) {
      try {
        const r = await fetch(ep, { method: 'POST', body: q });
        if (!r.ok) continue;
        const j = await r.json();
        const g = {};
        (j.elements || []).forEach(w => {
          if (w.type === 'way' && w.tags && w.tags.ref && w.geometry) {
            const ref = parseInt(w.tags.ref, 10);
            if (ref) g[ref] = w.geometry.map(p => [p.lat, p.lon]);
          }
        });
        if (Object.keys(g).length) {
          holeGeom = g;
          try { localStorage.setItem(key, JSON.stringify(g)); } catch (e) {}
          showHoleMap();
          return;
        }
      } catch (e) { /* sin conexión / OSM ocupado → se queda el satélite del campo */ }
    }
  })();
}

/* ---- Hoja de resultados (sube sola al cambiar de hoyo) ---- */
function openScoreSheet() {
  const sheet = $('#scoreSheet');
  sheet.innerHTML = '';
  sheet.appendChild(el('div', 'sheet-grab'));
  sheet.appendChild(holeCard(active.holes[curHole], curHole));
  const btn = el('button', 'btn sheet-confirm', 'Confirmar');
  btn.onclick = closeScoreSheet;
  sheet.appendChild(btn);
  const bg = $('#scoreSheetBg');
  bg.classList.remove('hidden');
  requestAnimationFrame(() => bg.classList.add('show'));
}
function closeScoreSheet() {
  const bg = $('#scoreSheetBg');
  bg.classList.remove('show');
  setTimeout(() => bg.classList.add('hidden'), 220);
}
$('#scoreSheetBg').onclick = e => { if (e.target === $('#scoreSheetBg')) closeScoreSheet(); };

function holeCard(h, i) {
  const par = active.pars[i];
  const si = active.si && active.si[i] ? active.si[i] : null;
  const c = el('div', 'hole');
  const gir = isGir(h, par);
  const badgeColor = scoreColor(h.strokes, par);
  c.innerHTML = `
    <div class="hole-head">
      <div class="hole-no tnum">${(active.holeStart || 1) + i}</div>
      <div class="hole-par">
        <div class="lbl">Par</div>
        <div class="par-stepper"><button data-parminus>−</button><b class="tnum" data-parval>${par}</b><button data-parplus>+</button></div>
      </div>
      ${si ? `<div class="hole-si" title="Índice de dificultad del hoyo (stroke index)"><div class="lbl">Índice</div><div class="siv tnum">${si}</div></div>` : ''}
      ${h.strokes ? `<span class="gir-tag ${gir ? 'gir-yes' : 'gir-no'}" data-gir>${gir ? 'GIR ✓' : 'no GIR'}</span>` : ''}
      <div class="score-badge tnum" data-badge style="background:${badgeColor}">${h.strokes || '–'}</div>
    </div>
    <div class="hole-body">
      <div class="row2">
        <div class="field">
          <div class="flbl">Golpes</div>
          <div class="stepper"><button data-s="strokes" data-d="-1">−</button><span class="val tnum" data-v="strokes">${h.strokes}</span><button data-s="strokes" data-d="1">+</button></div>
        </div>
        <div class="field">
          <div class="flbl">Putts</div>
          <div class="stepper"><button data-s="putts" data-d="-1">−</button><span class="val tnum" data-v="putts">${h.putts}</span><button data-s="putts" data-d="1">+</button></div>
        </div>
        <div class="field">
          <div class="flbl">Penal.</div>
          <div class="stepper"><button data-s="pen" data-d="-1">−</button><span class="val tnum" data-v="pen">${h.pen || 0}</span><button data-s="pen" data-d="1">+</button></div>
        </div>
      </div>
      <div class="field">
        <div class="flbl">Salida (calle)</div>
        <div class="seg" data-fir>
          <button data-f="left">◄ Izq</button>
          <button data-f="hit">Calle ✓</button>
          <button data-f="right">Dcha ►</button>
        </div>
      </div>
    </div>`;

  const refresh = () => {
    const p = active.pars[i];
    c.querySelector('[data-parval]').textContent = p;
    c.querySelectorAll('[data-v]').forEach(v => v.textContent = h[v.dataset.v] || 0);
    const badge = c.querySelector('[data-badge]');
    badge.textContent = h.strokes || '–';
    badge.style.background = scoreColor(h.strokes, p);
    // gir tag
    let tag = c.querySelector('[data-gir]');
    if (h.strokes) {
      const g = isGir(h, p);
      if (!tag) { tag = el('span', '', ''); tag.setAttribute('data-gir', ''); c.querySelector('.hole-head').insertBefore(tag, badge); }
      tag.className = 'gir-tag ' + (g ? 'gir-yes' : 'gir-no'); tag.textContent = g ? 'GIR ✓' : 'no GIR';
    } else if (tag) tag.remove();
    // fir segment state
    const seg = c.querySelector('[data-fir]');
    const par3 = p <= 3;
    seg.querySelectorAll('button').forEach(b => {
      b.disabled = par3;
      b.classList.toggle('on', !par3 && h.fir === b.dataset.f);
      b.classList.toggle('miss', b.dataset.f !== 'hit');
    });
    markDirty();
    updateHoleNav(); // el par se edita en la tarjeta → reflejarlo en la barra del hoyo
    updateTotals();
  };

  c.querySelectorAll('.stepper button').forEach(btn => btn.onclick = () => {
    const key = btn.dataset.s, d = +btn.dataset.d;
    h[key] = Math.max(0, (h[key] || 0) + d);
    // putts nunca pueden igualar/superar los golpes: al menos 1 golpe llega al green
    const maxPutts = Math.max(0, h.strokes - 1);
    if (h.putts > maxPutts) h.putts = maxPutts;
    refresh();
  });
  c.querySelector('[data-parminus]').onclick = () => { active.pars[i] = Math.max(3, active.pars[i] - 1); refresh(); };
  c.querySelector('[data-parplus]').onclick = () => { active.pars[i] = Math.min(6, active.pars[i] + 1); refresh(); };
  c.querySelectorAll('[data-fir] button').forEach(btn => btn.onclick = () => {
    if (btn.disabled) return;
    h.fir = h.fir === btn.dataset.f ? null : btn.dataset.f;
    refresh();
  });
  return c;
}

function markDirty() { active.dirty = true; save(LS.active, active); }

// En Medal play la casilla "Golpes" se puede tocar para verla "como si jugara en Stableford".
// El toggle es solo visual/informativo: el resultado real de Medal siguen siendo los golpes puros.
let strokesShowStb = false;
$('#cellStrokes').onclick = () => {
  if (!active || active.mode === 'stableford') return; // en Stableford ya hay casilla Puntos propia
  strokesShowStb = !strokesShowStb;
  updateTotals();
};

function updateTotals() {
  const t = roundTotals(active);
  const showStb = active && active.mode !== 'stableford' && strokesShowStb;
  $('#cellStrokes').classList.toggle('show-stb', !!showStb);
  $('#tkStrokes').textContent = showStb ? 'Stableford' : 'Golpes';
  $('#tStrokes').textContent = showStb ? (t.stb || 0) : (t.strokes || 0);
  $('#tVsPar').textContent = fmtVsPar(t.vsPar);
  $('#tVsPar').style.color = t.vsPar < 0 ? 'var(--birdie)' : t.vsPar > 0 ? 'var(--bogey)' : 'var(--text)';
  $('#tPutts').textContent = t.putts || 0;
  $('#tFir').textContent = t.firPoss ? t.firPct + '%' : '–';
  $('#tGir').textContent = t.girPoss ? t.girPct + '%' : '–';
  $('#tPts').textContent = t.stb || 0;
}
function fmtHcp(h) { return Number.isInteger(h) ? String(h) : String(h).replace('.', ','); }

$('#btnFinish').onclick = () => {
  const t = roundTotals(active);
  if (!t.played) { toast('Apunta al menos un hoyo'); return; }
  const rec = JSON.parse(JSON.stringify(active));
  delete rec.dirty; rec.saved = true;
  const idx = rounds.findIndex(r => r.id === rec.id);
  if (idx >= 0) rounds[idx] = rec; else rounds.unshift(rec);
  save(LS.rounds, rounds);
  active = null; localStorage.removeItem(LS.active);
  toast('Ronda guardada ✓');
  closeRound('historial');
};
$('#btnBackRound').onclick = () => {
  if (active && active.dirty && !active.saved) {
    if (!confirm('¿Salir sin guardar? Se conservará como borrador en curso.')) return;
  }
  closeRound();
};
$('#holePrev').onclick = () => goHole(-1);
$('#holeNext').onclick = () => goHole(1);
document.querySelector('.rb-hole').onclick = openScoreSheet; // tocar el hoyo reabre la hoja

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
    const holes = pars.map(() => ({ strokes: 0, putts: 0, fir: null, pen: 0 }));
    let remaining = vsTarget;
    for (let i = 0; i < n; i++) {
      let d = Math.round(remaining / (n - i) + rnd(-1, 1.2));
      d = Math.max(-1, Math.min(3, d));
      remaining -= d;
      const strokes = Math.max(2, pars[i] + d);
      let putts = d <= 0 ? 2 : (Math.random() < 0.5 ? 2 : 3);
      if (d < 0 && Math.random() < 0.4) putts = 1;
      putts = Math.max(1, Math.min(putts, strokes - 1));
      holes[i].strokes = strokes; holes[i].putts = putts;
      if (pars[i] >= 4) { const r = Math.random(); holes[i].fir = r < 0.55 ? 'hit' : (r < 0.78 ? 'left' : 'right'); }
      if (Math.random() < 0.08) holes[i].pen = 1;
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
