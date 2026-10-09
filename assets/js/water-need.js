/* ==========================================================================
   Water Intelligence (ETc = ET0 x Kc + hujan prakiraan)
   --------------------------------------------------------------------------
   Menghasilkan neraca indikatif 16 hari dari ETc menurut umur tanaman dan
   porsi hujan efektif yang dipilih pengguna. Ini bukan jadwal irigasi: belum
   memodelkan simpanan zona akar, limpasan, drainase, genangan, atau efisiensi.

   ET0 diambil dari Open-Meteo (gratis, tanpa API key):
     - Archive API : rerata bulanan 5 tahun -> "musim normal"
     - Forecast API: harian 16 hari       -> ET0 dan hujan untuk neraca dekat

   Mengikuti pola assets/js/dem-analysis.js: satu titik per polygon (bujur,
   lintang) -> 2 request per polygon, disimpan di window.__airEt0Cache.
   ========================================================================== */
(function () {
  'use strict';

  if (window.WaterNeed) return;

  var FORECAST_DAYS = 16;
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /* Tabel Kc dan durasi tahapan tanaman (FAO-56, dibulatkan agar cocok dengan
     jadwal lapangan Indonesia). Nilai ini TABEL, bukan data yang diunduh, jadi
     tidak perlu API dan bisa diganti pengguna lewat select.

       kc       : awal, puncak, akhir
       hari     : (inisiasi, pengembangan, tengah, akhir) total satu musim */
  var TANAMAN = [
    { id: 'padi', nama: 'Padi', kc: [1.05, 1.20, 0.90], hari: [20, 35, 40, 30], irigasi: true,
      catatan: 'Butuh genangan tipis saat tahap vegetatif.' },
    { id: 'jagung', nama: 'Jagung', kc: [0.30, 1.20, 0.60], hari: [20, 30, 40, 30], irigasi: true,
      catatan: 'Kebutuhan puncak saat pembungaan.' },
    { id: 'kedelai', nama: 'Kedelai', kc: [0.40, 1.15, 0.50], hari: [15, 30, 40, 25], irigasi: false,
      catatan: 'Umumnya digantungkan pada hujan.' },
    { id: 'gandum', nama: 'Gandum', kc: [0.40, 1.15, 0.25], hari: [15, 25, 40, 25], irigasi: true,
      catatan: 'Butuh air seragam, sensitif kekeringan saat berbunga.' },
    { id: 'tebu', nama: 'Tebu', kc: [0.40, 1.20, 0.70], hari: [30, 60, 90, 60], irigasi: true,
      catatan: 'Musim panjang, kebutuhan tinggi di tahap tengah.' },
    { id: 'kentang', nama: 'Kentang', kc: [0.50, 1.15, 0.75], hari: [25, 30, 45, 30], irigasi: true,
      catatan: 'Butuh air seragam, hassle bila kekeringan.' },
    { id: 'cengkih', nama: 'Cengkih', kc: [0.65, 1.15, 1.05], hari: [40, 70, 100, 50], irigasi: true,
      catatan: 'Tanaman tahunan; angka ini untuk satu musim lezet.' },
    { id: 'sawit', nama: 'Kelapa Sawit', kc: [0.95, 1.00, 1.00], hari: [60, 90, 120, 90], irigasi: false,
      catatan: 'Tanaman tahunan, Kc tinggi sepanjang tahun.' }
  ];

  /* Cache ET0 per koordinat. Archive saat kuota habis -> pakai rerata kasar
     dengan label jelas, supaya fitur tidak mati total. */
  window.__airEt0Cache = window.__airEt0Cache || {};

  function cacheKey(lat, lng) {
    return lat.toFixed(2) + ',' + lng.toFixed(2);
  }

  function hitungEt0Bulanan(lat, lng) {
    var key = cacheKey(lat, lng);
    if (window.__airEt0Cache[key]) return Promise.resolve(window.__airEt0Cache[key]);
    var th = new Date().getFullYear();
    // Lima tahun LENGKAP yang sudah lewat, bukan lima tahun terakhir sampai
    // hari ini. Archive API menolak end_date di masa depan (HTTP 400), dan
    // tahun berjalan selalu setengah jadi sehingga bikin rata-rata bias.
    var mulai = (th - 5) + '-01-01';
    var selesai = (th - 1) + '-12-31';
    var url = 'https://archive-api.open-meteo.com/v1/archive'
      + '?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4)
      + '&daily=et0_fao_evapotranspiration&start_date=' + mulai
      + '&end_date=' + selesai
      + '&timezone=Asia/Jakarta';
    return fetch(url)
      .then(function (r) {
        if (r.status === 429) {
          var e = new Error('Kuota harian Open-Meteo habis untuk ET0.');
          e.code = '429';
          throw e;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var d = j && j.daily && j.daily.et0_fao_evapotranspiration;
        var t = j && j.daily && j.daily.time;
        if (!d || !t || d.length !== t.length) throw new Error('Data ET0 bulanan kosong dari Open-Meteo.');
        var perBulan = new Array(12).fill(0);
        var jumlah = new Array(12).fill(0);
        for (var i = 0; i < d.length; i++) {
          if (d[i] == null) continue;
          var m = parseInt(String(t[i]).slice(5, 7), 10) - 1;
          if (m < 0 || m > 11) continue;
          perBulan[m] += d[i];
          jumlah[m] += 1;
        }
        var hasil = {
          ok: true,
          perBulan: perBulan.map(function (s, k) { return jumlah[k] ? s / jumlah[k] : 0; }),
          sumber: 'Open-Meteo Archive, rata-rata ' + mulai.slice(0, 4) + '-' + selesai.slice(0, 4)
        };
        window.__airEt0Cache[key] = hasil;
        return hasil;
      })
      .catch(function (e) {
        if (e && e.code === '429') {
          var kasar = [2.4, 2.6, 2.8, 2.9, 2.9, 2.6, 2.4, 2.4, 2.6, 2.8, 2.7, 2.4];
          var fb = {
            ok: true,
            perkiraan: true,
            perBulan: kasar,
            sumber: 'Perkiraan kasar, kuota Open-Meteo habis'
          };
          window.__airEt0Cache[key] = fb;
          return fb;
        }
        throw e;
      });
  }

  function hitungEt0Harian(lat, lng) {
    var url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4)
      + '&daily=et0_fao_evapotranspiration,precipitation_sum&forecast_days=' + FORECAST_DAYS
      + '&timezone=Asia/Jakarta';
    return fetch(url)
      .then(function (r) {
        if (r.status === 429) {
          var e2 = new Error('Kuota harian Open-Meteo habis untuk ET0 harian.');
          e2.code = '429';
          throw e2;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var d = j && j.daily && j.daily.et0_fao_evapotranspiration;
        var t = j && j.daily && j.daily.time;
        var rain = j && j.daily && j.daily.precipitation_sum;
        if (!d || !rain || !t || d.length !== t.length || rain.length !== t.length) throw new Error('Data ET0 atau hujan harian kosong dari Open-Meteo.');
        return { ok: true, tanggal: t, et0: d, hujan: rain, sumber: 'Open-Meteo Forecast, ' + FORECAST_DAYS + ' hari' };
      });
  }

  /* Inti perhitungan ETc per tahapan. FAO-56 memang piecewise (nilai Kc
     ditahan per tahap, bukan diinterpolasi halus), jadi dipakai apa adanya. */
  function hitungEtc(tanaman, et0HarianRata2) {
    var kc = tanaman.kc;
    var hari = tanaman.hari;
    var totalHari = hari[0] + hari[1] + hari[2] + hari[3];
    var etcTotal = 0;
    var perTahap = [
      { nama: 'Inisiasi', hari: hari[0], kc: kc[0] },
      { nama: 'Pengembangan', hari: hari[1], kc: kc[1] },
      { nama: 'Tengah', hari: hari[2], kc: kc[1] },
      { nama: 'Akhir', hari: hari[3], kc: kc[2] }
    ].map(function (s) {
      s.etc = et0HarianRata2 * s.kc * s.hari;
      etcTotal += s.etc;
      return s;
    });
    return { totalHari: totalHari, etcTotal: etcTotal, perTahap: perTahap };
  }

  function hitungNeracaHarian(tanaman, harian, tanggalTanam, hujanEfektifPct) {
    var start = Date.parse(tanggalTanam + 'T00:00:00');
    if (!Number.isFinite(start)) throw new Error('Tanggal tanam tidak valid.');
    var eff = Math.max(0, Math.min(100, Number(hujanEfektifPct))) / 100;
    var hari = tanaman.hari;
    var awal = hari[0], pengembangan = hari[1], tengah = hari[2], akhir = hari[3];
    var totalUmur = awal + pengembangan + tengah + akhir;
    var days = harian.tanggal.map(function (date, i) {
      var cropAge = Math.floor((Date.parse(date + 'T00:00:00') - start) / 86400000);
      var kc = 0;
      if (cropAge >= 0) {
        if (cropAge < awal) kc = tanaman.kc[0];
        else if (cropAge < awal + pengembangan) {
          var p = (cropAge - awal + 1) / Math.max(1, pengembangan);
          kc = tanaman.kc[0] + (tanaman.kc[1] - tanaman.kc[0]) * p;
        } else if (cropAge < awal + pengembangan + tengah) kc = tanaman.kc[1];
        else if (cropAge < totalUmur) {
          var q = (cropAge - awal - pengembangan - tengah + 1) / Math.max(1, akhir);
          kc = tanaman.kc[1] + (tanaman.kc[2] - tanaman.kc[1]) * q;
        } else kc = tanaman.kc[2];
      }
      var et0 = harian.et0[i] == null ? NaN : Number(harian.et0[i]);
      var rain = harian.hujan[i] == null ? NaN : Number(harian.hujan[i]);
      var etc = Number.isFinite(et0) ? et0 * kc : null;
      var effectiveRain = Number.isFinite(rain) ? rain * eff : null;
      var gap = etc == null || effectiveRain == null ? null : Math.max(0, etc - effectiveRain);
      return { date: date, cropAge: cropAge, kc: kc, et0: Number.isFinite(et0) ? et0 : null,
        rain: Number.isFinite(rain) ? rain : null, etc: etc, effectiveRain: effectiveRain, gap: gap };
    });
    var valid = days.filter(function (day) { return day.etc != null && day.effectiveRain != null; });
    var totals = valid.reduce(function (sum, day) {
      sum.etc += day.etc;
      sum.rain += day.rain;
      sum.effectiveRain += day.effectiveRain;
      sum.gap += day.gap;
      return sum;
    }, { etc: 0, rain: 0, effectiveRain: 0, gap: 0 });
    return { days: days, totals: totals, rainEffectivePct: eff * 100, plantingDate: tanggalTanam,
      source: harian.sumber, completeDays: valid.length };
  }

  function fmtAngka(v) {
    return Number.isFinite(v)
      ? v.toLocaleString('id-ID', { maximumFractionDigits: 0 })
      : '-';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tabelTahapHtml(hasil) {
    return hasil.perTahap.map(function (s) {
      return '<div class="pa-air-row">'
        + '<span>' + escapeHtml(s.nama) + ' &middot; ' + s.hari + ' hari &middot; Kc ' + s.kc.toFixed(2) + '</span>'
        + '<span>ETc ' + fmtAngka(s.etc) + ' mm</span>'
        + '</div>';
    }).join('');
  }

  /* -- API publik, dipakai polygon-analysis.js -- */
  window.WaterNeed = {
    daftarTanaman: function () { return TANAMAN; },
    BULAN: BULAN,
    FORECAST_DAYS: FORECAST_DAYS,
    ongkosHitung: function (lat, lng, tanamanId, options) {
      var t = TANAMAN.filter(function (x) { return x.id === tanamanId; })[0] || TANAMAN[0];
      options = options || {};
      return Promise.all([hitungEt0Bulanan(lat, lng), hitungEt0Harian(lat, lng)])
        .then(function (r) {
          var bulanan = r[0];
          var harian = r[1];
          var totalEt0 = 0;
          var n = 0;
          harian.et0.forEach(function (e) {
            if (e == null) return;
            totalEt0 += e;
            n += 1;
          });
          var rerataEt0Harian = n ? totalEt0 / n : 0;
          return {
            tanaman: t,
            bulanan: bulanan,
            harian: harian,
            rerataEt0Harian: rerataEt0Harian,
            etc: hitungEtc(t, rerataEt0Harian),
            neraca: options.sowingDate ? hitungNeracaHarian(t, harian, options.sowingDate, options.effectiveRainPct == null ? 70 : options.effectiveRainPct) : null
          };
        });
    },
    _hitungEtc: hitungEtc,
    _hitungNeracaHarian: hitungNeracaHarian,
    _tabelTahapHtml: tabelTahapHtml,
    _fmtAngka: fmtAngka,
    _escapeHtml: escapeHtml
  };
})();
