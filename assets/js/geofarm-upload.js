/* ── GeoFarm: Impor Polygon dari File (SHP / GeoJSON) ──
   Alur ini devastated: file dibaca, luas polygon dihitung, lalu polygon masuk
   daftar GeoFarm dengan luas saja. Analisis (NDVI, indeks spektral, topografi)
   TIDAK dijalankan otomatis karena satu polygon sudah memakan sekitar lima
   permintaan jaringan; pengguna menekan tombol "Analisis" di panel.

   Pola pembacaan file mengikuti alat-layers.js (loadSHPFile): .zip lewat
   shp(), file terpisah .shp/.dbf/.prj lewat parseShp + parseDbf + combine.
   shpjs membaca isi .prj sehingga proyeksi non-WGS84 ikut dikonversi. */
(function () {
  'use strict';

  // Di atas jumlah ini peta mulai berat; beri peringatan tapi jangan blokir.
  var WARN_POLYGON_COUNT = 200;
  var BATCH_SIZE = 25;

  // Polygon hasil unggahan diberi warna berbeda dari hasil menggambar
  // (biru Leaflet.draw) supaya keduanya mudah dibedakan di peta.
  var UPLOAD_STYLE = {
    color: '#d97706',
    weight: 2,
    opacity: 0.9,
    dashArray: '6 4',
    fillColor: '#f59e0b',
    fillOpacity: 0.08
  };

  // Atribut yang umum dipakai untuk nama bidang sawah.
  var NAME_FIELDS = [
    'NAMA', 'nama', 'NAMA_LAPISAN', 'nama_lapisan', 'nm_lapis', 'NMW_LAPIS',
    'NAMA_WIL', 'nama_wilayah', 'PANGAN', 'pangan', 'KEHUTAN', 'kehutan',
    'NAME', 'name', 'Nm_Rtrw', 'LAPISAN', 'Id_Orto', 'ORTO', 'OBJECTID',
    'id', 'Id', 'ID', 'KODE', 'kode', 'no', 'NO'
  ];

  function getMap() {
    return window.map || (typeof map !== 'undefined' ? map : null);
  }

  /**
   * shpjs dimuat sebagai UMD dari CDN sehingga menjadi global `shp`.
   * Diambil lewat window lebih dulu supaya aman bila dibungkus modul lain.
   */
  function getShp() {
    if (typeof window.shp === 'function') return window.shp;
    if (typeof shp !== 'undefined' && typeof shp.parseShp === 'function') return shp;
    return null;
  }

  function setStatus(text, kind) {
    var el = document.getElementById('geofarmUploadStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'geofarm-upload-status' + (kind ? ' is-' + kind : '');
    el.hidden = !text;
  }

  function baseName(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/i, '');
  }

  /** Membaca satu file menjadi FeatureCollection. */
  async function readFile(file, allFiles) {
    const name = file.name.toLowerCase();
    const shp = getShp();
    if (name.endsWith('.zip')) {
      if (!shp) {
        throw new Error('Pustaka pembaca SHP belum termuat.');
      }
      const out = await shp(await file.arrayBuffer());
      const fc = Array.isArray(out) ? out[0] : out;
      if (!fc || fc.type !== 'FeatureCollection') {
        throw new Error('ZIP tidak menghasilkan FeatureCollection.');
      }
      return fc;
    }
    if (name.endsWith('.geojson') || name.endsWith('.json')) {
      return JSON.parse(await file.text());
    }
    if (name.endsWith('.shp')) {
      if (!shp) {
        throw new Error('Pustaka pembaca SHP belum termuat.');
      }
      const stem = baseName(name);
      const find = function (ext) {
        return allFiles.find(function (f) { return f.name.toLowerCase() === stem + ext; });
      };
      const dbfFile = find('.dbf');
      if (!dbfFile) throw new Error('File .dbf tidak ditemukan. Pilih .shp dan .dbf sekaligus, atau pakai .zip.');
      const prjFile = find('.prj');
      const geometries = await shp.parseShp(await file.arrayBuffer(), prjFile ? await prjFile.text() : undefined);
      const properties = await shp.parseDbf(await dbfFile.arrayBuffer());
      const fc = shp.combine([geometries, properties]);
      if (!fc || fc.type !== 'FeatureCollection') {
        throw new Error('SHP tidak menghasilkan FeatureCollection.');
      }
      return fc;
    }
    throw new Error('Format file tidak didukung: ' + file.name);
  }

  /** Memecah FeatureCollection menjadi [{ geometry, properties }] hanya poligon. */
  function extractPolygons(fc) {
    const out = [];
    const skipped = [];
    const features = (fc && fc.type === 'FeatureCollection' && fc.features) || [];
    features.forEach(function (feature) {
      const geom = feature && feature.geometry;
      if (!geom) { skipped.push('tanpa geometri'); return; }
      if (geom.type === 'Polygon') {
        out.push({ geometry: geom, properties: feature.properties || {} });
      } else if (geom.type === 'MultiPolygon') {
        // Setiap bagian MultiPolygon dipecah menjadi satu item agar luas dan
        // analisisnya tidak tercampur.
        (geom.coordinates || []).forEach(function (rings) {
          out.push({ geometry: { type: 'Polygon', coordinates: rings }, properties: feature.properties || {} });
        });
      } else {
        skipped.push(geom.type);
      }
    });
    return { polygons: out, skipped: skipped };
  }

  function pickName(properties, fallback) {
    if (!properties) return fallback;
    for (let i = 0; i < NAME_FIELDS.length; i++) {
      const key = NAME_FIELDS[i];
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      const value = properties[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return fallback;
  }

  function areaHaOf(geometry) {
    if (!window.geoArea || typeof window.geoArea.areaHaFromGeoJSON !== 'function') {
      // Tanpa modul geodesik luas tidak bisa dihitung, jadi poligon tetap
      // diimpor tetapi luasnya kosong. Panel GeoFarm akan menandainya.
      return 0;
    }
    const ha = window.geoArea.areaHaFromGeoJSON(geometry);
    return Number.isFinite(ha) ? ha : 0;
  }

  /**
   * GeoJSON ring [lng,lat] -> Leaflet LatLng array [lat,lng].
   * Ring pertama batas luar, ring berikutnya lubang (hole).
   */
  function toLeafletRings(geometry) {
    // coordinates bisa apa saja kalau file rusak atau bukan GeoJSON asli
    // (misalnya string atau objek). Tanpa penjaga ini, .filter di bawah
    // melempar TypeError dan satu berkas buruk menggagalkan seluruh impor
    // tanpa pesan yang menjelaskan penyebabnya.
    const rings = (geometry && Array.isArray(geometry.coordinates)) ? geometry.coordinates : [];
    const hasil = [];
    rings.forEach(function (ring) {
      if (!Array.isArray(ring) || ring.length < 3) return;
      const latLngs = [];
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i];
        // GeoJSON: [lng, lat] -> Leaflet: [lat, lng]
        if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
        latLngs.push([c[1], c[0]]);
      }
      if (latLngs.length >= 3) hasil.push(latLngs);
    });
    return hasil;
  }

  /**
   * Layer HARUS berupa L.Polygon, bukan L.geoJSON.
   * Analisis GeoFarm memanggil layer.getLatLngs(), dan L.geoJSON() membuat
   * L.FeatureGroup yang tidak punya metode itu -- sehingga addPolygonItem()
   * menolak setiap polygon dan tidak satu pun terpasang.
   */
  function makeLayer(geometry) {
    if (typeof L === 'undefined' || !L.polygon) return null;
    const latLngs = toLeafletRings(geometry);
    if (!latLngs.length) return null;
    return L.polygon(latLngs, UPLOAD_STYLE);
  }

  async function importFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    const m = getMap();
    if (!m) { setStatus('Peta belum siap.', 'error'); return; }
    if (typeof window.registerUploadedPolygon !== 'function') {
      setStatus('Modul analisis GeoFarm belum termuat.', 'error');
      return;
    }

    setStatus('Membaca file…', 'busy');

    // Semua file dibaca lebih dulu supaya .shp/.dbf bisa dipasangkan.
    let collections = [];
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Abaikan .dbf/.shx/.prj sebagai file mandiri; itu hanya pendamping.
      if (/\.(dbf|shx|prj)$/i.test(file.name)) continue;
      try {
        collections.push({ fc: await readFile(file, files), label: baseName(file.name) });
      } catch (error) {
        errors.push(file.name + ': ' + (error && error.message ? error.message : 'gagal dibaca'));
      }
    }

    if (errors.length) {
      setStatus('Sebagian file gagal: ' + errors.join(' · '), 'error');
      return;
    }
    if (!collections.length) {
      setStatus('Tidak ada file polygon yang terbaca. Pilih .shp+.dbf, .zip, atau .geojson.', 'error');
      return;
    }

    // Kumpulkan seluruh poligon lebih dulu supaya bisa dihitung totalnya.
    let pending = [];
    const skipped = [];
    collections.forEach(function (entry) {
      const result = extractPolygons(entry.fc);
      result.polygons.forEach(function (item, index) {
        pending.push({
          geometry: item.geometry,
          name: pickName(item.properties, entry.label + ' ' + (index + 1))
        });
      });
      skipped.push.apply(skipped, result.skipped);
    });

    if (!pending.length) {
      setStatus('File terbaca, tapi tidak memuat geometri poligon.', 'error');
      return;
    }
    if (pending.length > WARN_POLYGON_COUNT) {
      setStatus('Memuat ' + pending.length + ' poligon — peta akan terasa berat. Lanjut…', 'warn');
      await new Promise(function (r) { setTimeout(r, 900); });
    }

    setStatus('Memasang ' + pending.length + ' poligon di peta…', 'busy');

    let added = 0;
    let totalHa = 0;
    const failures = [];
    /* Layer yang benar-benar terppasang, dipakai untuk menyorot peta ke
       petak yang baru dimuat setelah semua selesai. */
    const mounted = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const slice = pending.slice(i, i + BATCH_SIZE);
      for (let j = 0; j < slice.length; j++) {
        const entry = slice[j];
        const layer = makeLayer(entry.geometry);
        if (!layer) {
          failures.push((entry.name || 'poligon') + ': geometri tidak valid untuk Leaflet');
          continue;
        }
        const areaHa = areaHaOf(entry.geometry);
        const item = window.registerUploadedPolygon(layer, areaHa, entry.name);
        if (!item) {
          failures.push((entry.name || 'poligon') + ': ditolak modul GeoFarm');
          continue;
        }
        // Masukkan ke feature group gambar supaya bisa diedit dan dihapus
        // lewat tool Gambar & Ukur seperti hasil menggambar. Group itu sudah
        // berada di peta, jadi poligon langsung terlihat.
        let shown = false;
        if (typeof window.addToDrawLayerGroup === 'function') {
          shown = window.addToDrawLayerGroup(layer) === true;
        }
        if (!shown) {
          layer.addTo(m);
        }
  /* Cek hasilnya, jangan berasumsi. addToDrawLayerGroup() mengembalikan
  true setelah menambahkan ke group, tapi group itu hanya terlihat kalau
  memang sudah terpasang di peta. Kalau ternyata tidak, layer ditambahkan
  langsung supaya petak benar-benar tampil. Pemeriksaan hanya dilakukan bila
  peta menyediakan hasLayer; tanpa itu andalkan hasil addToDrawLayerGroup(). */
  if (typeof m.hasLayer === 'function') {
  if (m.hasLayer(layer) !== true && typeof layer.addTo === 'function') {
  layer.addTo(m);
  }
  } else if (!shown && typeof layer.addTo === 'function') {
  layer.addTo(m);
  }
        mounted.push(layer);
        added++;
        totalHa += Number.isFinite(areaHa) ? areaHa : 0;
      }
      setStatus('Memasang ' + Math.min(i + BATCH_SIZE, pending.length) + '/' + pending.length + ' poligon…', 'busy');
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    if (!added) {
      // Sebutkan penyebabnya, jangan hanya menyebut jumlah nol -- penyebab
      // yang paling sering adalah geometri rusak atau versi Leaflet berbeda.
      console.warn('[GeoFarm] Tidak ada polygon terpasang. Detail:', failures.slice(0, 5));
      setStatus('Tidak ada polygon yang berhasil dipasang. ' +
        (failures.length ? 'Contoh: ' + failures.slice(0, 2).join(' · ') + '.' : 'Periksa format file dan isi geometri.'),
        'error');
      return;
    }

    // Samakan dengan alur "Buat Polygon": sheet ditutup, sidebar dikecilkan,
    // basemap pindah ke citra satelit dan peta menyorot ke petak yang dimuat.
    prepareMapForResults(m, mounted);

    const parts = [added + ' poligon dimuat · total ' + totalHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha'];
    if (skipped.length) parts.push(skipped.length + ' geometri dilewati (' + summarize(skipped) + ')');
    parts.push('tekan Analisis pada tiap kartu untuk menghitung');
    setStatus(parts.join(' · '), 'ok');
  }

  function summarize(list) {
    const counts = {};
    list.forEach(function (key) { counts[key] = (counts[key] || 0) + 1; });
    return Object.keys(counts).map(function (k) { return k + '×' + counts[k]; }).join(', ');
  }

  /**
   * Peta diperlebar, pindah basemap, lalu SOROT ke petak yang baru dimuat.
   *
   * Sheet GeoTools SENGAJA TIDAK ditutup atau diminimalkan. Dulu fungsi ini
   * memanggil closeGeotoolsSheet() supaya peta dapat ruang penuh, tapi
   * begitu unggahan selesai, GeoTools yang baru saja dipilih pengguna ikut
   * hilang dari layar -- dan di situ tombol "Buka Analisis" berada. Untuk
   * memindahkan tampilan ke petak, menutup pial tidak diperlukan; cukup
   * menyisakan ruang lewat padding (lihat sheetPaddingPx di bawah).
   *
   * Fungsi ini juga sebelumnya tidak pernah menggerakkan peta sama sekali --
   * tidak ada flyToBounds/fitBounds di seluruh file. Akibatnya polygon yang
   * diunggah benar-benar ada di peta, tapi kalau petaknya jauh dari tampilan
   * sedang pengguna tidak pernah melihatnya dan mengira unggahan gagal.
   *
   * `layers` boleh kosong: kalau tidak ada yang bisa dihitung, tidak ada yang
   * digerakkan dan pesan status yang menjelaskan sudah cukup.
   */
  function prepareMapForResults(m, layers) {
    var sidebar = document.getElementById('sidebar-left');
    if (sidebar && !sidebar.classList.contains('collapsed') && typeof window.toggleSidebar === 'function') {
      window.toggleSidebar();
    }
    if (typeof window.setBaseMap === 'function') {
      try { window.setBaseMap('google-satellite-kh'); } catch (e) { /* abaikan */ }
    }

    /* Peta diperlebar dulu: sidebar yang baru ditutup masih men-placeholder
       ruang, jadi invalidateSize ditunda. Gerakkan layar dilakukan setelah
       itu supaya tidak ada kedipan. */
    setTimeout(function () {
      if (!m) return;
      if (m.invalidateSize) m.invalidateSize();
      if (!layers || !layers.length) return;
      var bounds = null;
      for (var i = 0; i < layers.length; i++) {
        var b = layers[i] && layers[i].getBounds ? layers[i].getBounds() : null;
        if (!b || typeof b.isValid !== 'function' || !b.isValid()) continue;
        if (!bounds) { bounds = b; continue; }
        if (typeof bounds.extend === 'function') bounds.extend(b);
        else if (typeof L !== 'undefined' && L.latLngBounds) {
          bounds = L.latLngBounds(bounds.getSouth && bounds.getSouth() ? bounds.getSouthWest() : [0, 0], [0, 0]);
        }
      }
      if (!bounds) return;
      /* maxZoom 17 supaya petak yang sangat kecil tetap terlihat; pad 0.08
         memberi sedikit konteks di sekeliling tepi. */
      var opsi = { padding: sheetPaddingPx(), maxZoom: 17, duration: 0.8 };
      if (typeof m.flyToBounds === 'function') m.flyToBounds(bounds.pad ? bounds.pad(0.08) : bounds, opsi);
      else if (typeof m.fitBounds === 'function') m.fitBounds(bounds.pad ? bounds.pad(0.08) : bounds, opsi);
    }, 320);
  }

  /**
   * Padding untuk flyToBounds, dalam bentuk [atas, kanan, bawah, kiri].
   *
   * Sheet GeoTools tidak ditutup lagi (lihat prepareMapForResults), jadi
   * petak harus digeser ke bagian peta yang masih terlihat. Sheet-nya
   * position: fixed di sisi kanan dengan lebar sampai 380 px; diukur langsung
   * dari DOM, bukan angka tetap, supaya tetap benar kalau lebar sheet
   * berubah atau di layar sempit dia berubah menjadi bottom sheet.
   *
   * Kalau sheet tidak terlihat (sudah diminimalkan menjadi chip, atau sudah
   * ditutup), padding dikembalikan seperti biasa supaya petak tetap memakai
   * seluruh layar.
   */
  function sheetPaddingPx() {
    var base = 24;
    var sheet = document.getElementById('geotools-sheet');
    if (!sheet || !sheet.classList) return [base, base, base, base];
    if (!sheet.classList.contains('gs-sheet-open')) return [base, base, base, base];
    // Sheet yang sudah jadi chip hanya menyisakan baris judul tipis.
    if (sheet.classList.contains('gs-sheet-minimized')) return [base, base, base, base];

    var r = null;
    try { r = sheet.getBoundingClientRect(); } catch (e) { r = null; }
    if (!r || !r.width || !r.height) return [base, base, base, base];

    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    if (!vw || !vh) return [base, base, base, base];

    var top = base, right = base, bottom = base, left = base;
    // Bottom sheet (mobile): lebarnya hampir penuh layar dan tingginya besar,
    // jadi menutupi bagian bawah. Dicek DULUAN sebelum sisi kiri/kanan --
    // kalau tidak, sheet mobile yang juga menggantung di kanan ikut dihitung
    // sebagai padding kanan dan petak tergeser ke atas.
    if (r.width > vw * 0.8 && r.height > vh * 0.35) {
      return [top, right, base + Math.round(r.height), left];
    }
    // Berdampingan di kiri: sheet menutupi sisi kiri peta.
    if (r.left <= vw * 0.5) {
      left = base + Math.round(r.width) + 12;
    } else {
      right = base + Math.round(r.width) + 12;
    }
    return [top, right, bottom, left];
  }

  window.startGeofarmPolygonUpload = function () {
    var input = document.getElementById('geofarmUploadInput');
    if (!input) { setStatus('Input berkas tidak ditemukan.', 'error'); return; }
    input.value = '';
    input.click();
  };

  window.handleGeofarmUploadFiles = function (event) {
    const input = event && event.target;
    const files = input && input.files;
    importFiles(files).catch(function (error) {
      console.error('[GeoFarm] Gagal mengimpor polygon:', error);
      setStatus('Gagal mengimpor: ' + (error && error.message ? error.message : 'tidak diketahui'), 'error');
    });
  };
})();
