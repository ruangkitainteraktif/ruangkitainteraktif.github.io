/* ── SITR Jawa Timur WMS Layers (sitr.jatimprov.go.id) ──
 * Sistem Informasi Tata Ruang Provinsi Jawa Timur — GeoServer publik.
 * Tanpa header CORS, tapi Leaflet memuat tile via <img> sehingga tidak
 * butuh CORS untuk menampilkan peta (hanya ekspor kanvas yang terblokir).
 */
(function () {
  'use strict';

  var WMS_URL = 'https://sitr.jatimprov.go.id/geoserver/sitr/wms';

  var LAYERS = {
    'sitr-wms-5': { layer: 'sitr:layer_group_5', label: 'Batas Administrasi Area' },
    'sitr-wms-6': { layer: 'sitr:layer_group_6', label: 'Rencana Pola Ruang' },
    'sitr-wms-7': { layer: 'sitr:layer_group_7', label: 'Rencana Pola Ruang (Kab/Kota)' },
    'sitr-wms-12': { layer: 'sitr:layer_group_12', label: 'Sistem Jaringan Jalan' },
    'sitr-wms-15': { layer: 'sitr:layer_group_15', label: 'Sistem Jaringan Prasarana Lainnya' },
    'sitr-wms-19': { layer: 'sitr:layer_group_19', label: 'Sumber Mata Air' },
    'sitr-wms-20': { layer: 'sitr:layer_group_20', label: 'Sistem Jaringan Energi' },
    'sitr-wms-21': { layer: 'sitr:layer_group_21', label: 'Jaringan Gas dan Minyak' },
    'sitr-wms-25': { layer: 'sitr:layer_group_25', label: 'Sistem Perkotaan' },
    'sitr-wms-26': { layer: 'sitr:layer_group_26', label: 'Bandar Udara' },
    'sitr-wms-28': { layer: 'sitr:layer_group_28', label: 'Rencana Pola Ruang (Jawa Timur)' },
    'sitr-wms-29': { layer: 'sitr:layer_group_29', label: 'Stasiun KA' },
    'sitr-wms-32': { layer: 'sitr:layer_group_32', label: 'Sistem Jaringan Jalan (Kab/Kota)' },
    'sitr-wms-33': { layer: 'sitr:layer_group_33', label: 'Sistem Perkotaan (Kab/Kota)' },
    'sitr-wms-35': { layer: 'sitr:layer_group_35', label: 'Sistem Drainase (Kab/Kota)' },
    'sitr-wms-36': { layer: 'sitr:layer_group_36', label: 'Sistem Jaringan Persampahan (Kab/Kota)' },
    'sitr-wms-37': { layer: 'sitr:layer_group_37', label: 'Sistem Jaringan Jalan Tol' },
    'sitr-wms-38': { layer: 'sitr:layer_group_38', label: 'Rencana Jaringan Gas (Kab/Kota)' },
    'sitr-wms-39': { layer: 'sitr:layer_group_39', label: 'Rencana Saluran Irigasi (Kab/Kota)' },
    'sitr-wms-40': { layer: 'sitr:layer_group_40', label: 'Rencana Bandara (Kab/Kota)' },
    'sitr-wms-41': { layer: 'sitr:layer_group_41', label: 'Rencana Terminal (Kab/Kota)' },
    'sitr-wms-42': { layer: 'sitr:layer_group_42', label: 'Rencana Jaringan Listrik (Kab/Kota)' },
    'sitr-wms-43': { layer: 'sitr:layer_group_43', label: 'Rencana SUTET' },
    'sitr-wms-44': { layer: 'sitr:layer_group_44', label: 'Rencana Kawasan Agropolitan (Kab/Kota)' },
    'sitr-wms-45': { layer: 'sitr:layer_group_45', label: 'Rencana Kawasan Lindung (Kab/Kota)' },
    'sitr-wms-46': { layer: 'sitr:layer_group_46', label: 'Rencana Cakupan Persampahan (Kab/Kota)' },
    'sitr-wms-47': { layer: 'sitr:layer_group_47', label: 'Rencana Persampahan TPA (Kab/Kota)' },
    'sitr-wms-48': { layer: 'sitr:layer_group_48', label: 'Perencanaan Sistem Penyediaan Air Minum (Kab/Kota)' },
    'sitr-wms-49': { layer: 'sitr:layer_group_49', label: 'Rencana Telematika (Kab/Kota)' },
    'sitr-wms-50': { layer: 'sitr:layer_group_50', label: 'Rencana Gardu Induk (Kab/Kota)' },
    'sitr-wms-51': { layer: 'sitr:layer_group_51', label: 'Rencana Jalur Pelayaran (Kab/Kota)' },
    'sitr-wms-52': { layer: 'sitr:layer_group_52', label: 'Rencana Jalur Penerbangan (Kab/Kota)' },
    'sitr-wms-53': { layer: 'sitr:layer_group_53', label: 'Rencana Jaringan Air Bersih (Kab/Kota)' },
    'sitr-wms-54': { layer: 'sitr:layer_group_54', label: 'Rencana Rel Kereta Api (Kab/Kota)' },
    'sitr-wms-55': { layer: 'sitr:layer_group_55', label: 'Rencana Sistem Jaringan Telekomunikasi (Kab/Kota)' },
    'sitr-wms-56': { layer: 'sitr:layer_group_56', label: 'Rencana Sumber Daya Air (Kab/Kota)' },
    'sitr-wms-59': { layer: 'sitr:layer_group_59', label: 'Kawasan Pertahanan & Keamanan (Kab/Kota)' },
    'sitr-wms-60': { layer: 'sitr:layer_group_60', label: 'Rencana SUTT (Kab/Kota)' },
    'sitr-wms-61': { layer: 'sitr:layer_group_61', label: 'Rencana Sistem Perkotaan (Kab/Kota)' },
    'sitr-wms-62': { layer: 'sitr:layer_group_62', label: 'Rencana Wilayah Pelayanan (Kab/Kota)' },
    'sitr-wms-63': { layer: 'sitr:layer_group_63', label: 'Rencana Jaringan Jalan Lingkar Utara (Kab/Kota)' },
    'sitr-wms-64': { layer: 'sitr:layer_group_64', label: 'Rencana Jaringan Pedestarian (Kab/Kota)' },
    'sitr-wms-65': { layer: 'sitr:layer_group_65', label: 'Rencana Pengembangan Pintu Perlintasan KA (Kab/Kota)' },
    'sitr-wms-66': { layer: 'sitr:layer_group_66', label: 'Rencana Prasarana Transportasi (Kab/Kota)' },
    'sitr-wms-67': { layer: 'sitr:layer_group_67', label: 'Rencana IPAL (Kab/Kota)' },
    'sitr-wms-68': { layer: 'sitr:layer_group_68', label: 'Rencana Area Persampahan TPA (Kab/Kota)' },
    'sitr-wms-69': { layer: 'sitr:layer_group_69', label: 'Rencana Persampahan TPS (Kab/Kota)' },
    'sitr-wms-71': { layer: 'sitr:layer_group_71', label: 'Rencana Saluran (Kab/Kota)' },
    'sitr-wms-72': { layer: 'sitr:layer_group_72', label: 'Batas Unit Lingkungan (Kab/Kota)' },
    'sitr-wms-73': { layer: 'sitr:layer_group_73', label: 'BTS (Kab/Kota)' },
    'sitr-wms-74': { layer: 'sitr:layer_group_74', label: 'Rencana Titik Sistem Jaringan Telekomunikasi' },
    'sitr-wms-75': { layer: 'sitr:layer_group_75', label: 'Rencana Titik Jaringan Air Bersih (Kab/Kota)' },
    'sitr-wms-76': { layer: 'sitr:layer_group_76', label: 'Rencana Titik Jaringan Listrik (Kab/Kota)' },
    'sitr-wms-77': { layer: 'sitr:layer_group_77', label: 'Rencana Titik Jaringan Transportasi (Kab/Kota)' },
    'sitr-wms-78': { layer: 'sitr:layer_group_78', label: 'Rencana SPAM (Kab/Kota)' },
    'sitr-wms-79': { layer: 'sitr:layer_group_79', label: 'Rencana Area Jaringan Jalan Tol (Kab/Kota)' },
    'sitr-wms-80': { layer: 'sitr:layer_group_80', label: 'Rencana Toll Gate (Kab/Kota)' },
    'sitr-wms-81': { layer: 'sitr:layer_group_81', label: 'Wilayah Perencanaan (Kab/Kota)' },
    'sitr-wms-82': { layer: 'sitr:layer_group_82', label: 'Rencana ORR (Kab/Kota)' },
    'sitr-wms-83': { layer: 'sitr:layer_group_83', label: 'Rencana IRR (Kab/Kota)' },
    'sitr-wms-84': { layer: 'sitr:layer_group_84', label: 'Rencana Jaringan Jalan (Kab/Kota)' },
    'sitr-wms-86': { layer: 'sitr:layer_group_86', label: 'Kawasan Industri & Rawan Banjir, Erosi (Kab/Kota)' },
    'sitr-wms-87': { layer: 'sitr:layer_group_87', label: 'Kawasan Industri (Kab/Kota)' },
    'sitr-wms-88': { layer: 'sitr:layer_group_88', label: 'Rencana Kawasan Strategis Ekonomi (Kab/Kota)' },
    'sitr-wms-89': { layer: 'sitr:layer_group_89', label: 'Rencana Menara Bersama (Kab/Kota)' },
    'sitr-wms-90': { layer: 'sitr:layer_group_90', label: 'Rencana Pariwisata (Kab/Kota)' },
    'sitr-wms-91': { layer: 'sitr:layer_group_91', label: 'Rencana Pengembangan Wilayah (Kab/Kota)' },
    'sitr-wms-92': { layer: 'sitr:layer_group_92', label: 'Rencana Rute Wisata (Kab/Kota)' },
    'sitr-wms-93': { layer: 'sitr:layer_group_93', label: 'SSWP (Kab/Kota)' },
    'sitr-wms-94': { layer: 'sitr:layer_group_94', label: 'Rencana Pelabuhan Penyeberangan (Kab/Kota)' },
    'sitr-wms-95': { layer: 'sitr:layer_group_95', label: 'Rencana Pelabuhan (Kab/Kota)' },
    'sitr-wms-96': { layer: 'sitr:layer_group_96', label: 'Rencana Rel Double Track (Kab/Kota)' },
    'sitr-wms-97': { layer: 'sitr:layer_group_97', label: 'Rencana Rel Konservasi (Kab/Kota)' },
    'sitr-wms-98': { layer: 'sitr:layer_group_98', label: 'Rencana Stasiun KA (Kab/Kota)' },
    'sitr-wms-99': { layer: 'sitr:layer_group_99', label: 'Rencana Pelabuhan Ikan (Kab/Kota)' },
    'sitr-wms-100': { layer: 'sitr:layer_group_100', label: 'Rencana Pola Ruang (Kab/Kota)' },
    'sitr-wms-101': { layer: 'sitr:layer_group_101', label: 'Rencana Titik Rel Kereta Api Konservasi (Kab/Kota)' },
    'sitr-wms-102': { layer: 'sitr:layer_group_102', label: 'Rencana Terminal Barang (Kab/Kota)' },
    'sitr-wms-103': { layer: 'sitr:layer_group_103', label: 'Pola Ruang (Kab/Kota) Percobaan' },
    'sitr-wms-104': { layer: 'sitr:layer_group_104', label: 'Bandar Udara (Testing)' },
    'sitr-wms-107': { layer: 'sitr:layer_group_107', label: 'Infrastruktur Transportasi' },
    'sitr-wms-108': { layer: 'sitr:layer_group_108', label: 'Kawasan Strategis' },
    'sitr-wms-109': { layer: 'sitr:layer_group_109', label: 'Rencana Jaringan Telekomunikasi' },
    'sitr-wms-110': { layer: 'sitr:layer_group_110', label: 'Sistem Infrastruktur Energi' },
    'sitr-wms-111': { layer: 'sitr:layer_group_111', label: 'Sistem Infrastruktur Prasarana Lain' },
    'sitr-wms-112': { layer: 'sitr:layer_group_112', label: 'Sistem Infrastruktur Sumber Daya Air' },
    'sitr-wms-113': { layer: 'sitr:layer_group_113', label: 'Sistem Pusat Permukiman' },
    'sitr-wms-114': { layer: 'sitr:layer_group_114', label: 'Sistem Jaringan Energi' },
    'sitr-wms-115': { layer: 'sitr:layer_group_115', label: 'Sistem Jaringan Prasarana Lain' },
    'sitr-wms-116': { layer: 'sitr:layer_group_116', label: 'Sistem Jaringan Sumber Daya Air' },
    'sitr-wms-117': { layer: 'sitr:layer_group_117', label: 'Sistem Jaringan Transportasi' },
    'sitr-wms-118': { layer: 'sitr:layer_group_118', label: 'Rencana Pola Ruang Kab/Kota Perda 2023' },
    'sitr-wms-120': { layer: 'sitr:layer_group_120', label: 'KKPRL Perda 10/2023 — RTRW Provinsi' }
  };

  var active = {};
  var legendActive = {};

  function flyToConfig() {
    map.flyTo([-7.53, 112.5], 9, { duration: 1.2 });
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
      opacity: 0.75,
      maxZoom: 18,
      attribution: c.label + ' (SITR Jatim)'
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
      + '<div class="atrbpn-legend-source">Sumber: SITR Jawa Timur (sitr.jatimprov.go.id)</div>';
    addUnifiedLegend(id, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendActive[id] = true;
  }

  function hideLegend(id) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(id);
    legendActive[id] = false;
  }

  window.toggleSitrJatimWmsLayer = function (id, visible) {
    if (visible) show(id); else hide(id);
  };

  window.isSitrJatimWmsActive = function (id) {
    return !!(active[id] && map.hasLayer(active[id]));
  };

  window.SITR_JATIM_WMS_IDS = Object.keys(LAYERS);
})();
