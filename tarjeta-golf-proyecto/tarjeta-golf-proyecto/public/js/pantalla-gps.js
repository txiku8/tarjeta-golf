"use strict";
/* ---------- Pantalla GPS del hoyo (estilo Hole19) ----------
   Solo el hoyo, girado a vertical (salida abajo, green arriba). Foto aérea del
   IGN/PNOA (Esri de reserva) pintada rotada en un canvas mediante proyección propia.
   El mapa TE SIGUE: según te mueves, se acerca y recentra suavemente entre tu
   posición y el green (la rotación queda fija; solo se animan zoom y centro).
   Datos de green/salida en js/gps-datos.js. */

let gpsHoles = null;        // greens del campo activo {n:{t,f,c,b}}
let gpsN = 1;               // nº de hoyo mostrado
let gpsUserRaw = null;      // [lat,lon] último fix GPS crudo
let gpsUserView = null;     // [lat,lon] posición suavizada (para encuadre, punto y distancias)
let gpsWatch = null;        // id watchPosition
let gpsImg = null;          // Image de la foto aérea del hoyo
let gpsBBox = null;         // {latMin,lonMin,latMax,lonMax,w,h} de la foto
let gpsAnimRAF = null;      // id de la animación de seguimiento
let gpsAim = null;          // [lat,lon] de la mira arrastrable (punto a medir)
let gpsDrag = null;         // {dx,dy} desplazamiento dedo→mira mientras se arrastra
let gpsAccM = null;         // precisión del último fix, en metros
let gpsDistOn = false;      // panel grande de distancias abierto
let gpsShotFrom = null;     // [lat,lon] desde donde se dio el golpe que se está midiendo
let gpsShotTee = false;     // ese golpe salió de la salida → es el drive del hoyo
const V = {};               // parámetros de proyección/vista ACTUALES (animados)

const MPD_LAT = 111320;     // metros por grado de latitud
const MIN_SPAN = 55;        // m — no se acerca más que esto (evita sobre-zoom en el green)
const POS_LERP = 0.22;      // suavizado de la posición
const VIEW_LERP = 0.16;     // suavizado del encuadre

function gpsM(a, b) { return Math.round(haversineKm(a[0], a[1], b[0], b[1]) * 1000); }

// Frente / centro / fondo del green. Tres casos, por orden:
//   1) el campo trae bordes REALES distintos del centro (p. ej. Basózabal, de los polígonos de OSM);
//   2) el campo trae solo el centro + la PROFUNDIDAD `d` en metros (medida en Hole19): los bordes se
//      colocan a d/2 del centro sobre la línea origen→green, o sea según por dónde ataques el hoyo
//      (así sale bien también en los dogleg, que es donde un eje salida→green fijo fallaría);
//   3) ni bordes ni profundidad: null, para no inventar distancias (se muestra solo el centro).
function gpsGreenFCB(h, origin) {
  const c = h.c;
  if (h.f && h.b && (gpsM(h.f, c) >= 3 || gpsM(h.b, c) >= 3)) return { f: h.f, c, b: h.b };
  if (h.d > 0 && origin) {
    const mpdLon = MPD_LAT * Math.cos(c[0] * Math.PI / 180);
    const e = (c[1] - origin[1]) * mpdLon, n = (c[0] - origin[0]) * MPD_LAT;
    const L = Math.hypot(e, n);
    if (L >= 1) {
      const half = h.d / 2, ue = e / L, un = n / L;
      const mueve = k => [c[0] + un * half * k / MPD_LAT, c[1] + ue * half * k / mpdLon];
      return { f: mueve(-1), c, b: mueve(1) };
    }
  }
  return { f: null, c, b: null };
}
function gpsAvailable() { return !!(active && gpsHolesFor(active.courseName)); }
function gpsHoleIdx() { return gpsN - (active.holeStart || 1); }

