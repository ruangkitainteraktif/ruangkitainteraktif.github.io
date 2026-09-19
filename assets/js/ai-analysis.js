/**
 * AI Geospatial Analysis — Query Engine
 * Keyword-based data analysis from map features (no LLM).
 */
(function () {
  'use strict';

  var sheetOpen = false;
  var sheetMinimized = false;
  var chatHistory = [];
  var CHAT_HISTORY_KEY = 'ruangkita-ai-chat';
  var MAX_CHAT = 50;

  var QUICK_ACTIONS = [
    { label: 'Wilayah', intent: 'region' },
    { label: 'Hotspot', intent: 'hotspot' },
    { label: 'Gempa', intent: 'gempa' },
    { label: 'Gunung', intent: 'gunung' },
    { label: 'Cuaca', intent: 'cuaca' },
    { label: 'Layer', intent: 'layers' },
    { label: 'Lokasi', intent: 'viewport' },
    { label: 'Ringkasan', intent: 'summary' }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString('id-ID'); }

  /* === Category Layer Mapping === */
  var LAYER_CATEGORIES = {
    'Gempa & Bencana': {
      ids: ['toggleLatestEarthquake','toggleSignificantMarkers','toggleFeltMarkers','toggleFaultLayer','toggleFaultLayerNew','toggleWorldPlatesLayer','toggleJalurEvakuasi','toggleHistoryGempa','toggleKatalogGempa','toggleSensorSeismic','toggleSensorGlobal'],
      keywords: ['gempa','bencana','patahan','evakuasi','seismic','sensor']
    },
    'Ketahanan Pangan': {
      ids: ['toggleFsvaLayer','bps-lbs-2024','toggleSawahDilindungi','toggleSawahNasional50k','arcgis-sawah-2023','arcgis-sawah-2019','arcgis-kawasan-padi','arcgis-kawasan-jagung','arcgis-kawasan-kedelai','toggleSebaranPasar','toggleSppgSebaranLayer','toggleSppgDistrictLayer','toggleSppgLayer'],
      keywords: ['pangan','fsva','sawah','pasar','kementan','badan pangan']
    },
    'Sensus Pertanian 2023': {
      ids: ['st2023:batas_desa','st2023:batas_kecamatan','st2023:batas_kabupaten','st2023:batas_provinsi','st2023:dasymetric_utp','st2023:dasymetric_utp_tp','st2023:dasymetric_utp_horti','st2023:dasymetric_utp_holti','st2023:dasymetric_utp_hutan','st2023:dasymetric_utp_ikan','st2023:dasymetric_utp_kebun','st2023:dasymetric_utp_milenial','st2023:dasymetric_utp_ternak','st2023:dasymetric_utp_urban','st2023:geotagging','st2023:geotagging_tanaman_pangan','st2023:geotagging_hortikultura','st2023:geotagging_kebun','st2023:geotagging_hutan','st2023:geotagging_ikan','st2023:geotagging_ternak','st2023:infrastruktur_pertanian','st2023:gurem_lahan_vw','st2023:utp_ihk_01','st2023:utp_ihk_02','st2023:utp_ihk_03','st2023:utp_ihk_04','st2023:utp_ihk_05','st2023:utp_ihk_06','st2023:utp_ihk_07','st2023:utp_ihk_08','st2023:utp_ihk_09','st2023:utp_ihk_10','st2023:utp_ihk_11','st2023:utp_ihk_12','st2023:utp_ihk_13','st2023:utp_ihk_14','st2023:utp_ihk_15','st2023:utp_ihk_16','st2023:utp_ihk_17'],
      keywords: ['sensus','pertanian','utp','ihk','geotagging','dasymetric']
    },
    'ATRBPN': {
      ids: ['toggleBumiPersilLayer','toggleRtrwTmsLayer','toggleLsdTmsLayer','toggleLbsTmsLayer','toggleDiTmsLayer','toggleSaluranIrTmsLayer'],
      keywords: ['persil','rtrw','sawah dilindungi','lahan baku sawah','irigasi','atrbpn','pertanahan']
    },
    'Lingkungan': {
      ids: ['toggleChlorophyllOverlay','toggleParOverlay','omi-aerosol-index','omi-aod-abs','omi-modis-terra-aod','omi-modis-aqua-aod','omi-so2','omi-so2-pbl','omps-noaa20-so2-lt','omi-no2'],
      keywords: ['lingkungan','chlorophyll','aerosol','so2','no2','par','radiasi']
    },
    'Meteorologi': {
      ids: ['toggleWindRgb','toggleRhRgb','toggleTp24Rgb','togglePm25Rgb','toggleHthRgb','toggleBmkgPrecip10days','toggleCuacaPerairanLayer','toggleCuacaPelabuhanLayer','toggleMaritimeAngin','toggleMaritimeGelombang','toggleMaritimeSwell','toggleMaritimeWindSea'],
      keywords: ['cuaca','angin','hujan','pm25','suhu','kelembaban','gelombang','maritim','perairan','pelabuhan']
    },
    'Kualitas Udara': {
      ids: ['toggleAirVisualPm25','toggleAirVisualPm10','toggleAirVisualO3','toggleAirVisualNo2','toggleAirVisualSo2','toggleAirVisualCo'],
      keywords: ['udara','polusi','aqi','pm10','o3','no2','so2','co','kualitas udara']
    },
    'Kehutanan': {
      ids: ['toggleConcessionsLayer','toggleProtectedLayer','toggleMangroveLayer','togglePeatlandLayer','toggleKawasanHutanLayer','toggleGambutLayer','toggleKhLayer','togglePippibLayer','toggleSawitNasionalLayer','toggleSawitPerkebunanLayer','toggleRehabDasLayer','togglePerkebunanPl24Layer','toggleRktnSumateraLayer','toggleRktnSulawesiLayer','toggleRktnPapuaLayer','toggleRktnMalukuLayer','toggleRktnKalimantanLayer','toggleRktnJawaLayer','toggleRktnBaliNtLayer'],
      keywords: ['hutan','konsesi','mangrove','gambut','wdpa','gfw','sawit','rktn','kawasan hutan']
    },
    'Geologi': {
      ids: ['toggleGeologiBNPB','toggleVolcanoLayer','toggleKrbGunungApi','toggleKrbTitik','togglePetaGeologi','toggleGeostruktur','togglePatahanAktif','toggleLikuifaksi','toggleKarst'],
      keywords: ['geologi','gunung api','volcano','karst','likuifaksi','geostruktur','patahan aktif']
    },
    'Hidrologi': {
      ids: ['toggleSih3Dpu_78','toggleSih3Dpu_73','toggleSih3Dpu_70','toggleSih3Dpu_19','toggleSih3Dpu_18','toggleSih3Dpu_16','toggleSih3Dpu_81','toggleSih3Dpu_14','toggleSih3Dpu_21','toggleSih3Dpu_20','toggleSih3Dpu_31','toggleSih3Dpu_45','toggleSih3Dpu_17','toggleSih3Dpu_15','toggleSih3Dpu_44','toggleSih3Dpu_38','toggleSih3Dpu_41','toggleSih3Dpu_13','toggleSih3Dpu_39','toggleSih3Dpu_12','toggleSih3Dpu_40','toggleSih3Dpu_10','toggleSih3Dpu_69','toggleSih3Dpu_84','toggleSih3Dpu_90','toggleSih3Dpu_85','toggleSih3Dpu_77','toggleSih3Dpu_68','toggleSih3Dpu_89','toggleSih3Dpu_80','toggleSih3Dpu_83','toggleSih3Dpu_43','toggleSih3Dpu_54','toggleSih3Dpu_32','toggleSih3Dpu_36','toggleSih3Dpu_29','toggleSih3Cit_16','toggleSih3Cit_17','toggleSih3Cit_18','toggleSih3Cit_19','toggleSih3Cit_20','toggleSih3Cit_21','toggleSih3Cit_22','toggleSih3Cit_23','toggleSih3Cit_24','toggleSih3Cit_25','toggleSih3Cit_26','toggleSih3Cit_27','toggleSih3Cit_28','toggleSih3Cit_29','toggleSih3Cit_30','toggleSih3Cit_31'],
      keywords: ['hidrologi','sungai','banjir','debit','dam','tma','hujan','sih3','bbws','citarum']
    },
    'Terrain & Lainnya': {
      ids: ['toggleDemnasOverlay','toggleHillshade','toggleBatnas','toggleProvinceBoundary','toggleBmkgTimezone','toggleBpsTutupanLahan','toggleTollRoad','toggleNationalRoad','toggleEoxOverlay'],
      keywords: ['terrain','hillshade','batnas','batas provinsi','jalan tol','jalan nasional','tutupan lahan','demnas','label']
    }
  };

  /* === Data Extractors === */
  function extractHotspotData() {
    var features = (window.getHotspotFeatures && window.getHotspotFeatures()) || [];
    if (!features.length) return null;
    var byProv = {}, byKab = {}, conf = { high: 0, medium: 0, low: 0 };
    features.forEach(function (f) {
      var prov = (f.properties.nama_provinsi || 'Tidak Diketahui').trim();
      var kab = (f.properties.kabkota || '').trim();
      if (!byProv[prov]) byProv[prov] = { name: prov, count: 0 };
      byProv[prov].count++;
      if (kab) {
        var k = kab + ' (' + prov + ')';
        if (!byKab[k]) byKab[k] = { name: k, count: 0 };
        byKab[k].count++;
      }
      var c = (f.properties.confidence_level || '').toLowerCase();
      if (conf.hasOwnProperty(c)) conf[c]++;
    });
    return { total: features.length, confidence: conf, provinceTop10: Object.values(byProv).sort(function (a, b) { return b.count - a.count; }).slice(0, 10), kabkotaTop10: Object.values(byKab).sort(function (a, b) { return b.count - a.count; }).slice(0, 10) };
  }

  function extractGempaData() {
    var sig = window.earthquakeSignificantData || [];
    var felt = window.earthquakeFeltData || [];
    var latest = window.earthquakeLatestData || null;
    var items = [];
    sig.forEach(function (e) { items.push({ mag: e.Magnitude || e.mag, depth: e.Kedalaman || e.depth, place: e.Wilayah || e.place || e.lokasi, time: e.Date || e.time }); });
    felt.forEach(function (e) { items.push({ mag: e.Magnitude || e.mag, depth: e.Kedalaman || e.depth, place: e.Wilayah || e.place || e.lokasi, time: e.Date || e.time }); });
    if (!items.length && !latest) return null;
    return { latest: latest, items: items.slice(0, 15), totalSignificant: sig.length, totalFelt: felt.length };
  }

  function extractBasemapInfo() {
    var name = (typeof window.currentBasemapName !== 'undefined') ? window.currentBasemapName : 'unknown';
    var label = name;
    try {
      if (typeof window.vectorBasemapLabels !== 'undefined' && window.vectorBasemapLabels[name]) label = window.vectorBasemapLabels[name];
      else if (typeof window.satelliteBasemapLabels !== 'undefined' && window.satelliteBasemapLabels[name]) label = window.satelliteBasemapLabels[name];
    } catch (e) {}
    var totalVector = 10, totalSatellite = 27;
    return { id: name, label: label, totalVector: totalVector, totalSatellite: totalSatellite, total: totalVector + totalSatellite };
  }

  function extractActiveLayers() {
    var layers = [];
    document.querySelectorAll('.ql-btn.active').forEach(function (btn) {
      var m = { qlHotspot: 'Hotspot', qlPm25: 'PM2.5', qlWind: 'Angin', qlHujan: 'Hujan', qlRadar: 'Radar', qlProvinsi: 'Batas Provinsi' };
      if (m[btn.id]) layers.push(m[btn.id]);
    });
    document.querySelectorAll('.lc-item input[type="checkbox"]:checked').forEach(function (cb) {
      var item = cb.closest('.lc-item');
      if (item) { var lbl = item.querySelector('.lc-item-label, label'); if (lbl) { var n = lbl.textContent.trim(); if (layers.indexOf(n) === -1) layers.push(n); } }
    });
    return layers;
  }

  function extractActiveLayersByCategory() {
    var result = {};
    var catNames = Object.keys(LAYER_CATEGORIES);
    catNames.forEach(function (catName) {
      var cat = LAYER_CATEGORIES[catName];
      var active = [];
      cat.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.checked) active.push(id);
        else if (window._layerCatalogState && window._layerCatalogState[id]) active.push(id);
      });
      if (active.length) result[catName] = active;
    });
    var quickBtns = [];
    document.querySelectorAll('.ql-btn.active').forEach(function (btn) {
      var m = { qlHotspot: 'Hotspot', qlPm25: 'PM2.5', qlWind: 'Angin', qlHujan: 'Hujan', qlRadar: 'Radar', qlProvinsi: 'Batas Provinsi' };
      if (m[btn.id]) quickBtns.push(m[btn.id]);
    });
    if (quickBtns.length) result['Quick Layers'] = quickBtns;
    return result;
  }

  function extractViewportInfo() {
    if (typeof map === 'undefined' || !map) return null;
    var c = map.getCenter(), b = map.getBounds();
    return { lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), zoom: map.getZoom(), south: b.getSouth().toFixed(3), west: b.getWest().toFixed(3), north: b.getNorth().toFixed(3), east: b.getEast().toFixed(3) };
  }

  function isLayerActive(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.checked) return true;
      if (window._layerCatalogState && window._layerCatalogState[ids[i]]) return true;
    }
    return false;
  }

  function countActiveInCategory(ids) {
    var count = 0;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.checked) count++;
      else if (window._layerCatalogState && window._layerCatalogState[id]) count++;
    });
    return count;
  }

  /* === Layer Toggle from AI Chat === */
  function toggleLayerFromAI(layerId) {
    var newState = !isLayerActiveById(layerId);

    window._layerCatalogState[layerId] = newState;

    if (typeof window.buildLayerCatalogIfNeeded === 'function') window.buildLayerCatalogIfNeeded();

    var cb = document.querySelector('.lc-item input[data-layer-id="' + layerId + '"]');
    if (cb) {
      if (cb.checked !== newState) {
        cb.checked = newState;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      var altCb = document.querySelector('input[data-layer-id="' + layerId + '"]');
      if (altCb) {
        if (altCb.checked !== newState) {
          altCb.checked = newState;
          altCb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    setTimeout(function () {
      var rec = document.querySelector('.ais-layer-rec[data-layer-id="' + layerId + '"]');
      if (rec) rec.classList.toggle('ais-layer-rec-active', newState);
    }, 50);
  }
  window.toggleLayerFromAI = toggleLayerFromAI;

  window._aiRegionAnalyze = function (intent, regionName) {
    var queryMap = {
      hotspot: 'Hotspot di ',
      gempa: 'Gempa di ',
      gunung: 'Gunung api di ',
      lahan: 'Lahan sawah di ',
      udara: 'Kualitas udara di '
    };
    var query = (queryMap[intent] || '') + regionName;
    addChatMessage('user', query);
    getAnswer(intent, query).then(function (answer) {
      typeWriteMessage(answer);
    }).catch(function () {
      typeWriteMessage('Gagal memuat analisis. Silakan coba lagi.');
    });
  };

  function isLayerActiveById(layerId) {
    var el = document.getElementById(layerId);
    if (el && el.checked) return true;
    return !!(window._layerCatalogState && window._layerCatalogState[layerId]);
  }

  var REGION_CHIP_INTENTS = {
    toggleHotspotLayer: 'hotspot',
    toggleLatestEarthquake: 'gempa',
    toggleVolcanoLayer: 'gunung',
    'arcgis-sawah-2023': 'lahan',
    toggleSawahDilindungi: 'lahan',
    toggleAirVisualPm25: 'udara'
  };

  function recChip(id, label, isActive, regionName) {
    var onclick = "toggleLayerFromAI('" + id + "')";
    if (regionName && REGION_CHIP_INTENTS[id]) {
      var safeName = regionName.replace(/'/g, "\\'");
      onclick += ";window._aiRegionAnalyze('" + REGION_CHIP_INTENTS[id] + "','" + safeName + "')";
    }
    return '<button type="button" class="ais-layer-rec' + (isActive ? ' ais-layer-rec-active' : '') + '" data-layer-id="' + id + '" onclick="' + onclick + '">' + label + '</button>';
  }

  function recGrid(ids, labels, regionName) {
    var s = '<div class="ais-rec-grid">';
    ids.forEach(function (id) { s += recChip(id, labels[id], isLayerActiveById(id), regionName); });
    s += '</div><div class="ais-empty-hint">' + (regionName ? 'Klik untuk analisis detail' : 'Klik untuk aktifkan/dinonaktifkan') + '</div>';
    return '\x00RAW' + s + 'RAW\x00';
  }

  /* === Region Profile Functions === */
  var _regionBoundaryCache = {};

  function normalizeRegionQuery(text) {
    return text.toLowerCase()
      .replace(/^(profil|info|data|detail|informasi|tentang|untuk|di|pulau|provinsi|kabupaten|kota|kecamatan|desa|kelurahan)\s*/g, '')
      .trim();
  }

  function searchRegionByName(text) {
    var q = normalizeRegionQuery(text);
    if (!q) return null;

    var norm = function (s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
    var qn = norm(q);
    var qnCompact = qn.replace(/\s+/g, '');

    var provinsiIdx = (typeof window.provinsiSearchIndex !== 'undefined') ? window.provinsiSearchIndex : [];
    var kabkotaIdx = (typeof window.kabkotaSearchIndex !== 'undefined') ? window.kabkotaSearchIndex : [];
    var kecIdx = (typeof window.kecamatanSearchIndex !== 'undefined') ? window.kecamatanSearchIndex : [];

    var bestMatch = null;
    var bestScore = 0;

    function scoreMatch(searchText, item, type) {
      var sn = norm(searchText);
      var snCompact = sn.replace(/\s+/g, '');
      var score = 0;
      if (sn === qn || snCompact === qnCompact) score = 100;
      else if (sn.indexOf(qn) === 0 || snCompact.indexOf(qnCompact) === 0) score = 80;
      else if (qn.indexOf(sn) !== -1 && sn.length > 3) score = 60;
      else if (sn.indexOf(qn) !== -1 || snCompact.indexOf(qnCompact) !== -1) score = 40;
      else if (qnCompact.indexOf(snCompact) !== -1 && snCompact.length > 3) score = 30;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { type: type, name: item.name, kode: item.kode, provinsi: item.provinsi || item.name, kabkot: item.kabkot || '' };
      }
    }

    provinsiIdx.forEach(function (item) { scoreMatch(item.searchText, item, 'provinsi'); });
    kabkotaIdx.forEach(function (item) { scoreMatch(item.searchText, item, 'kabkot'); });
    kecIdx.forEach(function (item) { scoreMatch(item.searchText, item, 'kecamatan'); });

    if (typeof window.weatherSearchLocations !== 'undefined' && window.weatherSearchLocations.length) {
      for (var i = 0; i < Math.min(window.weatherSearchLocations.length, 50000); i++) {
        var loc = window.weatherSearchLocations[i];
        if (loc.searchText && (norm(loc.searchText).indexOf(qn) !== -1 || loc.searchText.replace(/\s+/g, '').indexOf(qnCompact) !== -1)) {
          scoreMatch(loc.searchText, { name: loc.desa || loc.kecamatan, kode: loc.kode, provinsi: loc.provinsi, kabkot: loc.kabkota }, 'desa');
          break;
        }
      }
    }

    return bestScore >= 30 ? bestMatch : null;
  }

  function computeBboxFromCenter(lat, lng, deltaDeg) {
    return { south: lat - deltaDeg, north: lat + deltaDeg, west: lng - deltaDeg, east: lng + deltaDeg };
  }

  async function getRegionCenter(kode) {
    if (!kode) return null;
    try {
      if (typeof geocodeVillageByAdm4 === 'function') {
        var loc = await geocodeVillageByAdm4(kode);
        if (loc && isFinite(loc.lat) && isFinite(loc.lon)) return { lat: loc.lat, lng: loc.lon };
      }
    } catch (e) {}
    return null;
  }

  async function fetchRegionBoundaryData(kode) {
    if (!kode) return null;
    if (_regionBoundaryCache[kode]) return _regionBoundaryCache[kode];

    try {
      var res = await fetch('https://wilayah.smartartstudio.my.id/api/boundaries/' + kode);
      if (!res.ok) return null;
      var data = await res.json();
      if (!data.path || !data.path.length) return null;

      var path = data.path;
      var flat = [];
      path.forEach(function (ring) { ring.forEach(function (p) { flat.push(p); }); });
      if (!flat.length) return null;

      var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      var sumLat = 0, sumLng = 0;
      flat.forEach(function (p) {
        if (p[0] < minLat) minLat = p[0];
        if (p[0] > maxLat) maxLat = p[0];
        if (p[1] < minLng) minLng = p[1];
        if (p[1] > maxLng) maxLng = p[1];
        sumLat += p[0]; sumLng += p[1];
      });
      var centerLat = sumLat / flat.length;
      var centerLng = sumLng / flat.length;

      var luasHa = 0;
      if (typeof computePolygonAreaHa === 'function') {
        luasHa = computePolygonAreaHa(path);
      }

      var bbox = { south: minLat, north: maxLat, west: minLng, east: maxLng };
      var result = { kode: kode, nama: data.nama || '', path: path, center: [centerLat, centerLng], bbox: bbox, luasHa: luasHa };
      _regionBoundaryCache[kode] = result;
      return result;
    } catch (e) {
      return null;
    }
  }

  function countHotspotsInBbox(bbox) {
    var features = (typeof window.getHotspotFeatures === 'function') ? window.getHotspotFeatures() : [];
    if (!features.length) return null;
    var total = 0, high = 0, medium = 0, low = 0;
    features.forEach(function (f) {
      var p = f.properties;
      if (p.lat == null || p.long == null) return;
      if (p.lat >= bbox.south && p.lat <= bbox.north && p.long >= bbox.west && p.long <= bbox.east) {
        total++;
        if (p.confidence_level === 'high') high++;
        else if (p.confidence_level === 'medium') medium++;
        else low++;
      }
    });
    return total > 0 ? { total: total, high: high, medium: medium, low: low } : null;
  }

  function findNearestQuakes(centerLat, centerLng, limit) {
    var quakes = [];
    var src = [];
    if (typeof earthquakeSignificantData !== 'undefined') src = src.concat(earthquakeSignificantData);
    if (typeof earthquakeFeltData !== 'undefined') src = src.concat(earthquakeFeltData);
    if (typeof earthquakeLatestData !== 'undefined' && earthquakeLatestData) src.push(earthquakeLatestData);

    src.forEach(function (item) {
      var coords = (item.Coordinates || '').split(',');
      var lat = parseFloat(coords[0]);
      var lon = parseFloat(coords[1]);
      if (!isFinite(lat) || !isFinite(lon)) return;
      var dist = geoidDistanceKm(centerLat, centerLng, lat, lon);
      quakes.push({
        mag: parseFloat(item.Magnitude) || 0,
        wilayah: item.Wilayah || '-',
        tanggal: item.Tanggal || '-',
        jam: item.Jam || '-',
        kedalaman: item.Kedalaman || '-',
        dist: dist,
        lat: lat, lon: lon
      });
    });
    quakes.sort(function (a, b) { return a.dist - b.dist; });
    return quakes.slice(0, limit || 5);
  }

  async function findNearestVolcanoes(centerLat, centerLng, regionName) {
    var volcanoes = [];
    if (typeof window._volcanoDataCache !== 'undefined' && window._volcanoDataCache) {
      volcanoes = window._volcanoDataCache;
    } else {
      try {
        var res = await fetch('assets/data/gunung.json');
        if (res.ok) {
          volcanoes = await res.json();
          window._volcanoDataCache = volcanoes;
        }
      } catch (e) {}
    }
    if (!volcanoes.length) return [];

    var regionNorm = (regionName || '').toLowerCase().replace(/[^a-z]/g, '');
    var STATUS_LABEL = { 1: 'Normal', 2: 'Waspada', 3: 'Siaga', 4: 'Awas' };

    var inRegion = [];
    var nearby = [];

    volcanoes.forEach(function (v) {
      var lat = v.ga_lat_gapi;
      var lon = v.ga_lon_gapi;
      if (!isFinite(lat) || !isFinite(lon)) return;
      var dist = geoidDistanceKm(centerLat, centerLng, lat, lon);
      var provNorm = (v.ga_prov_gapi || '').toLowerCase().replace(/[^a-z]/g, '');
      var kabNorm = (v.ga_kab_gapi || '').toLowerCase().replace(/[^a-z]/g, '');
      var item = {
        name: v.ga_nama_gapi || '-',
        status: STATUS_LABEL[v.ga_status] || 'Normal',
        statusId: v.ga_status || 1,
        elevation: v.ga_elev_gapi || 0,
        dist: dist
      };
      if (provNorm.indexOf(regionNorm) !== -1 || regionNorm.indexOf(provNorm) !== -1 ||
          kabNorm.indexOf(regionNorm) !== -1 || regionNorm.indexOf(kabNorm) !== -1) {
        inRegion.push(item);
      } else {
        nearby.push(item);
      }
    });

    inRegion.sort(function (a, b) { return a.dist - b.dist; });
    nearby.sort(function (a, b) { return a.dist - b.dist; });
    return inRegion.concat(nearby).slice(0, 5);
  }

  function parseRegionFromText(text) {
    var q = normalizeRegionQuery(text);
    return q;
  }

  /* === Intent Parser === */
  var INTENT_RULES = [
    { intent: 'basemap', patterns: ['basemap', 'peta dasar', 'satelit himawari', 'viirs', 'modis', 'terrain basemap'] },
    { intent: 'cuaca', patterns: ['cuaca', 'angin', 'hujan', 'suhu', 'kelembaban', 'humid', 'precipitation', 'gfs', 'forecast'] },
    { intent: 'udara', patterns: ['udara', 'polusi', 'aqi', 'pm10', 'pm2.5 airvisual', 'kualitas udara', 'o3', 'no2 airvisual', 'so2 airvisual', 'co karbon'] },
    { intent: 'gunung', patterns: ['gunung', 'api', 'vulkanik', 'erupsi', 'magma', 'pvmbg', 'krb gunung'] },
    { intent: 'hutan', patterns: ['hutan', 'konsesi', 'mangrove', 'gambut', 'wdpa', 'gfw', 'sawit', 'rktn', 'kawasan hutan'] },
    { intent: 'geologi', patterns: ['geologi', 'geostruktur', 'karst', 'likuifaksi', 'patahan aktif', 'batuan'] },
    { intent: 'hidrologi', patterns: ['hidrologi', 'sungai', 'banjir', 'debit', 'dam', 'tma', 'sih3', 'bbws', 'citarum', 'curah hujan'] },
    { intent: 'penduduk', patterns: ['penduduk', 'demografi', 'sensus penduduk', 'jumlah penduduk', 'populasi', 'dukcapil'] },
    { intent: 'pangan', patterns: ['harga', 'beras', 'commodity', 'food price', 'bi harga', 'komoditas'] },
    { intent: 'lahan', patterns: ['lahan', 'tutupan', 'irigasi', 'sawah dilindungi', 'lahan baku', 'pertanahan', 'atrbpn', 'persil', 'rtrw'] },
    { intent: 'maritim', patterns: ['laut', 'gelombang', 'swell', 'maritim', 'perairan', 'pelabuhan'] },
    { intent: 'bencana', patterns: ['bencana', 'longsor', 'evakuasi', 'patahan', 'jalur evakuasi'] },
    { intent: 'sensorgempa', patterns: ['sensor', 'seismic', 'stasiun', 'geofon'] },
    { intent: 'hotspot', patterns: ['hotspot', 'karhutla', 'kebakaran hutan', 'kebakaran lahan'] },
    { intent: 'gempa', patterns: ['gempa', 'earthquake', 'magnitudo', 'getaran', 'richter'] },
    { intent: 'layers', patterns: ['layer aktif', 'layer apa', 'tampil', 'menampilkan', 'overlay aktif'] },
    { intent: 'viewport', patterns: ['lokasi', 'posisi', 'koordinat', 'viewport', 'sekarang', 'area ini'] },
    { intent: 'summary', patterns: ['ringkasan', 'summary', 'semua data', 'kondisi', 'overview'] },
    { intent: 'region', patterns: ['pulau ', 'provinsi ', 'kabupaten ', 'kota ', 'kecamatan ', 'desa ', 'kelurahan ', 'wilayah ', 'region'] }
  ];

  function parseIntent(text) {
    var t = text.toLowerCase();
    for (var i = 0; i < INTENT_RULES.length; i++) {
      var r = INTENT_RULES[i];
      for (var j = 0; j < r.patterns.length; j++) {
        if (t.indexOf(r.patterns[j]) !== -1) return r.intent;
      }
    }
    return 'help';
  }

  /* === Answer Formatters === */
  function formatHotspotAnswer() {
    var d = extractHotspotData();
    if (!d) return 'Tidak ada data hotspot yang tersedia. Aktifkan layer Hotspot terlebih dahulu.';
    var s = '**Data Hotspot Karhutla (24 Jam)**\n\n';
    s += 'Total: **' + fmt(d.total) + '** titik\n';
    s += 'Confidence: High=**' + fmt(d.confidence.high) + '**, Medium=**' + fmt(d.confidence.medium) + '**, Low=**' + fmt(d.confidence.low) + '**\n\n';
    s += '**Top 10 Provinsi:**\n';
    d.provinceTop10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' - **' + fmt(p.count) + '** titik\n'; });
    if (d.kabkotaTop10.length) {
      s += '\n**Top 10 Kabupaten/Kota:**\n';
      d.kabkotaTop10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' - **' + fmt(p.count) + '** titik\n'; });
    }
    return s;
  }

  function formatGempaAnswer() {
    var d = extractGempaData();
    if (!d) return 'Tidak ada data gempa yang tersedia.';
    var s = '**Data Gempa BMKG**\n\n';
    if (d.latest) {
      var L = d.latest;
      s += '**Gempa Terbaru:**\n';
      s += 'Wilayah: ' + (L.Wilayah || L.place || L.lokasi || '-') + '\n';
      s += 'Magnitude: **' + (L.Magnitude || L.mag || '-') + '**\n';
      s += 'Kedalaman: ' + (L.Kedalaman || L.depth || '-') + ' km\n';
      s += 'Waktu: ' + (L.Date || L.time || '-') + '\n\n';
    }
    s += 'Total Signifikan (M5.0+): **' + fmt(d.totalSignificant) + '**\n';
    s += 'Total Dirasakan: **' + fmt(d.totalFelt) + '**\n\n';
    if (d.items.length) {
      s += '**Daftar Gempa:**\n';
      d.items.forEach(function (e, i) {
        s += (i + 1) + '. M' + (e.mag || '-') + ' - ' + (e.place || '-') + ' (Kedalaman: ' + (e.depth || '-') + ' km)\n';
      });
    }
    return s;
  }

  function formatBasemapAnswer() {
    var d = extractBasemapInfo();
    var s = '**Basemap Saat Ini**\n\n';
    s += 'Aktif: **' + d.label + '** (`' + d.id + '`)\n\n';
    s += '**Tersedia:**\n';
    s += '- Vektor: **' + d.totalVector + '** basemap\n';
    s += '- Satelit: **' + d.totalSatellite + '** basemap\n';
    s += '- Total: **' + d.total + '** basemap\n\n';
    s += '\n_Ganti basemap dari panel layer kiri._';
    return s;
  }

  function formatCuacaAnswer() {
    var active = [];
    var weatherIds = ['toggleWindRgb','toggleRhRgb','toggleTp24Rgb','togglePm25Rgb','toggleHthRgb','toggleBmkgPrecip10days','toggleCuacaPerairanLayer','toggleCuacaPelabuhanLayer'];
    var labels = { toggleWindRgb: 'Wind Speed (GFS)', toggleRhRgb: 'Relative Humidity', toggleTp24Rgb: 'Precipitation 24 Jam', togglePm25Rgb: 'PM2.5 (BMKG PCM)', toggleHthRgb: 'Hari Tanpa Hujan', toggleBmkgPrecip10days: 'Prakiraan Hujan 10 Hari', toggleCuacaPerairanLayer: 'Cuaca Perairan', toggleCuacaPelabuhanLayer: 'Cuaca Pelabuhan' };
    weatherIds.forEach(function (id) {
      var el = document.getElementById(id);
      if ((el && el.checked) || (window._layerCatalogState && window._layerCatalogState[id])) active.push(labels[id] || id);
    });
    var s = '**Data Cuaca & Meteorologi**\n\n';
    if (!active.length) {
      s += 'Tidak ada layer cuaca aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(weatherIds, labels);
      return s;
    }
    s += 'Layer aktif: **' + active.length + '**\n\n';
    active.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatUdaraAnswer() {
    var active = [];
    var airIds = ['toggleAirVisualPm25','toggleAirVisualPm10','toggleAirVisualO3','toggleAirVisualNo2','toggleAirVisualSo2','toggleAirVisualCo'];
    var labels = { toggleAirVisualPm25: 'PM2.5 (AirVisual)', toggleAirVisualPm10: 'PM10 (AirVisual)', toggleAirVisualO3: 'O3 - Ozon (AirVisual)', toggleAirVisualNo2: 'NO2 - Nitrogen Dioksida (AirVisual)', toggleAirVisualSo2: 'SO2 - Sulfur Dioksida (AirVisual)', toggleAirVisualCo: 'CO - Karbon Monoksida (AirVisual)' };
    airIds.forEach(function (id) {
      var el = document.getElementById(id);
      if ((el && el.checked) || (window._layerCatalogState && window._layerCatalogState[id])) active.push(labels[id] || id);
    });
    var s = '**Kualitas Udara (AirVisual)**\n\n';
    if (!active.length) {
      s += 'Tidak ada layer kualitas udara aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(airIds, labels);
      return s;
    }
    s += 'Layer aktif: **' + active.length + '**\n\n';
    active.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatGunungAnswer() {
    var ids = ['toggleVolcanoLayer','toggleKrbGunungApi','toggleKrbTitik','toggleGeologiBNPB'];
    var labels = { toggleVolcanoLayer: 'Gunung Api (PVMBG)', toggleKrbGunungApi: 'KRB Gunung Api (BIG)', toggleKrbTitik: 'Gas Vulkanik (BIG)', toggleGeologiBNPB: 'Peta Geologi (BNPB)' };
    var count = countActiveInCategory(ids);
    var s = '**Data Gunung Api**\n\n';
    if (!count) {
      s += 'Tidak ada layer gunung api aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(ids, labels);
      return s;
    }
    s += 'Layer aktif: **' + count + '**\n\n';
    ids.forEach(function (id) {
      if (isLayerActiveById(id)) s += '- ' + labels[id] + '\n';
    });
    return s;
  }

  function formatHutanAnswer() {
    var ids = LAYER_CATEGORIES['Kehutanan'].ids;
    var count = countActiveInCategory(ids);
    var s = '**Data Kehutanan**\n\n';
    if (!count) {
      var recIds = ['toggleConcessionsLayer','toggleProtectedLayer','toggleMangroveLayer','togglePeatlandLayer','toggleKawasanHutanLayer'];
      var recLabels = { toggleConcessionsLayer: 'Konsesi (GFW)', toggleProtectedLayer: 'Kawasan Konservasi (WDPA)', toggleMangroveLayer: 'Mangrove (GMW)', togglePeatlandLayer: 'Lahan Gambut (GFW)', toggleKawasanHutanLayer: 'Kawasan Hutan (ESDM)' };
      s += 'Tidak ada layer kehutanan aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(recIds, recLabels);
      return s;
    }
    s += 'Layer aktif: **' + count + '**\n\n';
    ids.forEach(function (id) {
      if (isLayerActiveById(id)) s += '- ' + id + '\n';
    });
    return s;
  }

  function formatGeologiAnswer() {
    var ids = LAYER_CATEGORIES['Geologi'].ids;
    var count = countActiveInCategory(ids);
    var s = '**Data Geologi**\n\n';
    if (!count) {
      var recIds = ['toggleGeologiBNPB','toggleVolcanoLayer','togglePetaGeologi','toggleGeostruktur','togglePatahanAktif','toggleLikuifaksi','toggleKarst'];
      var recLabels = { toggleGeologiBNPB: 'Peta Geologi (BNPB)', toggleVolcanoLayer: 'Gunung Api (PVMBG)', togglePetaGeologi: 'Peta Geologi (BIG)', toggleGeostruktur: 'Geostruktur (BIG)', togglePatahanAktif: 'Patahan Aktif 1:50K (BIG)', toggleLikuifaksi: 'Likuifaksi (BIG)', toggleKarst: 'Kawasan Karst (BIG)' };
      s += 'Tidak ada layer geologi aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(recIds, recLabels);
      return s;
    }
    s += 'Layer aktif: **' + count + '**\n\n';
    ids.forEach(function (id) {
      if (isLayerActiveById(id)) s += '- ' + id + '\n';
    });
    return s;
  }

  function formatHidrologiAnswer() {
    var ids = LAYER_CATEGORIES['Hidrologi'].ids;
    var count = countActiveInCategory(ids);
    var s = '**Data Hidrologi**\n\n';
    if (!count) {
      var recIds = ['toggleSih3Dpu_78','toggleSih3Dpu_32','toggleSih3Dpu_36','toggleSih3Cit_19','toggleSih3Cit_23'];
      var recLabels = { toggleSih3Dpu_78: 'Kualitas Air', toggleSih3Dpu_32: 'Pos Hujan Utama BMKG', toggleSih3Dpu_36: 'Pos Hujan Otomatis BMKG', toggleSih3Cit_19: 'Pos Duga Air (Citarum)', toggleSih3Cit_23: 'Pos Curah Hujan (Citarum)' };
      s += 'Tidak ada layer hidrologi aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(recIds, recLabels);
      return s;
    }
    s += 'Layer aktif: **' + count + '**\n';
    return s;
  }

  function formatLahanAnswer() {
    var ids = LAYER_CATEGORIES['ATRBPN'].ids;
    var count = countActiveInCategory(ids);
    var s = '**Data Lahan & Pertanahan**\n\n';
    if (!count) {
      var recIds = ['toggleBumiPersilLayer','toggleRtrwTmsLayer','toggleLsdTmsLayer','toggleLbsTmsLayer','toggleDiTmsLayer'];
      var recLabels = { toggleBumiPersilLayer: 'Persil Tanah (ATRBPN)', toggleRtrwTmsLayer: 'RTRW Kab/Kota', toggleLsdTmsLayer: 'Lahan Sawah Dilindungi', toggleLbsTmsLayer: 'Lahan Baku Sawah', toggleDiTmsLayer: 'Daerah Irigasi' };
      s += 'Tidak ada layer ATRBPN aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(recIds, recLabels);
      return s;
    }
    s += 'Layer ATRBPN aktif: **' + count + '**\n';
    return s;
  }

  function formatMaritimAnswer() {
    var active = [];
    var maritimeIds = ['toggleMaritimeAngin','toggleMaritimeGelombang','toggleMaritimeSwell','toggleMaritimeWindSea','toggleCuacaPerairanLayer','toggleCuacaPelabuhanLayer'];
    var labels = { toggleMaritimeAngin: 'Angin Laut', toggleMaritimeGelombang: 'Tinggi Gelombang', toggleMaritimeSwell: 'Swell', toggleMaritimeWindSea: 'Gelombang Angin (Wind Sea)', toggleCuacaPerairanLayer: 'Cuaca Perairan', toggleCuacaPelabuhanLayer: 'Cuaca Pelabuhan' };
    maritimeIds.forEach(function (id) {
      var el = document.getElementById(id);
      if ((el && el.checked) || (window._layerCatalogState && window._layerCatalogState[id])) active.push(labels[id] || id);
    });
    var s = '**Data Maritim & Kelautan**\n\n';
    if (!active.length) {
      s += 'Tidak ada layer maritim aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(maritimeIds, labels);
      return s;
    }
    s += 'Layer aktif: **' + active.length + '**\n\n';
    active.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatBencanaAnswer() {
    var active = [];
    var bencanaIds = ['toggleFaultLayer','toggleFaultLayerNew','toggleWorldPlatesLayer','toggleJalurEvakuasi','toggleLikuifaksi','toggleKrbGunungApi','toggleKrbTitik'];
    var labels = { toggleFaultLayer: 'Patahan Indonesia (BNPB)', toggleFaultLayerNew: 'Patahan Baru (PUSGEN 2024)', toggleWorldPlatesLayer: 'Zona Patahan Dunia (USGS)', toggleJalurEvakuasi: 'Jalur Evakuasi (BNPB)', toggleLikuifaksi: 'Likuifaksi (BIG)', toggleKrbGunungApi: 'KRB Gunung Api (BIG)', toggleKrbTitik: 'Gas Vulkanik (BIG)' };
    bencanaIds.forEach(function (id) {
      var el = document.getElementById(id);
      if ((el && el.checked) || (window._layerCatalogState && window._layerCatalogState[id])) active.push(labels[id] || id);
    });
    var s = '**Data Bencana**\n\n';
    if (!active.length) {
      s += 'Tidak ada layer bencana aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(bencanaIds, labels);
      return s;
    }
    s += 'Layer aktif: **' + active.length + '**\n\n';
    active.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatSensorGempaAnswer() {
    var active = [];
    var sensorIds = ['toggleSensorSeismic','toggleSensorGlobal'];
    var labels = { toggleSensorSeismic: 'Sensor Seismic BMKG', toggleSensorGlobal: 'Sensor Global (GEOFON)' };
    sensorIds.forEach(function (id) {
      var el = document.getElementById(id);
      if ((el && el.checked) || (window._layerCatalogState && window._layerCatalogState[id])) active.push(labels[id] || id);
    });
    var s = '**Data Sensor Seismic**\n\n';
    if (!active.length) {
      s += 'Tidak ada layer sensor aktif.\n\n**Rekomendasi layer:**\n';
      s += recGrid(sensorIds, labels);
      return s;
    }
    s += 'Layer aktif: **' + active.length + '**\n\n';
    active.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatPendudukAnswer() {
    var s = '**Data Penduduk & Demografi**\n\n';
    var stored = null;
    try { stored = localStorage.getItem('bpsIndicators'); } catch (e) {}
    if (stored) {
      try {
        var indicators = JSON.parse(stored);
        s += 'Data BPS tersedia: **' + (Array.isArray(indicators) ? indicators.length + ' indikator' : 'aktif') + '**\n';
      } catch (e) {
        s += 'Data BPS tersedia di localStorage\n';
      }
    } else {
      s += 'Data BPS belum dimuat.\n\n';
      s += '**Sumber data tersedia:**\n';
      s += '- BPS Indikator (18 indikator demografi)\n';
      s += '- Dukcapil (34 provinsi)\n';
      s += '- BPS Demografi (rank, gender, usia)\n';
    }
    return s;
  }

  function formatPanganAnswer() {
    var s = '**Data Harga Pangan**\n\n';
    var stored = null;
    try { stored = localStorage.getItem('biCommoditiesData'); } catch (e) {}
    if (stored) {
      try {
        var data = JSON.parse(stored);
        s += 'Komoditas BI tersedia: **' + (Array.isArray(data) ? data.length + ' komoditas' : 'aktif') + '**\n';
      } catch (e) {
        s += 'Data BI tersedia di localStorage\n';
      }
    } else {
      s += 'Data harga pangan belum dimuat.\n\n';
      s += '**Sumber data tersedia:**\n';
      s += '- BI Harga Pangan\n';
      s += '- Sebaran Pasar Indonesia\n';
    }
    return s;
  }

  function formatLayersAnswer() {
    var byCat = extractActiveLayersByCategory();
    var totalActive = 0;
    Object.keys(byCat).forEach(function (k) { totalActive += byCat[k].length; });
    var s = '**Layer Aktif di Peta**\n\n';
    if (!totalActive) return s + 'Tidak ada layer aktif saat ini.';
    s += 'Total: **' + totalActive + '** layer\n\n';
    Object.keys(byCat).forEach(function (cat) {
      s += '**' + cat + '** (' + byCat[cat].length + ')\n';
      byCat[cat].forEach(function (l) { s += '- ' + l + '\n'; });
      s += '\n';
    });
    return s.trim();
  }

  function formatViewportAnswer() {
    var v = extractViewportInfo();
    if (!v) return 'Tidak dapat membaca informasi viewport.';
    var bm = extractBasemapInfo();
    var s = '**Lokasi Saat Ini**\n\n';
    s += 'Koordinat: **' + v.lat + ', ' + v.lng + '**\n';
    s += 'Zoom Level: **' + v.zoom + '**\n';
    s += 'Basemap: **' + bm.label + '**\n';
    s += 'Area: ' + v.south + ',' + v.west + ' - ' + v.north + ',' + v.east;
    return s;
  }

  function formatSummaryAnswer() {
    var s = '**Ringkasan Data Peta**\n\n';
    var v = extractViewportInfo();
    if (v) {
      var bm = extractBasemapInfo();
      s += 'Lokasi: ' + v.lat + ', ' + v.lng + ' (zoom ' + v.zoom + ')\n';
      s += 'Basemap: ' + bm.label + '\n\n';
    }
    var layers = extractActiveLayers();
    s += 'Layer aktif: **' + layers.length + '**\n';
    if (layers.length) s += '_' + layers.join(', ') + '_\n\n';
    var hs = extractHotspotData();
    if (hs) s += '- Hotspot: **' + fmt(hs.total) + '** titik (High: ' + fmt(hs.confidence.high) + ')\n';
    var eq = extractGempaData();
    if (eq) {
      s += '- Gempa Signifikan: **' + fmt(eq.totalSignificant) + '**, Dirasakan: **' + fmt(eq.totalFelt) + '**\n';
    }
    var byCat = extractActiveLayersByCategory();
    var catKeys = Object.keys(byCat);
    if (catKeys.length) {
      s += '\n**Per Kategori:**\n';
      catKeys.forEach(function (cat) {
        s += '- ' + cat + ': **' + byCat[cat].length + '** layer\n';
      });
    }
    if (!hs && !eq && !layers.length) s += '\n_Aktifkan layer data untuk analisis lebih lanjut._';
    return s;
  }

  async function fetchLahanSawahData(kode, bbox) {
    var result = { lbs: null, lsd: null };
    try {
      var sawah = await fetchLuasSawah(kode);
      if (sawah && sawah.sawahHa > 0) {
        result.lbs = { ha: sawah.sawahHa, count: sawah.count };
      }
    } catch (e) {}
    if (bbox) {
      try {
        var envelope = bbox.west + ',' + bbox.south + ',' + bbox.east + ',' + bbox.north;
        var params = new URLSearchParams({
          f: 'json', returnGeometry: 'false', where: '1=1',
          geometry: envelope, geometryType: 'esriGeometryEnvelope',
          inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
          outFields: 'wadmpr,wadmkk,luasha'
        });
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, 12000);
        var res = await fetch('https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/59/query?' + params.toString(), { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          var data = await res.json();
          var feats = data.features || [];
          var totalHa = 0;
          feats.forEach(function (f) {
            var a = f.attributes || {};
            if (a.luasha && !isNaN(parseFloat(a.luasha))) totalHa += parseFloat(a.luasha);
          });
          if (totalHa > 0) result.lsd = { ha: Math.round(totalHa * 100) / 100, count: feats.length };
        }
      } catch (e) {}
    }
    return result;
  }

  async function formatRegionAnswer(text) {
    var regionQuery = parseRegionFromText(text);
    if (!regionQuery || /^(region|wilayah|area|daerah|pulau|provinsi|kabupaten|kota|kecamatan|desa|kelurahan)$/.test(regionQuery)) {
      return '**Cari Wilayah**\n\nKetik nama wilayah untuk melihat profil lengkapnya.\n\n' +
        '**Contoh:**\n' +
        '- "Jawa Timur"\n' +
        '- "Kota Bandung"\n' +
        '- "Kabupaten Sleman"\n' +
        '- "DKI Jakarta"\n' +
        '- "Bali"\n\n' +
        '_Data yang ditampilkan: luas wilayah, hotspot, gempa terdekat, dan gunung api terdekat._';
    }
    var match = searchRegionByName(regionQuery);
    if (!match) return 'Wilayah **"' + regionQuery + '"** tidak ditemukan. Coba nama provinsi, kabupaten, atau kota yang lebih lengkap.\n\n_Contoh: "Jawa Timur", "Kota Bandung", "Kabupaten Sleman"_.';

    if (typeof resetAllLayers === 'function') {
      try { resetAllLayers(); } catch (e) {}
    }
    if (typeof showGeoidBoundary === 'function') {
      try { await showGeoidBoundary(match.kode); } catch (e) {}
    }

    var levelLabel = { provinsi: 'Provinsi', kabkot: 'Kabupaten/Kota', kecamatan: 'Kecamatan', desa: 'Desa/Kelurahan' };
    var s = '**Profil Wilayah: ' + match.name + '**\n';
    s += (levelLabel[match.type] || match.type) + ' | Kode: ' + match.kode;
    if (match.provinsi && match.type !== 'provinsi') s += ' | ' + match.provinsi;
    s += '\n\n';

    var boundary = null;
    try { boundary = await fetchRegionBoundaryData(match.kode); } catch (e) {}

    if (boundary && boundary.luasHa > 0) {
      var luasKm2 = (boundary.luasHa / 100).toFixed(1);
      s += '**Luas Wilayah:** ' + fmt(Math.round(boundary.luasHa)) + ' ha (' + luasKm2 + ' km²)\n\n';
    }

    var centerLat = null, centerLng = null;
    var bbox = null;
    if (boundary && boundary.center) {
      centerLat = boundary.center[0];
      centerLng = boundary.center[1];
      bbox = boundary.bbox;
    } else {
      var center = await getRegionCenter(match.kode);
      if (center && center.lat && center.lng) {
        centerLat = center.lat;
        centerLng = center.lng;
        bbox = computeBboxFromCenter(centerLat, centerLng, 0.5);
      }
    }

    var lahanData = null;
    try { lahanData = await fetchLahanSawahData(match.kode, bbox); } catch (e) {}
    if (lahanData && (lahanData.lbs || lahanData.lsd)) {
      s += '**Lahan Sawah:**\n';
      if (lahanData.lbs && lahanData.lbs.ha > 0) {
        var lbsPct = (boundary && boundary.luasHa > 0) ? ((lahanData.lbs.ha / boundary.luasHa) * 100).toFixed(1) : null;
        s += '- LBS 2023: **' + fmt(lahanData.lbs.ha) + ' ha**';
        if (lbsPct) s += ' (' + lbsPct + '% dari luas wilayah)';
        s += '\n';
      }
      if (lahanData.lsd && lahanData.lsd.ha > 0) {
        var lsdPct = (boundary && boundary.luasHa > 0) ? ((lahanData.lsd.ha / boundary.luasHa) * 100).toFixed(1) : null;
        s += '- LSD 50K: **' + fmt(lahanData.lsd.ha) + ' ha**';
        if (lsdPct) s += ' (' + lsdPct + '% dari luas wilayah)';
        s += '\n';
      }
      s += '\n';
    }

    if (centerLat != null && centerLng != null) {
      if (!bbox) bbox = computeBboxFromCenter(centerLat, centerLng, 0.5);

      var hs = countHotspotsInBbox(bbox);
      if (hs) {
        s += '**Hotspot Karhutla (24 Jam):**\n';
        s += '- Total: **' + fmt(hs.total) + '** titik\n';
        if (hs.high > 0) s += '- High: **' + fmt(hs.high) + '**\n';
        if (hs.medium > 0) s += '- Medium: **' + fmt(hs.medium) + '**\n';
        if (hs.low > 0) s += '- Low: **' + fmt(hs.low) + '**\n';
        s += '\n';
      }

      var quakes = findNearestQuakes(centerLat, centerLng, 3);
      if (quakes.length) {
        s += '**Gempa Terdekat:**\n';
        quakes.forEach(function (q, i) {
          s += (i + 1) + '. M ' + q.mag.toFixed(1) + ' — **' + fmt(Math.round(q.dist)) + ' km** (' + q.wilayah + ')\n';
        });
        s += '\n';
      }

      var volcanoes = await findNearestVolcanoes(centerLat, centerLng, match.name);
      if (volcanoes.length) {
        s += '**Gunung Terdekat:**\n';
        var STATUS_COLOR_EMOJI = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
        volcanoes.forEach(function (v, i) {
          var emoji = STATUS_COLOR_EMOJI[v.statusId] || '⚪';
          s += (i + 1) + '. ' + v.name + ' (' + fmt(Math.round(v.dist)) + ' km) — ' + emoji + ' ' + v.status;
          if (v.elevation) s += ' | ' + fmt(v.elevation) + ' mdpl';
          s += '\n';
        });
        s += '\n';
      }
    }

    var recIds = ['toggleHotspotLayer', 'toggleLatestEarthquake', 'toggleVolcanoLayer', 'arcgis-sawah-2023', 'toggleSawahDilindungi', 'toggleAirVisualPm25'];
    var recLabels = { toggleHotspotLayer: '🔥 Hotspot', toggleLatestEarthquake: '🌍 Gempa', toggleVolcanoLayer: '🌋 Gunung Api', 'arcgis-sawah-2023': '🌾 LBS 2023', toggleSawahDilindungi: '🌾 LSD 50K', toggleAirVisualPm25: '💨 PM2.5' };
    s += '**Rekomendasi Layer:**\n';
    s += recGrid(recIds, recLabels, match.name);

    return s;
  }

  function formatHelpAnswer() {
    return '**AI Analisis Geospasial**\n\n' +
      'Tanyakan sesuatu tentang data peta, atau gunakan tombol quick action.\n\n' +
      '**Contoh pertanyaan:**\n' +
      '- "Hotspot terbanyak di mana?"\n' +
      '- "Gempa terbaru apa?"\n' +
      '- "Basemap apa yang aktif?"\n' +
      '- "Layer cuaca apa saja yang aktif?"\n' +
      '- "Kualitas udara bagaimana?"\n' +
      '- "Data gunung api"\n' +
      '- "Status kehutanan"\n' +
      '- "Data hidrologi aktif"\n' +
      '- "Layer bencana apa saja?"\n' +
      '- "Sensor seismic aktif?"\n' +
      '- "Data maritim"\n' +
      '- "Ringkasan data peta"\n' +
      '- "Jawa Timur"\n' +
      '- "Kota Bandung"\n' +
      '- "Kabupaten Sleman"\n';
  }

  async function getAnswer(intent, text) {
    switch (intent) {
      case 'region': return await formatRegionAnswer(text);
      case 'hotspot': return formatHotspotAnswer();
      case 'gempa': return formatGempaAnswer();
      case 'basemap': return formatBasemapAnswer();
      case 'cuaca': return formatCuacaAnswer();
      case 'udara': return formatUdaraAnswer();
      case 'gunung': return formatGunungAnswer();
      case 'hutan': return formatHutanAnswer();
      case 'geologi': return formatGeologiAnswer();
      case 'hidrologi': return formatHidrologiAnswer();
      case 'penduduk': return formatPendudukAnswer();
      case 'pangan': return formatPanganAnswer();
      case 'lahan': return formatLahanAnswer();
      case 'maritim': return formatMaritimAnswer();
      case 'bencana': return formatBencanaAnswer();
      case 'sensorgempa': return formatSensorGempaAnswer();
      case 'layers': return formatLayersAnswer();
      case 'viewport': return formatViewportAnswer();
      case 'summary': return formatSummaryAnswer();
      default: return formatHelpAnswer();
    }
  }

  /* === Chat Logic === */
  function addChatMessage(role, text) {
    chatHistory.push({ role: role, content: text, time: Date.now() });
    if (chatHistory.length > MAX_CHAT) chatHistory = chatHistory.slice(-MAX_CHAT);
    renderChat();
    saveChatHistory();
  }

  var AI_AVATAR_SVG = '<svg viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/><polyline points="2 15.5 12 8.5 22 15.5"/><line x1="12" y1="2" x2="12" y2="8.5"/></svg>';
  var USER_AVATAR_SVG = '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  function renderChat() {
    var c = $('ais-chat-messages');
    if (!c) return;
    var html = '';
    chatHistory.forEach(function (m) {
      var cls = m.role === 'user' ? 'ais-msg-user' : 'ais-msg-ai';
      var avatar = m.role === 'user' ? USER_AVATAR_SVG : AI_AVATAR_SVG;
      var text = m.role === 'user' ? escapeHtml(m.content) : formatMarkdown(m.content);
      html += '<div class="ais-msg ' + cls + '"><div class="ais-msg-avatar">' + avatar + '</div><div class="ais-msg-content">' + text + '</div></div>';
    });
    c.innerHTML = html;
    c.scrollTop = c.scrollHeight;
  }

  function escapeHtml(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }

  function formatMarkdown(t) {
    var rawBlocks = [];
    var processed = t.replace(/\x00RAW([\s\S]*?)RAW\x00/g, function (m, p1) {
      var idx = rawBlocks.length;
      rawBlocks.push(p1);
      return '\x00BLOCK' + idx + '\x00';
    });
    var result = processed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\d+\. (.+)$/gm, '<div class="ais-list-item">$1</div>')
      .replace(/^[-\u2022] (.+)$/gm, '<div class="ais-list-item">\u2022 $1</div>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
    result = result.replace(/\x00BLOCK(\d+)\x00/g, function (m, idx) {
      return rawBlocks[parseInt(idx)];
    });
    return result;
  }

  function saveChatHistory() { try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)); } catch (e) {} }
  function loadChatHistory() { try { chatHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]'); } catch (e) { chatHistory = []; } }

  window._aiClearChat = function () {
    if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    chatHistory = []; localStorage.removeItem(CHAT_HISTORY_KEY); renderChat();
  };

  window._aiSendQuick = function (idx) {
    var action = QUICK_ACTIONS[idx];
    if (action) sendMessage(action.intent);
  };

  /* === Typing Animation === */
  var _typingTimer = null;

  function getTypingSpeed(len) {
    if (len < 100) return 18;
    if (len < 500) return 12;
    return 8;
  }

  function typeWriteMessage(text) {
    var c = $('ais-chat-messages');
    if (!c) { addChatMessage('ai', text); return; }

    var msgDiv = document.createElement('div');
    msgDiv.className = 'ais-msg ais-msg-ai';
    msgDiv.innerHTML = '<div class="ais-msg-avatar">' + AI_AVATAR_SVG + '</div><div class="ais-msg-content"></div>';
    c.appendChild(msgDiv);

    var dotsDiv = document.createElement('div');
    dotsDiv.className = 'ais-msg ais-msg-ai ais-typing';
    dotsDiv.innerHTML = '<div class="ais-msg-avatar">' + AI_AVATAR_SVG + '</div><div class="ais-typing-dots"><span></span><span></span><span></span></div>';
    c.appendChild(dotsDiv);
    c.scrollTop = c.scrollHeight;

    var contentDiv = msgDiv.querySelector('.ais-msg-content');
    var formatted = formatMarkdown(text);
    var temp = document.createElement('div');
    temp.innerHTML = formatted;
    var fullHtml = temp.innerHTML;

    setTimeout(function () {
      c.removeChild(dotsDiv);
      msgDiv.classList.add('ais-msg-typing');
      var cursor = document.createElement('span');
      cursor.className = 'ais-msg-cursor';

      var charIdx = 0;
      var speed = getTypingSpeed(fullHtml.length);
      var maxTime = 2500;
      var startTime = Date.now();

      contentDiv.innerHTML = '';
      contentDiv.appendChild(cursor);

      _typingTimer = setInterval(function () {
        var elapsed = Date.now() - startTime;
        if (elapsed > maxTime || charIdx >= fullHtml.length) {
          clearInterval(_typingTimer);
          _typingTimer = null;
          contentDiv.innerHTML = fullHtml;
          finishAiMessage(text);
          return;
        }

        var chunk = Math.max(1, Math.ceil(fullHtml.length * (speed / maxTime)));
        charIdx = Math.min(charIdx + chunk, fullHtml.length);
        contentDiv.innerHTML = fullHtml.substring(0, charIdx);
        contentDiv.appendChild(cursor);
        c.scrollTop = c.scrollHeight;
      }, speed);
    }, 350);

    msgDiv.addEventListener('click', function () {
      if (_typingTimer) {
        clearInterval(_typingTimer);
        _typingTimer = null;
        contentDiv.innerHTML = fullHtml;
        finishAiMessage(text);
      }
    }, { once: true });
  }

  function finishAiMessage(text) {
    chatHistory.push({ role: 'ai', content: text, time: Date.now() });
    if (chatHistory.length > MAX_CHAT) chatHistory = chatHistory.slice(-MAX_CHAT);
    saveChatHistory();
    var c = $('ais-chat-messages');
    if (c) {
      var typingMsg = c.querySelector('.ais-msg-typing');
      if (typingMsg) typingMsg.classList.remove('ais-msg-typing');
    }
  }

  function showAiLoading(text) {
    var c = $('ais-chat-messages');
    if (!c) return;
    var div = document.createElement('div');
    div.className = 'ais-msg ais-msg-ai';
    div.id = 'ais-loading-msg';
    div.innerHTML = '<div class="ais-msg-avatar">' + AI_AVATAR_SVG + '</div><div class="ais-msg-content"><span class="ais-msg-typing-indicator">' + (text || 'Memproses') + '<span class="ais-typing-dots"><span></span><span></span><span></span></span></span></div>';
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }

  function removeAiLoading() {
    var el = document.getElementById('ais-loading-msg');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    var input = $('ais-chat-input');
    if (input) input.value = '';
    addChatMessage('user', text);
    var intent = parseIntent(text);
    if (intent === 'help' && text.trim().toLowerCase() !== 'region') {
      var regionMatch = searchRegionByName(text);
      if (regionMatch) intent = 'region';
    }
    var isRegion = intent === 'region';
    if (isRegion) showAiLoading('Mencari data wilayah');
    try {
      var answer = await getAnswer(intent, text);
      if (isRegion) removeAiLoading();
      typeWriteMessage(answer);
    } catch (e) {
      if (isRegion) removeAiLoading();
      typeWriteMessage('Terjadi kesalahan saat memproses pertanyaan. Silakan coba lagi.');
    }
  }

  window._aiSendMessage = function () { var input = $('ais-chat-input'); if (input) sendMessage(input.value); };
  window._aiHandleKeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._aiSendMessage(); } };

  /* === Sheet Controls === */
  function openAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheet.classList.add('ais-sheet-open');
    sheetOpen = true;
    sheetMinimized = false;
    if (!chatHistory.length) {
      addChatMessage('ai', 'Halo! Saya adalah AI asisten geospasial. Tanyakan apa saja tentang data peta, atau pilih quick action di bawah.');
    }
  }

  function closeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    sheetOpen = false;
    sheetMinimized = false;
    sheet.classList.remove('ais-sheet-open', 'ais-sheet-minimized');
  }

  function minimizeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheetMinimized = !sheetMinimized;
    sheet.classList.toggle('ais-sheet-minimized', sheetMinimized);
    sheet.classList.toggle('ais-sheet-open', !sheetMinimized);
  }

  function toggleAiSheet() { if (sheetOpen) closeAiSheet(); else openAiSheet(); }

  window.openAiSheet = openAiSheet;
  window.closeAiSheet = closeAiSheet;
  window.minimizeAiSheet = minimizeAiSheet;
  window.toggleAiSheet = toggleAiSheet;

  /* === Init === */
  function initAiAnalysis() {
    var triggerBtn = $('aiAnalysisBtn');
    if (triggerBtn) triggerBtn.addEventListener('click', toggleAiSheet);
    loadChatHistory();
    renderChat();
    document.querySelectorAll('.ais-quick-btn').forEach(function (btn, idx) {
      btn.addEventListener('click', function () { window._aiSendQuick(idx); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAnalysis);
  } else {
    initAiAnalysis();
  }

})();
