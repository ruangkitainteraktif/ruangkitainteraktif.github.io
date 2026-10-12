/* ── IGTPR ATR/BPN — 788 layer WMS ──
 *
 * Layer dimuat dari assets/data/igtpr-layers.json saat Katalog Layer dibuka
 * pertama kali, lalu diregistrasikan sebagai kategori dinamis. Dipisah dari
 * LAYER_CATALOG_DATA di map-core.js supaya 788 entri tidak ikut membebani
 * waktu muat awal halaman.
 *
 * PENTING: server ini dalam kondisi rusak dan tidak akan hilang dengan
 * sendirinya. GetCapabilities mengiklankan 788 layer, tetapi hasil uji
 * GetMap di bbox Jakarta untuk KETIGANYA (bukan sampel) menunjukkan:
 *   418 -> ServiceException, tabel PostGIS di belakang layer sudah dihapus
 *          ("ERROR: relation \"shp_...\" does not exist")
 *   332 -> PNG kosong, nol piksel opaque
 *    25 -> gagal / error HTTP
 *    13 -> timeout
 *     0 -> benar-benar menampilkan data
 *
* Artinya hampir semua checkbox di katalog ini tidak akan menampilkan apa
   * pun ketika diklik. Daftar tetap ditampilkan karena diminta, tapi jangan
   * simpulkan layer itu rusak hanya karena tidak tampil. Field `error` dan
   * `empty` di JSON menyimpan hasil uji itu supaya mudah dibedakan nanti kalau
   * server-nya diperbaiki.
 *
 * Nama layer juga nyaris tidak informatif: 786 dari 788 bernama
 * "shp_<hex>" dengan title yang sama persis dengan nama. Hanya dua yang
 * punya judul berarti ("Zona Nilai Tanah" dan "_Kawasan Hutan"), dan
 * keduanya juga kosong di semua zona yang diuji.
 */
(function () {
  'use strict';

  var WMS_URL = 'https://igtpr.atrbpn.go.id/geoserver/igt/wms';
  var DATA_URL = 'assets/data/igtpr-layers.json';
  var SIGNATURE = 'igtpr';

  var aktif = new Map();
  var legendas = new Map();
  var sudahDimuat = false;
  var sedangMemuat = null;

  /* Layer memakai WMS 1.3.0. Leaflet menambah sendiri parameter service,
     request, layers, version, format, width, height, bbox, dan crs dari
     option di toggle(), jadi WMS_URL dipakai polos -- menuliskan parameter
     yang sama secara manual hanya menghasilkan duplikat di URL. */
  function legendUrl(layerName) {
    return WMS_URL + '?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image%2Fpng&sld_version=1.1.0&layer=' +
      encodeURIComponent(layerName);
  }

  function showLegend(layerName) {
    if (legendas.has(layerName)) return;
    if (typeof addUnifiedLegend !== 'function') return;
    if (typeof createLegendWithToggle !== 'function') return;

    var div = L.DomUtil.create('div', 'igtpr-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="igtpr-legend-title">' + layerName + '</div>' +
      '<img class="igtpr-legend-img" alt="Legenda" src="' + legendUrl(layerName) + '" onerror="this.style.display=&apos;none&apos;" />' +
      '<div class="igtpr-legend-source">Sumber: ATR/BPN — IGTPR (igtpr.atrbpn.go.id)</div>';

    addUnifiedLegend('igtpr-' + layerName, createLegendWithToggle(div));
    legendas.set(layerName, true);
  }

  function hideLegend(layerName) {
    if (!legendas.has(layerName)) return;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('igtpr-' + layerName);
    legendas.delete(layerName);
  }

  function toggle(layerName, visible) {
    if (visible) {
      if (aktif.has(layerName)) {
        var sdh = aktif.get(layerName);
        if (typeof map !== 'undefined' && map && map.hasLayer(sdh)) return;
        aktif.delete(layerName);
      }
      var layer = L.tileLayer.wms(WMS_URL, {
        layers: layerName,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        attribution: 'ATR/BPN IGTPR'
      });
      layer.on('tileerror', function () { /* server sering 500/ServiceException */ });
      layer.addTo(map);
      aktif.set(layerName, layer);
      showLegend(layerName);
    } else {
      var l = aktif.get(layerName);
      if (l) {
        if (typeof map !== 'undefined' && map && map.hasLayer(l)) map.removeLayer(l);
        aktif.delete(layerName);
      }
      hideLegend(layerName);
    }
  }

  window.toggleDynamicCatalogLayer = function (layerName, visible) {
    toggle(layerName, !!visible);
  };

  window.isDynamicCatalogLayerActive = function (layerName) {
    var l = aktif.get(layerName);
    return !!(l && typeof map !== 'undefined' && map && map.hasLayer(l));
  };

  /* Dipanggil resetAllLayersImpl agar tombol Reset Semua ikut mematikan
   * layer IGTPR yang sedang nyala. */
  window.resetDynamicCatalogLayers = function () {
    aktif.forEach(function (layer, layerName) {
      try {
        if (map && map.hasLayer(layer)) map.removeLayer(layer);
      } catch (e) { /* sudah tidak ada di peta */ }
    });
    aktif.clear();
    legendas.forEach(function (_v, layerName) { hideLegend(layerName); });
  };

  window.ensureDynamicCatalogLoaded = function () {
    if (sudahDimuat) return;
    if (sedangMemuat) return sedangMemuat;
    if (typeof window.registerDynamicLayerCategory !== 'function') return;

    sedangMemuat = fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (cfg) {
        var layers = (cfg && cfg.layers) || [];
        var items = layers.map(function (l) {
          var label = l.label || l.id;
          /* Tandai status hasil uji supaya layer yang jelas rusak tidak
           * terlihat sama dengan layer yang mungkin sudah diperbaiki. */
          if (l.error) label += ' [error]';
          else if (l.empty) label += ' [kosong]';
          return { id: 'igtpr:' + l.id, label: label, dynamicKey: l.id };
        });
        window.registerDynamicLayerCategory({
          signature: SIGNATURE,
          title: (cfg && cfg.title) || 'IGTPR ATR/BPN',
          subcat: (cfg && cfg.subcat) || 'Semua Layer IGTPR',
          layers: items
        });
        sudahDimuat = true;
      })
      .catch(function (err) {
        sedangMemuat = null;
        console.warn('[IGTPR] Gagal memuat daftar layer:', err);
      });

    return sedangMemuat;
  };
})();