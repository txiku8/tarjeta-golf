"use strict";
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- Finder (explorar campos, dentro de Jugar) ---------- */
const fState = { q: '', holes: 'all', par: false, prov: null, provName: null };
const provKey = p => norm(p).replace(/[^a-z0-9]/g, '');
function isBrowsing() { return norm(fState.q).length >= 2 || !!fState.prov || fState.holes !== 'all' || fState.par; }

// FAB "Mapa": muestra/oculta un mapa de España (OpenStreetMap vía Leaflet) con un pin por campo.
let leafMap = null;
$('#mapFab').onclick = () => {
  const mw = $('#mapWrap');
  const willShow = mw.classList.contains('hidden');
  mw.classList.toggle('hidden');
  if (!willShow) return;
  if (!leafMap) buildMap();               // el contenedor ya es visible → Leaflet mide bien
  setTimeout(() => {
    if (leafMap) { leafMap.invalidateSize(); centerMap(); }
    mw.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
};

// Centra el mapa: si conocemos la ubicación del usuario, cerca de ella; si no, intenta geolocalizar.
function centerMap() {
  if (userPos) { leafMap.setView([userPos.lat, userPos.lon], 10); return; }
  leafMap.locate({ setView: true, maxZoom: 11 }); // si el navegador da permiso, se acerca solo
}

// URL a Google Maps: busca el campo por nombre + localidad para caer en su ficha (con estrellas/reseñas).
function googleMapsUrl(c) {
  const q = encodeURIComponent(`${c.n} ${c.t ? c.t + ' ' : ''}${c.p} golf`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
function coursePopupEl(c) {
  const meta = `${c.par ? 'Par ' + c.par + ' · ' : ''}${c.h} hoyos`;
  const loc = (c.t ? c.t + ' · ' : '') + c.p;
  const div = document.createElement('div');
  div.innerHTML = `<div class="cpop-name">${esc(c.n)}</div>
    <div class="cpop-loc">${esc(loc)}</div>
    <div class="cpop-meta">${meta}</div>
    <a class="cpop-gmaps" href="${googleMapsUrl(c)}" target="_blank" rel="noopener">★ Ver en Google Maps</a>`;
  return div;
}
const PIN_MIN_ZOOM = 8;   // los pines solo aparecen a partir de este zoom (al acercar a una zona)
let pinLayer = null;
function buildMap() {
  leafMap = L.map('leafMap', { scrollWheelZoom: true, tap: true }).setView([40.2, -3.7], 6);
  // Cartografía de relieve verde (estilo Apple/terreno) — Esri World Topographic, gratis y sin clave.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles &copy; Esri'
  }).addTo(leafMap);
  pinLayer = L.layerGroup();
  GOLF_CATALOG.filter(c => c.lat != null && c.lon != null).forEach(c => {
    L.marker([c.lat, c.lon]).bindPopup(() => coursePopupEl(c), { minWidth: 210, closeButton: true }).addTo(pinLayer);
  });
  leafMap.on('zoomend', updatePins);
  updatePins();
}
// Muestra/oculta la capa de pines según el zoom, y actualiza el aviso.
function updatePins() {
  if (!leafMap || !pinLayer) return;
  const show = leafMap.getZoom() >= PIN_MIN_ZOOM;
  if (show && !leafMap.hasLayer(pinLayer)) leafMap.addLayer(pinLayer);
  else if (!show && leafMap.hasLayer(pinLayer)) leafMap.removeLayer(pinLayer);
  const note = $('#mapNote');
  if (note) note.textContent = show
    ? '📍 Toca un campo para verlo y abrirlo en Google Maps'
    : '🔍 Acerca el zoom a una zona para ver los campos';
}

$('#fSearch').oninput = e => { fState.q = e.target.value.trim(); if (fState.q) { fState.prov = null; fState.provName = null; } renderFinder(); };
$('#fClr').onclick = () => { $('#fSearch').value = ''; fState.q = ''; renderFinder(); };

function renderFinder() {
  const q = norm(fState.q);
  // chips
  const cc = $('#fChips'); cc.innerHTML = '';
  if (fState.prov) {
    const b = el('button', 'chip prov-sel', esc(fState.provName) + ' ✕');
    b.onclick = () => { fState.prov = null; fState.provName = null; renderFinder(); };
    cc.appendChild(b);
  }
  $('#fClr').style.display = fState.q ? 'block' : 'none';

  const res = $('#fResults'), count = $('#fCount'), mis = $('#misCampos');
  // Si no se está buscando/filtrando: mostrar "Mis campos" y ocultar resultados del catálogo.
  if (!isBrowsing()) {
    mis.style.display = '';
    count.style.display = 'none';
    res.innerHTML = '';
    return;
  }
  // Modo búsqueda: resultados del catálogo como tarjetas grandes.
  mis.style.display = 'none';
  let list = GOLF_CATALOG.filter(c => {
    if (fState.holes === '18' && c.h < 18) return false;
    if (fState.holes === '9' && c.h !== 9) return false;
    if (fState.par && !c.par) return false;
    if (fState.prov && provKey(c.p) !== fState.prov) return false;
    if (q.length >= 2 && !(norm(c.n).includes(q) || norm(c.t).includes(q) || norm(c.p).includes(q))) return false;
    return true;
  });
  list = sortByDistance(list, c => (c.lat != null ? { lat: c.lat, lon: c.lon } : null));
  count.style.display = '';
  count.textContent = list.length + ' campo' + (list.length === 1 ? '' : 's') + (fState.provName ? ' · ' + fState.provName : '') + (userPos ? ' · por cercanía' : '');
  const CAP = 24, shown = list.slice(0, CAP);
  res.innerHTML = '';
  if (!list.length) { res.appendChild(el('div', 'empty', 'Sin resultados. Prueba otro nombre o quita filtros.')); return; }
  shown.forEach(c => {
    const coords = (c.lat != null && c.lon != null) ? { prov: c.p, lat: c.lat, lon: c.lon } : null;
    res.appendChild(bigCourseCard({
      name: c.n, loc: (c.t ? c.t + ' · ' : '') + c.p, par: c.par, h: c.h, coords, owned: false,
      km: distToCoords(coords),
      onPrev: () => openCoursePreview(c),
      onPlay: () => playCatalog(c),
    }));
  });
  if (list.length > CAP) res.appendChild(el('div', 'empty', `+${list.length - CAP} más · afina la búsqueda`));
}

/* ---------- Auth + sincronización ---------- */