function openGps() {
  if (!active) return;
  gpsHoles = gpsHolesFor(active.courseName);
  if (!gpsHoles) { toast('Este campo todavía no tiene GPS'); return; }
  gpsN = holeNo(selHole);
  $('#viewGps').classList.remove('hidden');
  keepAwake(true);   // el mapa se mira andando: la pantalla no debe apagarse
  $('#gpsClose').onclick = closeGps;
  $('#gpsPrev').onclick = () => gpsGoHole(-1);
  $('#gpsNext').onclick = () => gpsGoHole(1);
  $('#gpsScoreBtn').onclick = gpsOpenScore;
  $('#gpsGreen').onclick = gpsToggleDist;
  $('#gpsDistClose').onclick = gpsCloseDist;
  $('#gpsMeas').onclick = gpsStartShot;
  $('#gpsMeasCancel').onclick = gpsCancelShot;
  $('#gpsMeasSave').onclick = gpsSaveShot;
  gpsDistOn = false; $('#gpsDist').classList.add('hidden');
  gpsCancelShot();
  gpsLoadHole();
  gpsStartWatch();
  const stage = $('#viewGps');
  stage.addEventListener('pointerdown', gpsAimDown);
  stage.addEventListener('pointermove', gpsAimMove);
  stage.addEventListener('pointerup', gpsAimUp);
  stage.addEventListener('pointercancel', gpsAimUp);
  window.addEventListener('resize', gpsOnResize);
}

function closeGps() {
  if (gpsWatch != null && navigator.geolocation) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
  if (gpsAnimRAF) { cancelAnimationFrame(gpsAnimRAF); gpsAnimRAF = null; }
  const stage = $('#viewGps');
  stage.removeEventListener('pointerdown', gpsAimDown);
  stage.removeEventListener('pointermove', gpsAimMove);
  stage.removeEventListener('pointerup', gpsAimUp);
  stage.removeEventListener('pointercancel', gpsAimUp);
  gpsDrag = null;
  window.removeEventListener('resize', gpsOnResize);
  $('#viewGps').classList.add('hidden');
}

// --- Panel grande de distancias (frente / centro / trasera), al tocar el panel del green ---
function gpsToggleDist() { gpsDistOn ? gpsCloseDist() : gpsOpenDist(); }
function gpsOpenDist() {
  gpsDistOn = true;
  $('#gpsDist').classList.remove('hidden');
  gpsLayout();
}
function gpsCloseDist() {
  gpsDistOn = false;
  $('#gpsDist').classList.add('hidden');
}
// Rellena el panel grande. `g` = {f,c,b} ya calculados, `origin` = desde dónde se mide.
function gpsPintaDist(g, origin, jugando) {
  const sh = $('#gpsDist');
  sh.classList.toggle('solo-centro', !g.f || !g.b);
  $('#gpsDistMid').textContent = gpsM(origin, g.c);
  if (g.f) $('#gpsDistFront').textContent = gpsM(origin, g.f);
  if (g.b) $('#gpsDistBack').textContent = gpsM(origin, g.b);
  $('#gpsDistFrom').textContent = jugando ? 'desde tu posición' : 'desde la salida · sin señal GPS todavía';
  // precisión del GPS
  let clase = 'acc-nula', txt = 'sin señal';
  if (jugando && gpsAccM != null) {
    if (gpsAccM <= 8)       { clase = '';          txt = 'buena'; }
    else if (gpsAccM <= 20) { clase = 'acc-media'; txt = 'regular (±' + Math.round(gpsAccM) + ' m)'; }
    else                    { clase = 'acc-mala';  txt = 'mala (±' + Math.round(gpsAccM) + ' m)'; }
  }
  sh.classList.remove('acc-media', 'acc-mala', 'acc-nula');
  if (clase) sh.classList.add(clase);
  $('#gpsAccTxt').textContent = txt;
}

/* --- Medir un golpe: marcas dónde has pegado, andas hasta la bola y te dice cuánto has mandado.
   Si el golpe salió de la salida (a menos de TEE_R metros), se guarda como la SALIDA del hoyo y
   entra en la media de tus salidas. Los demás golpes se miden pero no se guardan: la tarjeta no
   lleva la cuenta golpe a golpe. */
