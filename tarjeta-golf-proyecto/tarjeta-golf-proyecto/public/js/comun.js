"use strict";

/* ---------- Tarjetas de métrica con icono (Rendimiento + resumen) ---------- */
// Icono SVG por nombre; hereda el color con currentColor.
function sicon(name) {
  const P = {
    flag:     '<path d="M7 21V3.5"/><path d="M7 4.5h9l-2.2 2.8L16 10H7"/>',
    chart:    '<path d="M4 18h15.5"/><path d="M5 14l4-4 3 2.4L18.5 6"/>',
    putter:   '<path d="M14 3v9"/><path d="M14 12h-3.4a2.6 2.6 0 0 0 0 5.2H12"/><circle cx="17.6" cy="18.4" r="1.5" fill="currentColor" stroke="none"/>',
    target:   '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".7" fill="currentColor" stroke="none"/>',
    green:    '<ellipse cx="12" cy="15.5" rx="8" ry="3.8"/><path d="M12 15.5V5l4 1.4-4 1.4"/>',
    scramble: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3.5"/>',
    bunker:   '<path d="M3 14.5c2.2 0 2.2-2 4.5-2s2.3 2 4.5 2 2.3-2 4.5-2 2.3 2 4.5 2"/><path d="M4 19h16"/>',
    ball:     '<circle cx="12" cy="12" r="8.5"/><circle cx="9.4" cy="10" r=".7" fill="currentColor" stroke="none"/><circle cx="13" cy="9.4" r=".7" fill="currentColor" stroke="none"/><circle cx="11.2" cy="13" r=".7" fill="currentColor" stroke="none"/>',
    ring:     '<circle cx="12" cy="12" r="8.5"/>',
    bird:     '<path d="M3 13q4.5-6 9-2 4.5-4 9 2"/>',
    warn:     '<path d="M12 4.5l8 14.5H4z"/><path d="M12 10.5v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + (P[name] || P.ring) + '</svg>';
}
// Tarjeta: título, valor, sub, icono. vc = color del valor; ic = color del icono (por defecto = vc).
function mtile(k, v, s, icon, vc, ic) {
  ic = ic || vc;
  const icStyle = ic ? ` style="color:${ic};background:color-mix(in srgb, ${ic} 15%, transparent)"` : '';
  const vStyle = vc ? ` style="color:${vc}"` : '';
  return `<div class="mtile"><div class="mtile-txt">`
    + `<div class="k">${k}</div>`
    + `<div class="v tnum"${vStyle}>${v}</div>`
    + (s ? `<div class="s">${s}</div>` : '')
    + `</div><div class="mtile-ic"${icStyle}>${sicon(icon)}</div></div>`;
}

function parArr(seq) { return seq.split('').map(Number); }
// Genera un reparto de par por hoyo realista que suma exactamente el par total.
function parLayout(holes, totalPar) {
  const n = holes >= 18 ? 18 : 9;
  const base = n === 18 ? 72 : 36;
  const tp = totalPar || base;
  const arr = Array(n).fill(4);
  let n3 = n === 18 ? 4 : 2;
  let n5 = (n === 18 ? 4 : 2) + (tp - base);
  if (n5 < 0) { n3 -= n5; n5 = 0; }
  n3 = Math.max(0, Math.min(n, n3));
  n5 = Math.max(0, Math.min(n - n3, n5));
  const p5 = [1, 4, 8, 13, 17, 10, 6, 2], p3 = [2, 6, 10, 15, 3, 7, 11, 16];
  for (let i = 0; i < n5; i++) arr[p5[i] % n] = 5;
  for (let i = 0; i < n3; i++) if (arr[p3[i] % n] === 4) arr[p3[i] % n] = 3;
  // ajuste fino para cuadrar la suma exacta
  let sum = arr.reduce((a, b) => a + b, 0), guard = 0;
  while (sum !== tp && guard < 80) {
    const i = guard % n; guard++;
    if (sum < tp && arr[i] < 5) { arr[i]++; sum++; }
    else if (sum > tp && arr[i] > 3) { arr[i]--; sum--; }
  }
  return arr;
}

/* ---------- Seed data ---------- */
const SEED_COURSES = [
  { id: uid(), name: 'Alhaurín Golf', loc: 'Alhaurín el Grande · Málaga', pars: parLayout(18, 72) },
  { id: uid(), name: 'PGA Catalunya (Stadium)', loc: 'Caldes de Malavella · Girona', pars: parLayout(18, 72) },
  { id: uid(), name: 'Real Club Valderrama', loc: 'San Roque · Cádiz', pars: parLayout(18, 71) },
];

let courses = load(LS.courses, null);
if (!courses) { courses = SEED_COURSES; save(LS.courses, courses); }
let rounds = load(LS.rounds, []);
let active = load(LS.active, null); // ronda en curso
let profile = load(LS.profile, { index: null, barra: null, hcp: null }); // índice/barra/golpes recordados

// migración: rellena datos de campos guardados antes de existir cada versión del catálogo
//  - coordenadas (antes de existir el mapa)
//  - par real por hoyo + stroke index (antes del cambio al catálogo softline)
// Se cruza por nombre exacto con GOLF_CATALOG. Solo toca campos que aún NO tienen `si`
// (señal de que se añadieron antes del cambio) y cuyo nº de hoyos coincide con el del catálogo.
// No altera las rondas guardadas: cada una conserva su propia copia de pars/si (foto del día).
function migrateCourses() {
  let changed = false;
  courses.forEach(c => {
    const cat = GOLF_CATALOG.find(x => x.n === c.name);
    if (!cat) return;
    if (c.lat == null && cat.lat != null) { c.lat = cat.lat; c.lon = cat.lon; changed = true; }
    if (!c.si && cat.si && cat.pars && Array.isArray(c.pars) && c.pars.length === cat.pars.length) {
      c.pars = [...cat.pars];
      c.si = [...cat.si];
      changed = true;
    }
  });
  if (changed) save(LS.courses, courses);
  return changed;
}
migrateCourses();


/* ---------- Scoring helpers ---------- */
function scoreColor(strokes, par) {
  if (!strokes) return 'var(--line-strong)';
  const d = strokes - par;
  if (d <= -2) return 'var(--eagle)';
  if (d === -1) return 'var(--birdie)';
  if (d === 0) return 'var(--par)';
  if (d === 1) return 'var(--bogey)';
  return 'var(--double)';
}
function isGir(h, par) { return h.strokes > 0 && (h.strokes - h.putts) <= (par - 2); }
function fmtVsPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }

