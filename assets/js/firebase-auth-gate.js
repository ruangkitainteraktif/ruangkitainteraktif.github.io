import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDubhn2QyQ4lLcny9Y_vZY-b4p8v7Q2ugI',
  authDomain: 'ruang-kita-interaktif.firebaseapp.com',
  projectId: 'ruang-kita-interaktif',
  storageBucket: 'ruang-kita-interaktif.firebasestorage.app',
  messagingSenderId: '404545284582',
  appId: '1:404545284582:web:79c89ad7b77dc54e21ce27',
  measurementId: 'G-XKFGWL046Z'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const PENDING_KEY = 'ruangkita.auth.pendingFab';
let currentUser = null;
let authReady = false;
let dialog;
let statusEl;
let signInButton;
let emailForm;
let emailButton;
let authMode = 'login';
let accountButton;
let returnFocus = null;
let resumeInProgress = false;

function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch (error) { return null; }
}

function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch (error) { /* sesi tetap bisa login tanpa pemulihan otomatis */ }
}

function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch (error) { /* sesi tetap aktif */ }
}

function buatDialog() {
  dialog = document.createElement('div');
  dialog.className = 'rk-auth-backdrop';
  dialog.id = 'rkGoogleLoginDialog';
  dialog.hidden = true;
  dialog.innerHTML = '<section class="rk-auth-card" role="dialog" aria-modal="true" aria-labelledby="rkAuthTitle" aria-describedby="rkAuthDescription">'
    + '<button type="button" class="rk-auth-close" data-rk-auth-close aria-label="Tutup">&times;</button>'
    + '<aside class="rk-auth-visual" aria-hidden="true"><div class="rk-auth-brand"><span class="rk-auth-mark">RK</span><span><b>RUANG KITA</b><small>GEOSPATIAL WORKSPACE</small></span></div>'
    + '<div class="rk-auth-visual-copy"><span>GEOSPASIAL TERPADU</span><h2>Pahami ruang.<br>Rencanakan lebih baik.</h2><p>Jelajahi peta, data, dan insight wilayah dalam satu ruang kerja.</p></div>'
    + '<div class="rk-auth-map-art"><i></i><i></i><i></i><b>06°12\' S</b><b>106°49\' E</b><span></span></div><div class="rk-auth-visual-foot">MAPS <i></i> DATA <i></i> INSIGHT</div></aside>'
    + '<div class="rk-auth-panel"><div class="rk-auth-heading"><span>AKSES RUANG KITA</span><h1 id="rkAuthTitle">Selamat datang</h1><p id="rkAuthDescription">Masuk atau buat akun untuk melanjutkan.</p></div>'
    + '<div class="rk-auth-tabs" role="tablist" aria-label="Akses akun"><button type="button" class="rk-auth-tab is-active" data-rk-auth-mode="login" role="tab" aria-selected="true">Masuk</button><button type="button" class="rk-auth-tab" data-rk-auth-mode="register" role="tab" aria-selected="false">Daftar</button></div>'
    + '<form class="rk-auth-form" data-rk-email-form><label data-rk-name-wrap hidden>Nama<input name="name" type="text" autocomplete="name" maxlength="80" placeholder="Nama Anda"></label><label>Email<input name="email" type="email" autocomplete="email" required placeholder="nama@email.com"></label><label>Kata sandi<input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Minimal 6 karakter"></label><button type="button" class="rk-auth-link" data-rk-auth-reset>Lupa kata sandi?</button><button type="submit" class="rk-auth-submit" data-rk-auth-submit>Masuk</button></form>'
    + '<div class="rk-auth-divider"><span>atau masuk dengan</span></div><button type="button" class="rk-auth-google" data-rk-auth-signin><span aria-hidden="true">G</span> Google</button>'
    + '<p class="rk-auth-status" data-rk-auth-status role="status" aria-live="polite"></p><p class="rk-auth-legal">Akun Anda digunakan untuk mengakses fitur RUANG KITA.</p></div>'
    + '</section>';
  document.body.appendChild(dialog);
  statusEl = dialog.querySelector('[data-rk-auth-status]');
  signInButton = dialog.querySelector('[data-rk-auth-signin]');
  emailForm = dialog.querySelector('[data-rk-email-form]');
  emailButton = dialog.querySelector('[data-rk-auth-submit]');

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog || event.target.closest('[data-rk-auth-close]')) tutupDialog(true);
    if (event.target.closest('[data-rk-auth-signin]')) masukDenganGoogle();
    const modeButton = event.target.closest('[data-rk-auth-mode]');
    if (modeButton) aturMode(modeButton.dataset.rkAuthMode);
    if (event.target.closest('[data-rk-auth-reset]')) resetPassword();
  });
  emailForm.addEventListener('submit', submitEmail);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !dialog.hidden) tutupDialog(true);
  });
}

function aturMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  dialog.querySelectorAll('[data-rk-auth-mode]').forEach(function (button) {
    const active = button.dataset.rkAuthMode === authMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const register = authMode === 'register';
  dialog.querySelector('[data-rk-name-wrap]').hidden = !register;
  emailForm.elements.password.autocomplete = register ? 'new-password' : 'current-password';
  dialog.querySelector('[data-rk-auth-reset]').hidden = register;
  emailButton.textContent = register ? 'Buat akun' : 'Masuk';
  dialog.querySelector('#rkAuthTitle').textContent = register ? 'Buat akun baru' : 'Selamat datang';
  dialog.querySelector('#rkAuthDescription').textContent = register
    ? 'Daftar untuk mulai menggunakan RUANG KITA.'
    : 'Masuk atau buat akun untuk melanjutkan.';
  statusEl.textContent = '';
}

function selesaikanLogin(user) {
  currentUser = user;
  renderAccountButton(user);
  tutupDialog(false);
  resumePendingFab();
}

async function submitEmail(event) {
  event.preventDefault();
  if (!authReady) return;
  const data = new FormData(emailForm);
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');
  const name = String(data.get('name') || '').trim();
  emailButton.disabled = true;
  signInButton.disabled = true;
  statusEl.textContent = authMode === 'register' ? 'Membuat akun…' : 'Memeriksa akun…';
  try {
    let result;
    if (authMode === 'register') {
      result = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        try { await updateProfile(result.user, { displayName: name }); }
        catch (profileError) { console.warn('[firebase-auth] Nama profil belum dapat disimpan.', profileError); }
      }
    } else result = await signInWithEmailAndPassword(auth, email, password);
    selesaikanLogin(result.user);
  } catch (error) {
    console.error('[firebase-auth] Email/password sign-in failed:', error);
    statusEl.textContent = pesanError(error);
  } finally {
    emailButton.disabled = false;
    signInButton.disabled = false;
  }
}

async function resetPassword() {
  const email = String(new FormData(emailForm).get('email') || '').trim();
  if (!email) {
    statusEl.textContent = 'Masukkan email terlebih dahulu untuk menerima tautan pemulihan.';
    emailForm.elements.email.focus();
    return;
  }
  statusEl.textContent = 'Mengirim tautan pemulihan…';
  try {
    await sendPasswordResetEmail(auth, email);
    statusEl.textContent = 'Tautan pemulihan dikirim. Periksa kotak masuk atau folder spam.';
  } catch (error) {
    console.error('[firebase-auth] Password reset failed:', error);
    statusEl.textContent = pesanError(error);
  }
}

function bukaDialog() {
  if (!dialog) buatDialog();
  dialog.hidden = false;
  document.body.classList.add('rk-auth-open');
  if (statusEl) statusEl.textContent = authReady ? '' : 'Memeriksa sesi akun…';
  if (signInButton) signInButton.disabled = !authReady;
  if (emailButton) emailButton.disabled = !authReady;
  requestAnimationFrame(function () { signInButton && signInButton.focus(); });
}

function tutupDialog(hapusPending) {
  if (!dialog) return;
  dialog.hidden = true;
  document.body.classList.remove('rk-auth-open');
  if (hapusPending) safeSessionRemove(PENDING_KEY);
  if (returnFocus && returnFocus.isConnected) returnFocus.focus();
}

