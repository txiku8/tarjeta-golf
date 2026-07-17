"use strict";
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const uid = () => 'x' + Math.abs(Date.now() + Math.floor(performance.now()*1000)).toString(36) + Math.floor(performance.now()%1000);
const LS = { courses: 'golf_courses_v1', rounds: 'golf_rounds_v1', active: 'golf_active_v1', profile: 'golf_profile_v1', wasSignedIn: 'golf_signed_in_v1' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (cloudMode && !applyingSnapshot && (k === LS.courses || k === LS.rounds)) scheduleCloudPush();
};

/* ---------- Estado nube (Firebase) ---------- */
const FB_CONFIG = { apiKey: 'AIzaSyCnXV2YozY6RDfc971cZPp_5-jqkUT1jCc', authDomain: 'tarjeta-golf-txiku.firebaseapp.com', projectId: 'tarjeta-golf-txiku', storageBucket: 'tarjeta-golf-txiku.firebasestorage.app', messagingSenderId: '667980098164', appId: '1:667980098164:web:ebf403b72f5eb1ec9d3f21' };
const CLOUD_ENABLED = /(^|\.)(web\.app|firebaseapp\.com)$/.test(location.hostname) && typeof firebase !== 'undefined';
let cloudMode = false, cloudUser = null, cloudUnsub = null, pushTimer = null, applyingSnapshot = false, localChosen = false, appStarted = false, firstSnap = true;
function scheduleCloudPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!cloudUser) { if (cloudMode) scheduleCloudPush(); return; } // aún resolviendo la sesión: reintenta
    firebase.firestore().collection('users').doc(cloudUser.uid)
      .set({ courses, rounds, updated: Date.now() }, { merge: true }).catch(e => console.warn('push', e));
  }, 700);
}

