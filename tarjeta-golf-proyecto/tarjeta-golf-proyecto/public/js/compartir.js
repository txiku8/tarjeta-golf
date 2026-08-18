"use strict";
/* ---------- Compartir la tarjeta como imagen ----------
   Al acabar la partida lo natural es mandarla al grupo. Aquí la tarjeta se dibuja en un canvas
   (nada de librerías: funciona sin cobertura) y se pasa a navigator.share, que abre el menú de
   compartir del móvil con WhatsApp, Telegram, correo… Donde no exista, se descarga el PNG.
   El formato es vertical (1080 px de ancho) porque es como se ve en el chat. */

const SH_W = 1080, SH_PAD = 56, SH_LABW = 132;
const SH_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/* Los canvas no entienden las variables CSS: se resuelven contra el documento. Algunas apuntan
   a otra variable (--par → --text), así que se sigue la cadena. */
const shCssCache = new Map();
function shColor(v) {
  let s = String(v || '#000').trim();
  for (let i = 0; i < 4; i++) {
    const m = /^var\((--[\w-]+)\)$/.exec(s);
    if (!m) return s;
    if (!shCssCache.has(m[1])) shCssCache.set(m[1], getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#000');
    s = shCssCache.get(m[1]);
  }
  return s;
}
function shFont(ctx, size, weight) { ctx.font = (weight || 700) + ' ' + size + 'px ' + SH_FONT; }
function shRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// Escribe una línea; devuelve el ancho ocupado. `align`: 'left' | 'center' | 'right'.
function shTxt(ctx, txt, x, y, size, weight, color, align) {
  shFont(ctx, size, weight);
  ctx.fillStyle = shColor(color);
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(txt), x, y);
  return ctx.measureText(String(txt)).width;
}
// Parte un título largo en como mucho `max` líneas que quepan en `w`.
function shWrap(ctx, txt, size, weight, w, max) {
  shFont(ctx, size, weight);
  const words = String(txt).split(' ');
  const lines = [];
  let cur = '';
  for (const p of words) {
    const t = cur ? cur + ' ' + p : p;
    if (ctx.measureText(t).width > w && cur) { lines.push(cur); cur = p; } else cur = t;
    if (lines.length === max - 1 && ctx.measureText(cur).width > w) break;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, max);
}

/* Bloque de nueve hoyos: cabecera con los números y una fila por dato (par, metros, golpes…).
   `rows` = [{ label, cell(i) -> {txt, bg}, sum }]. Devuelve la Y por debajo del bloque. */
function shNine(ctx, idxs, rows, sumLabel, y) {
  const nCols = idxs.length + 1;                       // hoyos + la columna del parcial
  const colW = (SH_W - 2 * SH_PAD - SH_LABW) / nCols;
  const x0 = SH_PAD + SH_LABW;
  const cx = k => x0 + colW * k + colW / 2;
  const headH = 54, rowH = 68;
  const totH = headH + rows.length * rowH;

  ctx.save();
  shRect(ctx, SH_PAD, y, SH_W - 2 * SH_PAD, totH, 22);
  ctx.fillStyle = shColor('var(--surface)');
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = shColor('var(--line)');
  ctx.stroke();
  ctx.clip();   // que nada se salga de las esquinas redondeadas

  // cabecera con el número de cada hoyo
  ctx.fillStyle = shColor('var(--surface-2)');
  ctx.fillRect(SH_PAD, y, SH_W - 2 * SH_PAD, headH);
  shTxt(ctx, 'HOYO', SH_PAD + 22, y + headH / 2 + 9, 22, 800, 'var(--muted)');
  idxs.forEach((h, k) => shTxt(ctx, h.no, cx(k), y + headH / 2 + 10, 27, 800, 'var(--text)', 'center'));
  shTxt(ctx, sumLabel, cx(nCols - 1), y + headH / 2 + 10, 24, 800, 'var(--muted)', 'center');

  rows.forEach((row, ri) => {
    const ry = y + headH + ri * rowH;
    if (ri) {
      ctx.beginPath(); ctx.moveTo(SH_PAD, ry); ctx.lineTo(SH_W - SH_PAD, ry);
      ctx.strokeStyle = shColor('var(--line)'); ctx.lineWidth = 1.5; ctx.stroke();
    }
    shTxt(ctx, row.label, SH_PAD + 22, ry + rowH / 2 + 10, 25, 700, 'var(--muted)');
    idxs.forEach((h, k) => {
      const c = row.cell(h.i);
      const mid = ry + rowH / 2;
      if (c.bg) {   // resultado: bolita de color con el número dentro
        ctx.beginPath(); ctx.arc(cx(k), mid, 25, 0, Math.PI * 2);
        ctx.fillStyle = shColor(c.bg); ctx.fill();
        shTxt(ctx, c.txt, cx(k), mid + 10, 28, 800, '#fff', 'center');
      } else {
        shTxt(ctx, c.txt, cx(k), mid + 10, c.small ? 23 : 27, c.small ? 700 : 800,
          c.color || (c.small ? 'var(--muted)' : 'var(--text)'), 'center');
      }
    });
    shTxt(ctx, row.sum, cx(nCols - 1), ry + rowH / 2 + 10, 27, 800, 'var(--text)', 'center');
  });
  ctx.restore();
  return y + totH;
}