/* ---------- Aggregate stats ---------- */
function roundTotals(r) {
  let strokes = 0, putts = 0, par = 0, played = 0, firHit = 0, firPoss = 0, gir = 0, girPoss = 0, pen = 0;
  let scr = 0, scrPoss = 0, girPutts = 0, sand = 0, sandPoss = 0;
  r.holes.forEach((h, i) => {
    const p = r.pars[i];
    if (h.strokes > 0) {
      played++; strokes += h.strokes; putts += h.putts; par += p; pen += h.pen || 0;
      girPoss++;
      // Scrambling: green fallado y aun así par o mejor. Putts por GIR: solo cuentan los greens cogidos,
      // porque los putts totales premian fallar el green y chipear cerca.
      if (isGir(h, p)) { gir++; girPutts += h.putts; }
      else {
        scrPoss++;
        const saved = h.strokes - p <= 0;
        if (saved) scr++;
        // Salidas de bunker: subconjunto del scrambling (si estabas en bunker, fallaste el green).
        // Las rondas antiguas no traen el campo y sencillamente no suman.
        if (h.bunker) { sandPoss++; if (saved) sand++; }
      }
      if (p >= 4) { firPoss++; if (h.fir === 'hit') firHit++; }
    }
  });
  return { strokes, putts, par, played, vsPar: strokes - par,
    firHit, firPoss, gir, girPoss, pen, scr, scrPoss, girPutts, sand, sandPoss,
    stb: stablefordPoints(r),
    firPct: firPoss ? Math.round(firHit / firPoss * 100) : 0,
    girPct: girPoss ? Math.round(gir / girPoss * 100) : 0,
    scrPct: scrPoss ? Math.round(scr / scrPoss * 100) : 0,
    sandPct: sandPoss ? Math.round(sand / sandPoss * 100) : 0,
    puttsPerGir: gir ? girPutts / gir : 0 };
}

