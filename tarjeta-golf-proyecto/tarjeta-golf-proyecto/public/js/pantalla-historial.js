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
    // En match play la fila muestra el marcador del partido (3&2, 1 arriba…) en vez del vs par.
    const mst = isMatch(r) ? matchState(r) : null;
    const mUp = mst ? (mst.closed ? mst.closedUp : mst.up) : 0;
    const cls = mst ? (mUp > 0 ? 'up' : mUp < 0 ? 'dn' : '') : (t.vsPar < 0 ? 'up' : t.vsPar > 0 ? 'dn' : '');
    const item = el('div', 'round-item');
    const del = el('button', 'round-delete', 'Borrar');
    del.onclick = (e) => { e.stopPropagation(); deleteRound(r.id); };
    const row = el('button', 'round-row');
    row.innerHTML = `
      <div class="round-score tnum">${t.strokes}</div>
      <div class="round-info">
        <div class="n">${esc(r.courseName)}</div>
        <div class="d">${fmtDate(r.date)} · ${t.played} hoyos · ${mst ? 'vs ' + esc(r.match.rival) : t.putts + ' putts'}</div>
      </div>
      <span class="pill ${cls}">${mst ? matchFinalText(mst) : fmtVsPar(t.vsPar)}</span>`;
    attachRowSwipe(item, row, del, () => showRoundSummary(r, true));
    item.appendChild(del);
    item.appendChild(row);
    hist.appendChild(item);
  });
}

/* Deslizar una fila del historial a la izquierda hace aparecer el botón "Borrar" por encima. */
let openHistItem = null;
function closeOpenHistItem() {
  if (openHistItem) { openHistItem.classList.remove('open'); const d = openHistItem.querySelector('.round-delete'); if (d) d.style.transform = ''; openHistItem = null; }
}
function attachRowSwipe(item, row, del, onTap) {
  const OPEN = 92, THRESH = 46;
  let startX = 0, startY = 0, off = OPEN, dragging = false, decided = false, horiz = false, moved = false;
  const setOpen = (o) => {
    if (o) { if (openHistItem && openHistItem !== item) closeOpenHistItem(); openHistItem = item; item.classList.add('open'); del.style.transform = ''; }
    else { if (openHistItem === item) openHistItem = null; item.classList.remove('open'); del.style.transform = ''; }
  };
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY; dragging = true; decided = false; horiz = false; moved = false;
  });
  row.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mx) > 8 || Math.abs(my) > 8) { decided = true; horiz = Math.abs(mx) > Math.abs(my); if (horiz) { try { row.setPointerCapture(e.pointerId); } catch (_) {} } }
    }
    if (!horiz) return;
    e.preventDefault();
    moved = true;
    const base = item.classList.contains('open') ? 0 : OPEN;
    off = Math.max(0, Math.min(OPEN, base + mx));
    del.style.transition = 'none';
    del.style.transform = 'translateX(' + off + 'px)';
  });
  const end = () => {
    if (!dragging) return; dragging = false;
    del.style.transition = '';
    if (horiz) setOpen(off < OPEN - THRESH);
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    if (item.classList.contains('open')) { setOpen(false); return; }
    onTap();
  });
}

function deleteRound(id) {
  const idx = rounds.findIndex(r => r.id === id);
  if (idx < 0) return;
  rounds.splice(idx, 1);
  save(LS.rounds, rounds);
  openHistItem = null;
  renderHistorial();
  toast('Ronda borrada');
}

/* ---------- TAB: Rendimiento ---------- */
