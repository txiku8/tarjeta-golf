"use strict";
function renderHistorial() {
  resumeBannerInto($('#resumeBanner'));
  const hist = $('#history'); hist.innerHTML = '';
  if (!rounds.length) {
    hist.appendChild(el('div', 'empty', 'Aún no has guardado ninguna ronda.<br>Ve a <b>Jugar</b>, elige un campo y empieza.'));
    return;
  }
  rounds.forEach(r => {
    const t = roundTotals(r);
    const cls = t.vsPar < 0 ? 'up' : t.vsPar > 0 ? 'dn' : '';
    const row = el('button', 'round-row');
    row.innerHTML = `
      <div class="round-score tnum">${t.strokes}</div>
      <div class="round-info">
        <div class="n">${esc(r.courseName)}</div>
        <div class="d">${fmtDate(r.date)} · ${t.played} hoyos · ${t.putts} putts</div>
      </div>
      <span class="pill ${cls}">${fmtVsPar(t.vsPar)}</span>`;
    row.onclick = () => resumeRound(r);
    hist.appendChild(row);
  });
}

/* ---------- TAB: Rendimiento ---------- */