const SHOT_TEE_R = 45;    // m alrededor de la salida para considerar que el golpe es el drive
function gpsStartShot() {
  if (!gpsUserRaw) { toast('Esperando a que el GPS te sitúe'); return; }
  const h = gpsHoles[gpsN];
  gpsShotFrom = gpsUserRaw.slice();
  // vale tanto la salida real como la de juego (V.ftee), que es la que se pinta
  gpsShotTee = !!h && Math.min(gpsM(gpsShotFrom, h.t), V.ftee ? gpsM(gpsShotFrom, V.ftee) : 1e9) <= SHOT_TEE_R;
  $('#gpsMeas').classList.add('hidden');
  $('#gpsMeasBox').classList.remove('hidden');
  $('#gpsMeasK').textContent = gpsShotTee ? 'Salida · camina hasta la bola' : 'Camina hasta la bola';
  $('#gpsMeasSave').textContent = gpsShotTee ? 'Guardar como salida' : 'Hecho';
  gpsLayout();
}
function gpsCancelShot() {
  gpsShotFrom = null; gpsShotTee = false;
  $('#gpsMeas').classList.remove('hidden');
  $('#gpsMeasBox').classList.add('hidden');
  $('#gpsShotDot').classList.add('hidden');
}
function gpsShotM() {
  const now = gpsUserView || gpsUserRaw;
  return (gpsShotFrom && now) ? gpsM(gpsShotFrom, now) : 0;
}
function gpsSaveShot() {
  const m = gpsShotM(), tee = gpsShotTee;
  if (tee && m > 0) {
    const i = gpsHoleIdx();
    if (active.holes[i]) { active.holes[i].drive = m; markDirty(); }
    toast('Salida de ' + m + ' m guardada');
  } else {
    toast(m > 0 ? 'Golpe de ' + m + ' m' : 'No te has movido del sitio');
  }
  gpsCancelShot();
}

// Pulsar la barra de abajo: cierra el mapa y abre la pantalla de apuntar (tarjeta/editor) en ESTE hoyo.
function gpsOpenScore() {
  selHole = gpsHoleIdx();
  closeGps();
  if (typeof renderRound === 'function') renderRound();
  window.scrollTo(0, 0);
}

function gpsGoHole(d) {
  const first = active.holeStart || 1, last = first + active.pars.length - 1;
  const n = Math.max(first, Math.min(last, gpsN + d));
  if (n === gpsN) return;
  gpsN = n;
  gpsCancelShot();   // la medición era de ESE hoyo
  gpsLoadHole();
}

let gpsResizeT = null;
function gpsOnResize() {
  clearTimeout(gpsResizeT);
  gpsResizeT = setTimeout(() => { gpsComputeStatic(); gpsSnapView(); gpsDrawSat(); gpsLayout(); }, 150);
}

// Geometría del hoyo + descarga de la foto aérea; al cargar, encuadra y pinta.
function gpsLoadHole() {
  const h = gpsHoles[gpsN];
  const idx = gpsHoleIdx(), mts = holeMetres(active, idx);
  const meta = 'PAR ' + (active.pars[idx] || '')
    + (mts ? ' · ' + mts + ' M' : '')
    + (active.si && active.si[idx] ? ' · SI ' + active.si[idx] : '');
  $('#gpsHbNo').textContent = gpsN;
  $('#gpsHbMeta').textContent = meta;
  $('#gpsPrev').disabled = gpsN <= (active.holeStart || 1);
  $('#gpsNext').disabled = gpsN >= (active.holeStart || 1) + active.pars.length - 1;
  if (!h) { $('#gpsNote').textContent = 'Este hoyo no tiene datos GPS'; return; }

  gpsComputeStatic();
  // si sigo teniendo un fix reciente cerca de ESTE hoyo lo mantengo; si no, encuadro el hoyo entero
  gpsUserView = (gpsUserRaw && gpsNearHole(gpsUserRaw)) ? gpsUserRaw.slice() : null;
  gpsSnapView();          // V = encuadre exacto para el origen actual (sin animación)
  gpsResetAim();          // mira a mitad de camino origen→green, lista para arrastrar
  gpsBBoxFromView();      // foto que cubre el hoyo entero, con margen
  gpsLayout();

  const bb = gpsBBox;
  const pnoa = 'https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&request=GetMap&version=1.3.0&layers=OI.OrthoimageCoverage&styles=&crs=EPSG:4326&bbox=' +
    bb.latMin + ',' + bb.lonMin + ',' + bb.latMax + ',' + bb.lonMax + '&width=' + bb.w + '&height=' + bb.h + '&format=image/jpeg';
  const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=' +
    bb.lonMin + ',' + bb.latMin + ',' + bb.lonMax + ',' + bb.latMax + '&bboxSR=4326&imageSR=4326&size=' + bb.w + ',' + bb.h + '&format=jpg&f=image';
  gpsImg = null;
  const im = new Image();
  im.onload = () => { gpsImg = im; gpsDrawSat(); gpsLayout(); };
  im.onerror = () => {
    const im2 = new Image();
    im2.onload = () => { gpsImg = im2; gpsBBox.w = im2.naturalWidth; gpsBBox.h = im2.naturalHeight; gpsDrawSat(); gpsLayout(); };
    im2.onerror = () => { gpsDrawSat(); };
    im2.src = esri;
  };
  im.src = pnoa;
}