// Reparte el HÁNDICAP DE JUEGO total de la ronda (r.hcp, ya calculado con la tabla de slope y ya
// reducido a la mitad si se juegan 9 hoyos) entre los hoyos jugados, según su stroke index:
//   perHole = floor(hcp / nHoyos);  los `hcp mod nHoyos` hoyos más difíciles reciben 1 golpe extra.
// La dificultad se ordena por stroke index (menor = más difícil) sobre los hoyos realmente jugados.
function spreadStrokes(pars, si, hcp) {
  const n = pars.length;
  const recv = new Array(n).fill(0);
  hcp = Math.round(hcp || 0);
  if (hcp <= 0 || !n) return recv;
  const perHole = Math.floor(hcp / n), extra = hcp % n;
  const order = pars.map((_, i) => i)
    .sort((a, b) => ((si && si[a]) || a + 1) - ((si && si[b]) || b + 1));
  order.forEach((idx, rank) => { recv[idx] = perHole + (rank < extra ? 1 : 0); });
  return recv;
}
function golfStrokesReceived(r) { return spreadStrokes(r.pars, r.si, r.hcp != null ? r.hcp : 0); }
// Puntos Stableford (2 + par + golpes recibidos − golpes, mín 0). Se calcula SIEMPRE, aunque la
// ronda sea Medal play, para poder mostrar "como si jugara en Stableford" al clicar en Golpes.
function stablefordPoints(r) {
  const recv = golfStrokesReceived(r);
  let pts = 0;
  r.holes.forEach((h, i) => {
    if (h.strokes > 0) pts += Math.max(0, 2 + (r.pars[i] + recv[i]) - h.strokes);
  });
  return pts;
}

/* ---------- Match play (uno contra uno) ----------
   La ronda guarda un bloque `match`:
     { rival, scratch, myHcp, rivalHcp, give, holes:[{strokes, conc}] }
   `give` = golpes de ventaja del partido (hcp de juego mío − del rival, ambos al 100%):
     > 0 los recibo yo, < 0 los recibe el rival, 0 o `scratch` = nadie da nada.
   `conc` marca un hoyo concedido: 'me' = se lo doy por perdido, 'rival' = me lo dan. */
function isMatch(r) { return !!(r && r.mode === 'match' && r.match); }
function blankMatchHoles(n) { return Array.from({ length: n }, () => ({ strokes: 0, conc: null })); }

