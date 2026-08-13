"use strict";
/* ---------- Navegación por pestañas ---------- */
const TABS = ['historial', 'rendimiento', 'jugar', 'yo'];
let curTab = 'jugar';

function showTab(name, opts) {
  if (!TABS.includes(name)) name = 'jugar';
  curTab = name;
  document.querySelectorAll('main.tab').forEach(m => m.classList.add('hidden'));
  $('#tab' + name.charAt(0).toUpperCase() + name.slice(1)).classList.remove('hidden');
  $('#tabbar').classList.remove('hidden');
  $('#tabbar').querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('#mapFab').classList.toggle('hidden', name !== 'jugar');
  renderTab(name);
  if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
}
function renderTab(name) {
  if (name === 'historial') renderHistorial();
  else if (name === 'rendimiento') renderRendimiento();
  else if (name === 'jugar') renderJugar();
  else if (name === 'yo') renderYo();
}
// alias: refresca la pestaña activa (lo usan el modal de campo, importar, etc.)
function renderHome() { renderTab(curTab); }

/* ---------- Banner de ronda en curso (reutilizable) ---------- */
function resumeBannerInto(container) {
  container.innerHTML = '';
  if (active && active.dirty && !active.saved) {
    const rt = roundTotals(active);
    const d = el('div', 'resume');
    d.innerHTML = `<div class="rz-main"><div class="rz-k">Ronda en curso</div>
      <div class="rz-n">${esc(active.courseName)}</div>
      <div class="rz-d">${rt.played} hoyos · ${rt.strokes} golpes</div></div>
      <button class="rz-x" data-x>Descartar</button>
      <button class="rz-go" data-go>Continuar</button>`;
    d.querySelector('[data-go]').onclick = () => openRound();
    d.querySelector('[data-x]').onclick = () => {
      if (!confirm('¿Descartar la ronda en curso? No se puede deshacer.')) return;
      active = null; localStorage.removeItem(LS.active); renderTab(curTab);
    };
    container.appendChild(d);
  }
}

