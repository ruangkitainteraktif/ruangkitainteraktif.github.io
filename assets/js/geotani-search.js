/* ── GeoTani Layer Catalog Bridge ──
 * Bridges layer catalog checkboxes to existing toggle functions
 * defined in geoportal.js, sawah-dilindungi.js, erosi-kta.js.
 */
(function () {
  'use strict';

  /* WMS BPS (Sensus Pertanian 2023) layers */
  var BPS_WMS_IDS = [
    'st2023:batas_desa', 'st2023:batas_kecamatan', 'st2023:batas_kabupaten', 'st2023:batas_provinsi',
    'st2023:dasymetric_utp', 'st2023:dasymetric_utp_tp', 'st2023:dasymetric_utp_horti', 'st2023:dasymetric_utp_holti',
    'st2023:dasymetric_utp_hutan', 'st2023:dasymetric_utp_ikan', 'st2023:dasymetric_utp_kebun',
    'st2023:dasymetric_utp_milenial', 'st2023:dasymetric_utp_ternak', 'st2023:dasymetric_utp_urban',
    'st2023:geotagging', 'st2023:geotagging_tanaman_pangan', 'st2023:geotagging_hortikultura',
    'st2023:geotagging_kebun', 'st2023:geotagging_hutan', 'st2023:geotagging_ikan', 'st2023:geotagging_ternak',
    'st2023:infrastruktur_pertanian', 'st2023:gurem_lahan_vw',
    'st2023:utp_ihk_01', 'st2023:utp_ihk_02', 'st2023:utp_ihk_03', 'st2023:utp_ihk_04',
    'st2023:utp_ihk_05', 'st2023:utp_ihk_06', 'st2023:utp_ihk_07', 'st2023:utp_ihk_08',
    'st2023:utp_ihk_09', 'st2023:utp_ihk_10', 'st2023:utp_ihk_11', 'st2023:utp_ihk_12',
    'st2023:utp_ihk_13', 'st2023:utp_ihk_14', 'st2023:utp_ihk_15', 'st2023:utp_ihk_16', 'st2023:utp_ihk_17'
  ];

  /* WMTS BPS layer */
  var BPS_WMTS_IDS = ['bps-lbs-2024'];

  /* ArcGIS KEMENTAN layers */
  var ARCGIS_IDS = [
    'arcgis-sawah-2023', 'arcgis-sawah-2019',
    'arcgis-kawasan-padi', 'arcgis-kawasan-jagung', 'arcgis-kawasan-kedelai'
  ];

  /* Special layers (toggle functions defined elsewhere) */
  var SPECIAL_MAP = {
    'toggleSawahDilindungi': function (v) { if (typeof toggleSawahDilindungi === 'function') toggleSawahDilindungi(v); },
    'toggleSawahNasional50k': function (v) { if (typeof toggleSawahNasional50k === 'function') toggleSawahNasional50k(v); },
    'toggleErosiLayer': function (v) { if (typeof toggleErosiLayer === 'function') toggleErosiLayer(v); },
    'toggleBpsTutupanLahan': function (v) { if (typeof toggleBpsTutupanLahan === 'function') toggleBpsTutupanLahan(v); },
    'toggleBppLayer': function (v) { if (typeof toggleBppLayer === 'function') toggleBppLayer(v); },
    'toggleSawitLayer': function (v) { if (typeof toggleSawitLayer === 'function') toggleSawitLayer(v); }
  };

  function bindCheckbox(id, handler) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () { handler(this.checked); });
  }

  function initGeotaniCatalogBridge() {
    var i, id;

    /* WMS BPS layers */
    for (i = 0; i < BPS_WMS_IDS.length; i++) {
      id = BPS_WMS_IDS[i];
      bindCheckbox(id, (function (layerId) {
        return function (visible) { if (typeof toggleBpsSt2023Layer === 'function') toggleBpsSt2023Layer(layerId, visible); };
      })(id));
    }

    /* WMTS BPS layers */
    for (i = 0; i < BPS_WMTS_IDS.length; i++) {
      id = BPS_WMTS_IDS[i];
      bindCheckbox(id, (function (layerId) {
        return function (visible) { if (typeof toggleBpsWmts === 'function') toggleBpsWmts(layerId, visible); };
      })(id));
    }

    /* ArcGIS layers */
    for (i = 0; i < ARCGIS_IDS.length; i++) {
      id = ARCGIS_IDS[i];
      bindCheckbox(id, (function (layerId) {
        return function (visible) { if (typeof toggleArcgisSawah === 'function') toggleArcgisSawah(layerId, visible); };
      })(id));
    }

    /* Special layers */
    var keys = Object.keys(SPECIAL_MAP);
    for (i = 0; i < keys.length; i++) {
      bindCheckbox(keys[i], SPECIAL_MAP[keys[i]]);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initGeotaniCatalogBridge, 300);
  });
})();