function pesanError(error) {
  const code = error && error.code;
  const pesan = {
    'auth/popup-closed-by-user': 'Jendela Google tertutup sebelum proses masuk selesai. Silakan coba lagi.',
    'auth/cancelled-popup-request': 'Permintaan masuk sebelumnya dibatalkan. Silakan coba lagi.',
    'auth/popup-blocked': 'Browser menutup jendela Google. Izinkan popup untuk situs ini, lalu coba lagi.',
    'auth/unauthorized-domain': 'Situs ini belum diizinkan untuk masuk. Pengelola perlu menambahkan domain situs di pengaturan Firebase.',
    'auth/operation-not-allowed': 'Metode masuk ini belum diaktifkan. Pengelola perlu mengaktifkan Email/Sandi atau Google di Firebase.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar. Pilih Masuk atau gunakan email lain.',
    'auth/invalid-email': 'Format email belum benar. Periksa kembali alamat email Anda.',
    'auth/weak-password': 'Kata sandi terlalu singkat. Gunakan minimal 6 karakter.',
    'auth/missing-password': 'Masukkan kata sandi untuk melanjutkan.',
    'auth/invalid-credential': 'Email atau kata sandi tidak cocok. Periksa kembali lalu coba lagi.',
    'auth/user-not-found': 'Email atau kata sandi tidak cocok. Periksa kembali lalu coba lagi.',
    'auth/wrong-password': 'Email atau kata sandi tidak cocok. Periksa kembali lalu coba lagi.',
    'auth/network-request-failed': 'Koneksi internet terputus atau sedang tidak stabil. Periksa koneksi, lalu coba lagi.',
    'auth/too-many-requests': 'Terlalu banyak percobaan masuk dalam waktu singkat. Tunggu sebentar, lalu coba lagi.',
    'auth/invalid-api-key': 'Pengaturan login aplikasi belum benar. Pengelola perlu memeriksa konfigurasi Firebase.',
    'auth/invalid-oauth-client-id': 'Pengaturan Google Sign-In belum benar. Pengelola perlu memeriksa konfigurasi OAuth.',
    'auth/configuration-not-found': 'Layanan login belum selesai dikonfigurasi. Pengelola perlu memeriksa pengaturan Firebase.',
    'auth/web-storage-unsupported': 'Browser tidak mengizinkan penyimpanan sesi login. Coba gunakan browser biasa dan aktifkan penyimpanan situs.',
    'auth/operation-not-supported-in-this-environment': 'Metode login ini tidak didukung di browser atau mode yang sedang digunakan. Coba browser biasa.'
  }[code];

  if (pesan) return pesan;
  const referensi = code ? ' Kode bantuan: ' + code.replace(/^auth\//, '') + '.' : '';
  return 'Login belum berhasil. Periksa koneksi dan pengaturan akun, lalu coba lagi.' + referensi;
}

function resumePendingFab() {
  if (!currentUser || resumeInProgress) return;
  const fabId = safeSessionGet(PENDING_KEY);
  if (!fabId || !/^[a-z0-9-]+$/.test(fabId)) return;

  resumeInProgress = true;
  let attempts = 0;
  function findAndOpen() {
    if (!currentUser) { resumeInProgress = false; return; }
    const item = document.querySelector('.map-fab-item[data-rk-auth-fab-id="' + fabId + '"]');
    if (item) {
      resumeInProgress = false;
      safeSessionRemove(PENDING_KEY);
      tutupDialog(false);
      item.click();
      return;
    }
    attempts += 1;
    if (attempts < 80) window.setTimeout(findAndOpen, 50);
    else {
      resumeInProgress = false;
      if (statusEl) statusEl.textContent = 'Sheet tidak ditemukan. Silakan pilih kembali dari menu peta.';
    }
  }
  findAndOpen();
}

async function masukDenganGoogle() {
  if (!authReady || !signInButton) return;
  signInButton.disabled = true;
  emailButton.disabled = true;
  if (statusEl) statusEl.textContent = 'Menghubungkan ke Google…';

  try {
    // This site is hosted on GitHub Pages, while authDomain is firebaseapp.com.
    // Redirect sign-in can lose its session in mobile browsers that block
    // third-party storage, so keep this flow on the site's own origin.
    const result = await signInWithPopup(auth, provider);
    selesaikanLogin(result.user);
  } catch (error) {
    console.error('[firebase-auth] Google sign-in failed:', error);
    if (statusEl) statusEl.textContent = pesanError(error);
    signInButton.disabled = false;
    emailButton.disabled = false;
  }
}

function renderAccountButton(user) {
  const items = document.querySelector('.map-fab-items');
  if (!items) return false;
  if (!accountButton) {
    accountButton = document.createElement('button');
    accountButton.type = 'button';
    accountButton.className = 'map-fab-item rk-auth-account';
    accountButton.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopPropagation();
      try { await signOut(auth); } catch (error) { window.alert('Tidak dapat keluar dari akun. Coba lagi.'); }
    });
    items.appendChild(accountButton);
  }
  accountButton.title = 'Keluar dari ' + (user.displayName || user.email || 'akun Google');
  accountButton.setAttribute('aria-label', accountButton.title);
  accountButton.replaceChildren();
  if (user.photoURL) {
    try {
      const photo = new URL(user.photoURL);
      if (photo.protocol === 'https:') {
        const image = document.createElement('img');
        image.alt = '';
        image.src = photo.href;
        accountButton.appendChild(image);
      }
    } catch (error) { /* avatar teks jadi cadangan */ }
  }
  if (!accountButton.childElementCount) {
    const initials = document.createElement('span');
    initials.textContent = String((user.displayName || user.email || 'G').trim().charAt(0)).toUpperCase();
    accountButton.appendChild(initials);
  }
  accountButton.hidden = false;
  return true;
}