/* ---------- Geolocalización (ordenar campos por cercanía) ---------- */
let userPos = null;        // { lat, lon } una vez concedido el permiso
let geoState = 'idle';     // 'idle' | 'asking' | 'ok' | 'denied'
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function distToCoords(coords) {
  if (!userPos || !coords || coords.lat == null || coords.lon == null) return null;
  return haversineKm(userPos.lat, userPos.lon, coords.lat, coords.lon);
}
function fmtKm(km) {
  if (km == null) return '';
  return km < 10 ? String(km.toFixed(1)).replace('.', ',') + ' km' : Math.round(km) + ' km';
}
// Ordena una lista por distancia (los sin coordenadas al final). getCoords devuelve {lat,lon} o null.
function sortByDistance(list, getCoords) {
  if (!userPos) return list;
  return list.map(x => ({ x, km: distToCoords(getCoords(x)) }))
    .sort((a, b) => (a.km == null ? Infinity : a.km) - (b.km == null ? Infinity : b.km))
    .map(o => o.x);
}
function requestGeo(force) {
  if (!navigator.geolocation) { geoState = 'denied'; return; }
  if (geoState === 'asking' || (geoState !== 'idle' && !force)) return;
  geoState = 'asking';
  navigator.geolocation.getCurrentPosition(
    p => { userPos = { lat: p.coords.latitude, lon: p.coords.longitude }; geoState = 'ok'; if (curTab === 'jugar') renderJugar(); },
    () => { geoState = 'denied'; if (curTab === 'jugar') renderJugar(); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
  );
}

/* ---------- Tarjeta de campo grande (estilo HOLE19) ---------- */
function bigCourseCard(o) {
  const par = o.pars ? o.pars.reduce((a, b) => a + b, 0) : (o.par || 0);
  const holes = o.pars ? o.pars.length : (o.h || 18);
  const co = o.coords;
  const mapHtml = co ? `<div class="gc-map">${courseMiniMap(co.prov, co.lat, co.lon)}</div>` : '';
  const cornerTag = (o.owned && cloudMode) ? '✓ Sincronizado' : holes + ' hoyos';
  const km = o.km != null ? ` · ${fmtKm(o.km)}` : '';
  const d = el('div', 'gcard');
  d.innerHTML = `
    ${mapHtml}
    <div class="gc-shade"></div>
    <div class="gc-tags">
      <span class="gc-rating">⛳ Par ${par || '–'}</span>
      <span class="gc-sync">${cornerTag}</span>
    </div>
    <div class="gc-body">
      <div class="gc-name">${esc(o.name)}</div>
      <div class="gc-loc">${esc(o.loc || '')}${km}</div>
      <div class="gc-actions">
        <button class="prev" data-prev>Vista previa</button>
        <button class="play" data-play>Jugar al golf</button>
      </div>
    </div>`;
  d.querySelector('[data-prev]').onclick = o.onPrev;
  d.querySelector('[data-play]').onclick = o.onPlay;
  return d;
}

// Convierte una entrada del catálogo en un "campo" para jugar (SIN guardarlo en Mis campos).
// La ronda guardará su propia copia de pars/si, así que no hace falta persistir el campo.
function catalogToCourse(c) {
  return {
    id: 'cat_' + norm(c.n).replace(/[^a-z0-9]/g, '').slice(0, 40),
    name: c.n, loc: (c.t ? c.t + ' · ' : '') + c.p,
    pars: (c.pars && c.pars.length ? [...c.pars] : parLayout(c.h, c.par)),
    si: c.si && c.si.length ? [...c.si] : null, lat: c.lat, lon: c.lon,
    par: c.par || 0, tees: c.tees || null, // par total del campo + barras [nombre, slope, rating]
  };
}
function playCatalog(c) { openRoundConfig(catalogToCourse(c)); }

// Pantalla de configuración de la ronda: nº de hoyos, modo de juego, barra y hándicap.
// El hándicap de juego (golpes totales) se calcula de la tabla de slope del campo con la fórmula
// WHS al 95% (Medal/Stableford):  golpes = redondear( 95% · [ índice × SR/113 + (CR − Par) ] ).
// En 9 hoyos se divide entre 2. El resultado sigue siendo editable a mano.
const HCP_ALLOWANCE = 0.95; // asignación Medal/Stableford individual (RFEG/WHS)
function openRoundConfig(course) {
  const nH = course.pars.length;
  const has18 = nH >= 18;
  const tees = Array.isArray(course.tees) && course.tees.length ? course.tees : null;
  const par = course.par || course.pars.reduce((a, b) => a + b, 0);
  let teeIdx = 0;
  if (tees) {
    // Prioridad: barra guardada en el perfil → amarillas de caballeros (por defecto) → primera barra.
    let j = tees.findIndex(t => t[0] === profile.barra);
    if (j < 0) j = tees.findIndex(t => { const n = norm(t[0]); return n.includes('amarill') && n.includes('caballero'); });
    if (j >= 0) teeIdx = j;
  }
  const savedIndex = profile.index != null ? profile.index : ''; // number input: punto decimal
  const savedHcp = profile.hcp != null ? profile.hcp : '';
  const bg = el('div', 'modal-bg rc-bg');
  bg.innerHTML = `
    <div class="modal rc" role="dialog" aria-label="Configurar ronda">
      <div class="rc-head">
        <button class="rc-ico" id="rcCancel" aria-label="Cerrar">✕</button>
        <h3>Configuración de la ronda</h3>
        <span class="rc-ico info" aria-hidden="true">i</span>
      </div>

      <div class="rc-course">
        <div class="rc-thumb">⛳️</div>
        <div>
          <div class="nm">${esc(course.name)}</div>
          <div class="mt">${nH} hoyos · Par ${par}</div>
        </div>
      </div>

      <div class="rc-sec">Formato</div>
      <div class="rc-group">
        <div class="rc-row">
          <span class="k">Hoyos</span>
          <span class="v"><select id="rcHoles">
            ${has18 ? '<option value="18">18 hoyos</option>' : ''}
            <option value="front">9 hoyos (1-9)</option>
            ${has18 ? '<option value="back">9 hoyos (10-18)</option>' : ''}
          </select></span>
        </div>
        <div class="rc-modo">
          <span class="k">Modo de juego</span>
          <div class="seg rc-seg rc-seg3" id="rcMode">
            <button type="button" data-m="stableford" class="on">Stableford</button>
            <button type="button" data-m="medal">Medal</button>
            <button type="button" data-m="match">Match play</button>
          </div>
        </div>
      </div>

      <div class="rc-sec hidden" id="rcRivalSec">Rival</div>
      <div class="rc-group hidden" id="rcRivalGrp">
        <div class="rc-row">
          <span class="k">Nombre</span>
          <span class="v"><input id="rcRival" type="text" maxlength="18" placeholder="Rival" value="${esc(profile.rivalName || '')}"></span>
        </div>
        <div class="rc-modo">
          <span class="k">Ventaja</span>
          <div class="seg rc-seg" id="rcAdv">
            <button type="button" data-a="hcp" class="on">Con hándicap</button>
            <button type="button" data-a="scratch">Los dos a scratch</button>
          </div>
        </div>
        <div class="rc-row" id="rcRivalHcpRow">
          <span class="k">${tees ? 'Hándicap exacto' : 'Hándicap de juego'}</span>
          <span class="v"><input id="rcRivalHcp" type="number" inputmode="decimal" step="${tees ? '0.1' : '1'}" min="-10" max="54" placeholder="${tees ? 'Índice' : 'Golpes'}" value="${tees ? (profile.rivalIndex != null ? profile.rivalIndex : '') : (profile.rivalHcp != null ? profile.rivalHcp : '')}"></span>
        </div>
        <div class="rc-note" id="rcAdvNote"></div>
      </div>

      <div class="rc-sec">Hándicap</div>
      <div class="rc-group">
        ${tees ? `
        <div class="rc-row">
          <span class="k">Barra (tees)</span>
          <span class="v"><select id="rcTee">
            ${tees.map((t, i) => `<option value="${i}"${i === teeIdx ? ' selected' : ''}>${esc(t[0])}</option>`).join('')}
          </select></span>
        </div>
        <div class="rc-row">
          <span class="k">Hándicap exacto</span>
          <span class="v"><input id="rcIndex" type="number" inputmode="decimal" step="0.1" min="-10" max="54" placeholder="Índice" value="${savedIndex}"></span>
        </div>
        <div class="rc-row">
          <span class="k">Hándicap de juego</span>
          <span class="v"><input id="rcHcp" type="number" inputmode="numeric" step="1" min="0" max="54" placeholder="—"></span>
        </div>
        <div class="rc-note" id="rcCalc"></div>
        ` : `
        <div class="rc-row">
          <span class="k">Hándicap de juego</span>
          <span class="v"><input id="rcHcp" type="number" inputmode="numeric" step="1" min="0" max="54" placeholder="Golpes" value="${savedHcp}"></span>
        </div>
        <div class="rc-note">Este campo no tiene tabla de slope; introduce tus golpes directamente.</div>
        `}
      </div>

      <div class="rc-actions">
        <button class="btn" id="rcStart">Empezar ronda</button>
      </div>
    </div>`;
  document.body.appendChild(bg);

  let mode = 'stableford', adv = 'hcp';
  const modeBox = $('#rcMode'), advBox = $('#rcAdv');
  const holesSel = $('#rcHoles');
  const curTee = () => tees ? (tees[+$('#rcTee').value] || tees[0]) : null;
  const nine = () => holesSel.value !== '18';
  // Hándicap de juego (golpes) a partir del índice, con la asignación de la modalidad.
  function playingHcp(index, allow) {
    const t = curTee(), sr = t[1], cr = t[2];
    let ph = allow * (index * (sr / 113) + (cr - par));
    if (nine()) ph /= 2;
    return Math.round(ph);
  }
  const numVal = sel => { const raw = $(sel).value.trim(); if (raw === '') return null; const v = parseFloat(raw.replace(',', '.')); return isNaN(v) ? null : v; };
  const myPH = () => { const v = numVal('#rcHcp'); return v == null ? null : Math.round(v); };
  // Hándicap de juego del rival: si el campo tiene slope se introduce su índice y se convierte al 100%.
  const rivalPH = () => { const v = numVal('#rcRivalHcp'); return v == null ? null : (tees ? playingHcp(v, 1) : Math.round(v)); };

  modeBox.querySelectorAll('button').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    modeBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    const m = mode === 'match';
    $('#rcRivalSec').classList.toggle('hidden', !m);
    $('#rcRivalGrp').classList.toggle('hidden', !m);
    recalc(); // el match play individual se juega al 100% del hándicap, no al 95%
  });
  advBox.querySelectorAll('button').forEach(b => b.onclick = () => {
    adv = b.dataset.a;
    advBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    recalcAdv();
  });

  // Recalcula el hándicap de juego al cambiar índice, barra, nº de hoyos o modalidad.
  function recalc() {
    if (tees) {
      const box = $('#rcCalc'), index = numVal('#rcIndex');
      if (index == null) { $('#rcHcp').value = ''; box.textContent = 'Introduce tu índice para calcular los golpes.'; }
      else {
        const allow = mode === 'match' ? 1 : HCP_ALLOWANCE; // RFEG/WHS: match play individual al 100%
        const t = curTee(), sr = t[1], cr = t[2], phR = playingHcp(index, allow);
        $('#rcHcp').value = phR;
        box.innerHTML = `redondear( ${Math.round(allow * 100)}% × [ ${fmtHcp(index)} × ${sr}/113 + (${fmtHcp(cr)} − ${par}) ]${nine() ? ' ÷ 2' : ''} ) = <b>${phR} golpes</b>`;
      }
    }
    recalcAdv();
  }
  // Nota de la ventaja del partido: quién da golpes a quién (o si se juega a scratch).
  function recalcAdv() {
    if (mode !== 'match') return;
    const note = $('#rcAdvNote');
    $('#rcRivalHcpRow').classList.toggle('hidden', adv === 'scratch');
    if (adv === 'scratch') {
      note.textContent = 'Los dos jugáis con los golpes brutos, sin ventaja: gana el hoyo quien haga menos golpes.';
      return;
    }
    const mine = myPH(), his = rivalPH();
    if (mine == null || his == null) { note.textContent = 'Introduce los dos hándicaps y se reparten los golpes de ventaja por stroke index.'; return; }
    const g = mine - his, nm = esc($('#rcRival').value.trim() || 'el rival');
    note.innerHTML = g === 0
      ? `Mismo hándicap de juego (${mine}): el partido se juega sin ventaja.`
      : (g > 0 ? `Recibes <b>${g} golpe${g === 1 ? '' : 's'}</b>` : `Le das <b>${-g} golpe${g === -1 ? '' : 's'}</b> a ${nm}`)
        + ` (${mine} − ${his}), en los hoyos de índice más bajo.`;
  }
  if (tees) {
    $('#rcIndex').oninput = recalc;
    $('#rcTee').onchange = recalc;
    holesSel.onchange = recalc;
  }
  $('#rcHcp').oninput = recalcAdv;
  $('#rcRivalHcp').oninput = recalcAdv;
  $('#rcRival').oninput = recalcAdv;
  recalc();

  const close = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) close(); };
  $('#rcCancel').onclick = close;
  $('#rcStart').onclick = () => {
    const hraw = $('#rcHcp').value.trim();
    const hcp = hraw === '' ? null : Math.max(0, Math.min(54, Math.round(parseFloat(hraw.replace(',', '.')) || 0)));
    let index = null, barra = null;
    if (tees) {
      const iraw = $('#rcIndex').value.trim();
      index = iraw === '' ? null : parseFloat(iraw.replace(',', '.'));
      barra = curTee()[0];
      profile.index = index; profile.barra = barra;
    } else {
      profile.hcp = hcp;
    }
    // Match play: rival, ventaja (o scratch) y golpes que se dan.
    let match = null;
    if (mode === 'match') {
      const scratch = adv === 'scratch';
      const his = scratch ? null : rivalPH();
      if (!scratch && his == null) { toast('Pon el hándicap del rival o juega a scratch'); return; }
      const rival = $('#rcRival').value.trim() || 'Rival';
      match = { rival, scratch, myHcp: hcp, rivalHcp: his,
        give: (scratch || hcp == null) ? 0 : hcp - his,
        holes: blankMatchHoles(0) }; // se dimensiona en startRound, ya con el rango de hoyos
      profile.rivalName = rival;
      if (!scratch) { if (tees) profile.rivalIndex = numVal('#rcRivalHcp'); else profile.rivalHcp = his; }
    }
    save(LS.profile, profile); // recuerda índice/barra (o golpes) y el rival para la próxima
    close();
    startRound(course, { range: holesSel.value, mode, hcp, index, barra, match });
  };
}

