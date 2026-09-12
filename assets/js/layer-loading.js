/* ── Universal map-layer loading spinner overlay + error toast ──
 * Shows a transparent spinner over the map whenever a map-layer
 * checkbox is toggled on, and hides it when the layer finishes
 * loading. Shows a toast error if the layer fails to load.
 */
(function () {
  'use strict';

  var SAFETY_TIMEOUT = 4000;
  var ERROR_MESSAGES = {
    'toggleConcessionsLayer': 'Data Konsesi GFW tidak tersedia.',
    'toggleProtectedLayer': 'Data Kawasan Konservasi WDPA tidak tersedia.',
    'toggleMangroveLayer': 'Data Mangrove GMW tidak tersedia.',
    'togglePeatlandLayer': 'Data Lahan Gambut GFW tidak tersedia.',
    'toggleKawasanHutanLayer': 'Data Kawasan Hutan ESDM tidak tersedia.',
    'toggleGambutLayer': 'Data Lahan Gambut SIMONTANA tidak tersedia.',
    'toggleKhLayer': 'Data Kawasan Kehutanan tidak tersedia.',
    'togglePippibLayer': 'Data PIPPIB tidak tersedia.',
    'toggleSawitNasionalLayer': 'Data Sawit Nasional tidak tersedia.',
    'toggleSawitPerkebunanLayer': 'Data Sawit dan Perkebunan tidak tersedia.',
    'toggleRehabDasLayer': 'Data Rehab DAS tidak tersedia.',
    'togglePerkebunanPl24Layer': 'Data Perkebunan PL24 tidak tersedia.',
    'toggleRktnSumateraLayer': 'Data RKTN Sumatera tidak tersedia.',
    'toggleRktnSulawesiLayer': 'Data RKTN Sulawesi tidak tersedia.',
    'toggleRktnPapuaLayer': 'Data RKTN Papua tidak tersedia.',
    'toggleRktnMalukuLayer': 'Data RKTN Maluku tidak tersedia.',
    'toggleRktnKalimantanLayer': 'Data RKTN Kalimantan tidak tersedia.',
    'toggleRktnJawaLayer': 'Data RKTN Jawa tidak tersedia.',
    'toggleRktnBaliNtLayer': 'Data RKTN Bali & NT tidak tersedia.',
    'toggleFaultLayer': 'Data Patahan Indonesia tidak tersedia.',
    'toggleFaultLayerNew': 'Data Patahan Indonesia Baru tidak tersedia.',
    'toggleJalurEvakuasi': 'Data Jalur Evakuasi tidak tersedia.',
    'toggleVolcanoLayer': 'Data Gunung Api tidak tersedia.',
    'toggleKrbGunungApi': 'Data KRB Gunung Api tidak tersedia.',
    'toggleKrbTitik': 'Data Gas Vulkanik tidak tersedia.',
    'togglePetaGeologi': 'Data Peta Geologi BIG tidak tersedia.',
    'toggleGeostruktur': 'Data Geostruktur tidak tersedia.',
    'togglePatahanAktif': 'Data Patahan Aktif tidak tersedia.',
    'toggleLikuifaksi': 'Data Likuifaksi tidak tersedia.',
    'toggleKarst': 'Data Karst tidak tersedia.',
    'toggleSebaranPasar': 'Data Sebaran Pasar tidak tersedia.',
    'toggleSppgSebaranLayer': 'Data Sebaran SPPG tidak tersedia.',
    'toggleSppgLayer': 'Data SPPG tidak tersedia.',
    'toggleDemnasOverlay': 'Data Terrain SRTM tidak tersedia.',
    'toggleBppLayer': 'Data BPP tidak tersedia.',
    'toggleSawitLayer': 'Data Sawit tidak tersedia.',
    'toggleErosiLayer': 'Data Erosi tidak tersedia.',
    'toggleHotspotLayer': 'Data Hotspot tidak tersedia.',
    'toggleCuacaPelabuhanLayer': 'Data Cuaca Pelabuhan tidak tersedia.',
    'toggleCuacaPerairanLayer': 'Data Cuaca Perairan tidak tersedia.',
    'toggleWindRgb': 'Data Wind Speed tidak tersedia.',
    'toggleRhRgb': 'Data Relative Humidity tidak tersedia.',
    'toggleTp24Rgb': 'Data Precipitation tidak tersedia.',
    'togglePm25Rgb': 'Data PM2.5 tidak tersedia.',
    'toggleHthRgb': 'Data Hari Tanpa Hujan tidak tersedia.',
    'toggleMaritimeAngin': 'Data Angin Laut tidak tersedia.',
    'toggleMaritimeGelombang': 'Data Tinggi Gelombang tidak tersedia.',
    'toggleMaritimeSwell': 'Data Swell tidak tersedia.',
    'toggleMaritimeWindSea': 'Data Wind Sea tidak tersedia.',
    'toggleTollRoad': 'Data Jalan Tol tidak tersedia.',
    'toggleNationalRoad': 'Data Jalan Nasional tidak tersedia.',
    'toggleNonTollRoad': 'Data Jalan Non Tol tidak tersedia.',
    'toggleLatestEarthquake': 'Data Gempa Terbaru BMKG tidak tersedia.',
    'toggleSignificantMarkers': 'Data Gempa Signifikan tidak tersedia.',
    'toggleFeltMarkers': 'Data Gempa Dirasakan tidak tersedia.',
    'toggleHistoryGempa': 'Data Riwayat Gempa tidak tersedia.',
    'toggleKatalogGempa': 'Data Katalog Gempa tidak tersedia.',
    'toggleSensorSeismic': 'Data Sensor Seismic tidak tersedia.',
    'toggleSensorGlobal': 'Data Sensor Global tidak tersedia.',
    'toggleLsdTmsLayer': 'Data Lahan Sawah Dilindungi (LSD) tidak tersedia.',
    'toggleBpsTutupanLahan': 'Data Tutupan Lahan tidak tersedia.',
    'toggleErosiLayer': 'Data Peta Rawan Erosi tidak tersedia.',
    'toggleSawahDilindungi': 'Data LSD 50K tidak tersedia.',
    'toggleSawahNasional50k': 'Data LBS 50K tidak tersedia.',
    'toggleBppLayer': 'Data BPP tidak tersedia.',
    'toggleSawitLayer': 'Data IGT Sawit tidak tersedia.',
    'st2023:batas_desa': 'Data Batas Desa tidak tersedia.',
    'st2023:batas_kecamatan': 'Data Batas Kecamatan tidak tersedia.',
    'st2023:batas_kabupaten': 'Data Batas Kabupaten tidak tersedia.',
    'st2023:batas_provinsi': 'Data Batas Provinsi tidak tersedia.',
    'st2023:dasymetric_utp': 'Data Dasymetric UTP tidak tersedia.',
    'st2023:dasymetric_utp_tp': 'Data Dasymetric UTP Tanaman Pangan tidak tersedia.',
    'st2023:dasymetric_utp_horti': 'Data Dasymetric UTP Hortikultura tidak tersedia.',
    'st2023:dasymetric_utp_holti': 'Data Dasymetric UTP Holtikultura tidak tersedia.',
    'st2023:dasymetric_utp_hutan': 'Data Dasymetric UTP Hutan tidak tersedia.',
    'st2023:dasymetric_utp_ikan': 'Data Dasymetric UTP Perikanan tidak tersedia.',
    'st2023:dasymetric_utp_kebun': 'Data Dasymetric UTP Perkebunan tidak tersedia.',
    'st2023:dasymetric_utp_milenial': 'Data Dasymetric UTP Petani Milenial tidak tersedia.',
    'st2023:dasymetric_utp_ternak': 'Data Dasymetric UTP Peternakan tidak tersedia.',
    'st2023:dasymetric_utp_urban': 'Data Dasymetric UTP Urban tidak tersedia.',
    'st2023:geotagging': 'Data Geotagging tidak tersedia.',
    'st2023:geotagging_tanaman_pangan': 'Data Geotagging Tanaman Pangan tidak tersedia.',
    'st2023:geotagging_hortikultura': 'Data Geotagging Hortikultura tidak tersedia.',
    'st2023:geotagging_kebun': 'Data Geotagging Perkebunan tidak tersedia.',
    'st2023:geotagging_hutan': 'Data Geotagging Hutan tidak tersedia.',
    'st2023:geotagging_ikan': 'Data Geotagging Perikanan tidak tersedia.',
    'st2023:geotagging_ternak': 'Data Geotagging Peternakan tidak tersedia.',
    'st2023:infrastruktur_pertanian': 'Data Infrastruktur Pertanian tidak tersedia.',
    'st2023:gurem_lahan_vw': 'Data Gurem Lahan tidak tersedia.',
    'st2023:utp_ihk_01': 'Data UTP IHK 01 tidak tersedia.',
    'st2023:utp_ihk_02': 'Data UTP IHK 02 tidak tersedia.',
    'st2023:utp_ihk_03': 'Data UTP IHK 03 tidak tersedia.',
    'st2023:utp_ihk_04': 'Data UTP IHK 04 tidak tersedia.',
    'st2023:utp_ihk_05': 'Data UTP IHK 05 tidak tersedia.',
    'st2023:utp_ihk_06': 'Data UTP IHK 06 tidak tersedia.',
    'st2023:utp_ihk_07': 'Data UTP IHK 07 tidak tersedia.',
    'st2023:utp_ihk_08': 'Data UTP IHK 08 tidak tersedia.',
    'st2023:utp_ihk_09': 'Data UTP IHK 09 tidak tersedia.',
    'st2023:utp_ihk_10': 'Data UTP IHK 10 tidak tersedia.',
    'st2023:utp_ihk_11': 'Data UTP IHK 11 tidak tersedia.',
    'st2023:utp_ihk_12': 'Data UTP IHK 12 tidak tersedia.',
    'st2023:utp_ihk_13': 'Data UTP IHK 13 tidak tersedia.',
    'st2023:utp_ihk_14': 'Data UTP IHK 14 tidak tersedia.',
    'st2023:utp_ihk_15': 'Data UTP IHK 15 tidak tersedia.',
    'st2023:utp_ihk_16': 'Data UTP IHK 16 tidak tersedia.',
    'st2023:utp_ihk_17': 'Data UTP IHK 17 tidak tersedia.',
    'bps-lbs-2024': 'Data LBS Nasional 2024 tidak tersedia.',
    'arcgis-sawah-2023': 'Data LBS 2023 tidak tersedia.',
    'arcgis-sawah-2019': 'Data LBS 2019 tidak tersedia.',
    'arcgis-kawasan-padi': 'Data Kawasan Padi tidak tersedia.',
    'arcgis-kawasan-jagung': 'Data Kawasan Jagung tidak tersedia.',
    'arcgis-kawasan-kedelai': 'Data Kawasan Kedelai tidak tersedia.'
  };

  var DEFAULT_ERROR_MSG = 'Data layer tidak tersedia.';

  var overlay = document.createElement('div');
  overlay.className = 'map-loading-overlay';

  var pending = 0;
  var _cbState = {};

  function show() {}
  function hideOne() {}

  function getLayerName(cb) {
    var id = cb.id || '';
    if (ERROR_MESSAGES[id]) return ERROR_MESSAGES[id];
    var label = cb.closest('.lc-item, .geotools-main-tab-panel, .geoid-check');
    if (label) {
      var lbl = label.querySelector('label, span');
      if (lbl) return 'Layer "' + lbl.textContent.trim() + '" tidak tersedia.';
    }
    return DEFAULT_ERROR_MSG;
  }

  function showToast(msg) {
    if (typeof showMapToast === 'function') {
      showMapToast(msg, 'error');
    }
  }

  // 1. Detect map-layer checkbox toggles (capture phase)
  document.addEventListener('change', function (e) {
    var cb = e.target;
    if (!cb || cb.type !== 'checkbox' || !cb.checked) return;
    if (cb.closest && cb.closest('.lc-item')) return;
    var isLayer = /^(toggle|geoidToggle)/.test(cb.id) ||
      (cb.closest && (cb.closest('.cctv-layer-toggle') || cb.closest('.geoid-check')));
    if (isLayer) {
      show();
      var cbId = cb.id || ('cb_' + Math.random());
      _cbState[cbId] = { hasError: false, loaded: false, timer: null };

      _cbState[cbId].timer = setTimeout(function () {
        var s = _cbState[cbId];
        if (!s) return;
        if (s.hasError && !s.loaded) {
          showToast(getLayerName(cb));
        }
        delete _cbState[cbId];
        hideOne();
      }, SAFETY_TIMEOUT);
    }
  }, true);

  // 2. Detect layer load success & errors via Leaflet events
  if (typeof map !== 'undefined') {
    map.on('layeradd', function (ev) {
      var l = ev && ev.layer;
      if (!l || typeof l.once !== 'function') return;

      l.once('load', function () {
        Object.keys(_cbState).forEach(function (k) {
          if (_cbState[k] && !_cbState[k].loaded) {
            _cbState[k].loaded = true;
          }
        });
        hideOne();
      });

      l.once('tileloadend', function () {
        Object.keys(_cbState).forEach(function (k) {
          if (_cbState[k] && !_cbState[k].loaded) {
            _cbState[k].loaded = true;
          }
        });
        hideOne();
      });

      l.once('tileerror', function () {
        Object.keys(_cbState).forEach(function (k) {
          if (_cbState[k] && !_cbState[k].loaded) {
            _cbState[k].hasError = true;
          }
        });
      });

      l.once('error', function () {
        Object.keys(_cbState).forEach(function (k) {
          if (_cbState[k] && !_cbState[k].loaded) {
            _cbState[k].hasError = true;
            _cbState[k].loaded = true;
          }
        });
        hideOne();
        showToast('Gagal memuat layer.');
      });
    });
  }

  window.LayerLoading = { show: show, hide: hideOne };
})();