// ¿Un punto está jugando ESTE hoyo? (cerca de la salida real)
function gpsNearHole(p) {
  const h = gpsHoles[gpsN];
  const L = haversineKm(h.t[0], h.t[1], h.c[0], h.c[1]) * 1000;
  return haversineKm(p[0], p[1], h.t[0], h.t[1]) * 1000 < L * 1.6;
}
// Origen de las medidas/encuadre: tu posición suavizada si juegas el hoyo; si no, la salida de juego.
function gpsOrigin() {
  return (gpsUserView && gpsNearHole(gpsUserView)) ? gpsUserView : (V.ftee || gpsHoles[gpsN].t);
}

// Parte FIJA de la vista: rotación (salida→green = arriba), tamaño y centro de green.
function gpsComputeStatic() {
  const h = gpsHoles[gpsN];
  const stage = $('#viewGps');
  V.W = stage.clientWidth; V.H = stage.clientHeight; V.dpr = window.devicePixelRatio || 1;
  V.Glat = h.c[0]; V.Glon = h.c[1];
  V.mpdLon = MPD_LAT * Math.cos(V.Glat * Math.PI / 180);
  const FT = gpsFTfor(active.courseName);
  V.ftee = [h.t[0] + (h.c[0] - h.t[0]) * FT, h.t[1] + (h.c[1] - h.t[1]) * FT];
  const te = (V.ftee[1] - V.Glon) * V.mpdLon, tn = (V.ftee[0] - V.Glat) * MPD_LAT;
  const ue = -te, un = -tn, L = Math.hypot(ue, un) || 1;
  V.phi = Math.atan2(ue / L, un / L);
  V.cphi = Math.cos(V.phi); V.sphi = Math.sin(V.phi);
  V.cx = V.W / 2;
}

// Encuadre OBJETIVO (scale/centro) para ver desde `origin` (abajo) hasta el green (arriba).
function gpsFrameFor(origin) {
  const g = gpsToMap(V.Glat, V.Glon);            // (0,0)
  const o = gpsToMap(origin[0], origin[1]);
  const usableTop = 66, usableBottom = V.H - 88;
  const span = Math.max(Math.abs(o.y - g.y), MIN_SPAN);
  return {
    scale: (usableBottom - usableTop) / (span + 24),
    midX: (g.x + o.x) / 2,
    midY: (g.y + o.y) / 2,
    cy: (usableTop + usableBottom) / 2,
  };
}
// Fija la vista al objetivo sin animar (al cargar hoyo / resize).
function gpsSnapView() {
  const t = gpsFrameFor(gpsOrigin());
  V.scale = t.scale; V.midX = t.midX; V.midY = t.midY; V.cy = t.cy;
}

function gpsToMap(lat, lon) {
  const e = (lon - V.Glon) * V.mpdLon, n = (lat - V.Glat) * MPD_LAT;
  return { x: e * V.cphi - n * V.sphi, y: e * V.sphi + n * V.cphi };
}
function gpsProject(lat, lon) {
  const m = gpsToMap(lat, lon);
  return { x: V.cx + (m.x - V.midX) * V.scale, y: V.cy - (m.y - V.midY) * V.scale };
}
// Inversa de gpsProject: píxel de pantalla → [lat,lon] (para arrastrar la mira).
function gpsFromPx(x, y) {
  const mx = (x - V.cx) / V.scale + V.midX, my = (V.cy - y) / V.scale + V.midY;
  const e = mx * V.cphi + my * V.sphi, n = -mx * V.sphi + my * V.cphi;
  return [V.Glat + n / MPD_LAT, V.Glon + e / V.mpdLon];
}

