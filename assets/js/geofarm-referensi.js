/* ── GeoFarm: Referensi Pertanian ──
 * ──────────────────────────────────────────────────────────────────────────
 * Lima kartu referensi, termasuk katalog varietas lokal:
 * pernah dipakai siapa pun:
 *
 *   data-ref-card  file                            var    isi
 *   ─────────────  ──────────────────────────────  ─────  ─────────────────
 *   artikel        assets/data/pertanian/blog.js    post   judul + isi + poster
 *   kamus          assets/data/pertanian/kamus.js   kamus  5.613 istilah
 *   opete          assets/data/pertanian/opete.js   opt    2.172 hama & penyakit
 *   pestisida      assets/data/pertanian/pestisida.js pestisida 1.898 racun
 *   varietas       assets/data/pertanian/varietas-perkebunan.json 351 varietas hasil ekstraksi PDF
 *
 * ── KENAPA TIDAK PAKAI <script src> ──
 * Keempat file itu bukan JSON: isinya literal `var x = [...]` diikuti
 * jQuery tahun 2010-an yang menulis ke #list-kamus, #list-opt,
 * #list-pestisida, #list-artikel. Empat elemen itu tidak ada lagi di
 * index.html, jadi skrip lamanya tidak akan terlihat, tapi tetap dieksekusi
 * kalau file-nya dimuat lewat <script>: jQuery harus sudah ada, dan
   * kamus.js/opete.js masih membangun string HTML untuk ribuan entri yang
   * lalu dibuang. Jadi file diambil dengan fetch() dan HANYA literal
   * array-nya yang diekstrak. Sisa file tidak pernah dijalankan.
 *
 * ── KENAPA LAZY ──
 * Total 3,7 MB. Dimuat satu per satu, saat kartu pertama kali dibuka, lalu
 * disimpan di memori. Halaman awal nol byte; yang terambil hanya file yang
 * benar-benar dibuka user.
 *
 * ── KENAPA BUKAN SATU KARTU DENGAN TAB ──
 * Kartu terpisah. Alasannya praktis: hanya satu di antaranya yang perlu
 * dibuka untuk satu tugas (nyari hama != baca artikel), dan tiap file punya
 * bentuk data sendiri sehingga biaya render-nya tidak sebanding bila digabung
 * jadi satu daftar. Semua tetap mulai terlipat, sama seperti kartu GeoFarm
 * Analisis dan Kalkulator.
 *
 * ── CATATAN KEAMANAN ──
 * Field `konten` (artikel) dan `detail` (hama) sudah berupa HTML dari repo
 * ini sendiri, jadi disisipkan apa adanya — sama seperti versi lamanya.
 * Semua teks lain (judul, arti, nama dagang, perusahaan) lewat esc().
 */