// Golpes de ventaja por hoyo repartidos por stroke index: { me:[…], rival:[…] }.
function matchStrokes(r) {
  const n = r.pars.length, zero = new Array(n).fill(0);
  const m = r.match;
  if (!m || m.scratch) return { me: zero, rival: zero.slice() };
  const g = Math.round(m.give || 0);
  if (!g) return { me: zero, rival: zero.slice() };
  const spread = spreadStrokes(r.pars, r.si, Math.abs(g));
  return g > 0 ? { me: spread, rival: zero } : { me: zero, rival: spread };
}
// Resultado de un hoyo: 1 lo gano yo, −1 lo gana el rival, 0 empatado, null aún sin decidir.
function matchHoleResult(r, i, ms) {
  const m = r.match; if (!m || !m.holes[i]) return null;
  const c = m.holes[i].conc;
  if (c === 'me') return -1;      // yo concedo el hoyo → lo gana el rival
  if (c === 'rival') return 1;    // el rival me lo concede → lo gano yo
  const my = r.holes[i].strokes, rv = m.holes[i].strokes;
  if (!my || !rv) return null;
  ms = ms || matchStrokes(r);
  const a = my - ms.me[i], b = rv - ms.rival[i];
  return a < b ? 1 : a > b ? -1 : 0;
}
// Estado del partido. `up` > 0 = voy ganando por esos hoyos.
// El partido se cierra cuando la ventaja es mayor que los hoyos que quedan (de ahí el "3&2").
function matchState(r) {
  const n = r.pars.length, ms = matchStrokes(r);
  const res = []; const run = [];
  let up = 0, decided = 0, closedAt = -1, closedUp = 0, closedLeft = 0;
  for (let i = 0; i < n; i++) {
    const x = matchHoleResult(r, i, ms);
    res.push(x);
    if (x !== null) { decided++; up += x; }
    run.push(x === null ? null : up);
    if (closedAt < 0 && x !== null && Math.abs(up) > n - (i + 1)) {
      closedAt = i; closedUp = up; closedLeft = n - (i + 1);
    }
  }
  const remaining = n - decided;
  return { res, run, up, decided, remaining, ms,
    closed: closedAt >= 0, closedAt, closedUp, closedLeft,
    dormie: closedAt < 0 && up !== 0 && Math.abs(up) === remaining && remaining > 0 };
}
function matchLabel(st) { return st.up === 0 ? 'Iguales' : Math.abs(st.up) + (st.up > 0 ? ' arriba' : ' abajo'); }
function matchShort(v) { return v === 0 ? 'AS' : Math.abs(v) + (v > 0 ? '↑' : '↓'); }
function matchColor(v) { return v > 0 ? 'var(--good)' : v < 0 ? 'var(--bad)' : 'var(--text)'; }
// Marcador final al estilo clásico: "3&2", "1 arriba", "Empate".
function matchFinalText(st) {
  if (st.closed) return Math.abs(st.closedUp) + '&' + st.closedLeft;
  if (st.up === 0) return 'Empate';
  return Math.abs(st.up) + (st.up > 0 ? ' arriba' : ' abajo');
}
// Una sola palabra para el marcador: Ganas / Pierdes / Empate / Sin terminar.
function matchOutcomeWord(st) {
  if (st.closed) return st.closedUp > 0 ? 'Ganas' : 'Pierdes';
  if (st.remaining > 0) return st.decided ? 'Sin terminar' : '—';
  return st.up === 0 ? 'Empate' : st.up > 0 ? 'Ganas' : 'Pierdes';
}
// Frase de resultado: "Ganas 3&2" / "Pierdes por 2" / "Empate" (o el estado si sigue vivo).
function matchVerdict(st) {
  const win = st.closed ? st.closedUp > 0 : st.up > 0;
  if (st.closed) return (win ? 'Ganas ' : 'Pierdes ') + Math.abs(st.closedUp) + '&' + st.closedLeft;
  if (st.remaining > 0) return matchLabel(st) + (st.dormie ? ' (dormie)' : '');
  if (st.up === 0) return 'Empate';
  return (win ? 'Ganas por ' : 'Pierdes por ') + Math.abs(st.up) + (Math.abs(st.up) === 1 ? ' hoyo' : ' hoyos');
}

