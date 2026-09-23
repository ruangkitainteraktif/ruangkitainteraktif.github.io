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
    'toggleSppgDistrictLayer': 'Data SPPG per Kabupaten/Kota tidak tersedia.',
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
    'toggleGhrsstSstAnomali': 'Data SST Anomaly tidak tersedia.',
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
    'toggleLsdTmsLayer': 'Data Lahan Sawah Dilindungi tidak tersedia.',
    'toggleLbsTmsLayer': 'Data Lahan Baku Sawah tidak tersedia.',
    'toggleDiTmsLayer': 'Data Daerah Irigasi tidak tersedia.',
    'toggleSaluranIrTmsLayer': 'Data Saluran Irigasi tidak tersedia.',
    'toggleRtrwTmsLayer': 'Data RTRW tidak tersedia.',
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
         'arcgis-kawasan-kedelai': 'Data Kawasan Kedelai tidak tersedia.',
    'toggleBumiPersilLayer': 'Data Persil Tanah (ATRBPN) tidak tersedia.',
    'toggleFsvaLayer': 'Data FSVA 2025 (Badan Pangan) tidak tersedia.',
    'toggleWorldPlatesLayer': 'Data Zona Patahan Dunia (USGS) tidak tersedia.',
    'toggleChlorophyllOverlay': 'Data Chlorophyll-a Laut (NASA) tidak tersedia.',
    'toggleParOverlay': 'Data PAR - Radiasi Fotosintesis (NASA) tidak tersedia.',
    'omi-aerosol-index': 'Data UV Aerosol Index (OMI/Aura) tidak tersedia.',
    'omi-aod-abs': 'Data Absorbing AOD Near-UV (OMI/Aura) tidak tersedia.',
    'omi-modis-terra-aod': 'Data Aerosol Optical Depth (MODIS Terra) tidak tersedia.',
    'omi-modis-aqua-aod': 'Data Aerosol Optical Depth (MODIS Aqua) tidak tersedia.',
    'omi-so2': 'Data SO2 Lower Troposphere (OMI/Aura) tidak tersedia.',
    'omi-so2-pbl': 'Data SO2 Planetary Boundary Layer (OMI/Aura) tidak tersedia.',
    'omps-noaa20-so2-lt': 'Data SO2 Lower Troposphere (OMPS NOAA-20) tidak tersedia.',
    'omi-no2': 'Data NO2 Tropospheric Column (OMI/Aura) tidak tersedia.',
    'toggleAirVisualPm25': 'Data PM2.5 (AirVisual) tidak tersedia.',
    'toggleAirVisualPm10': 'Data PM10 (AirVisual) tidak tersedia.',
    'toggleAirVisualO3': 'Data O3 - Ozon (AirVisual) tidak tersedia.',
    'toggleAirVisualNo2': 'Data NO2 - Nitrogen Dioksida (AirVisual) tidak tersedia.',
    'toggleAirVisualSo2': 'Data SO2 - Sulfur Dioksida (AirVisual) tidak tersedia.',
    'toggleAirVisualCo': 'Data CO - Karbon Monoksida (AirVisual) tidak tersedia.',
    'toggleGeologiBNPB': 'Data Peta Geologi (BNPB) tidak tersedia.',
    'toggleSekolahLayer': 'Data Sekolah Indonesia (BNPB) tidak tersedia.',
    'toggleHillshade': 'Data Hillshade tidak tersedia.',
    'toggleBatnas': 'Data Batnas (Batimetri) tidak tersedia.',
    'toggleProvinceBoundary': 'Data Batas Provinsi (PBF) tidak tersedia.',
    'toggleSistemLahan': 'Data Sistem Lahan (InaLAND) tidak tersedia.',
    'toggleFuPadang': 'Data Foto Udara Padang (BIG) tidak tersedia.',
    'toggleFuKendari': 'Data Foto Udara Kendari (BIG) tidak tersedia.',
    'toggleFuBitung': 'Data Foto Udara Bitung (BIG) tidak tersedia.',
    'toggleFuMakassar': 'Data Foto Udara Makassar (BIG) tidak tersedia.',
    'toggleFuPlanetScope': 'Data Basemap PlanetScope (BIG) tidak tersedia.',
    'toggleSih3Dpu_78': 'Data Titik Sampling Kualitas Air tidak tersedia.',
    'toggleSih3Dpu_73': 'Data Sensor Banjir BPBD Jatim tidak tersedia.',
    'toggleSih3Dpu_70': 'Data Pos Tinggi Muka Air Dam tidak tersedia.',
    'toggleSih3Dpu_19': 'Data Pos Hujan WS Brantas PJT 1 tidak tersedia.',
    'toggleSih3Dpu_18': 'Data Pos Hujan WS Bengawan Solo PJT 1 tidak tersedia.',
    'toggleSih3Dpu_16': 'Data Pos Hujan WS BBWS Solo tidak tersedia.',
    'toggleSih3Dpu_81': 'Data Pos Hujan PU SDA tidak tersedia.',
    'toggleSih3Dpu_14': 'Data Pos Hujan BBWS Brantas tidak tersedia.',
    'toggleSih3Dpu_21': 'Data Pos Duga Air WS Brantas PJT 1 tidak tersedia.',
    'toggleSih3Dpu_20': 'Data Pos Duga Air WS Bengawan Solo PJT 1 tidak tersedia.',
    'toggleSih3Dpu_31': 'Data Pos Duga Air PU SDA tidak tersedia.',
    'toggleSih3Dpu_45': 'Data Pos Duga Air Jam-jaman PU SDA tidak tersedia.',
    'toggleSih3Dpu_17': 'Data Pos Duga Air BBWS Solo tidak tersedia.',
    'toggleSih3Dpu_15': 'Data Pos Duga Air BBWS Brantas tidak tersedia.',
    'toggleSih3Dpu_44': 'Data Hujan Jam-jaman PU SDA tidak tersedia.',
    'toggleSih3Dpu_38': 'Data Hujan Harian WS Welang Rejoso tidak tersedia.',
    'toggleSih3Dpu_41': 'Data Hujan Harian WS Pekalen Sampean tidak tersedia.',
    'toggleSih3Dpu_13': 'Data Hujan Harian WS Madura Bawean tidak tersedia.',
    'toggleSih3Dpu_39': 'Data Hujan Harian WS Brantas tidak tersedia.',
    'toggleSih3Dpu_12': 'Data Hujan Harian WS Bondoyudo Bedadung tidak tersedia.',
    'toggleSih3Dpu_40': 'Data Hujan Harian WS Bengawan Solo tidak tersedia.',
    'toggleSih3Dpu_10': 'Data Hujan Harian WS Baru Bajulmati tidak tersedia.',
    'toggleSih3Dpu_69': 'Data TMA Harian PUPR Pamekasan tidak tersedia.',
    'toggleSih3Dpu_84': 'Data Prediksi TMA PU SDA tidak tersedia.',
    'toggleSih3Dpu_90': 'Data Prediksi Hujan Jam-jaman tidak tersedia.',
    'toggleSih3Dpu_85': 'Data Prediksi Debit Sungai tidak tersedia.',
    'toggleSih3Dpu_77': 'Data Meteorologi Juanda tidak tersedia.',
    'toggleSih3Dpu_68': 'Data Hujan Harian PUPR Pamekasan tidak tersedia.',
    'toggleSih3Dpu_89': 'Data Debit Sungai PU SDA tidak tersedia.',
    'toggleSih3Dpu_80': 'Data AWLR Bidang Sungai Waduk Pantai tidak tersedia.',
    'toggleSih3Dpu_83': 'Data Telemetri TMA Tanah ESDM tidak tersedia.',
    'toggleSih3Dpu_43': 'Data Sumur Pantau ESDM tidak tersedia.',
    'toggleSih3Dpu_54': 'Data Sumur Pantau Badan Usaha tidak tersedia.',
    'toggleSih3Dpu_32': 'Data Pos Hujan Utama BMKG tidak tersedia.',
    'toggleSih3Dpu_36': 'Data Pos Hujan Otomatis BMKG tidak tersedia.',
    'toggleSih3Dpu_29': 'Data Peta Peringatan Dini Kekeringan tidak tersedia.',
    'toggleSih3Cit_16': 'Data Batas DAS WS Citarum tidak tersedia.',
    'toggleSih3Cit_17': 'Data Batas WS Citarum tidak tersedia.',
    'toggleSih3Cit_18': 'Data Kab/Kota WS Citarum tidak tersedia.',
    'toggleSih3Cit_19': 'Data Pos Duga Air (PDA) tidak tersedia.',
    'toggleSih3Cit_20': 'Data Status Kualitas Air BBWS tidak tersedia.',
    'toggleSih3Cit_21': 'Data Status Kualitas Air DLH tidak tersedia.',
    'toggleSih3Cit_22': 'Data Titik Pos Pantau Kualitas Air tidak tersedia.',
    'toggleSih3Cit_23': 'Data Pos Curah Hujan (PCH) tidak tersedia.',
    'toggleSih3Cit_24': 'Data Analisis CH Juni 2026 tidak tersedia.',
    'toggleSih3Cit_25': 'Data Prakiraan CH Agustus 2026 tidak tersedia.',
    'toggleSih3Cit_26': 'Data Prakiraan CH September 2026 tidak tersedia.',
    'toggleSih3Cit_27': 'Data Hari Tanpa Hujan Klimatologi tidak tersedia.',
    'toggleSih3Cit_31': 'Data Prakiraan CH Oktober 2026 tidak tersedia.',
    'toggleSih3Cit_30': 'Data Cekungan Air Tanah tidak tersedia.'
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
    if (id.indexOf('toggleFu') === 0) return 'Data BIG tidak tersedia.';
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