(function () {
  'use strict';

  /* Berapa entri per halaman. 5.613 baris kamus sekaligus di DOM memang
     masih bisa dilution browser, tapi sheet GeoTools bukan tempatnya. */
  var HALAMAN = 20;
  var JEDA_CARI = 180;

  var KAKTIF = {};   /* key -> state; sekaligus penanda sudah di-bind */

  /* ── util ───────────────────────────────────────────────────────────── */

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Buang tag lalu rapikan spasi. Dipakai untuk dua hal: teks yang mau
     ditampilkan sebagai teks (bukan HTML) dan teks yang jadi kunci
     pencarian. */
  function teks(v) {
    return String(v == null ? '' : v)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function huruf(v) {
    return teks(v).toLowerCase();
  }

  /* Deskripsi varietas berasal dari PDF yang teksnya rata dalam satu baris.
     Pisahkan atribut dengan titik koma tanpa mengubah urutan sumber. */
  function formatDeskripsiVarietas(v) {
    var sumber = teks(v);
    if (!sumber) return '';

    var labelMulai = [
      'Adaptasi', 'Agroekologi', 'Aroma', 'Asal', 'Berat', 'Bentuk', 'Bobot',
      'Ciri', 'Daya', 'Diameter', 'Duri', 'Habitus', 'Hasil', 'Identitas',
      'Izin', 'Jenis', 'Jumlah', 'Kadar', 'Kaki', 'Kandungan', 'Karakter', 'Keadaan', 'Kedaan',
      'Kelangsungan', 'Kelarutan', 'Kepala', 'Kerapatan', 'Keseragaman',
      'Ketahanan', 'Keterangan', 'Kekuatan', 'Kualitas', 'Lebar', 'Lingkar',
      'Masa', 'Mutu', 'Nama', 'Nilai', 'Nomor', 'Panjang', 'Pangkal', 'Pelepah',
      'Pemilik', 'Penampang', 'Penampilan', 'Peneliti', 'Pengusul', 'Penyebaran',
      'Perakaran', 'Perawakan', 'Permukaan', 'Persentase', 'Phylotaksi', 'Posisi',
      'Potensi', 'Produksi', 'Produktivitas', 'Rasa', 'Rata-rata', 'Rendemen',
      'Sifat', 'Silsilah', 'Silisilah', 'Sumber', 'Tahun', 'Teknisi', 'Tebal', 'Tinggi',
      'Tipe', 'Ukuran', 'Umur', 'Ujung', 'Varietas', 'Warna'
    ];
    var mulai = new RegExp('\\s+(' + labelMulai.join('|') + ')\\b', 'gi');
    var potongan = [];
    var akhir = 0;
    var cocok;

    while ((cocok = mulai.exec(sumber))) {
      var setelahLabel = sumber.slice(cocok.index + cocok[0].length);
      var kolon = setelahLabel.search(/\s*:\s*/);
      // Label atribut diikuti titik dua sebelum label berikutnya.
      if (kolon < 0 || kolon > 100) continue;
      if (cocok.index > akhir) potongan.push(sumber.slice(akhir, cocok.index).trim());
      akhir = cocok.index;
    }

    // Escaping dilakukan setelah pemisahan; teks dari transkripsi tetap aman.
    if (!potongan.length) return esc(sumber);
    potongan.push(sumber.slice(akhir).trim());
    return potongan.filter(Boolean).map(esc).join('; ');
  }

  /* Urut alfabetis untuk daftar yang dibaca manusia. Perbandingan < > tidak
     bisa dipakai: 'A' < 'a' benar, tapi 'a' < 'B' salah, sehingga huruf
     besar akan bercampur dengan huruf kecil di tengah daftar — persis di
     tempat orang mencari. localeCompare juga menyelesaikan selisih "e" dan
     "é", yang muncul di istilah latin. */
  function urut(a, b) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b));
  }

  /* ── parser literal array ─────────────────────────────────────────────
   * File data bukan JSON murni, tapi awalannya selalu
   * `var <nama> = [ ... ];` dan setelah `];` baru ada jQuery. Jadi yang
   * dibutuhkan cuma literal-nya: mulai dari `[` pertama dan berhenti di `]`
   * yang menutupnya.
   *
   * Naif `src.slice(i, src.indexOf(']') + 1)` salah untuk data ini, karena
   * `]` muncul di dalam string: kamus.js punya 5.613 entri dan blog.js punya
   * isi artikel berisi tag <ul>/<ol> berindex. Karena itu pemindaiannya
   * benar-benar menghitung kedalaman kurung siku sambil membedakan isi
   * string dan karakter escape.
   */
  function literalArray(src, nama) {
    var re = new RegExp('var\\s+' + nama + '\\s*=\\s*\\[');
    var m = re.exec(String(src || ''));
    if (!m) throw new Error('literal ' + nama + ' tidak ditemukan');
    var mulai = m.index + m[0].length - 1;   /* index si '[' */
    var dalam = 0, kutip = '';
    for (var i = mulai; i < src.length; i++) {
      var c = src.charAt(i);
      if (kutip) {
        if (c === '\\') { i++; continue; }    /* \" di dalam string */
        if (c === kutip) kutip = '';
        continue;
      }
      if (c === '"' || c === "'") { kutip = c; continue; }
      if (c === '[') dalam++;
      else if (c === ']') {
        dalam--;
        if (dalam === 0) return src.slice(mulai, i + 1);
      }
    }
    throw new Error('literal ' + nama + ' tidak tertutup');
  }

  function muatJsonArray(url, fallbackUrl) {
    var attemp = function (target) {
      return fetch(target, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (src) {
        var data = JSON.parse(src);
        if (!Array.isArray(data)) throw new Error(target + ' bukan array JSON');
        return data;
      });
    };

    return attemp(url).catch(function (err) {
      if (!fallbackUrl || fallbackUrl === url) throw err;
      return attemp(fallbackUrl);
    });
  }

  function muatArray(url, nama, mode, fallbackUrl) {
    if (mode === 'json' || /\.json(?:\?|$)/i.test(String(url || ''))) {
      return muatJsonArray(url, fallbackUrl);
    }
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (src) {
      var data = new Function('return (' + literalArray(src, nama) + ');')();
      if (!Array.isArray(data)) throw new Error(nama + ' bukan array');
      return data;
    });
  }

  /* ── pembedah data per sumber ───────────────────────────────────────── */

  /* "PT Fortuna Mulia Sejati (info) Izin: Tetap 02 February 2023 RI. 0103…"
     -> { nama: "PT Fortuna Mulia Sejati", izin: "Tetap … RI. 0103…" } */
  function pecahPerusahaan(v) {
    var t = String(v == null ? '' : v).trim();
    var i = t.search(/izin\s*:/i);
    var kiri = i >= 0 ? t.slice(0, i) : t;
    var kanan = i >= 0 ? t.slice(i).replace(/^[^:]*:\s*/, '') : '';
    return {
      nama: kiri.replace(/\(\s*info\s*\)\s*$/i, '').trim(),
      izin: kanan.trim()
    };
  }

  /* "VULGAR 865 SL (umum) 2,4-D dimetil amina …"
     -> { merek: "VULGAR 865 SL", keterangan: "(umum) 2,4-D …" } */
  function pecahMerek(v) {
    var t = String(v == null ? '' : v).trim();
    var i = t.indexOf('(');
    if (i < 0) return { merek: t, keterangan: '' };
    return { merek: t.slice(0, i).trim(), keterangan: t.slice(i).trim() };
  }

  /* Bungkus satu entri yang isinya panjang sebagai <details> sendiri, supaya
     list 5.613 baris tetap ringan: yang dirender hanya 20 baris pertama dan
     isinya baru ikut ke DOM saat baris itu dibuka. */
  function entri(judulHtml, isiHtml, kelas) {
    return '<details class="geofarm-ref-item' + (kelas ? ' ' + kelas : '') + '">' +
      '<summary class="geofarm-ref-item-sum">' + judulHtml + '</summary>' +
      '<div class="geofarm-ref-item-body">' + isiHtml + '</div>' +
    '</details>';
  }

  var DATASET = {

    varietas: {
      file: 'assets/data/pertanian/varietas-perkebunan.json',
      fileTambahan: 'assets/data/pertanian/sdg-pisang.json',
      mode: 'json',
      satuan: 'varietas dan aksesi',
      placeholder: 'Cari nama, komoditas, aksesi, spesies, atau asal',
      opsiFilter: function (rows) {
        var seen = {}, out = [];
        for (var i = 0; i < rows.length; i++) {
          var category = String(rows[i].kategori || 'Varietas Rilis Perkebunan').trim();
          if (category && !seen[category]) { seen[category] = true; out.push(category); }
        }
        return out.sort();
      },
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var nama = String(r.nama || '').trim();
          if (!nama) continue;
          if (Array.isArray(r.tabs)) {
            var tabSearch = JSON.stringify(r.tabs);
            out.push({
              no: String(r.no || ''), nama: nama, komoditas: String(r.komoditas || 'Pisang'),
              genus: String(r.genus || ''), species: String(r.species || ''),
              kategori: String(r.kategori || 'Sumber Daya Genetik / Buah Tropika / Pisang'),
              tabs: r.tabs, sumber: String(r.sumber || ''), url: String(r.url || ''),
              cari: [nama, r.no, r.komoditas, r.genus, r.species, tabSearch].join(' ').toLowerCase()
            });
            continue;
          }
          out.push({
            no: String(r.no || ''),
            nama: nama,
            komoditas: String(r.komoditas || '').trim(),
            kategori: String(r.kategori || 'Varietas Rilis Perkebunan'),
            asal: String(r.asal || '').trim(),
            tahun: String(r.tahun || '').trim(),
            status: String(r.status || '').trim(),
            sk: String(r.sk || '').trim(),
            deskripsi: String(r.deskripsi || '').trim(),
            cari: [nama, r.komoditas, r.asal, r.tahun, r.status, r.sk, r.deskripsi].join(' ').toLowerCase()
          });
        }
        out.sort(function (a, b) {
          var byCategory = urut(a.kategori, b.kategori);
          return byCategory || urut(a.nama, b.nama);
        });
        return out;
      },
      render: function (it) {
        if (it.tabs) {
          var tabHtml = it.tabs.map(function (tab) {
            var fields = (tab.fields || []).map(function (field) {
              return '<div class="geofarm-ref-blok"><b>' + esc(field.label) + '</b><br />' + esc(field.value || '-') + '</div>';
            }).join('');
            if (!fields && tab.note) fields = '<p class="geofarm-ref-blok">' + esc(tab.note) + '</p>';
            if (!fields) fields = '<p class="geofarm-ref-blok">Tidak ada data pada subtab ini.</p>';
            return '<details class="geofarm-ref-sdg-tab"><summary>' + esc(tab.tab) +
              (tab.fields && tab.fields.length ? ' &middot; ' + jumlah(tab.fields.length) + ' atribut' : '') +
              '</summary><div>' + fields + '</div></details>';
          }).join('');
          var metaSdg = [it.komoditas, it.genus, it.species, it.no].filter(Boolean).join(' / ');
          var sumberSdg = it.url ? '<p class="geofarm-ref-blok">Sumber: <a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">SISGen-Horti · ' + esc(it.sumber || 'Buka data sumber') + '</a></p>' : '';
          return entri('<b>' + esc(it.nama) + '</b><small>' + esc(metaSdg) + '</small>',
            sumberSdg + tabHtml, 'geofarm-ref-item-varietas geofarm-ref-item-sdg');
        }
        var meta = [it.komoditas, it.tahun, it.status].filter(function (v) { return v; }).join(' · ');
        var isi = '';
        if (it.asal) isi += '<p class="geofarm-ref-blok"><b>Asal</b><br />' + esc(it.asal) + '</p>';
        if (it.deskripsi) isi += '<p class="geofarm-ref-blok"><b>Deskripsi</b><br />' + formatDeskripsiVarietas(it.deskripsi) + '</p>';
        else isi += '<p class="geofarm-ref-blok">Deskripsi atribut tidak tercantum pada transkripsi sumber.</p>';
        if (it.sk) isi += '<p class="geofarm-ref-blok"><b>SK pelepasan</b><br />' + esc(it.sk) + '</p>';
        return entri('<b>' + esc(it.nama) + '</b><small>' + esc(meta || ('Nomor ' + it.no)) + '</small>', isi || '<p class="geofarm-ref-blok">Rincian belum tercantum di transkripsi lokal.</p>', 'geofarm-ref-item-varietas');
      }
    },


    /* ── artikel (blog.js) ──
       Isinya HTML panjang (panduan budidaya lengkap) dan gambarnya ada di
       telegra.ph, jadi poster pakai loading="lazy": gambar di dalam
       <details> yang tertutup tidak akan diunduh sampai baris itu dibuka. */
    artikel: {
      file: 'assets/data/pertanian/blog.js',
      varName: 'post',
      satuan: 'artikel',
      placeholder: 'Cari judul atau isi artikel',
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var judul = String(r.title || '').trim();
          var konten = String(r.konten || '');
          out.push({
            judul: judul,
            meta: String(r.tanggal || '').trim(),
            poster: String(r.poster || '').trim(),
            html: '<div class="geofarm-ref-konten">' + konten + '</div>',
            cari: (judul + ' ' + teks(konten)).toLowerCase()
          });
        }
        out.sort(function (a, b) { return urut(a.judul, b.judul); });
        return out;
      },
      render: function (it) {
        var gambar = '';
        if (it.poster) {
          gambar = '<img class="geofarm-ref-poster" src="' + esc(it.poster) + '" alt="" loading="lazy" decoding="async" />';
        }
        return entri(
          '<b>' + esc(it.judul) + '</b>' + (it.meta ? '<small>' + esc(it.meta) + '</small>' : ''),
          gambar + it.html,
          'geofarm-ref-item-artikel'
        );
      }
    },

    /* ── kamus (kamus.js) ──
       5.613 istilah, isinya pendek dan tidak perludetails: dua baris
       (istilah + arti) selalu terlihat. Jadi renderer paling ringan dari
       empatnya. */
    kamus: {
      file: 'assets/data/pertanian/kamus.js',
      varName: 'kamus',
      satuan: 'istilah',
      placeholder: 'Cari istilah atau artinya',
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var kata = String(r.kata || '').trim();
          var arti = String(r.arti || '').trim();
          if (!kata) continue;
          out.push({ kata: kata, arti: arti, cari: (kata + ' ' + arti).toLowerCase() });
        }
        out.sort(function (a, b) { return urut(a.kata, b.kata); });
        return out;
      },
      render: function (it) {
        return '<div class="geofarm-ref-row">' +
          '<b>' + esc(it.kata) + '</b>' +
          '<span>' + (it.arti ? esc(it.arti) : '<i>—</i>') + '</span>' +
        '</div>';
      }
    },

    /* ── opete (opete.js) ──
       Hama & penyakit. Dua kelompok kategori, jadi dikartu ini ada
       <select> penyaring; field `kategori` di isi di sini dan dibaca
       tampilkan(). */
    opete: {
      file: 'assets/data/pertanian/opete.js',
      varName: 'opt',
      satuan: 'hama & penyakit',
      placeholder: 'Cari nama Latin, inang, atau gejala',
      /* Opsi <select> penyaring. Diturunkan dari nilai yang benar-benar ada
         di data, bukan ditulis di index.html: kalau nanti opete.js ditambah
         kategori baru, pilihan di UI ikut tanpa perlu disentuh. */
      opsiFilter: function (rows) {
        var ada = {}, out = [];
        for (var i = 0; i < rows.length; i++) {
          var k = String((rows[i] || {}).kategori || '').trim();
          if (!k || ada[k]) continue;
          ada[k] = 1;
          out.push(k);
        }
        out.sort();
        return out;
      },
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var nama = String(r.nama || '').trim();
          if (!nama) continue;
          out.push({
            nama: nama,
            kategori: String(r.kategori || '').trim(),
            html: '<div class="geofarm-ref-konten">' + String(r.detail || '') + '</div>',
            cari: (nama + ' ' + teks(r.detail)).toLowerCase()
          });
        }
        out.sort(function (a, b) { return urut(a.nama, b.nama); });
        return out;
      },
      render: function (it) {
        var kat = it.kategori
          ? '<span class="geofarm-ref-badge" data-kat="' + esc(huruf(it.kategori)) + '">' + esc(it.kategori) + '</span>'
          : '';
        return entri('<b>' + esc(it.nama) + '</b>' + kat, it.html);
      }
    },

    /* ── pestisida (pestisida.js) ──
       merekdagang memuat nama + bahan aktif + sifat dalam satu string
       ("VULGAR 865 SL (umum) 2,4-D dimetil amina : 865 g/l …"), jadi
       dipecah: nama jadi judul, sisanya jadi keterangan di dalam. Yang
       ditampilkan sebagai ringkasan adalah perusahaan, bukan ulasannya. */
    'pupuk-publik': {
      file: 'https://ap-simpel.pertanian.go.id/pupuk/json_pupuk_publik_new',
      fallbackFile: 'assets/data/pertanian/pupuk-publik.json',
      varName: 'pupukPublik',
      mode: 'json',
      satuan: 'pupuk publik',
      placeholder: 'Cari merek dagang, jenis formula, atau perusahaan',
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var no = String(r.no == null ? i + 1 : r.no);
          var merk = String(r.merk_dagang || '').trim();
          var bentuk = String(r.bentuk_formula || '').trim();
          var jenis = String(r.jenis_formula || '').trim();
          var warna = String(r.warna_pupuk || '').trim();
          var pendaftaran = String(r.nomor_pendaftaran || '').trim();
          var perusahaan = String(r.pemegang_nomor_pendaftaran || '').trim();
          var permohonan = String(r.jenis_permohonan || '').trim();
          var terbit = String(r.tanggal_terbit || '').trim();
          var berakhir = String(r.tanggal_berakhir || '').trim();
          out.push({
            no: no,
            judul: merk || ('#' + no),
            bentuk: bentuk,
            jenis: jenis,
            warna: warna,
            pendaftaran: pendaftaran,
            perusahaan: perusahaan,
            permohonan: permohonan,
            terbit: terbit,
            berakhir: berakhir,
            cari: (merk + ' ' + bentuk + ' ' + jenis + ' ' + warna + ' ' + perusahaan + ' ' + pendaftaran).toLowerCase()
          });
        }
        return out;
      },
      render: function (it) {
        var meta = [it.jenis, it.bentuk, it.warna].filter(function (v) { return v; }).join(' · ');
        var isi = '';
        if (it.perusahaan) {
          isi += '<p class="geofarm-ref-blok"><b>Pemegang nomor pendaftaran</b><br />' + esc(it.perusahaan) + '</p>';
        }
        if (it.permohonan) {
          isi += '<p class="geofarm-ref-blok"><b>Jenis permohonan</b><br />' + esc(it.permohonan) + '</p>';
        }
        if (it.pendaftaran) {
          isi += '<p class="geofarm-ref-blok"><b>Nomor pendaftaran</b><br />' + esc(it.pendaftaran) + '</p>';
        }
        if (it.terbit || it.berakhir) {
          var rentang = [it.terbit, it.berakhir].filter(function (v) { return v; }).join('–');
          if (rentang) {
            isi += '<p class="geofarm-ref-blok"><b>Periode</b><br />' + esc(rentang) + '</p>';
          }
        }
        return entri(
          '<b>' + esc(it.judul) + '</b><small>' + esc(meta || ('#' + it.no)) + '</small>',
          isi || '<p class="geofarm-ref-blok">Data pupuk publik tidak lengkap pada sumber.</p>',
          'geofarm-ref-item-pupuk'
        );
      }
    },

    pestisida: {
      file: 'assets/data/pertanian/pestisida.js',
      varName: 'pestisida',
      satuan: 'produk pestisida',
      placeholder: 'Cari merek dagang, bahan aktif, atau perusahaan',
      normalisasi: function (rows) {
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i] || {};
          var merek = pecahMerek(r.merekdagang);
          var pt = pecahPerusahaan(r.perusahaan);
          var no = String(r.no == null ? i + 1 : r.no);
          var judul = (merek.merek || ('#' + no));
          out.push({
            no: no,
            judul: judul,
            keterangan: merek.keterangan,
            cara: teks(r.caraPakai || r.carapemakaian),
            perusahaan: pt.nama,
            izin: pt.izin,
            cari: (judul + ' ' + r.merekdagang + ' ' + r.caraPakai + ' ' + r.perusahaan).toLowerCase()
          });
        }
        return out;
      },
      render: function (it) {
        var meta = it.perusahaan || it.izin || ('#' + it.no);
        var isi = '';
        if (it.keterangan) {
          isi += '<p class="geofarm-ref-blok"><b>Bahan aktif &amp; sifat</b><br />' + esc(it.keterangan) + '</p>';
        }
        if (it.cara) {
          isi += '<p class="geofarm-ref-blok"><b>Cara pemakaian</b><br />' + esc(it.cara) + '</p>';
        }
        if (it.izin) {
          isi += '<p class="geofarm-ref-blok"><b>Izin</b><br />' + esc(it.izin) + '</p>';
        }
        return entri(
          '<b>' + esc(it.judul) + '</b><small>' + esc(meta) + '</small>',
          isi || '<p class="geofarm-ref-blok">Data produk tidak lengkap pada sumber.</p>',
          'geofarm-ref-item-pestisida'
        );
      }
    }
  };

  /* ── status ─────────────────────────────────────────────────────────── */

  function status(st, pesan, kelas) {
    var u = st.u.status;
    if (!u) return;
    u.textContent = pesan;
    u.className = 'geofarm-ref-status' + (kelas ? ' ' + kelas : '');
  }

  function jumlah(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /* ── render ──────────────────────────────────────────────────────────── */

  /* Saringan kategori harus TEPAT, bukan "kalau punya kategori". Versi yang
     melonggarkan (`kategori && it.kategori && ...`) akan membocorkan entri
     yang kategorinya kosong ke dalam hasil "Hama", karena `kategori` yang
     kosong berarti tidak sama dengan apa pun. */
  function cocok(it, istilah, kategori) {
    if (kategori && it.kategori !== kategori) return false;
    for (var i = 0; i < istilah.length; i++) {
      if (it.cari.indexOf(istilah[i]) === -1) return false;
    }
    return true;
  }

  function tampilkan(st, lanjut) {
    if (!st.data) return;
    var q = String(st.q || '').trim().toLowerCase();
    var istilah = q ? q.split(/\s+/) : [];
    var hasil = [];
    for (var i = 0; i < st.data.length; i++) {
      if (cocok(st.data[i], istilah, st.kategori)) hasil.push(st.data[i]);
    }
    st.hasil = hasil;
    if (!lanjut) st.tampil = 0;
    var potong = hasil.slice(st.tampil, st.tampil + HALAMAN);
    var html = '';
    for (var k = 0; k < potong.length; k++) html += st.conf.render(potong[k]);
    /* Paginasi memakai append, bukan render ulang: dengan begitu <details>
       yang sudah dibuka pengguna tetap terbuka setiap kali "Muat lagi"
       ditekan, dan 5.613 entri tidak perlu dibangun ulang sebagai string. */
    if (lanjut) {
      if (html) st.u.list.insertAdjacentHTML('beforeend', html);
    } else {
      st.u.list.innerHTML = html;
    }
    st.tampil += potong.length;

    if (!hasil.length) {
      status(st, q
        ? 'Tidak ada ' + st.conf.satuan + ' untuk "' + q + '".'
        : 'Tidak ada ' + st.conf.satuan + ' pada kategori ini.', 'is-warn');
    } else if (q || st.kategori) {
      status(st, jumlah(hasil.length) + ' hasil dari ' + jumlah(st.data.length) + ' ' +
        st.conf.satuan + ' · menampilkan ' + jumlah(Math.min(st.tampil, hasil.length)) + '.');
    } else {
      status(st, jumlah(st.data.length) + ' ' + st.conf.satuan +
        ' · menampilkan ' + jumlah(Math.min(st.tampil, hasil.length)) + '.');
    }

    if (st.u.more) {
      var sisa = hasil.length - st.tampil;
      st.u.more.hidden = sisa <= 0;
      st.u.more.textContent = 'Muat ' + jumlah(Math.min(sisa, HALAMAN)) + ' lagi';
    }
  }

  /* ── muat (lazy, sekali per kartu) ──────────────────────────────────── */

  function muat(st) {
    if (st.data || st.sedang) return;
    st.sedang = true;
    if (st.u.more) st.u.more.hidden = true;
    status(st, 'Mengambil ' + st.conf.satuan + '…', 'is-busy');
    var sumber = [muatArray(st.conf.file, st.conf.varName, st.conf.mode, st.conf.fallbackFile)];
    if (st.conf.fileTambahan) sumber.push(muatArray(st.conf.fileTambahan, null, 'json'));
    Promise.all(sumber).then(function (kelompok) {
      var rows = [].concat.apply([], kelompok);
      st.data = st.conf.normalisasi(rows);
      st.sedang = false;
      isiFilter(st, rows);
      tampilkan(st, false);
    }).catch(function () {
      st.sedang = false;
      status(st, 'Gagal membaca data ' + st.conf.satuan + '. Silakan coba lagi nanti.', 'is-error');
    });
  }

  /* Bangun <option> penyaring dari data yang baru dimuat. Kartu tanpa
     conf.opsiFilter (artikel, kamus, pestisida) tidak punya select sama
     sekali, jadi fungsi ini dilewati. */
  function isiFilter(st, rows) {
    var u = st.u.filter;
    if (!u || !st.conf.opsiFilter) return;
    var daftar = st.conf.opsiFilter(rows);
    if (daftar.length < 2) return;   /* satu kategori = tidak perlu saringan */
    var opsi = ['<option value="">Semua kategori</option>'];
    for (var i = 0; i < daftar.length; i++) {
      opsi.push('<option value="' + esc(daftar[i]) + '">' + esc(daftar[i]) + '</option>');
    }
    u.innerHTML = opsi.join('');
    u.hidden = false;
  }

  function jeda(st) {
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      st.q = st.u.cari.value;
      if (st.data) tampilkan(st, false);
      else muat(st);
    }, JEDA_CARI);
  }

  /* ── bind ───────────────────────────────────────────────────────────── */

  function siapkan(host) {
    var key = host && host.getAttribute && host.getAttribute('data-ref-card');
    var conf = key && DATASET[key];
    if (!conf) return null;
    if (KAKTIF[key]) return KAKTIF[key];

    var cari = host.querySelector('[data-ref-cari]');
    var statusEl = host.querySelector('[data-ref-status]');
    var list = host.querySelector('[data-ref-list]');
    if (!cari || !statusEl || !list) return null;

    var st = {
      key: key,
      conf: conf,
      q: '',
      kategori: '',
      data: null,
      hasil: null,
      tampil: 0,
      sedang: false,
      u: {
        cari: cari,
        status: statusEl,
        list: list,
        more: host.querySelector('[data-ref-more]'),
        filter: host.querySelector('[data-ref-filter]')
      }
    };
    KAKTIF[key] = st;

    /* Poster artikel diambil dari telegra.ph, host pihak ketiga yang
       bisa kedaluwarsa. Saat offline atau diblokir, <img> yang gagal
       meninggalkan kotak setinggi 190px dan teks artikel meloncat ke
       bawahnya — kotak kosong yang lebih besar dari isinya. Event "error"
       pada <img> tidak membubble, jadi harus ditangkap di fase capture.
       begini tidak ada handler sebaris (onerror=) di markup. */
    list.addEventListener('error', function (ev) {
      var t = ev.target;
      if (t && t.tagName === 'IMG') t.style.display = 'none';
    }, true);

    if (cari.placeholder === '') cari.placeholder = conf.placeholder;
    status(st, 'Belum dimuat. Buka kartu ini untuk mengambil ' +
      st.conf.satuan + '.', 'is-idle');

    host.addEventListener('toggle', function () {
      if (host.open) muat(st);
    });
    cari.addEventListener('input', function () { jeda(st); });
    if (st.u.filter) {
      st.u.filter.addEventListener('change', function () {
        st.kategori = st.u.filter.value;
        if (st.data) tampilkan(st, false);
        else muat(st);
      });
    }
    if (st.u.more) {
      st.u.more.addEventListener('click', function () { tampilkan(st, true); });
    }
    return st;
  }

  function init() {
    var host = document.getElementById('geofarm-referensi');
    if (!host) return false;
    var n = 0;
    var kartu = host.querySelectorAll('[data-ref-card]');
    for (var i = 0; i < kartu.length; i++) {
      if (siapkan(kartu[i])) n++;
    }
    return n > 0;
  }

  window.GeoFarmReferensi = {
    init: init,
    siapkan: siapkan,
    muatArray: muatArray,
    literalArray: literalArray,
    esc: esc,
    teks: teks,
    huruf: huruf,
    pecahMerek: pecahMerek,
    pecahPerusahaan: pecahPerusahaan,
    jumlah: jumlah,
    urut: urut,
    DATASET: DATASET,
    HALAMAN: HALAMAN
  };

  /* Kartu ada di DOM sejak awal tapi modul ini dimuat belakangan dari daftar
     script; pola boot ulang 300ms sama dengan geofarm-kalkulator.js supaya
     urutan pemuatan tidak harus dijaga manual. */
  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
