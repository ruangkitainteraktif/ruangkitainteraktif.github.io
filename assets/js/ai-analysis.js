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

  var QUICK_ACTIONS = [];

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
      ids: ['toggleWindRgb','toggleRhRgb','toggleTp24Rgb','togglePm25Rgb','toggleHthRgb','toggleBmkgPrecip10days','toggleCuacaPerairanLayer','toggleCuacaPelabuhanLayer','toggleMaritimeAngin','toggleMaritimeGelombang','toggleMaritimeSwell','toggleMaritimeWindSea','toggleGhrsstSstAnomali'],
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
    var q = text.toLowerCase()
      .replace(/^(profil|info|data|detail|informasi|tentang|untuk|di|pulau|penduduk|jumlah|populasi|demografi|hotspot|gempa|gunung|cuaca|udara|lahan|iklim|curah|hujan|angin|suhu|banjir|longsor|kebakaran|erupsi|magma|sawah|pertanian)\s*/g, '')
      .trim();
    return q;
  }

  function stripAdminPrefix(q) {
    return q.replace(/^(provinsi|kabupaten|kota|kecamatan|desa|kelurahan)\s*/g, '').trim();
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

    // Detect level prefix: "kabupaten Bandung" -> filter to kabkot only
    var levelPrefixRe = /^(provinsi|kabupaten|kota|kecamatan|desa|kelurahan)\s+/;
    var levelFilter = null;
    var prefixMatch = q.match(levelPrefixRe);
    if (prefixMatch) {
      var p = prefixMatch[1].toLowerCase();
      if (p === 'provinsi') levelFilter = 'provinsi';
      else if (p === 'kabupaten' || p === 'kota') levelFilter = 'kabkot';
      else if (p === 'kecamatan') levelFilter = 'kecamatan';
      else if (p === 'desa' || p === 'kelurahan') levelFilter = 'desa';
      q = q.replace(levelPrefixRe, '').trim();
      qn = norm(q);
      qnCompact = qn.replace(/\s+/g, '');
    }

    var results = [];

    function addResult(searchText, item, type, contextBonus) {
      var sn = norm(searchText);
      var snCompact = sn.replace(/\s+/g, '');
      var score = 0;
      if (sn === qn || snCompact === qnCompact) score = 100;
      else if (sn.indexOf(qn) === 0 || snCompact.indexOf(qnCompact) === 0) score = 80;
      else if (qn.indexOf(sn) !== -1 && sn.length > 3) score = 60;
      else if (sn.indexOf(qn) !== -1 || snCompact.indexOf(qnCompact) !== -1) score = 40;
      else if (qnCompact.indexOf(snCompact) !== -1 && snCompact.length > 3) score = 30;
      if (score > 0) score += (contextBonus || 0);
      if (score > 0) {
        results.push({ score: score, type: type, name: item.name, kode: item.kode, provinsi: item.provinsi || item.name, kabkot: item.kabkot || '', kecamatan: item.kecamatan || '' });
      }
    }

    function hasContext(word) {
      if (!word) return false;
      var wn = norm(word);
      return qn.indexOf(wn) !== -1 || qnCompact.indexOf(wn.replace(/\s+/g, '')) !== -1;
    }

    provinsiIdx.forEach(function (item) { addResult(item.searchText, item, 'provinsi', 0); });

    kabkotaIdx.forEach(function (item) {
      var bonus = hasContext(item.provinsi) ? 15 : 0;
      addResult(item.searchText, item, 'kabkot', bonus);
    });

    kecIdx.forEach(function (item) {
      var bonus = 0;
      if (hasContext(item.kabkot)) bonus += 15;
      if (hasContext(item.provinsi)) bonus += 10;
      addResult(item.searchText, item, 'kecamatan', bonus);
    });

    if (typeof window.weatherSearchLocations !== 'undefined' && window.weatherSearchLocations.length) {
      for (var i = 0; i < Math.min(window.weatherSearchLocations.length, 50000); i++) {
        var loc = window.weatherSearchLocations[i];
        var locDesa = norm(loc.desa || '');
        if (locDesa && (locDesa === qn || locDesa.indexOf(qn) !== -1 || qn.indexOf(locDesa) !== -1)) {
          var bonus = 0;
          if (hasContext(loc.kecamatan)) bonus += 20;
          if (hasContext(loc.kabkota)) bonus += 15;
          if (hasContext(loc.provinsi)) bonus += 10;
          addResult(loc.desa, { name: loc.desa || loc.kecamatan, kode: loc.kode, provinsi: loc.provinsi, kabkot: loc.kabkota, kecamatan: loc.kecamatan }, 'desa', bonus);
        } else if (loc.searchText && (norm(loc.searchText).indexOf(qn) !== -1 || loc.searchText.replace(/\s+/g, '').indexOf(qnCompact) !== -1)) {
          var bonus2 = 0;
          if (hasContext(loc.kecamatan)) bonus2 += 20;
          if (hasContext(loc.kabkota)) bonus2 += 15;
          if (hasContext(loc.provinsi)) bonus2 += 10;
          addResult(loc.searchText, { name: loc.desa || loc.kecamatan, kode: loc.kode, provinsi: loc.provinsi, kabkot: loc.kabkota, kecamatan: loc.kecamatan }, 'desa', bonus2);
        }
      }
    }

    if (!results.length) return null;

    // Filter by explicit level prefix
    if (levelFilter) {
      results = results.filter(function (r) { return r.type === levelFilter; });
      if (!results.length) return null;
    }

    // Parent hierarchy validation penalty (skip if user typed a level prefix):
    // desa       -> butuh kecamatan context  -> -20 jika tidak ada
    // kecamatan   -> butuh kabkot context    -> -20 jika tidak ada
    // kabkot      -> butuh provinsi context  -> -20 jika tidak ada
    if (!levelFilter) {
      results.forEach(function (r) {
        if (r.type === 'desa' && !hasContext(r.kabkot)) r.score -= 20;
        else if (r.type === 'kecamatan' && !hasContext(r.kabkot)) r.score -= 20;
        else if (r.type === 'kabkot' && !hasContext(r.provinsi)) r.score -= 20;
      });
    }
    results.sort(function (a, b) { return b.score - a.score; });

    var best = results[0];
    if (best.score < 30) return null;

    // Disambiguation: if multiple results share the same name but different types
    // with a tight score gap, return the disambiguation object.
    var sameName = results.filter(function (r) { return norm(r.name) === norm(best.name); });
    if (sameName.length >= 2 && !levelFilter) {
      var scoreGap = sameName[0].score - sameName[sameName.length - 1].score;
      var hasDiffTypes = sameName.some(function (r) { return r.type !== best.type; });
      if (hasDiffTypes && scoreGap <= 15) {
        var types = sameName.map(function (r) {
          var label = r.type === 'kabkot' ? 'Kabupaten/Kota' : r.type === 'kecamatan' ? 'Kecamatan' : r.type === 'desa' ? 'Desa/Kelurahan' : 'Provinsi';
          var ctx = r.type === 'desa' ? ' (Kec. ' + r.kabkot + ')' : r.type === 'kecamatan' ? ' (Kab. ' + r.kabkot + ')' : r.type === 'kabkot' ? ' (' + r.provinsi + ')' : '';
          return label + ': ' + r.name + ctx;
        });
        return { ambiguous: true, name: best.name, options: types, results: sameName };
      }
    }

    return { type: best.type, name: best.name, kode: best.kode, provinsi: best.provinsi, kabkot: best.kabkot, kecamatan: best.kecamatan || '' };
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

  function findNearestHotspots(centerLat, centerLng, limit) {
    var features = (typeof window.getHotspotFeatures === 'function') ? window.getHotspotFeatures() : [];
    if (!features.length) return [];
    var result = [];
    features.forEach(function (f) {
      var p = f.properties;
      if (p.lat == null || p.long == null) return;
      var dist = geoidDistanceKm(centerLat, centerLng, p.lat, p.long);
      result.push({
        lat: p.lat, long: p.long,
        confidence: p.confidence_level || '-',
        provinsi: p.nama_provinsi || '-',
        kabkota: p.kabkota || '-',
        sumber: p.sumber || '-',
        date: p.date_hotspot || '-',
        dist: dist
      });
    });
    result.sort(function (a, b) { return a.dist - b.dist; });
    return result.slice(0, limit || 5);
  }

  async function findNearestQuakes(centerLat, centerLng, limit) {
    var quakes = [];
    var src = [];
    if (typeof earthquakeSignificantData !== 'undefined' && earthquakeSignificantData.length) src = src.concat(earthquakeSignificantData);
    if (typeof earthquakeFeltData !== 'undefined' && earthquakeFeltData.length) src = src.concat(earthquakeFeltData);
    if (typeof earthquakeLatestData !== 'undefined' && earthquakeLatestData) src.push(earthquakeLatestData);

    if (!src.length) {
      if (!window._quakeFetchPromise) {
        window._quakeFetchPromise = (async function () {
          var urls = [
            'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json',
            'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json',
            'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json'
          ];
          try {
            var results = await Promise.all(urls.map(function (u) { return fetch(u).then(function (r) { return r.json(); }); }));
            var getGempa = function (p) { var g = p && p.Infogempa && p.Infogempa.gempa; return Array.isArray(g) ? g : (g ? [g] : []); };
            earthquakeLatestData = getGempa(results[0])[0] || null;
            earthquakeSignificantData = getGempa(results[1]);
            earthquakeFeltData = getGempa(results[2]);
          } catch (e) {}
        })();
      }
      await window._quakeFetchPromise;
      if (typeof earthquakeSignificantData !== 'undefined' && earthquakeSignificantData.length) src = src.concat(earthquakeSignificantData);
      if (typeof earthquakeFeltData !== 'undefined' && earthquakeFeltData.length) src = src.concat(earthquakeFeltData);
      if (typeof earthquakeLatestData !== 'undefined' && earthquakeLatestData) src.push(earthquakeLatestData);
    }

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
    { intent: 'lahan', patterns: ['lahan', 'tutupan', 'irigasi', 'sawah dilindungi', 'lahan baku', 'pertanahan', 'atrbpn', 'persil', 'rtrw', 'penggunaan tanah', 'land use', 'peta penggunaan', 'ptnobj'] },
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
  async function formatHotspotAnswer(text, regionMatch) {
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
    if (regionMatch) {
      var boundary = await fetchRegionBoundaryData(regionMatch.kode);
      if (boundary) {
        var regionHotspots = countHotspotsInBbox(boundary.bbox);
        s += '\n---\n**Hotspot di ' + regionMatch.name + ':**\n';
        if (regionHotspots) {
          s += 'Total dalam bbox: **' + fmt(regionHotspots.total) + '** titik\n';
          s += 'High: **' + fmt(regionHotspots.high) + '** | Medium: **' + fmt(regionHotspots.medium) + '** | Low: **' + fmt(regionHotspots.low) + '**\n';
          var nearest = findNearestHotspots(boundary.center[0], boundary.center[1], 3);
          if (nearest.length) {
            s += 'Terdekat dari pusat wilayah: **' + fmt(Math.round(nearest[0].dist)) + ' km** (' + nearest[0].confidence + ', ' + nearest[0].kabkota + ')\n';
            s += '\n**3 Hotspot Terdekat:**\n';
            nearest.forEach(function (h, i) {
              s += (i + 1) + '. ' + h.lat.toFixed(1) + ', ' + h.long.toFixed(1) + ' — ' + h.confidence + ' — **' + fmt(Math.round(h.dist)) + ' km** — ' + h.kabkota + '\n';
            });
          }
        } else {
          s += 'Tidak ada hotspot dalam bbox wilayah ini.\n';
        }
      }
    }
    return s;
  }

  async function formatGempaAnswer(text, regionMatch) {
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
    if (regionMatch) {
      var boundary = await fetchRegionBoundaryData(regionMatch.kode);
      if (boundary) {
        var nearest = await findNearestQuakes(boundary.center[0], boundary.center[1], 5);
        if (nearest.length) {
          s += '\n---\n**Gempa Terdekat dari ' + regionMatch.name + ':**\n';
          nearest.forEach(function (q, i) {
            s += (i + 1) + '. M' + q.mag + ' — **' + fmt(Math.round(q.dist)) + ' km** — ' + q.wilayah + ' (Kedalaman: ' + q.kedalaman + ' km)\n';
          });
        } else {
          s += '\n---\nTidak ada data gempa di sekitar ' + regionMatch.name + '.\n';
        }
      }
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

  async function formatCuacaAnswer(text, regionMatch) {
    var active = [];
    var weatherIds = ['toggleWindRgb','toggleRhRgb','toggleTp24Rgb','togglePm25Rgb','toggleHthRgb','toggleBmkgPrecip10days','toggleCuacaPerairanLayer','toggleCuacaPelabuhanLayer','toggleGhrsstSstAnomali'];
    var labels = { toggleWindRgb: 'Wind Speed (GFS)', toggleRhRgb: 'Relative Humidity', toggleTp24Rgb: 'Precipitation 24 Jam', togglePm25Rgb: 'PM2.5 (BMKG PCM)', toggleHthRgb: 'Hari Tanpa Hujan', toggleBmkgPrecip10days: 'Prakiraan Hujan 10 Hari', toggleCuacaPerairanLayer: 'Cuaca Perairan', toggleCuacaPelabuhanLayer: 'Cuaca Pelabuhan', toggleGhrsstSstAnomali: 'SST Anomaly (GHRSST)' };
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
    if (regionMatch) {
      s += '\n---\n**Cuaca untuk ' + regionMatch.name + ':**\n';
      s += 'Untuk data cuaca detail, gunakan pencarian lokasi di panel cuaca dengan nama desa/kelurahan.\n';
      s += 'Kode wilayah: **' + regionMatch.kode + '**\n';
    }
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
    if (regionMatch) {
      s += '\n---\n**Kualitas Udara di ' + regionMatch.name + ':**\n';
      s += 'Data PM2.5 ditampilkan melalui layer AirVisual di peta.\n';
      s += 'Kode wilayah: **' + regionMatch.kode + '**\n';
    }
    return s;
  }

  async function formatGunungAnswer(text, regionMatch) {
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
    if (regionMatch) {
      var boundary = await fetchRegionBoundaryData(regionMatch.kode);
      if (boundary) {
        var nearest = await findNearestVolcanoes(boundary.center[0], boundary.center[1], regionMatch.name);
        if (nearest.length) {
          var STATUS_ICON = { Normal: '\uD83D\uDFE2', Waspada: '\uD83D\uDFE1', Siaga: '\uD83D\uDD34', Awas: '\uD83D\uDD34' };
          s += '\n---\n**Gunung Terdekat dari ' + regionMatch.name + ':**\n';
          nearest.slice(0, 5).forEach(function (v, i) {
            s += (i + 1) + '. **' + v.name + '** — ' + fmt(Math.round(v.dist)) + ' km — ' + (STATUS_ICON[v.status] || '') + ' ' + v.status + ' | ' + fmt(v.elevation) + ' mdpl\n';
          });
        }
      }
    }
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

  async function formatLahanAnswer(text, regionMatch) {
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
    if (regionMatch) {
      var boundary = await fetchRegionBoundaryData(regionMatch.kode);
      if (boundary) {
        var lahans = await fetchLahanSawahData(regionMatch.kode, boundary.bbox);
        s += '\n---\n**Lahan di ' + regionMatch.name + ':**\n';
        if (lahans.lbs) {
          s += 'LBS 2023 (Lahan Baku Sawah): **' + fmt(Math.round(lahans.lbs.ha)) + '** ha (' + lahans.lbs.count + ' blok)\n';
        }
        if (lahans.lsd) {
          s += 'LSD 50K (Lahan Sawah Dilindungi): **' + fmt(Math.round(lahans.lsd.ha)) + '** ha (' + lahans.lsd.count + ' poligon)\n';
        }
        if (!lahans.lbs && !lahans.lsd) {
          s += 'Tidak ada data lahan sawah untuk wilayah ini.\n';
        }
        var ptData = null;
        try { ptData = await fetchPenggunaanTanah(regionMatch.kode, boundary.bbox); } catch (e) {}
        if (ptData && ptData.types.length) {
          s += '\n**Penggunaan Tanah 10K:**\n';
          s += '- Total: **' + fmt(ptData.totalPolygons) + '** polygon | Luas: **' + ptData.totalHa.toFixed(2) + ' ha**\n';
          ptData.types.slice(0, 5).forEach(function (t) {
            var pct = ptData.totalHa > 0 ? ((t.ha / ptData.totalHa) * 100).toFixed(1) : '0';
            s += '- ' + t.name + ': **' + t.ha.toFixed(2) + ' ha** (' + pct + '%)\n';
          });
          if (ptData.types.length > 5) s += '- _...dan ' + (ptData.types.length - 5) + ' jenis lainnya_\n';
        }
      }
    }
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

  async function formatPendudukAnswer(text, regionMatch) {
    if (!regionMatch) {
      return '**Data Penduduk & Demografi**\n\n' +
        'Ketik nama wilayah untuk melihat data penduduk detail dari Dukcapil.\n\n' +
        '**Contoh:**\n' +
        '- "penduduk Jawa Timur"\n' +
        '- "jumlah penduduk Kota Bandung"\n' +
        '- "populasi DKI Jakarta"\n' +
        '- "demografi Bali"\n\n' +
        '_Sumber: DKB Tahun 2024 Semester 1 (39 provinsi, level desa/kelurahan)._';
    }
    if (typeof window.getDukcapilPopulation !== 'function') {
      return 'Data Dukcapil belum dimuat. Silakan coba lagi nanti.';
    }
    var data = await window.getDukcapilPopulation(regionMatch.kode);
    if (!data) {
      return 'Data penduduk untuk **' + regionMatch.name + '** tidak ditemukan.';
    }
    var malePct = data.pp ? Math.round((data.pd / data.pp) * 100) : 0;
    var femalePct = 100 - malePct;
    var areaKm2 = Number(data.lw) || 0;
    var density = areaKm2 > 0 ? Math.round(data.pp / areaKm2) : 0;
    var avgKK = data.kk ? (data.pp / data.kk).toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '-';

    var s = '**Data Penduduk: ' + regionMatch.name + '**\n';
    s += '_Sumber: ' + data.source + '_\n\n';
    s += 'Total Populasi: **' + fmt(data.pp) + '** jiwa\n';
    s += 'Laki-laki: **' + fmt(data.pd) + '** (' + malePct + '%) | Perempuan: **' + fmt(data.wn) + '** (' + femalePct + '%)\n';
    s += 'Kepala Keluarga: **' + fmt(data.kk) + '**\n';
    s += 'Luas Wilayah: **' + (areaKm2 ? areaKm2.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' km²' : '-') + '**\n';
    s += 'Kepadatan: **' + (density ? fmt(density) + '/km²' : '-') + '**\n';
    s += 'Rata-rata/KK: **' + avgKK + ' jiwa**\n';

    var ageGroups = [['0–4', 'u0'], ['5–9', 'u5'], ['10–14', 'u10'], ['15–19', 'u15'], ['20–24', 'u20'], ['25–34', 'u25'], ['35–44', 'u35'], ['45–54', 'u45'], ['55–64', 'u55'], ['65–69', 'u65'], ['70–74', 'u70'], ['75+', 'u75']];
    var ageSorted = ageGroups.map(function (a) { return { label: a[0], val: Number(data[a[1]]) || 0 }; }).sort(function (a, b) { return b.val - a.val; });
    s += '\n**Distribusi Usia (Top 5):**\n';
    ageSorted.slice(0, 5).forEach(function (a, i) {
      s += (i + 1) + '. ' + a.label + ' tahun: **' + fmt(a.val) + '**\n';
    });

    var totalReligion = (data.is || 0) + (data.kr || 0) + (data.ka || 0) + (data.hi || 0) + (data.bu || 0) + (data.ko || 0);
    if (totalReligion > 0) {
      var relItems = [
        { name: 'Islam', val: data.is },
        { name: 'Kristen', val: data.kr },
        { name: 'Katolik', val: data.ka },
        { name: 'Hindu', val: data.hi },
        { name: 'Buddha', val: data.bu },
        { name: 'Konghucu', val: data.ko }
      ].filter(function (r) { return r.val > 0; }).sort(function (a, b) { return b.val - a.val; });
      s += '\n**Agama:** ';
      s += relItems.map(function (r) { return r.name + ' ' + Math.round((r.val / totalReligion) * 100) + '%'; }).join(' | ') + '\n';
    }

    var totalEdu = (data.tb || 0) + (data.bt || 0) + (data.ts || 0) + (data.sl || 0) + (data.sa || 0) + (data.d1 || 0) + (data.d3 || 0) + (data.s1 || 0) + (data.s2 || 0) + (data.s3 || 0);
    if (totalEdu > 0) {
      var eduItems = [
        { name: 'Belum sekolah', val: data.tb },
        { name: 'Belum tamat SD', val: data.bt },
        { name: 'Tamat SD', val: data.ts },
        { name: 'SLTP', val: data.sl },
        { name: 'SLTA', val: data.sa },
        { name: 'Diploma', val: (data.d1 || 0) + (data.d3 || 0) },
        { name: 'S1', val: data.s1 },
        { name: 'S2+', val: (data.s2 || 0) + (data.s3 || 0) }
      ].filter(function (e) { return e.val > 0; }).sort(function (a, b) { return b.val - a.val; });
      s += '**Pendidikan:** ';
      s += eduItems.slice(0, 5).map(function (e) { return e.name + ' ' + Math.round((e.val / totalEdu) * 100) + '%'; }).join(' | ') + '\n';
    }

    var totalJob = (data.pk || 0) + (data.ps || 0) + (data.mr || 0) + (data.pw || 0) + (data.nl || 0) + (data.pm || 0) + (data.gp || 0) + (data.ws || 0);
    if (totalJob > 0) {
      var jobItems = [
        { name: 'Petani', val: data.pk },
        { name: 'PNS', val: data.ps },
        { name: 'Mengurus rumah', val: data.mr },
        { name: 'Pelajar/mahasiswa', val: data.pw },
        { name: 'Nelayan', val: data.nl },
        { name: 'Pensiunan', val: data.pm },
        { name: 'Guru', val: data.gp },
        { name: 'Wiraswasta', val: data.ws }
      ].filter(function (j) { return j.val > 0; }).sort(function (a, b) { return b.val - a.val; });
      s += '**Pekerjaan:** ';
      s += jobItems.slice(0, 5).map(function (j) { return j.name + ' ' + Math.round((j.val / totalJob) * 100) + '%'; }).join(' | ') + '\n';
    }

    var totalBlood = (data.og || 0) + (data.ag || 0) + (data.bg || 0) + (data.abg || 0);
    if (totalBlood > 0) {
      s += '**Golongan Darah:** ';
      s += [
        { name: 'O', val: data.og },
        { name: 'A', val: data.ag },
        { name: 'B', val: data.bg },
        { name: 'AB', val: data.abg }
      ].filter(function (b) { return b.val > 0; }).sort(function (a, b) { return b.val - a.val; }).map(function (b) { return b.name + ' ' + Math.round((b.val / totalBlood) * 100) + '%'; }).join(' | ') + '\n';
    }

    s += '\nTotal desa/kelurahan: **' + fmt(data.records) + '**';
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

  async function fetchPenggunaanTanah(kode, bbox) {
    if (!bbox) return null;
    try {
      var minX = bbox.west || bbox[0], minY = bbox.south || bbox[1];
      var maxX = bbox.east || bbox[2], maxY = bbox.north || bbox[3];
      var envelope = JSON.stringify({ xmin: minX, ymin: minY, xmax: maxX, ymax: maxY, spatialReference: { wkid: 4326 } });
      var offset = 0;
      var all = [];
      var PAGE = 1000;
      var loop = function () {
        var params = new URLSearchParams({
          f: 'json', returnGeometry: 'false', where: '1=1',
          geometry: envelope, geometryType: 'esriGeometryEnvelope',
          spatialRel: 'esriSpatialRelIntersects', inSR: '4326',
          outFields: 'ptnobjname,ig25k_penggunaan10k_ar_area',
          resultOffset: String(offset), resultRecordCount: String(PAGE)
        });
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, 15000);
        return fetch('https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/3/query?' + params.toString(), { signal: ctrl.signal })
          .then(function (r) { clearTimeout(t); return r.json(); })
          .then(function (data) {
            if (data.features) all = all.concat(data.features);
            if (data.exceededTransferLimit && data.features && data.features.length > 0) {
              offset += PAGE;
              return loop();
            }
            return all;
          });
      };
      var features = await loop();
      if (!features.length) return null;
      var types = {};
      var totalHa = 0;
      features.forEach(function (f) {
        var a = f.attributes || {};
        var name = a.ptnobjname || 'Lainnya';
        var ha = parseFloat(a.ig25k_penggunaan10k_ar_area) || 0;
        if (!types[name]) types[name] = { name: name, count: 0, ha: 0 };
        types[name].count++;
        types[name].ha += ha / 10000;
        totalHa += ha / 10000;
      });
      var sorted = Object.values(types).sort(function (a, b) { return b.ha - a.ha; });
      return { types: sorted, totalPolygons: features.length, totalHa: totalHa };
    } catch (e) {
      console.warn('[AI] fetchPenggunaanTanah error:', e);
      return null;
    }
  }

  var LULC_CLASSES = [
    { id: 1, band: 1, name: 'Air', color: '#419bdf' },
    { id: 2, band: 2, name: 'Hutan/Pohon', color: '#397d49' },
    { id: 3, band: 4, name: 'Vegetasi Banjir', color: '#7a87c6' },
    { id: 4, band: 5, name: 'Tanaman Pangan', color: '#e49635' },
    { id: 5, band: 7, name: 'Kawasan Terbangun', color: '#c4281b' },
    { id: 6, band: 8, name: 'Tanah Gundul', color: '#a59b8f' },
    { id: 7, band: 9, name: 'Salju/Es', color: '#a8ebff' },
    { id: 8, band: 10, name: 'Awan', color: '#616161' },
    { id: 9, band: 11, name: 'Padang Rumput', color: '#e3e2c3' }
  ];
  var LULC_BAND_MAP = {};
  LULC_CLASSES.forEach(function (c) { LULC_BAND_MAP[c.band] = c; });

  function lulcToMercator(lon, lat) {
    return [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180];
  }

  async function fetchLulcData(boundary) {
    if (!boundary || !boundary.path || !boundary.path.length) return null;
    var rings = boundary.path.map(function (ring) { return ring.map(function (p) { return lulcToMercator(p[1], p[0]); }); });
    var geometry = { rings: rings, spatialReference: { wkid: 102100 } };
    var params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      pixelSize: '10'
    });
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var res = await fetch('https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/computeStatisticsHistograms?' + params, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      var payload = await res.json();
      var histograms = payload.histograms && payload.histograms[0];
      if (!histograms || !histograms.counts) return null;
      var counts = histograms.counts || [];
      var mins = histograms.minValues || [];
      var totalPixels = counts.reduce(function (a, b) { return a + b; }, 0);
      if (totalPixels === 0) return null;
      var dist = {};
      for (var i = 0; i < counts.length; i++) {
        var bandVal = Math.round(mins[i] ?? i);
        var cls = LULC_BAND_MAP[bandVal];
        if (!cls) continue;
        if (!dist[cls.id]) dist[cls.id] = { name: cls.name, color: cls.color, count: 0, pct: 0 };
        dist[cls.id].count += counts[i];
        dist[cls.id].pct += (counts[i] / totalPixels) * 100;
      }
      var classes = Object.values(dist).sort(function (a, b) { return b.pct - a.pct; });
      var vegPct = classes.filter(function (c) { return [2, 3, 4].indexOf(c.id) !== -1; }).reduce(function (s, c) { return s + c.pct; }, 0);
      var builtPct = (dist[5] || {}).pct || 0;
      return { classes: classes, totalPixels: totalPixels, vegPct: vegPct, builtPct: builtPct };
    } catch (e) {
      clearTimeout(timeout);
      return null;
    }
  }

  var GEOPANGAN_KEY_COMMODITIES = [
    { id: 'com_1', name: 'Beras Kualitas Bawah I', satuan: 'kg', cat: 'Beras' },
    { id: 'com_2', name: 'Beras Kualitas Bawah II', satuan: 'kg', cat: 'Beras' },
    { id: 'com_3', name: 'Beras Kualitas Medium I', satuan: 'kg', cat: 'Beras' },
    { id: 'com_4', name: 'Beras Kualitas Medium II', satuan: 'kg', cat: 'Beras' },
    { id: 'com_5', name: 'Beras Kualitas Super I', satuan: 'kg', cat: 'Beras' },
    { id: 'com_6', name: 'Beras Kualitas Super II', satuan: 'kg', cat: 'Beras' },
    { id: 'com_7', name: 'Daging Ayam Ras Segar', satuan: 'kg', cat: 'Daging Ayam' },
    { id: 'com_8', name: 'Daging Sapi Kualitas 1', satuan: 'kg', cat: 'Daging Sapi' },
    { id: 'com_9', name: 'Daging Sapi Kualitas 2', satuan: 'kg', cat: 'Daging Sapi' },
    { id: 'com_10', name: 'Telur Ayam Ras Segar', satuan: 'kg', cat: 'Telur Ayam' },
    { id: 'com_11', name: 'Bawang Merah Ukuran Sedang', satuan: 'kg', cat: 'Bawang Merah' },
    { id: 'com_12', name: 'Bawang Putih Ukuran Sedang', satuan: 'kg', cat: 'Bawang Putih' },
    { id: 'com_13', name: 'Cabai Merah Besar', satuan: 'kg', cat: 'Cabai Merah' },
    { id: 'com_14', name: 'Cabai Merah Keriting', satuan: 'kg', cat: 'Cabai Merah' },
    { id: 'com_15', name: 'Cabai Rawit Hijau', satuan: 'kg', cat: 'Cabai Rawit' },
    { id: 'com_16', name: 'Cabai Rawit Merah', satuan: 'kg', cat: 'Cabai Rawit' },
    { id: 'com_17', name: 'Minyak Goreng Curah', satuan: 'kg', cat: 'Minyak Goreng' },
    { id: 'com_18', name: 'Minyak Goreng Kemasan Bermerk 1', satuan: 'kg', cat: 'Minyak Goreng' },
    { id: 'com_19', name: 'Minyak Goreng Kemasan Bermerk 2', satuan: 'kg', cat: 'Minyak Goreng' },
    { id: 'com_20', name: 'Gula Pasir Kualitas Premium', satuan: 'kg', cat: 'Gula Pasir' },
    { id: 'com_21', name: 'Gula Pasir Lokal', satuan: 'kg', cat: 'Gula Pasir' }
  ];
  var GEOPANGAN_PROXY = [
    function (u) { return 'https://api.cors.lol/?url=' + encodeURIComponent(u); },
    function (u) { return 'https://proxy.killcors.com/?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }
  ];
  var GEOPANGAN_PROV_MAP = {
    '11': 1, '12': 2, '13': 3, '14': 4, '15': 6, '16': 8, '17': 7, '18': 10,
    '19': 9, '21': 5, '31': 13, '32': 12, '33': 14, '34': 15, '35': 16, '36': 11,
    '51': 17, '52': 18, '53': 19, '61': 20, '62': 22, '63': 21, '64': 23, '65': 24,
    '71': 25, '72': 26, '73': 27, '74': 29, '75': 28, '76': 30, '81': 31, '82': 32,
    '91': 33, '92': 37, '93': 38, '94': 35, '95': 39, '96': 36, '97': 40, '99': 34
  };

  async function fetchGeopanganData(kode) {
    if (!kode) return null;
    var provCode = kode.split('.')[0];
    var provId = GEOPANGAN_PROV_MAP[provCode];
    if (!provId) return null;

    var now = new Date();
    var end = now.toISOString().slice(0, 10);
    var start = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);

    async function fetchWithFallback(url) {
      try {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, 8000);
        var r = await fetch(url, { signal: c.signal });
        clearTimeout(t);
        if (r.ok) return await r.json();
      } catch (e) {}
      for (var i = 0; i < GEOPANGAN_PROXY.length; i++) {
        try {
          var c2 = new AbortController();
          var t2 = setTimeout(function () { c2.abort(); }, 8000);
          var r2 = await fetch(GEOPANGAN_PROXY[i](url), { cache: 'no-store', signal: c2.signal });
          clearTimeout(t2);
          if (r2.ok) return await r2.json();
        } catch (e) {}
      }
      return null;
    }

    var results = [];
    for (var ci = 0; ci < GEOPANGAN_KEY_COMMODITIES.length; ci++) {
      var com = GEOPANGAN_KEY_COMMODITIES[ci];
      var params = new URLSearchParams({
        price_type_id: '1', comcat_id: com.id, province_id: String(provId),
        regency_id: '', showKota: 'false', showPasar: 'false', tipe_laporan: '1',
        start_date: start, end_date: end
      });
      try {
        var json = await fetchWithFallback('https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataKomoditas?' + params);
        if (json && json.data && json.data.length) {
          var rows = json.data.filter(function (r) { return r.level === 1; });
          if (rows.length) {
            var latestVal = null;
            var firstDate = null;
            var prevVal = null;
            var dateCols = Object.keys(rows[0]).filter(function (k) { return /\d{2}\/\d{2}\/\d{4}/.test(k); }).sort(function (a, b) {
              var pa = a.split('/'), pb = b.split('/');
              return new Date(pa[2], pa[1] - 1, pa[0]) - new Date(pb[2], pb[1] - 1, pb[0]);
            });
            for (var di = 0; di < rows.length; di++) {
              var r = rows[di];
              for (var dj = dateCols.length - 1; dj >= 0; dj--) {
                var v = parseFloat(String(r[dateCols[dj]] || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
                if (!isNaN(v) && v > 0) { latestVal = v; firstDate = dateCols[dj]; break; }
              }
              if (dj > 0) {
                var pv = parseFloat(String(r[dateCols[dj - 1]] || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
                if (!isNaN(pv) && pv > 0) prevVal = pv;
              }
              break;
            }
            if (latestVal !== null) {
              var trend = '';
              if (prevVal !== null && prevVal > 0) {
                var chg = ((latestVal - prevVal) / prevVal * 100).toFixed(1);
                trend = parseFloat(chg) > 0 ? ' +_chg_' + chg + '%' : parseFloat(chg) < 0 ? ' _chg_' + chg + '%' : '';
              }
              results.push({ name: com.name, price: latestVal, satuan: com.satuan, trend: trend, date: firstDate, cat: com.cat });
            }
          }
        }
      } catch (e) {}
    }
    return results.length ? results : null;
  }

  async function fetchFsvaData(kode) {
    if (!kode) return null;
    var kabCode = String(kode).split('.').slice(0, 2).join('.');
    var fsvaWmsUrl = 'https://geoportal.badanpangan.go.id/geoserver/palapa/wms';
    var props = 'WADMPR,WADMKK,KDPKAB,RANK,NCPR,P_NCPR,ENERGI,P_ENERG,PROHE,P_PROHE,CBPD,P_CBPD,MISKIN,P_MISKIN,CVHARGA,P_CVHARGA,POU,P_POU,RLSP,P_RLSP,TNPAIR,P_TNPAIR,AMANPANGN,P_AMANPANG,PPH,P_PPH,STUNTING,P_STUNTING';
    var wfsUrl = fsvaWmsUrl.replace('/wms', '/wfs') + '?service=WFS&version=2.0.0&request=GetFeature&typeName=palapa:FSVA_2025&CQL_FILTER=KDPKAB=%27' + encodeURIComponent(kabCode) + '%27&outputFormat=application/json&count=1&propertyName=' + props;

    async function tryFetch(url) {
      var c = new AbortController();
      var t = setTimeout(function () { c.abort(); }, 10000);
      var r = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    var json = null;
    try {
      json = await tryFetch(wfsUrl);
    } catch (e) {
      for (var i = 0; i < GEOPANGAN_PROXY.length; i++) {
        try {
          json = await tryFetch(GEOPANGAN_PROXY[i](wfsUrl));
          break;
        } catch (e2) {}
      }
    }

    if (!json || !json.features || !json.features.length) return null;
    return json.features[0].properties || null;
  }

  var _cctvCache = null;
  async function findNearestCctv(centerLat, centerLng, limit) {
    if (!_cctvCache) {
      try {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, 10000);
        var res = await fetch('assets/data/cctv_updated.geojson', { signal: c.signal });
        clearTimeout(t);
        if (!res.ok) return [];
        var gj = await res.json();
        _cctvCache = (gj.features || []).map(function (f) {
          var p = f.properties || {};
          var g = f.geometry || {};
          return { id: String(p.id || ''), name: p.name || 'CCTV', area: p.area || '-', lon: Number(g.coordinates && g.coordinates[0]), lat: Number(g.coordinates && g.coordinates[1]) };
        }).filter(function (i) { return isFinite(i.lat) && isFinite(i.lon); });
      } catch (e) { return []; }
    }
    var items = _cctvCache.map(function (i) {
      return { id: i.id, name: i.name, area: i.area, dist: geoidDistanceKm(centerLat, centerLng, i.lat, i.lon) };
    });
    items.sort(function (a, b) { return a.dist - b.dist; });
    return items.slice(0, limit || 5);
  }

  async function formatRegionAnswer(text) {
    var regionQuery = parseRegionFromText(text);
    if (!regionQuery || /^(region|wilayah|area|daerah|pulau|provinsi|kabupaten|kota|kecamatan|desa|kelurahan)$/.test(regionQuery)) {
      return '**Cari Wilayah**\n\nKetik nama wilayah untuk melihat profil lengkapnya.\n\n' +
        '**Contoh:**\n' +
        '- "Jawa Timur"\n' +
        '- "Kota Bandung"\n' +
        '- "Kabupaten Sleman"\n' +
        '- "Kecamatan Coblong"\n' +
        '- "Desa Sukamaju"\n\n' +
        'Gunakan prefix **Provinsi**, **Kabupaten**, **Kota**, **Kecamatan**, atau **Desa** untuk hasil lebih akurat.\n\n' +
        '_Data yang ditampilkan: luas wilayah, penduduk, lahan sawah, topografi, hotspot, gempa, dan gunung api terdekat._';
    }
    var match = searchRegionByName(regionQuery);
    if (!match) return 'Wilayah **"' + regionQuery + '"** tidak ditemukan. Coba nama provinsi, kabupaten, kota, kecamatan, atau desa yang lebih lengkap.\n\n_Contoh: "Jawa Timur", "Kota Bandung", "Kecamatan Coblong", "Desa Sukamaju"_.';
    if (match.ambiguous) {
      var opts = match.options.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n');
      return '**"' + match.name + '"** ditemukan di beberapa tingkat:\n\n' + opts + '\n\nKetik salah satu secara lengkap, contoh: **"' + match.options[0].split(': ')[1] + '"**.';
    }

    if (typeof window.resetAllLayers === 'function') {
      try { window.resetAllLayers(); } catch (e) { console.warn('[AI] resetAllLayers error:', e); }
    }
    if (typeof showGeoidBoundary === 'function') {
      try { await showGeoidBoundary(match.kode); } catch (e) { console.warn('[AI] showGeoidBoundary error:', e); }
    }

    var levelLabel = { provinsi: 'Provinsi', kabkot: 'Kabupaten/Kota', kecamatan: 'Kecamatan', desa: 'Desa/Kelurahan' };
    var s = '**Profil Wilayah: ' + match.name + '**\n';
    s += (levelLabel[match.type] || match.type) + ' | Kode: ' + match.kode + '\n';
    var hierarchy = [];
    if (match.type === 'desa') {
      if (match.kecamatan) hierarchy.push('Kec. ' + match.kecamatan);
      if (match.kabkot) hierarchy.push(match.kabkot);
      if (match.provinsi) hierarchy.push(match.provinsi);
    } else if (match.type === 'kecamatan') {
      if (match.kabkot) hierarchy.push(match.kabkot);
      if (match.provinsi) hierarchy.push(match.provinsi);
    } else if (match.type === 'kabkot') {
      if (match.provinsi) hierarchy.push(match.provinsi);
    }
    if (hierarchy.length) s += hierarchy.join(' > ') + '\n';
    s += '\n';

    var boundary = null;
    try { boundary = await fetchRegionBoundaryData(match.kode); } catch (e) {}

    if (boundary && boundary.luasHa > 0) {
      var luasKm2 = (boundary.luasHa / 100).toFixed(1);
      s += '**Luas Wilayah:** ' + fmt(Math.round(boundary.luasHa)) + ' ha (' + luasKm2 + ' km²)\n\n';
    }

    var popData = null;
    try { if (typeof window.getDukcapilPopulation === 'function') popData = await window.getDukcapilPopulation(match.kode); } catch (e) {}
    if (popData && popData.pp > 0) {
      var malePct = Math.round((popData.pd / popData.pp) * 100);
      var density = popData.lw > 0 ? Math.round(popData.pp / popData.lw) : 0;
      s += '**Data Penduduk (DKB 2024):**\n';
      s += '- Total: **' + fmt(popData.pp) + '** jiwa\n';
      s += '- Laki-laki: **' + fmt(popData.pd) + '** (' + malePct + '%) | Perempuan: **' + fmt(popData.wn) + '** (' + (100 - malePct) + '%)\n';
      s += '- KK: **' + fmt(popData.kk) + '** | Kepadatan: **' + (density ? fmt(density) + '/km²' : '-') + '**\n';
      s += '- Desa/Kelurahan: **' + fmt(popData.records) + '**\n\n';
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

    var ptData = null;
    try { ptData = await fetchPenggunaanTanah(match.kode, bbox); } catch (e) {}
    if (ptData && ptData.types.length) {
      s += '**Penggunaan Tanah 10K:**\n';
      s += '- Total polygon: **' + fmt(ptData.totalPolygons) + '** | Luas total: **' + ptData.totalHa.toFixed(2) + ' ha**\n';
      ptData.types.slice(0, 5).forEach(function (t) {
        var pct = ptData.totalHa > 0 ? ((t.ha / ptData.totalHa) * 100).toFixed(1) : '0';
        s += '- ' + t.name + ': **' + t.ha.toFixed(2) + ' ha** (' + pct + '%, ' + t.count + ' polygon)\n';
      });
      if (ptData.types.length > 5) s += '- _...dan ' + (ptData.types.length - 5) + ' jenis lainnya_\n';
      s += '\n';
    }

    if (centerLat != null && centerLng != null) {
      if (!bbox) bbox = computeBboxFromCenter(centerLat, centerLng, 0.5);

      if (typeof fetchPropertiHarga === 'function') {
        var properti = null;
        try {
          var propertiPromise = fetchPropertiHarga(centerLat, centerLng);
          var propertiTimeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 10000); });
          properti = await Promise.race([propertiPromise, propertiTimeout]);
        } catch (e) {}
        if (properti && (properti.rumah.count > 0 || properti.ruko.count > 0)) {
          var formatRp = function (val) {
            if (!val || val <= 0) return '-';
            if (val >= 1000000000) return 'Rp ' + (val / 1000000000).toFixed(1) + ' M';
            if (val >= 1000000) return 'Rp ' + (val / 1000000).toFixed(1) + ' jt';
            return 'Rp ' + fmt(val);
          };
          s += '**Harga Properti (Rupabumi):**\n';
          if (properti.rumah.count > 0) s += '- Rumah: **' + formatRp(properti.rumah.avg) + '** (rerata dari ' + properti.rumah.count + ' listing)\n';
          if (properti.ruko.count > 0) s += '- Ruko: **' + formatRp(properti.ruko.avg) + '** (rerata dari ' + properti.ruko.count + ' listing)\n';
          s += '\n';
        }
      }

      var now = new Date();
      var dd = String(now.getDate()).padStart(2, '0');
      var mm = String(now.getMonth() + 1).padStart(2, '0');
      var yyyy = now.getFullYear();
      var sholatUrl = 'https://api.aladhan.com/v1/timings/' + dd + '-' + mm + '-' + yyyy + '?latitude=' + centerLat + '&longitude=' + centerLng + '&method=20';
      var sholatData = null;
      try {
        var sholatPromise = fetch(sholatUrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
        var sholatTimeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); });
        sholatData = await Promise.race([sholatPromise, sholatTimeout]);
      } catch (e) {}
      if (sholatData && sholatData.data && sholatData.data.timings) {
        var t = sholatData.data.timings;
        var tgl = sholatData.data.date && sholatData.data.date.readable ? sholatData.data.date.readable : dd + '/' + mm + '/' + yyyy;
        s += '**Waktu Sholat (' + tgl + '):**\n';
        s += '- Imsak: **' + (t.Imsak || '-') + '**\n';
        s += '- Subuh: **' + (t.Fajr || '-') + '**\n';
        s += '- Terbit: **' + (t.Sunrise || '-') + '**\n';
        s += '- Dhuha: **' + (t.Dhuha || '-') + '**\n';
        s += '- Dzuhur: **' + (t.Dhuhr || '-') + '**\n';
        s += '- Ashar: **' + (t.Asr || '-') + '**\n';
        s += '- Maghrib: **' + (t.Maghrib || '-') + '**\n';
        s += '- Isya: **' + (t.Isha || '-') + '**\n\n';
      }

      var hs = countHotspotsInBbox(bbox);
      if (hs) {
        s += '**Hotspot Karhutla (24 Jam):**\n';
        s += '- Total: **' + fmt(hs.total) + '** titik\n';
        if (hs.high > 0) s += '- High: **' + fmt(hs.high) + '**\n';
        if (hs.medium > 0) s += '- Medium: **' + fmt(hs.medium) + '**\n';
        if (hs.low > 0) s += '- Low: **' + fmt(hs.low) + '**\n';
        s += '\n';
      }

      if (match.type !== 'provinsi') {
        var quakes = await findNearestQuakes(centerLat, centerLng, 3);
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
    }

    var topoLevel = match.type === 'provinsi' ? 'provinsi' : 'kabupaten';
    var topoResult = null;
    try { if (typeof window.runDemAnalysis === 'function') topoResult = await window.runDemAnalysis(match.kode, topoLevel, null, { skipOverlay: true }); } catch (e) {}
    if (topoResult && topoResult.elevMin !== undefined) {
      var floodKm2 = topoResult.floodAreaHa > 0 ? (topoResult.floodAreaHa / 100).toFixed(1) : null;
      var erosionKm2 = topoResult.erosionAreaHa > 0 ? (topoResult.erosionAreaHa / 100).toFixed(1) : null;
      s += '**Topografi (DEM):**\n';
      s += '- Elevasi: **' + Math.round(topoResult.elevMin) + '–' + Math.round(topoResult.elevMax) + ' m** (rerata ' + Math.round(topoResult.elevAvg) + ' m)\n';
      s += '- Kemiringan: rerata **' + topoResult.slopeAvg.toFixed(1) + '°** | maks **' + topoResult.slopeMax.toFixed(1) + '°**\n';
      s += '- Terrain: datar **' + topoResult.flatPct.toFixed(1) + '%** | curam **' + topoResult.steepPct.toFixed(1) + '%** | aspek dominan **' + topoResult.dominantAspect + '**\n';
      if (floodKm2 && parseFloat(floodKm2) > 0) s += '- Potensi banjir: **' + floodKm2 + ' km²**\n';
      if (erosionKm2 && parseFloat(erosionKm2) > 0) s += '- Potensi erosi: **' + erosionKm2 + ' km²**\n';
      s += '\n';
    }

    if (boundary && boundary.path) {
      var lulc = null;
      try { lulc = await fetchLulcData(boundary); } catch (e) {}
      if (lulc && lulc.classes.length) {
        s += '**Land Cover (Sentinel-2 10m):**\n';
        lulc.classes.slice(0, 6).forEach(function (c) {
          s += '- ' + c.name + ': **' + c.pct.toFixed(1) + '%**\n';
        });
        s += '- Vegetasi total: **' + lulc.vegPct.toFixed(1) + '%** | Terbangun: **' + lulc.builtPct.toFixed(1) + '%**\n\n';
      }

      if (typeof window.fetchNdviStatistics === 'function') {
        var ndviRings = boundary.path.map(function (ring) {
          var coords = ring[0] || ring;
          return coords.map(function (p) { return [p[1], p[0]]; });
        });
        var ndviStats = null;
        try { ndviStats = await window.fetchNdviStatistics(ndviRings); } catch (e) { console.warn('[AI] NDVI error:', e); }
        if (ndviStats && Number.isFinite(ndviStats.mean)) {
          var ndviMean = ndviStats.mean;
          var ndviLabel, ndviColor;
          if (ndviMean >= 0.6) { ndviLabel = 'Sangat Tinggi'; ndviColor = '#176b34'; }
          else if (ndviMean >= 0.4) { ndviLabel = 'Tinggi'; ndviColor = '#3f9c49'; }
          else if (ndviMean >= 0.2) { ndviLabel = 'Sedang'; ndviColor = '#a8b93b'; }
          else { ndviLabel = 'Sangat Rendah'; ndviColor = '#c62828'; }
          s += '**NDVI (Sentinel-2):**\n';
          s += '- Rata-rata: **' + ndviMean.toFixed(3) + '** — ' + ndviLabel + '\n';
          s += '- Min: **' + Number(ndviStats.min).toFixed(2) + '** | Maks: **' + Number(ndviStats.max).toFixed(2) + '**\n';
          s += '- Sampel: **' + fmt(Number(ndviStats.count || 0)) + '** piksel valid\n\n';
        }
      }
    }

    if (match.type === 'provinsi') {
      var gpData = null;
      try { gpData = await fetchGeopanganData(match.kode); } catch (e) {}
      if (gpData && gpData.length) {
        s += '**Harga Pangan (PIHPS BI):**\n';
        var grouped = {};
        var catOrder = [];
        gpData.forEach(function (item) {
          var cat = item.cat || 'Lainnya';
          if (!grouped[cat]) { grouped[cat] = []; catOrder.push(cat); }
          grouped[cat].push(item);
        });
        catOrder.forEach(function (cat) {
          s += '- **' + cat + ':**\n';
          grouped[cat].forEach(function (item) {
            var priceStr = 'Rp ' + Math.round(item.price).toLocaleString('id-ID') + '/' + item.satuan;
            s += '  - ' + item.name + ': **' + priceStr + '**';
            if (item.trend) {
              var trendStr = item.trend.replace('_chg_', '').replace('+', ' ↗ ').replace('-', ' ↘ ');
              s += trendStr;
            }
            s += '\n';
          });
        });
        s += '\n';
      }
    }

    if (match.type === 'kabkot') {
      var fsvaProps = null;
      try { fsvaProps = await fetchFsvaData(match.kode); } catch (e) {}
      if (fsvaProps && fsvaProps.RANK) {
        var rankLabel = function (r) {
          r = Number(r);
          if (r <= 5) return 'Sangat Baik';
          if (r <= 10) return 'Baik';
          if (r <= 20) return 'Sedang';
          return 'Rentan';
        };
        var rankColor = function (r) {
          r = Number(r);
          if (r <= 5) return '#16a34a';
          if (r <= 10) return '#65a30d';
          if (r <= 20) return '#ca8a04';
          return '#dc2626';
        };
        s += '**FSVA 2025 (Ketahanan & Kerentanan Pangan):**\n';
        s += '- Peringkat Nasional: **#' + fsvaProps.RANK + ' dari 514 kab/kota**\n\n';
        var fsvaIndicators = [
          ['Penduduk Miskin', fsvaProps.NCPR, fsvaProps.P_NCPR, '%'],
          ['Ketersediaan Energi', fsvaProps.ENERGI, fsvaProps.P_ENERG, '%'],
          ['Protein Hewani', fsvaProps.PROHE, fsvaProps.P_PROHE, '%'],
          ['Konsumsi Beras', fsvaProps.CBPD, fsvaProps.P_CBPD, '%'],
          ['Kemiskinan', fsvaProps.MISKIN, fsvaProps.P_MISKIN, '%'],
          ['Harga & Ketersediaan Pangan', fsvaProps.CVHARGA, fsvaProps.P_CVHARGA, ''],
          ['Pelayanan Air Minum', fsvaProps.POU, fsvaProps.P_POU, '%'],
          ['Rasio Lahan Sawah', fsvaProps.RLSP, fsvaProps.P_RLSP, '%'],
          ['Tanaman Pangan', fsvaProps.TNPAIR, fsvaProps.P_TNPAIR, '%'],
          ['Indeks Ketahanan Pangan', fsvaProps.AMANPANGN, fsvaProps.P_AMANPANG, '%'],
          ['Pencemaran Habitat', fsvaProps.PPH, fsvaProps.P_PPH, '%'],
          ['Prevalensi Stunting', fsvaProps.STUNTING, fsvaProps.P_STUNTING, '%']
        ];
        fsvaIndicators.forEach(function (ind) {
          var label = ind[0], val = ind[1], rank = ind[2], unit = ind[3];
          if (val == null) return;
          var rl = rankLabel(rank);
          s += '- ' + label + ': **' + parseFloat(val).toFixed(1) + unit + '** (' + rl + ', #' + rank + ')\n';
        });
        s += '\n';
      }
    }

    if (centerLat != null && centerLng != null && match.type !== 'provinsi') {
      var cctvs = await findNearestCctv(centerLat, centerLng, 5);
      if (cctvs.length) {
        s += '**CCTV Terdekat:**\n';
        cctvs.forEach(function (cam, i) {
          s += (i + 1) + '. ' + cam.name + ' (' + cam.area + ') — **' + fmt(Math.round(cam.dist)) + ' km**\n';
        });
        s += '\n';
      }
    }

    var WEATHER_DESC = {
      0: 'Cerah', 1: 'Sebagian Besar Cerah', 2: 'Berawan Sebagian', 3: 'Berawan',
      45: 'Kabut', 48: 'Kabut Beku',
      51: 'Gerimis Ringan', 53: 'Gerimis', 55: 'Gerimis Lebat',
      56: 'Gerimis Beku Ringan', 57: 'Gerimis Beku Lebat',
      61: 'Hujan Ringan', 63: 'Hujan', 65: 'Hujan Lebat',
      66: 'Hujan Beku Ringan', 67: 'Hujan Beku Lebat',
      71: 'Salju Ringan', 73: 'Salju', 75: 'Salju Lebat',
      77: 'Butiran Salju',
      80: 'Hujan Petir Ringan', 81: 'Hujan Petir', 82: 'Hujan Petir Lebat',
      85: 'Hujan Salju Ringan', 86: 'Hujan Salju Lebat',
      95: 'Badai Petir', 96: 'Badai Petir + Hujan Es Ringan', 99: 'Badai Petir + Hujan Es Lebat'
    };
    var WMO_TO_UV = function (cloud) { return cloud < 20 ? 8 : cloud < 50 ? 6 : cloud < 70 ? 4 : 2; };

    if (centerLat != null && centerLng != null) {
      var weatherData = null;
      try {
        var wUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + centerLat + '&longitude=' + centerLng +
          '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation' +
          '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,uv_index_max&timezone=Asia%2FBangkok&forecast_days=3';
        var wRes = await fetch(wUrl);
        if (wRes.ok) weatherData = await wRes.json();
      } catch (e) {}
      if (weatherData && weatherData.current) {
        var c = weatherData.current;
        var desc = WEATHER_DESC[c.weather_code] || 'Tidak diketahui';
        s += '**Cuaca Hari Ini:**\n';
        s += '- Kondisi: **' + desc + '**\n';
        s += '- Suhu: **' + c.temperature_2m + '°C** (Terasa: ' + c.apparent_temperature + '°C)\n';
        s += '- Kelembapan: **' + c.relative_humidity_2m + '%** | Angin: **' + c.wind_speed_10m + ' km/j**\n';
        s += '- Curah hujan: **' + (c.precipitation || 0) + ' mm**\n';
        if (weatherData.daily) {
          var d = weatherData.daily;
          s += '- Prediksi 3 hari: ';
          for (var di = 0; di < Math.min(3, (d.time || []).length); di++) {
            var dayDesc = WEATHER_DESC[d.weather_code[di]] || '-';
            var dayLabel = di === 0 ? 'Hari ini' : di === 1 ? 'Besok' : d.time[di].slice(5);
            s += dayLabel + ' **' + Math.round(d.temperature_2m_min[di]) + '–' + Math.round(d.temperature_2m_max[di]) + '°C** ' + dayDesc;
            if (d.precipitation_sum[di] > 0) s += ' (' + d.precipitation_sum[di] + ' mm)';
            s += di < 2 ? ', ' : '';
          }
          s += '\n';
        }
        s += '\n';
      }
    }

    return s;
  }

  function formatHelpAnswer() {
    return '**Cari Wilayah**\n\n' +
      'Ketik nama wilayah untuk melihat profil lengkapnya: luas, penduduk, topografi, hotspot, gempa, gunung api.\n\n' +
      '**Contoh:**\n' +
      '- "Jawa Timur"\n' +
      '- "Kota Bandung"\n' +
      '- "Kabupaten Sleman"\n' +
      '- "Kecamatan Coblong"\n' +
      '- "Desa Sukamaju"\n\n' +
      'Gunakan prefix **Provinsi**, **Kabupaten**, **Kota**, **Kecamatan**, atau **Desa** untuk hasil lebih akurat.\n\n' +
      'Atau pilih quick action di bawah untuk analisis cepat.';
  }

  async function getAnswer(intent, text, regionMatch) {
    // Handle ambiguous region match across all intents
    if (regionMatch && regionMatch.ambiguous) {
      var opts = regionMatch.options.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n');
      return '**"' + regionMatch.name + '"** ditemukan di beberapa tingkat:\n\n' + opts + '\n\nKetik salah satu secara lengkap, contoh: **"' + regionMatch.options[0].split(': ')[1] + '"**.';
    }
    switch (intent) {
      case 'region': return await formatRegionAnswer(text);
      case 'hotspot': return await formatHotspotAnswer(text, regionMatch);
      case 'gempa': return await formatGempaAnswer(text, regionMatch);
      case 'basemap': return formatBasemapAnswer();
      case 'cuaca': return await formatCuacaAnswer(text, regionMatch);
      case 'udara': return await formatUdaraAnswer(text, regionMatch);
      case 'gunung': return await formatGunungAnswer(text, regionMatch);
      case 'hutan': return formatHutanAnswer();
      case 'geologi': return formatGeologiAnswer();
      case 'hidrologi': return formatHidrologiAnswer();
      case 'penduduk': return formatPendudukAnswer();
      case 'pangan': return formatPanganAnswer();
      case 'lahan': return await formatLahanAnswer(text, regionMatch);
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

  function showWelcomeMessage() {
    addChatMessage('ai', '**Selamat datang di Tanya Ruang!**\n\nKetik nama wilayah untuk melihat profil lengkapnya.\n\n**Contoh:**\n- "Jawa Timur"\n- "Kota Bandung"\n- "Kecamatan Coblong"\n- "Desa Sukamaju"\n\nGunakan prefix **Provinsi**, **Kabupaten**, **Kota**, **Kecamatan**, atau **Desa** untuk hasil lebih akurat.');
  }

  window._aiClearChat = function () {
    if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    chatHistory = []; localStorage.removeItem(CHAT_HISTORY_KEY); renderChat();
    showWelcomeMessage();
  };

  window._aiSendQuick = function (idx, directText) {
    if (directText) { sendMessage(directText); return; }
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
      if (regionMatch && !regionMatch.ambiguous) intent = 'region';
      if (regionMatch && regionMatch.ambiguous) {
        var opts = regionMatch.options.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n');
        typeWriteMessage('**"' + regionMatch.name + '"** ditemukan di beberapa tingkat:\n\n' + opts + '\n\nKetik salah satu secara lengkap, contoh: **"' + regionMatch.options[0].split(': ')[1] + '"**.');
        return;
      }
    }
    var regionMatch = null;
    if (intent !== 'region' && intent !== 'help' && intent !== 'basemap' && intent !== 'layers' && intent !== 'viewport' && intent !== 'summary') {
      regionMatch = searchRegionByName(text);
    }
    var needsLoading = intent === 'region' || (regionMatch && !regionMatch.ambiguous);
    if (needsLoading) showAiLoading(regionMatch ? 'Mencari data ' + regionMatch.name : 'Mencari data wilayah');
    try {
      var answer = await getAnswer(intent, text, regionMatch);
      if (needsLoading) removeAiLoading();
      typeWriteMessage(answer);
    } catch (e) {
      if (needsLoading) removeAiLoading();
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
      showWelcomeMessage();
    }
    var input = $('ais-chat-input');
    if (input && window.innerWidth > 768) { setTimeout(function () { input.focus(); }, 300); }
  }

  function closeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
    sheetOpen = false;
    sheetMinimized = false;
    sheet.classList.remove('ais-sheet-open', 'ais-sheet-minimized');
    if (typeof window.resetAllLayers === 'function') {
      try { window.resetAllLayers(); } catch (e) {}
    }
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAnalysis);
  } else {
    initAiAnalysis();
  }

})();
