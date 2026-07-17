"use strict";
const YO_ICO = {
  export: '<svg viewBox="0 0 24 24"><path d="M12 3v12"></path><polyline points="8 7 12 3 16 7"></polyline><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"></path></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M12 15V3"></path><polyline points="8 11 12 15 16 11"></polyline><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"></path></svg>',
  trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"></path><path d="M10 11v6M14 11v6"></path></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
};
function renderYo() {
  const box = $('#yoContent'); box.innerHTML = '';
  const email = cloudMode && cloudUser ? (cloudUser.email || '') : null;
  const photo = cloudMode && cloudUser && cloudUser.photoURL ? cloudUser.photoURL : null;
  const name = email ? ((cloudUser.displayName || email.split('@')[0])) : 'Modo local';
  const hero = el('div', 'profile-hero');
  hero.innerHTML = `
    <div class="profile-av">${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : (email ? esc(email[0].toUpperCase()) : '⛳')}</div>
    <div style="min-width:0">
      <div class="profile-name">${esc(name)}</div>
      <div class="profile-sub">${email ? esc(email) + ' · sincronizando en la nube' : 'Datos solo en este dispositivo'}</div>
    </div>`;
  box.appendChild(hero);

  renderPlayerCard(box, name);

  const list = el('div', 'yo-list');
  const mk = (label, ico, cls) => {
    const b = el('button', 'yo-item' + (cls ? ' ' + cls : ''));
    b.innerHTML = `<span class="ico">${ico}</span><span>${label}</span><span class="chev">›</span>`;
    return b;
  };
  const bExport = mk('Exportar copia (.json)', YO_ICO.export);
  const bImport = mk('Importar copia', YO_ICO.import);
  const bReset = mk('Borrar todo', YO_ICO.trash, 'danger');
  list.append(bExport, bImport, bReset);
  let bOut = null;
  if (cloudMode) { bOut = mk('Cerrar sesión', YO_ICO.out, 'danger'); list.appendChild(bOut); }
  box.appendChild(list);
  box.appendChild(el('p', '', 'Exporta de vez en cuando para no perder tus datos.'));
  box.lastChild.style.cssText = 'color:var(--muted);font-size:13px;margin:16px 4px 0';

  bExport.onclick = () => {
    const blob = new Blob([JSON.stringify({ courses, rounds, v: 1 }, null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob);
    a.download = 'tarjeta-golf-backup.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  bImport.onclick = () => $('#mFile').click();
  $('#mFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.courses) { courses = d.courses; save(LS.courses, courses); }
        if (d.rounds) { rounds = d.rounds; save(LS.rounds, rounds); }
        migrateCourses(); renderTab(curTab); toast('Datos importados ✓');
      } catch { toast('Archivo no válido'); }
      e.target.value = '';
    };
    rd.readAsText(f);
  };
  bReset.onclick = () => {
    if (!confirm('¿Borrar TODOS los campos y rondas? No se puede deshacer.')) return;
    localStorage.clear(); location.reload();
  };
  if (bOut) bOut.onclick = () => firebase.auth().signOut();
}

/* Ficha de jugador: nº de licencia y hándicap RFEG (leído solo, se actualiza tras jugar).
   El valor lo escribe un robot en handicap.json; aquí solo se muestra. */
function renderPlayerCard(box, accountName) {
  const card = el('div', 'golf-card');
  box.appendChild(card);
  const paint = (d) => {
    if (!d || !d.handicap) { card.style.display = 'none'; return; }
    card.style.display = '';
    const foot = d.fecha ? `Hándicap RFEG · actualizado ${esc(d.fecha)}` : 'Hándicap RFEG';
    card.innerHTML = `
      <div class="gc-top">${sicon('flag')} Licencia de golf</div>
      <div class="gc-name">${esc(d.nombre || accountName || 'Jugador')}</div>
      <div class="gc-fields">
        <div class="gc-field big"><div class="k">Hándicap</div><div class="v tnum">${esc(d.handicap)}</div></div>
        <div class="gc-field"><div class="k">Nº licencia</div><div class="v tnum">${esc(d.licencia || '—')}</div></div>
        ${d.estado ? `<div class="gc-field"><div class="k">Estado</div><div class="v">${esc(d.estado)}</div></div>` : ''}
      </div>
      <div class="gc-foot">${foot}</div>`;
  };
  // pinta ya con la copia local (arranque instantáneo)
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('golf_hcp_v1')); } catch {}
  paint(cached);

  // Solo refresca la PRIMERA vez que se abre la app en el día; el resto usa la copia guardada.
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('golf_hcp_day') === today) return;
  // El robot (GitHub Actions) actualiza handicap.json en el repo; se lee de ahí (raw) y,
  // si falla, del propio hosting (copia semilla).
  const RAW = 'https://raw.githubusercontent.com/txiku8/tarjeta-golf/main/tarjeta-golf-proyecto/tarjeta-golf-proyecto/public/handicap.json';
  const grab = url => fetch(url, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject());
  grab(RAW).catch(() => grab('handicap.json'))
    .then(d => {
      if (d) { localStorage.setItem('golf_hcp_v1', JSON.stringify(d)); localStorage.setItem('golf_hcp_day', today); paint(d); }
    })
    .catch(() => {});
}

/* ---------- utils ---------- */