// --- Mira arrastrable: mides cuánto hay hasta ese punto y cuánto queda al green ---
function gpsResetAim() {
  const h = gpsHoles[gpsN]; if (!h) { gpsAim = null; return; }
  const o = gpsOrigin();
  gpsAim = [(o[0] + h.c[0]) / 2, (o[1] + h.c[1]) / 2];   // a mitad de camino
}
function gpsAimDown(e) {
  if (!gpsAim || !V.scale) return;
  if (e.target.closest('.gps-hbar, .gps-x, .gps-green, .gps-sheet, .gps-meas, .gps-measbox')) return;   // botones y paneles
  const r = $('#viewGps').getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const p = gpsProject(gpsAim[0], gpsAim[1]);
  const near = Math.hypot(x - p.x, y - p.y) <= 46;
  // tocando la mira la arrastras (sin saltos); tocando lejos, salta a ese punto
  gpsDrag = near ? { dx: p.x - x, dy: p.y - y } : { dx: 0, dy: 0 };
  if (!near) gpsAim = gpsFromPx(x, y);
  $('#gpsAim').classList.add('drag');
  try { $('#viewGps').setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
  gpsLayout();
}
function gpsAimMove(e) {
  if (!gpsDrag) return;
  const r = $('#viewGps').getBoundingClientRect();
  gpsAim = gpsFromPx(e.clientX - r.left + gpsDrag.dx, e.clientY - r.top + gpsDrag.dy);
  e.preventDefault();
  gpsLayout();
}
function gpsAimUp(e) {
  if (!gpsDrag) return;
  gpsDrag = null;
  $('#gpsAim').classList.remove('drag');
  try { $('#viewGps').releasePointerCapture(e.pointerId); } catch (_) {}
}

// bbox (norte arriba) que cubre el hoyo entero con margen (para que al seguirte no falte foto). Alta resolución.
function gpsBBoxFromView() {
  const h = gpsHoles[gpsN];
  // extremos: salida REAL, green y tu posición (si la hay)
  const pts = [gpsToMap(h.t[0], h.t[1]), gpsToMap(h.c[0], h.c[1])];
  if (gpsUserView) pts.push(gpsToMap(gpsUserView[0], gpsUserView[1]));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = Math.max(maxX - cx, maxY - cy) + 70;    // metros, +70 m de margen
  // pasar el centro (en metros locales) de vuelta a lat/lon
  const e = cx * V.cphi + cy * V.sphi, n = -cx * V.sphi + cy * V.cphi;
  const cLat = V.Glat + n / MPD_LAT, cLon = V.Glon + e / V.mpdLon;
  const dLat = half / MPD_LAT, dLon = half / V.mpdLon;
  gpsBBox = { latMin: cLat - dLat, lonMin: cLon - dLon, latMax: cLat + dLat, lonMax: cLon + dLon, w: 2048, h: 2048 };
}

// Pinta la foto aérea rotada en el canvas mediante una transformación afín (px foto → px pantalla).
function gpsDrawSat() {
  const cv = $('#gpsCanvas'), ctx = cv.getContext('2d');
  const W = V.W, H = V.H, dpr = V.dpr;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!gpsImg || !gpsBBox) return;
  const bb = gpsBBox;
  const nw = gpsProject(bb.latMax, bb.lonMin);
  const ne = gpsProject(bb.latMax, bb.lonMax);
  const sw = gpsProject(bb.latMin, bb.lonMin);
  const a = (ne.x - nw.x) / bb.w, b = (ne.y - nw.y) / bb.w;
  const c = (sw.x - nw.x) / bb.h, d = (sw.y - nw.y) / bb.h;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, nw.x * dpr, nw.y * dpr);
  ctx.drawImage(gpsImg, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Coloca bandera, tu posición, mira, distancias y la línea de juego (usa la posición suavizada).
function gpsLayout() {
  const h = gpsHoles[gpsN]; if (!h || !V.scale) return;
  const playing = gpsUserView && gpsNearHole(gpsUserView);
  const origin = gpsOrigin();
  const pF = gpsProject(h.c[0], h.c[1]);
  const flag = $('#gpsFlag'); flag.style.left = pF.x + 'px'; flag.style.top = pF.y + 'px';

  // Sobre el mapa, SOLO el centro del green (cifra y bandera). Frente y fondo van en el panel grande.
  const g = gpsGreenFCB(h, origin);
  $('#gpsMid').textContent = gpsM(origin, g.c);
  $('#gpsFrontDot').style.display = 'none';
  $('#gpsBackDot').style.display = 'none';
  if (gpsDistOn) gpsPintaDist(g, origin, playing);

  const me = $('#gpsMe');
  if (playing) { const pm = gpsProject(gpsUserView[0], gpsUserView[1]); me.style.display = 'block'; me.style.left = pm.x + 'px'; me.style.top = pm.y + 'px'; }
  else me.style.display = 'none';

  // Golpe que se está midiendo: punto donde se pegó + metros recorridos hasta ahora.
  const shot = $('#gpsShotDot');
  if (gpsShotFrom) {
    const ps = gpsProject(gpsShotFrom[0], gpsShotFrom[1]);
    shot.classList.remove('hidden');
    shot.style.left = ps.x + 'px'; shot.style.top = ps.y + 'px';
    $('#gpsMeasM').textContent = gpsShotM();
  } else shot.classList.add('hidden');

  // Línea desde tu posición (o la salida) hasta la mira, y de la mira al green (a trazos).
  const po = gpsProject(origin[0], origin[1]);
  const aim = $('#gpsAim'), badge = $('#gpsAimBadge');
  if (gpsAim) {
    const pa = gpsProject(gpsAim[0], gpsAim[1]);
    aim.style.display = 'block'; aim.style.left = pa.x + 'px'; aim.style.top = pa.y + 'px';
    badge.style.display = 'block';
    badge.style.left = Math.max(58, Math.min(V.W - 58, pa.x)) + 'px';
    badge.style.top = Math.max(26, pa.y - 48) + 'px';
    $('#gpsAimM').textContent = gpsM(origin, gpsAim) + ' m';
    $('#gpsAimRest').textContent = 'al green ' + gpsM(gpsAim, g.c) + ' m';
    $('#gpsLine').setAttribute('points', po.x + ',' + po.y + ' ' + pa.x + ',' + pa.y);
    $('#gpsLineAim').setAttribute('points', pa.x + ',' + pa.y + ' ' + pF.x + ',' + pF.y);
  } else {
    aim.style.display = 'none'; badge.style.display = 'none';
    $('#gpsLine').setAttribute('points', po.x + ',' + po.y + ' ' + pF.x + ',' + pF.y);
    $('#gpsLineAim').setAttribute('points', '');
  }
}

// --- Seguimiento suave: anima la posición y el encuadre hacia el objetivo ---
function gpsTick() {
  gpsAnimRAF = null;
  let moving = false;
  // 1) suavizar la posición hacia el último fix
  if (gpsUserRaw) {
    if (!gpsUserView) gpsUserView = gpsUserRaw.slice();
    const dLat = gpsUserRaw[0] - gpsUserView[0], dLon = gpsUserRaw[1] - gpsUserView[1];
    if (Math.abs(dLat) > 1e-7 || Math.abs(dLon) > 1e-7) {
      gpsUserView[0] += dLat * POS_LERP; gpsUserView[1] += dLon * POS_LERP; moving = true;
    } else gpsUserView = gpsUserRaw.slice();
  }
  // 2) suavizar el encuadre hacia el objetivo
  const t = gpsFrameFor(gpsOrigin());
  const ds = (t.scale - V.scale), dx = (t.midX - V.midX), dy = (t.midY - V.midY), dc = (t.cy - V.cy);
  if (Math.abs(ds) > V.scale * 0.003 || Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3 || Math.abs(dc) > 0.3) {
    V.scale += ds * VIEW_LERP; V.midX += dx * VIEW_LERP; V.midY += dy * VIEW_LERP; V.cy += dc * VIEW_LERP; moving = true;
  } else { V.scale = t.scale; V.midX = t.midX; V.midY = t.midY; V.cy = t.cy; }

  gpsDrawSat(); gpsLayout();
  if (moving) gpsAnimRAF = requestAnimationFrame(gpsTick);
}
function gpsKick() { if (!gpsAnimRAF) gpsAnimRAF = requestAnimationFrame(gpsTick); }

function gpsStartWatch() {
  if (!navigator.geolocation) { $('#gpsNote').textContent = 'Este dispositivo no tiene GPS'; return; }
  if (gpsWatch != null) return;
  $('#gpsNote').textContent = 'Buscando tu posición…';
  gpsWatch = navigator.geolocation.watchPosition(
    p => { gpsUserRaw = [p.coords.latitude, p.coords.longitude]; gpsAccM = p.coords.accuracy;
           $('#gpsNote').textContent = ''; gpsKick(); },
    () => { $('#gpsNote').textContent = 'Sin señal GPS · distancias desde la salida'; },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
  );
}