// Dibuja la tarjeta entera de la ronda `r` y devuelve el canvas.
function roundShareCanvas(r) {
  const t = roundTotals(r);
  const recv = golfStrokesReceived(r);
  const mts = roundMetres(r);
  const hno = i => (r.holeStart || 1) + i;
  const stb = r.mode === 'stableford';
  const mst = anyMatchState(r);
  const team = isFourball(r);
  const ft = fbIsStb(r) ? fbTotals(r) : null;

  const all = r.holes.map((_, i) => ({ i, no: hno(i) }));
  const front = all.filter(h => h.no <= 9), back = all.filter(h => h.no >= 10);
  const bloques = [front, back].filter(b => b.length);

  // --- filas de cada bloque ---
  const sum = (idxs, fn) => idxs.reduce((a, h) => a + (fn(h.i) || 0), 0);
  const dash = v => v || '–';
  const filasDe = idxs => {
    const rows = [
      { label: 'Par', cell: i => ({ txt: r.pars[i], small: true }), sum: sum(idxs, i => r.pars[i]) },
    ];
    if (mts) rows.push({ label: 'Metros', cell: i => ({ txt: mts[i], small: true }), sum: sum(idxs, i => mts[i]) });
    rows.push({
      label: mst || team ? 'Yo' : 'Golpes',
      cell: i => { const s = r.holes[i].strokes;
        return s ? { txt: s, bg: scoreColor(s, r.pars[i]) } : { txt: '·', small: true }; },
      sum: dash(sum(idxs, i => r.holes[i].strokes)),
    });
    if (team) {
      const f = r.fb;
      rows.push({ label: shortName(f.partner, 8), cell: i => { const s = f.holes[i].strokes;
        return s ? { txt: s, bg: scoreColor(s, r.pars[i]) } : { txt: '·', small: true }; },
        sum: dash(sum(idxs, i => f.holes[i].strokes)) });
      if (fbIsMatch(r)) rows.push({ label: shortName(f.rivals, 8), cell: i => { const s = f.rivalHoles[i].strokes;
        return s ? { txt: s, bg: scoreColor(s, r.pars[i]) } : { txt: '·', small: true }; },
        sum: dash(sum(idxs, i => f.rivalHoles[i].strokes)) });
    } else if (mst) {
      const m = r.match;
      rows.push({ label: shortName(m.rival, 8), cell: i => { const s = m.holes[i].strokes;
        return s ? { txt: s, bg: scoreColor(s, r.pars[i]) } : { txt: '·', small: true }; },
        sum: dash(sum(idxs, i => m.holes[i].strokes)) });
    }
    rows.push({ label: 'Putts', cell: i => ({ txt: r.holes[i].strokes ? r.holes[i].putts : '·', small: true }),
      sum: sum(idxs, i => r.holes[i].putts) });
    if (stb || ft) {
      const pts = i => { if (ft) { const p = fbHolePoints(r, i).team; return p === null ? 0 : p; }
        return r.holes[i].strokes ? Math.max(0, 2 + (r.pars[i] + recv[i]) - r.holes[i].strokes) : 0; };
      rows.push({ label: ft ? 'Pts pareja' : 'Puntos', cell: i => ({ txt: r.holes[i].strokes ? pts(i) : '·', small: true }),
        sum: sum(idxs, pts) });
    }
    return rows;
  };

  // --- alto total: se calcula antes para dimensionar el canvas ---
  const HEAD_H = 300, HERO_H = 196, STATS_H = 178, FOOT_H = 96, GAP = 26;
  const bloqueH = idxs => 54 + filasDe(idxs).length * 68;
  const H = HEAD_H + HERO_H + GAP + bloques.reduce((a, b) => a + bloqueH(b) + GAP, 0) + STATS_H + FOOT_H;

  const cv = document.createElement('canvas');
  cv.width = SH_W; cv.height = Math.round(H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = shColor('var(--bg)');
  ctx.fillRect(0, 0, cv.width, cv.height);

  // --- cabecera ---
  let y = 84;
  shTxt(ctx, '⛳ TARJETA DE GOLF', SH_PAD, y, 24, 800, 'var(--indigo)');
  y += 62;
  const lineas = shWrap(ctx, r.courseName, 54, 800, SH_W - 2 * SH_PAD, 2);
  lineas.forEach(l => { shTxt(ctx, l, SH_PAD, y, 54, 800, 'var(--text)'); y += 62; });
  const modeLbl = modeName(r) + (team ? ' con ' + r.fb.partner : '') + (mst ? ' vs ' + oppName(r) : '');
  shTxt(ctx, fmtDate(r.date) + ' · ' + t.played + ' hoyos · ' + modeLbl, SH_PAD, y, 26, 600, 'var(--muted)');
  y = HEAD_H;

  // --- resultado principal ---
  const heroBg = mst ? ((mst.closed ? mst.closedUp : mst.up) > 0 ? 'var(--good)'
    : (mst.closed ? mst.closedUp : mst.up) < 0 ? 'var(--bad)' : 'var(--indigo)') : 'var(--indigo)';
  shRect(ctx, SH_PAD, y, SH_W - 2 * SH_PAD, HERO_H - 20, 26);
  ctx.fillStyle = shColor(heroBg); ctx.fill();
  const heroK = mst ? 'PARTIDO' : ft ? 'PUNTOS PAREJA' : stb ? 'PUNTOS' : 'GOLPES';
  const heroV = mst ? matchFinalText(mst) : ft ? ft.team : stb ? t.stb : t.strokes;
  shTxt(ctx, heroK, SH_PAD + 34, y + 52, 22, 800, 'rgba(255,255,255,.75)');
  shTxt(ctx, heroV, SH_PAD + 34, y + 132, 84, 800, '#fff');
  // A la derecha, tres datos de apoyo. Se descarta el que ya es el número grande para no
  // repetirlo (en Medal el hero ya son los golpes, así que ahí entra otro dato).
  const sub = [
    mst ? ['RESULTADO', matchOutcomeWord(mst, team)] : null,
    ['VS PAR', fmtVsPar(t.vsPar)],
    ['GOLPES', String(t.strokes)],
    r.hcp ? ['HÁNDICAP', fmtHcp(r.hcp)] : null,
    ['PUTTS', String(t.putts)],
  ].filter(c => c && c[0] !== heroK).slice(0, 3);
  sub.forEach((s, k) => {
    const sx = SH_W - SH_PAD - 34 - (sub.length - 1 - k) * 168;
    shTxt(ctx, s[0], sx, y + 62, 19, 800, 'rgba(255,255,255,.7)', 'right');
    shTxt(ctx, s[1], sx, y + 112, 40, 800, '#fff', 'right');
  });
  y += HERO_H + GAP - 20;

  // --- los nueves ---
  bloques.forEach((b, k) => {
    y = shNine(ctx, b, filasDe(b), b[0].no <= 9 ? 'OUT' : 'IN', y) + GAP;
  });

  // --- estadísticas ---
  const tiles = [
    ['Calles', t.firPoss ? t.firPct + '%' : '—', t.firPoss ? t.firHit + '/' + t.firPoss : 'par 3'],
    ['Greens', t.girPoss ? t.girPct + '%' : '—', t.gir + '/' + t.girPoss],
    ['Putts', String(t.putts), t.played ? (t.putts / t.played).toFixed(2).replace('.', ',') + ' por hoyo' : ''],
    t.driveN ? ['Salida', t.driveAvg + ' m', 'media de ' + t.driveN]
      : ['Scrambling', t.scrPoss ? t.scrPct + '%' : '—', t.scrPoss ? t.scr + '/' + t.scrPoss : 'todos los greens'],
  ];
  const tw = (SH_W - 2 * SH_PAD - 3 * 16) / 4;
  tiles.forEach((tl, k) => {
    const tx = SH_PAD + k * (tw + 16);
    shRect(ctx, tx, y, tw, STATS_H - 26, 20);
    ctx.fillStyle = shColor('var(--surface)'); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = shColor('var(--line)'); ctx.stroke();
    shTxt(ctx, tl[0].toUpperCase(), tx + tw / 2, y + 44, 19, 800, 'var(--muted)', 'center');
    shTxt(ctx, tl[1], tx + tw / 2, y + 100, 42, 800, 'var(--text)', 'center');
    shTxt(ctx, tl[2], tx + tw / 2, y + 132, 19, 700, 'var(--muted)', 'center');
  });
  y += STATS_H;

  // --- pie ---
  shTxt(ctx, (r.courseLoc || '') + (r.barra ? ' · ' + r.barra : ''), SH_PAD, y + 22, 22, 700, 'var(--muted)');
  shTxt(ctx, 'tarjeta-golf-txiku.web.app', SH_W - SH_PAD, y + 22, 22, 700, 'var(--muted)', 'right');
  return cv;
}

/* Comparte la imagen. En el móvil abre el menú del sistema; si el navegador no sabe compartir
   archivos (escritorio, Firefox…), descarga el PNG para poder adjuntarlo a mano. */
function shareRound(r) {
  let cv;
  try { cv = roundShareCanvas(r); }
  catch (e) { console.warn('share', e); toast('No se ha podido crear la imagen'); return; }
  const t = roundTotals(r);
  const mst = anyMatchState(r);
  const nombre = 'tarjeta-' + norm(r.courseName).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.png';
  const texto = r.courseName + ' · ' + fmtDate(r.date) + ' · '
    + (mst ? matchFinalText(mst) + ' vs ' + oppName(r) : t.strokes + ' golpes (' + fmtVsPar(t.vsPar) + ')');
  cv.toBlob(blob => {
    if (!blob) { toast('No se ha podido crear la imagen'); return; }
    const file = new File([blob], nombre, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: texto }).catch(() => {});
      return;
    }
    const a = el('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Tarjeta descargada');
  }, 'image/png');
}