function tungguMenuFab(user) {
  if (renderAccountButton(user)) return;
  const observer = new MutationObserver(function () {
    if (currentUser && renderAccountButton(currentUser)) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(function () { observer.disconnect(); }, 15000);
}

function tahanKlikFab(event) {
  const item = event.target && event.target.closest
    ? event.target.closest('.map-fab-item[data-rk-requires-google-login="true"]')
    : null;
  if (!item || currentUser) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  returnFocus = item;
  safeSessionSet(PENDING_KEY, item.dataset.rkAuthFabId || '');
  bukaDialog();
}

document.addEventListener('click', tahanKlikFab, true);
window.RKGoogleAuthGate = true;

if (window.__rkAuthPendingFab) {
  const pendingFabId = window.__rkAuthPendingFab;
  window.__rkAuthPendingFab = '';
  if (/^[a-z0-9-]+$/.test(pendingFabId)) {
    returnFocus = document.querySelector('.map-fab-item[data-rk-auth-fab-id="' + pendingFabId + '"]');
    safeSessionSet(PENDING_KEY, pendingFabId);
    bukaDialog();
  }
}

try {
  await setPersistence(auth, browserLocalPersistence);
} catch (error) {
  console.warn('[firebase-auth] Persistensi sesi lokal tidak tersedia.', error);
}

onAuthStateChanged(auth, function (user) {
  currentUser = user;
  authReady = true;
  if (signInButton) signInButton.disabled = false;
  if (emailButton) emailButton.disabled = false;
  if (statusEl && dialog && !dialog.hidden) statusEl.textContent = '';
  if (user) {
    tungguMenuFab(user);
    resumePendingFab();
  } else if (accountButton) {
    accountButton.remove();
    accountButton = null;
  }
});

getRedirectResult(auth).then(function (result) {
  // Complete redirect attempts started by an older version of the app.
  if (result && result.user) selesaikanLogin(result.user);
}).catch(function (error) {
  console.error('[firebase-auth] Hasil redirect gagal diproses.', error);
  if (statusEl && dialog && !dialog.hidden) statusEl.textContent = pesanError(error);
});
