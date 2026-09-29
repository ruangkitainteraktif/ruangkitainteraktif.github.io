/* ══ Pernyataan dan Penafian (disclaimer) ══
   Berpasangan dengan modal welcome: setelah welcome ditutup, penafian
   muncul sebagai syarat sebelum peta dipakai.

   Yang membedakannya dari modal biasa:
   - Tidak ada tombol tutup, tidak ada klik-di-luar, tidak ada tombol Escape.
     Satu-satunya jalan keluar adalah tombol terima.
   - Tombol terima terkunci sampai kotak persetujuan dicentang, jadi
     persetujuan tidak bisa terjadi tanpa dibaca.
   - Pilihan dicatat di localStorage (bukan sessionStorage seperti welcome)
     bersama versi naskah. Kalau naskah diubah, versi ikut naik dan semua
     pengguna diminta menerima ulang.
   - Sebelum tampil, isi modal dikunci supaya halaman di belakang tidak bisa
     digulir. Dikembalikan lagi saat ditutup. */
(function () {
  'use strict';

  /* Naikkan kalau redaksi penafian berubah, supaya versi lama otomatis
     tidak berlaku lagi dan pengguna diminta membaca ulang. */
  var VERSI = 1;
  var KUNCI = 'ruangkita_disclaimer_accepted';
  var KUNCI_VERSI = 'ruangkita_disclaimer_version';

  var modal, consent, tombol, sebelumnyaFokus = null, scrollLock = 0;

  function aman(f, argumen) {
    try { return f(argumen); } catch (e) { /* penafian tidak boleh mematikan peta */ }
  }

  function sudahDiterima() {
    try {
      return localStorage.getItem(KUNCI) === '1'
        && Number(localStorage.getItem(KUNCI_VERSI)) === VERSI;
    } catch (e) { return false; }
  }

  function catatDiterima() {
    try {
      localStorage.setItem(KUNCI, '1');
      localStorage.setItem(KUNCI_VERSI, String(VERSI));
    } catch (e) { /* mode privat: tetap boleh, hanya tidak persisten */ }
  }

  function kunciGulir(aktif) {
    if (aktif) {
      if (scrollLock) return;
      scrollLock = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollLock > 0) document.body.style.paddingRight = scrollLock + 'px';
    } else {
      if (!scrollLock && document.body.style.overflow !== 'hidden') return;
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      scrollLock = 0;
    }
  }

  function tampilkan() {
    if (!modal || sudahDiterima()) return;
    /* Kosongkan centang dan kunci lagi tombolnya: jangan sampai state
       "sudah dicentang" dari pembukaan sebelumnya terbawa. */
    if (consent) consent.checked = false;
    if (tombol) tombol.disabled = true;
    modal.hidden = false;
    modal.classList.add('open');
    document.body.classList.add('disclaimer-modal-active');
    kunciGulir(true);
    /* Fokus ke kotak persetujuan, bukan ke tombol yang masih terkunci. */
    window.setTimeout(function () {
      if (consent) consent.focus();
    }, 60);
  }

  function tutup() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.hidden = true;
    document.body.classList.remove('disclaimer-modal-active');
    kunciGulir(false);
    /* Kembalikan fokus ke tempat user tadi, kalau masih ada. */
    if (sebelumnyaFokus && typeof sebelumnyaFokus.focus === 'function') {
      aman(function () { sebelumnyaFokus.focus(); });
    }
  }

  function terima() {
    if (!consent || !consent.checked || !tombol) return;
    catatDiterima();
    tutup();
    if (sebelumnyaFokus && typeof sebelumnyaFokus.focus === 'function') {
      aman(function () { sebelumnyaFokus.focus(); });
    }
  }

  function init() {
    modal = document.getElementById('ruangkitaDisclaimerModal');
    consent = document.getElementById('ruangkitaDisclaimerConsent');
    tombol = document.getElementById('ruangkitaDisclaimerAccept');
    if (!modal || !consent || !tombol) return;

    consent.addEventListener('change', function () {
      tombol.disabled = !consent.checked;
    });
    tombol.addEventListener('click', terima);

    /* Escape sengaja TIDAK ditangani. Menutup modal tanpa menyatakan
       diterima akan membuat penafian ini tidak mengikat apa pun, dan itu
       justru membuat redaksinya tidak berguna. */
  }

  /* Dipakai sekali setelah welcome ditutup. */
  window.tampilkanDisclaimerJikaBelum = function () {
    if (sudahDiterima()) return false;
    window.setTimeout(tampilkan, 220);
    return true;
  };

  /* Membuka ulang penafian dari luar, misalnya dari menu bantuan. */
  window.bukaDisclaimer = function () {
    if (!modal) return false;
    sebelumnyaFokus = document.activeElement;
    if (sudahDiterima() && consent) {
      /* Sudah pernah menerima: tetap bisa dibuka untuk dibaca ulang, tapi
         tombolnya langsung aktif karena syaratnya sudah pernah dipenuhi. */
      consent.checked = true;
      tombol.disabled = false;
    } else {
      consent.checked = false;
      tombol.disabled = true;
    }
    modal.hidden = false;
    modal.classList.add('open');
    document.body.classList.add('disclaimer-modal-active');
    kunciGulir(true);
    return true;
  };

  window.tutupDisclaimer = tutup;
  window.disclaimerSudahDiterima = sudahDiterima;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