// Ficha de vista previa (solo lectura) de un campo del catálogo.
function openCoursePreview(c) {
  const cc = catalogToCourse(c);
  const totPar = cc.pars.reduce((a, b) => a + b, 0);
  const km = distToCoords(c.lat != null ? { lat: c.lat, lon: c.lon } : null);
  const hasMap = c.lat != null && c.lon != null;
  const rows = cc.pars.map((p, i) =>
    `<div class="pv-row"><span class="tnum">${i + 1}</span><span>Par <b class="tnum">${p}</b></span>` +
    `<span class="pv-si">${cc.si && cc.si[i] ? 'Índice ' + cc.si[i] : ''}</span></div>`).join('');
  const bg = el('div', 'modal-bg');
  bg.innerHTML = `
    <div class="modal" role="dialog">
      ${hasMap ? `<div id="pvMap" style="height:150px;border-radius:14px;overflow:hidden;margin-bottom:14px;border:1px solid var(--line);background:var(--surface-2)"></div>` : ''}
      <h3 style="margin-bottom:4px">${esc(cc.name)}</h3>
      <p style="margin:0 0 14px;color:var(--muted);font-size:14px">${esc(cc.loc)}${km != null ? ' · ' + fmtKm(km) : ''} · ${cc.pars.length} hoyos · Par ${totPar}</p>
      <div class="pv-list">${rows}</div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn ghost" id="pvClose">Cerrar</button>
        <button class="btn" id="pvPlay">Jugar al golf</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  if (hasMap) $('#pvMap').innerHTML = courseMiniMap(c.p, c.lat, c.lon);
  const close = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) close(); };
  $('#pvClose').onclick = close;
  $('#pvPlay').onclick = () => { close(); playCatalog(c); };
}

/* ---------- TAB: Historial ---------- */
