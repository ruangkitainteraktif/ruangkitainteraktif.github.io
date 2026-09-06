/* ── GFS RGB Base — shared utilities for BMKG RGB tile layers ── */
(function () {
  'use strict';

  var BASE_URL = 'https://spartan.bmkg.go.id/map/rgb_req';
  var MODELRUN_API = 'https://spartan.bmkg.go.id/map/modelrun';
  var CACHE_MS = 10 * 60 * 1000;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function buildDateStr(d) {
    return '' + d.getUTCFullYear()
      + pad2(d.getUTCMonth() + 1)
      + pad2(d.getUTCDate())
      + pad2(d.getUTCHours()) + '00';
  }

  function calcForecastTime(modelRun) {
    var now = new Date();
    var utcH = now.getUTCHours();
    var base = modelRun ? new Date(modelRun) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    var forecast = new Date(base);

    if (utcH >= 12) {
      forecast.setUTCDate(forecast.getUTCDate() + 1);
      forecast.setUTCHours(3, 0, 0, 0);
    } else if (utcH >= 3) {
      forecast.setUTCHours(12, 0, 0, 0);
    } else {
      forecast.setUTCHours(3, 0, 0, 0);
    }

    if (forecast <= modelRun) {
      forecast = new Date(modelRun);
      forecast.setUTCHours(forecast.getUTCHours() + 3);
    }

    return forecast;
  }

  function calcForecastForModel(modelRun) {
    var now = new Date();
    var utcH = now.getUTCHours();
    var forecast = new Date(modelRun);
    if (utcH >= 12) { forecast.setUTCDate(forecast.getUTCDate() + 1); forecast.setUTCHours(3, 0, 0, 0); }
    else if (utcH >= 3) { forecast.setUTCHours(12, 0, 0, 0); }
    else { forecast.setUTCHours(3, 0, 0, 0); }
    if (forecast <= modelRun) { forecast = new Date(modelRun); forecast.setUTCHours(forecast.getUTCHours() + 3); }
    return forecast;
  }

  function buildCandidateList() {
    var now = new Date();
    var utcH = now.getUTCHours();
    var candidates = [];

    var today00 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    var today12 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    var yesterday12 = new Date(today00);
    yesterday12.setUTCDate(yesterday12.getUTCDate() - 1);
    yesterday12.setUTCHours(12, 0, 0, 0);
    var yesterday00 = new Date(today00);
    yesterday00.setUTCDate(yesterday00.getUTCDate() - 1);
    yesterday00.setUTCHours(0, 0, 0, 0);

    if (utcH >= 12) candidates.push(today12);
    candidates.push(today00);
    candidates.push(yesterday12);
    candidates.push(yesterday00);

    return candidates.map(function (mr) {
      return { modelRun: mr, forecast: calcForecastTime(mr) };
    });
  }

  var _modelrunCache = {};

  function fetchModelrunsFor(modelName) {
    var cached = _modelrunCache[modelName];
    if (cached && (Date.now() - cached.ts) < CACHE_MS) {
      return Promise.resolve(cached.runs);
    }
    return fetch(MODELRUN_API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var runs = [];
        if (data && data[modelName]) {
          runs = data[modelName].map(function (s) { return new Date(s); });
        }
        _modelrunCache[modelName] = { runs: runs, ts: Date.now() };
        return runs;
      })
      .catch(function () { return (cached && cached.runs) || []; });
  }

  function fetchLatestModelruns() {
    return fetchModelrunsFor('gfs_indo');
  }

  function buildCandidateListAsync() {
    return fetchLatestModelruns().then(function (modelruns) {
      var local = buildCandidateList();
      if (!modelruns || modelruns.length === 0) return local;

      var apiCandidates = modelruns.map(function (mr) {
        return { modelRun: mr, forecast: calcForecastTime(mr) };
      });

      local.forEach(function (c) {
        var dup = apiCandidates.some(function (a) {
          return a.modelRun.getTime() === c.modelRun.getTime();
        });
        if (!dup) apiCandidates.push(c);
      });

      return apiCandidates;
    });
  }

  function buildCandidateListForModel(modelName, calcForecast) {
    var fn = calcForecast || calcForecastForModel;
    return fetchModelrunsFor(modelName).then(function (modelruns) {
      if (!modelruns || modelruns.length === 0) return [];
      return modelruns.map(function (mr) {
        return { modelRun: mr, forecast: fn(mr) };
      });
    });
  }

  var _refreshTimer = null;
  var _refreshCallbacks = [];
  var _lastNotifiedRun = null;

  function startAutoRefresh(intervalMs) {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(function () {
      fetchLatestModelruns().then(function (runs) {
        if (!runs || runs.length === 0) return;
        var latest = runs[0].getTime();
        if (_lastNotifiedRun !== null && _lastNotifiedRun !== latest) {
          _lastNotifiedRun = latest;
          _refreshCallbacks.forEach(function (cb) { try { cb(runs); } catch (e) {} });
        }
        if (_lastNotifiedRun === null) _lastNotifiedRun = latest;
      });
    }, intervalMs || 10 * 60 * 1000);
  }

  function onNewModelrun(cb) { _refreshCallbacks.push(cb); }

  function probeTile(basePath, mrStr, fcStr) {
    return new Promise(function (resolve) {
      var img = new Image();
      var timeout = setTimeout(function () { img.src = ''; resolve(false); }, 5000);
      img.onload = function () { clearTimeout(timeout); resolve(true); };
      img.onerror = function () { clearTimeout(timeout); resolve(false); };
      img.src = BASE_URL + '/' + basePath + '/1000/' + mrStr + '/' + fcStr + '/5/24/16.png';
    });
  }

  function probeTileFor(basePath, layer, mrStr, fcStr) {
    return new Promise(function (resolve) {
      var img = new Image();
      var timeout = setTimeout(function () { img.src = ''; resolve(false); }, 5000);
      img.onload = function () { clearTimeout(timeout); resolve(true); };
      img.onerror = function () { clearTimeout(timeout); resolve(false); };
      img.src = BASE_URL + '/' + basePath + '/' + layer + '/1000/' + mrStr + '/' + fcStr + '/5/24/16.png';
    });
  }

  function formatInfo(modelRun, forecast) {
    var m = buildDateStr(modelRun);
    var f = buildDateStr(forecast);
    var ms = m.slice(6, 8) + ' ' + m.slice(8, 10) + 'Z ' + m.slice(4, 6) + '/' + m.slice(0, 4);
    var fs = f.slice(6, 8) + ' ' + f.slice(8, 10) + 'Z ' + f.slice(4, 6) + '/' + f.slice(0, 4);
    return ms + ' → ' + fs;
  }

  var _provinsiLoaded = false;
  var _provinsiLayer = null;

  function loadProvinsi(provinsiGeojsonUrl) {
    if (_provinsiLoaded) {
      if (_provinsiLayer) _provinsiLayer.addTo(map);
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', provinsiGeojsonUrl, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var geojson = JSON.parse(xhr.responseText);
            _provinsiLayer = L.geoJSON(geojson, {
              style: { color: '#ffffff', weight: 1.2, opacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.03 },
              interactive: false
            }).addTo(map);
            _provinsiLoaded = true;
          } catch (e) {
            console.error('[GfsBase] Gagal load provinsi GeoJSON:', e);
          }
        }
        resolve();
      };
      xhr.send();
    });
  }

  function removeProvinsi() {
    if (_provinsiLayer && map.hasLayer(_provinsiLayer)) map.removeLayer(_provinsiLayer);
  }

  var _layerMap = {};
  var _allToggleIds = ['toggleWindRgb', 'toggleRhRgb', 'toggleTp24Rgb', 'togglePm25Rgb', 'toggleHthRgb', 'toggleMaritimeAngin', 'toggleMaritimeGelombang', 'toggleMaritimeSwell', 'toggleMaritimeWindSea'];

  function registerLayer(name, hideFn) { _layerMap[name] = hideFn; }
  function deactivateOthers(except) {
    Object.keys(_layerMap).forEach(function (k) {
      if (k !== except && typeof _layerMap[k] === 'function') _layerMap[k]();
    });
    var exceptToggle = 'toggle' + except.charAt(0).toUpperCase() + except.slice(1) + 'Rgb';
    _allToggleIds.forEach(function (id) {
      if (id !== exceptToggle) {
        var cb = document.getElementById(id);
        if (cb && cb.checked) { cb.checked = false; }
      }
    });
  }

  function deactivateAll() {
    Object.keys(_layerMap).forEach(function (k) {
      if (typeof _layerMap[k] === 'function') _layerMap[k]();
    });
    _allToggleIds.forEach(function (id) {
      var cb = document.getElementById(id);
      if (cb && cb.checked) { cb.checked = false; }
    });
  }

  window.GfsBase = {
    basePath: BASE_URL + '/gfs_indo',
    buildDateStr: buildDateStr,
    buildCandidateList: buildCandidateList,
    buildCandidateListAsync: buildCandidateListAsync,
    buildCandidateListForModel: buildCandidateListForModel,
    fetchLatestModelruns: fetchLatestModelruns,
    fetchModelrunsFor: fetchModelrunsFor,
    startAutoRefresh: startAutoRefresh,
    onNewModelrun: onNewModelrun,
    probeTile: probeTile,
    probeTileFor: probeTileFor,
    formatInfo: formatInfo,
    loadProvinsi: loadProvinsi,
    removeProvinsi: removeProvinsi,
    registerLayer: registerLayer,
    deactivateOthers: deactivateOthers,
    deactivateAll: deactivateAll
  };

  document.addEventListener('DOMContentLoaded', function () {
    fetchLatestModelruns().then(function () {
      startAutoRefresh(10 * 60 * 1000);
    });
    onNewModelrun(function () {
      _allToggleIds.forEach(function (id) {
        var cb = document.getElementById(id);
        if (cb && cb.checked) cb.dispatchEvent(new Event('change'));
      });
    });
  });
})();