/* ---------- Gráficos (offline SVG) ---------- */
function svgLine(vals, opts) {
  opts = opts || {};
  const W = 320, H = 92, padX = 10, padTop = 12, padBot = 14;
  if (!vals.length) return '';
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (opts.includeZero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  if (mn === mx) { mn -= 1; mx += 1; }
  const px = i => padX + (vals.length === 1 ? (W - 2 * padX) / 2 : i * (W - 2 * padX) / (vals.length - 1));
  const py = v => padTop + (mx - v) / (mx - mn) * (H - padTop - padBot);
  const pts = vals.map((v, i) => [px(i), py(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const color = opts.color || 'var(--fairway)';
  const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${H - padBot} L ${pts[0][0].toFixed(1)} ${H - padBot} Z`;
  let zero = '';
  if (opts.includeZero && mn < 0 && mx > 0) {
    const zy = py(0).toFixed(1);
    zero = `<line x1="${padX}" y1="${zy}" x2="${W - padX}" y2="${zy}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 3"/>`;
  }
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible" preserveAspectRatio="none">
    <defs><linearGradient id="pg${opts.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.20"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${zero}<path d="${area}" fill="url(#pg${opts.id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" fill="${color}"/></svg>`;
}

/* ---------- Mini-mapa de campo (offline, sin salir de la app) ---------- */
function projectPt(lat, lon, isCanary) {
  const P = isCanary ? SPAIN_MAP.canaryProj : SPAIN_MAP.proj;
  const x = lon * Math.cos(P.lat0 * Math.PI / 180), y = -lat;
  return [(x - P.mnx) * P.s + P.ox, (y - P.mny) * P.s + P.oy];
}
function courseMiniMap(prov, lat, lon) {
  const ck = provKey(prov);
  const pe = SPAIN_MAP.provs.find(p => p.ck === ck);
  if (!pe) return '';
  const nums = (pe.d.match(/-?\d+\.?\d*/g) || []).map(Number);
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  const isCanary = SPAIN_MAP.canaryKeys.includes(ck);
  let mk = '', mx, my;
  if (lat != null && lon != null) {
    [mx, my] = projectPt(lat, lon, isCanary);
    minx = Math.min(minx, mx); maxx = Math.max(maxx, mx);
    miny = Math.min(miny, my); maxy = Math.max(maxy, my);
  }
  const pad = Math.max(maxx - minx, maxy - miny) * 0.14 + 4;
  const vbW = maxx - minx + 2 * pad, vbH = maxy - miny + 2 * pad;
  const r = vbW * 0.035;
  if (lat != null && lon != null)
    mk = `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${r.toFixed(1)}" fill="var(--birdie)" stroke="#fff" stroke-width="${(r * 0.35).toFixed(1)}"/>`;
  return `<svg class="mini-svg" viewBox="${(minx - pad).toFixed(1)} ${(miny - pad).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" preserveAspectRatio="xMidYMid meet">
    <path d="${pe.d}" fill="rgb(219,234,227)" stroke="var(--fairway)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>${mk}</svg>`;
}
// Resuelve coordenadas de un campo: guardadas o, si no, desde el catálogo por nombre.
function courseCoords(c) {
  let lat = c.lat, lon = c.lon, prov = (c.loc || '').split('·').pop().trim();
  if (lat == null || lon == null) {
    const cat = GOLF_CATALOG.find(x => x.n === c.name);
    if (cat && cat.lat != null) { lat = cat.lat; lon = cat.lon; prov = cat.p; }
  }
  return (lat != null && lon != null) ? { lat, lon, prov } : null;
}

function renderProgress() {
  const box = $('#progress'), sec = $('#progressSec');
  const done = rounds.filter(r => roundTotals(r).played > 0);
  if (!done.length) { sec.style.display = 'none'; box.innerHTML = ''; return; }
  sec.style.display = '';
  const chrono = [...done].reverse(); // antiguo -> reciente
  const vspar = chrono.map(r => roundTotals(r).vsPar);
  const putts = chrono.map(r => { const t = roundTotals(r); return t.played ? +(t.putts / t.played).toFixed(2) : 0; });
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  done.forEach(r => r.holes.forEach((h, i) => {
    if (!h.strokes) return;
    const d = h.strokes - r.pars[i];
    if (d <= -2) dist.eagle++; else if (d === -1) dist.birdie++; else if (d === 0) dist.par++; else if (d === 1) dist.bogey++; else dist.double++;
  }));
  const segs = [['Eagle', dist.eagle, 'var(--eagle)'], ['Birdie', dist.birdie, 'var(--birdie)'], ['Par', dist.par, 'var(--par)'], ['Bogey', dist.bogey, 'var(--bogey)'], ['Doble+', dist.double, 'var(--double)']];
  const tot = segs.reduce((a, s) => a + s[1], 0) || 1;

  box.innerHTML = `
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Evolución vs par</span>
        <span class="prog-cur tnum" style="color:${vspar[vspar.length-1] < 0 ? 'var(--birdie)' : vspar[vspar.length-1] > 0 ? 'var(--bogey)' : 'var(--text)'}">${fmtVsPar(vspar[vspar.length-1])}</span></div>
      ${svgLine(vspar, { id: 'vp', includeZero: true })}
      <div class="prog-sub">${done.length} ronda${done.length === 1 ? '' : 's'} · mejor ${fmtVsPar(Math.min(...vspar))}</div>
    </div>
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Putts por hoyo</span>
        <span class="prog-cur tnum">${putts[putts.length-1].toFixed(2)}</span></div>
      ${svgLine(putts, { id: 'pt', color: 'var(--fairway-2)' })}
      <div class="prog-sub">media ${(putts.reduce((a,b)=>a+b,0)/putts.length).toFixed(2)} · mejor ${Math.min(...putts).toFixed(2)}</div>
    </div>
    <div class="prog-card">
      <div class="prog-head"><span class="prog-title">Reparto de resultados</span><span class="prog-sub">${tot} hoyos</span></div>
      <div class="dist-bar">${segs.filter(s => s[1]).map(s => `<span style="width:${(s[1]/tot*100).toFixed(1)}%;background:${s[2]}"></span>`).join('')}</div>
      <div class="dist-legend">${segs.map(s => `<span class="dl"><span class="dot" style="background:${s[2]}"></span>${s[0]} <b class="tnum">${s[1]}</b></span>`).join('')}</div>
    </div>`;
}

