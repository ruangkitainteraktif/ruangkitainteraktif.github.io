/* ── ATRBPN WMS Tile Layers (mapservice.atrbpn.go.id) ── */
(function () {
  'use strict';

  var WMS_URL = 'https://mapservice.atrbpn.go.id/geoserver/wms';

  var LAYERS = {
    'atrbpn-wms-toponim-umum': { layer: 'umum:toponim', label: 'Toponim', center: [-2.4653, 118.0086] },
    'atrbpn-wms-blbi-umum': { layer: 'umum:BLBI', label: 'BLBI', center: null },
    'atrbpn-wms-blbipoint-umum': { layer: 'umum:BLBIPOINT', label: 'BLBI Titik', center: null },
    'atrbpn-wms-dir-pengendalian-data-hgu-hgb-hp-dirpengendalian': { layer: 'dirpengendalian:Dir_pengendalian data hgu hgb hp', label: 'Dit. Pengendalian HGU/HGB/HP', center: null },
    'atrbpn-wms-lsd-umum': { layer: 'umum:LSD', label: 'Lahan Sawah Dilindungi', center: null },
    'atrbpn-wms-penetapan-kawasan-hutan-umum': { layer: 'umum:PENETAPAN_KAWASAN_HUTAN', label: 'Penetapan Kawasan Hutan', center: null },
    'atrbpn-wms-penggunaantanah-penggunaantanah': { layer: 'PenggunaanTanah:PENGGUNAANTANAH', label: 'Penggunaan Tanah', center: null },
    'atrbpn-wms-penunjukan-kawasan-hutan-umum': { layer: 'umum:PENUNJUKAN_KAWASAN_HUTAN', label: 'Penunjukan Kawasan Hutan', center: null },
    'atrbpn-wms-persilberdasarkanstatuspendaftaran-petabpn': { layer: 'petabpn:PersilBerdasarkanStatusPendaftaran', label: 'Persil per Status Pendaftaran', center: null },
    'atrbpn-wms-v-letakpersil-umum': { layer: 'umum:V_LETAKPERSIL', label: 'Letak Persil', center: null },
    'atrbpn-wms-zntrange-zntrange': { layer: 'ZNTRANGE:ZNTRANGE', label: 'ZNTRANGE', center: null },
    'atrbpn-wms-zntrange-igt': { layer: 'igt:ZNTRANGE', label: 'ZNTRANGE (IGT)', center: null },
    'atrbpn-wms-zntrange-djbpd': { layer: 'djbpd:ZNTRANGE', label: 'ZNTRANGE (DJBPD)', center: null },
    'atrbpn-wms-admdesacirebon-lampung': { layer: 'lampung:admdesacirebon', label: 'Admin Desa Cirebon', center: [-6.7613, 108.5851] },
    'atrbpn-wms-btdki-btdki': { layer: 'btdki:btdki', label: 'Batas Tanah DKI 2', center: null },
    'atrbpn-wms-btdki-old-btdki': { layer: 'btdki:btdki_old', label: 'Batas Tanah DKI (old)', center: null },
    'atrbpn-wms-djpk-layer-djpk-nomorhak': { layer: 'djpk_nomorhak:djpk_layer', label: 'DJP-K Nomor Hak', center: null },
    'atrbpn-wms-hgu-djp-djp-hgu': { layer: 'djp_hgu:hgu_djp', label: 'HGU DJP', center: null },
    'atrbpn-wms-hortikultura-hortikultura': { layer: 'hortikultura:hortikultura', label: 'hortikultura', center: null },
    'atrbpn-wms-hplhgb-hplhgb': { layer: 'hplhgb:hplhgb', label: 'HPL HGB', center: null },
    'atrbpn-wms-hplhgbhp-hplhgbhp': { layer: 'hplhgbhp:hplhgbhp', label: 'HPL HGB HP', center: null },
    'atrbpn-wms-inventarisasi-aset-atrbpn': { layer: 'atrbpn:inventarisasi_aset', label: 'Inventarisasi Aset', center: null },
    'atrbpn-wms-jb-24-25-jb-24-25': { layer: 'jb_24_25:jb_24_25', label: 'Jabatan Batas 2024-2025', center: [-3.8047, 111.7058] },
    'atrbpn-wms-kerawanan-banjir-rawan-banjir': { layer: 'rawan_banjir:kerawanan_banjir', label: 'Kerawanan Banjir', center: [-2.4653, 118.0151] },
    'atrbpn-wms-lahanbakusawah-new-sawah': { layer: 'sawah:lahanbakusawah_new', label: 'Lahan Baku Sawah 2024', center: null },
    'atrbpn-wms-laut-laut': { layer: 'laut:laut', label: 'Laut', center: null },
    'atrbpn-wms-layer-2023-2025-jb-2023-2025': { layer: 'jb_2023_2025:layer_2023_2025', label: 'Jabatan Batas 2023-2025', center: [-3.6827, 102.384] },
    'atrbpn-wms-layer-2023-2025-2-jb-2023-2025': { layer: 'jb_2023_2025:layer_2023_2025_2', label: 'Jabatan Batas 2023-2025 (2)', center: [-3.8047, 111.7058] },
    'atrbpn-wms-lsd-12-provinsi-sawah': { layer: 'sawah:lsd_12_provinsi', label: 'LSD 12 Provinsi', center: null },
    'atrbpn-wms-lsd-8-provinsi-sawah': { layer: 'sawah:lsd_8_provinsi', label: 'LSD 8 Provinsi', center: null },
    'atrbpn-wms-persil15-persil15': { layer: 'persil15:persil15', label: 'Persil15', center: null },
    'atrbpn-wms-persil-tuban-tuban': { layer: 'tuban:persil_tuban', label: 'Persil Tuban', center: null },
    'atrbpn-wms-prov22-prov22': { layer: 'prov22:prov22', label: 'Provinsi (prov22)', center: null },
    'atrbpn-wms-znt1025-znt1025': { layer: 'znt1025:znt1025', label: 'znt1025', center: null },
    'atrbpn-wms-znt15-znt15': { layer: 'znt15:znt15', label: 'znt15', center: null },
    'atrbpn-wms-znt2025-znt2025': { layer: 'znt2025:znt2025', label: 'znt2025', center: null },
    'atrbpn-wms-znt-100-znt-100': { layer: 'znt_100:znt_100', label: 'znt_100', center: null },
    'atrbpn-wms-znt-djp-kemenkeu': { layer: 'kemenkeu:znt_djp', label: 'znt_djp', center: [-8.5, 117.5] },
    'atrbpn-wms-zntbandungraya-zntbandungraya': { layer: 'zntbandungraya:zntbandungraya', label: 'zntbandungraya', center: null },
    'atrbpn-wms-zntdki-zntdki': { layer: 'zntdki:zntdki', label: 'zntdki', center: null },
    'atrbpn-wms-zntdki1025-zntdki1025': { layer: 'zntdki1025:zntdki1025', label: 'zntdki1025', center: null },
    'atrbpn-wms-zntkaltim-zntkaltim': { layer: 'zntkaltim:zntkaltim', label: 'zntkaltim', center: null },
    'atrbpn-wms-zntkotamalang-zntkotamalang': { layer: 'zntkotamalang:zntkotamalang', label: 'zntkotamalang', center: null },
    'atrbpn-wms-zntkotapadang-zntkotapadang': { layer: 'zntkotapadang:zntkotapadang', label: 'zntkotapadang', center: [-2.5, 118.0] },
    'atrbpn-wms-zntpadang-zntpadang': { layer: 'zntpadang:zntpadang', label: 'zntpadang', center: [-0.9623, 100.4032] },
    'atrbpn-wms-zntpangkajene-zntpangkajene': { layer: 'zntpangkajene:zntpangkajene', label: 'zntpangkajene', center: null },
    'atrbpn-wms-zntpemalang-zntpemalang': { layer: 'zntpemalang:zntpemalang', label: 'zntpemalang', center: null },
    'atrbpn-wms-zntsidoarjo-zntsidoarjo': { layer: 'zntsidoarjo:zntsidoarjo', label: 'ZNT Sidoarjo', center: null }
  };

  var active = {};
  var legendActive = {};

  function flyToConfig() {
    map.flyTo([-6.1754, 106.8272], 11, { duration: 1.2 });
  }

  function show(id) {
    var c = LAYERS[id];
    if (!c) return;
    if (active[id]) { map.removeLayer(active[id]); }
    active[id] = L.tileLayer.wms(WMS_URL, {
      layers: c.layer,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      tiled: true,
      opacity: 0.7,
      maxZoom: 18,
      attribution: c.label + " (ATR/BPN)"
    }).addTo(map);
    flyToConfig();
    showLegend(id, c);
  }

  function hide(id) {
    if (active[id]) { map.removeLayer(active[id]); delete active[id]; }
    hideLegend(id);
  }

  function showLegend(id, c) {
    if (legendActive[id]) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'atrbpn-legend');
    L.DomEvent.disableClickPropagation(div);
    var legendUrl = WMS_URL + '?service=WMS&version=1.1.1&request=GetLegendGraphic'
      + '&format=image/png&layer=' + encodeURIComponent(c.layer)
      + '&legend_options=fontAntiAliasing:true;fontSize:11';
    div.innerHTML =
      '<div class="atrbpn-legend-title">' + c.label + '</div>'
      + '<img src="' + legendUrl + '" alt="legend" style="max-width:100%;background:#fff;border-radius:4px;" onerror="this.style.display=&apos;none&apos;" />'
      + '<div class="atrbpn-legend-source">Sumber: ATR/BPN (mapservice.atrbpn.go.id)</div>';
    addUnifiedLegend(id, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendActive[id] = true;
  }

  function hideLegend(id) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(id);
    legendActive[id] = false;
  }

  window.toggleAtrbpnWmsLayer = function (id, visible) {
    if (visible) show(id); else hide(id);
  };

  window.isAtrbpnWmsActive = function (id) {
    return !!(active[id] && map.hasLayer(active[id]));
  };

  window.ATRBPN_WMS_IDS = Object.keys(LAYERS);
})();
