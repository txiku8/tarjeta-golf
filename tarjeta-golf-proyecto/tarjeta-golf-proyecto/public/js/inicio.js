"use strict";
function startApp() {
  $('#authView').classList.remove('show');
  if (!appStarted) { appStarted = true; showTab('jugar'); }
  else if ($('#viewRound').classList.contains('hidden')) renderTab(curTab); // refresca con datos de la nube (salvo en ronda)
}
function subscribeCloud(uid) {
  const ref = firebase.firestore().collection('users').doc(uid);
  firstSnap = true;
  cloudUnsub = ref.onSnapshot(snap => {
    if (snap.exists) {
      const d = snap.data() || {};
      applyingSnapshot = true;
      courses = Array.isArray(d.courses) ? d.courses : [];
      rounds = Array.isArray(d.rounds) ? d.rounds : [];
      localStorage.setItem(LS.courses, JSON.stringify(courses));
      localStorage.setItem(LS.rounds, JSON.stringify(rounds));
      applyingSnapshot = false;
      migrateCourses(); // aplica par real / stroke index a campos añadidos antes del cambio y re-sube si cambia
    } else if (firstSnap) {
      ref.set({ courses, rounds, updated: Date.now() }, { merge: true }).catch(() => {}); // primer login: sube lo local
    }
    firstSnap = false;
    startApp();
  }, err => { console.warn('snap', err); startApp(); });
}
function initCloud() {
  firebase.initializeApp(FB_CONFIG);
  firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
  const auth = firebase.auth();
  auth.onAuthStateChanged(user => {
    if (user) {
      cloudUser = user; cloudMode = true; localChosen = false;
      subscribeCloud(user.uid);
    } else {
      cloudUser = null; cloudMode = false;
      if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
      if (!localChosen) $('#authView').classList.add('show');
    }
  });
  $('#btnGoogle').onclick = () => {
    $('#authErr').textContent = '';
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => {
      $('#authErr').textContent = e.code === 'auth/operation-not-allowed'
        ? 'El login con Google aún no está activado en Firebase.'
        : (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' ? '' : (e.message || 'Error al entrar'));
    });
  };
  $('#btnLocal').onclick = () => { localChosen = true; cloudMode = false; startApp(); };
  $('#btnDemo').onclick = () => { localChosen = true; cloudMode = false; loadDemo(); startApp(); };
}

/* ---------- Barra de pestañas ---------- */
$('#tabbar').querySelectorAll('.tabbtn').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- boot ---------- */
if (CLOUD_ENABLED) { $('#authView').classList.add('show'); initCloud(); }
else showTab('jugar'); // servidor local / Artifact: modo local como hasta ahora
