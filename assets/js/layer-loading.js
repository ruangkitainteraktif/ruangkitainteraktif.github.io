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
    'toggleSensorGlobal': 'Data Sensor Global tidak tersedia.'
  };

  var DEFAULT_ERROR_MSG = 'Data layer tidak tersedia.';

  var overlay = document.createElement('div');
  overlay.className = 'map-loading-overlay';
  overlay.innerHTML = '<div class="map-loading-spinner" role="status" aria-label="Memuat layer..."></div>';

  var mapEl = document.getElementById('map');
  if (mapEl) mapEl.appendChild(overlay);

  var pending = 0;
  var _cbState = {};

  function show() {
    if (pending === 0 && overlay) overlay.classList.add('active');
    pending++;
  }

  function hideOne() {
    pending = Math.max(0, pending - 1);
    if (pending === 0 && overlay) overlay.classList.remove('active');
  }

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
