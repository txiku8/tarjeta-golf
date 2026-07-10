"use strict";
function renderRendimiento() {
  const last = rounds.slice(0, 20);
  const agg = last.reduce((a, r) => {
    const t = roundTotals(r);
    a.strokes += t.strokes; a.par += t.par; a.putts += t.putts; a.played += t.played;
    a.firHit += t.firHit; a.firPoss += t.firPoss; a.gir += t.gir; a.girPoss += t.girPoss;
    return a;
  }, { strokes: 0, par: 0, putts: 0, played: 0, firHit: 0, firPoss: 0, gir: 0, girPoss: 0 });
  const puttsPer = agg.played ? (agg.putts / agg.played) : 0;
  const stats = [
    { k: 'Rondas', v: rounds.length },
    { k: 'Media vs par', v: agg.played ? fmtVsPar(Math.round((agg.strokes - agg.par) / (last.length || 1))) : '—', sub: '/ ronda' },
    { k: 'Putts / hoyo', v: agg.played ? puttsPer.toFixed(2) : '—' },
    { k: 'Calles', v: agg.firPoss ? Math.round(agg.firHit / agg.firPoss * 100) + '%' : '—' },
  ];
  const sr = $('#homeStats'); sr.innerHTML = '';
  stats.forEach(s => {
    const d = el('div', 'stat');
    d.innerHTML = `<div class="k">${s.k}</div><div class="v tnum">${s.v}${s.sub ? ' <small>' + s.sub + '</small>' : ''}</div>`;
    sr.appendChild(d);
  });
  renderProgress();
}

/* ---------- TAB: Jugar ---------- */
