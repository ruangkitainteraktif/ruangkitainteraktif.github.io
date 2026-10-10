/* Fallback geometri batas desa untuk panggilan RBI BIG yang gagal. */
(function () {
  'use strict';

  var SOURCES = [
    'https://geoportal.pertanian.go.id/arcgis/rest/services/Hosted/Batas_Administrasi_Desa_2/FeatureServer/0/query',
    'https://gis.bnpb.go.id/server/rest/services/Basemap/Batas_Desa/MapServer/0/query'
  ];
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  function bnpbWhere(where) {
    var match = String(where || '').match(/KDEPUM\s*(=|LIKE)\s*'([0-9.]+)(%?)'/i);
    if (!match) return where;
    var digits = match[2].replace(/\D/g, '');
    if (!digits) return where;
    if (match[1].toUpperCase() === 'LIKE' || match[3] === '%') {
      var lower = Number(digits) * 10000;
      return 'KODE_DESA_ >= ' + lower + ' AND KODE_DESA_ <= ' + (lower + 9999);
    }
    return 'KODE_DESA_ = ' + Number(digits);
  }

  function normalizeBnpb(data) {
    (data.features || []).forEach(function (feature) {
      var a = feature.attributes || feature.properties || {};
      a.KDEPUM = a.KDEPUM || a.kdepum;
      if (a.KODE_DESA_ != null && a.KDEPUM == null) {
        var code = String(Math.round(Number(a.KODE_DESA_)));
        if (/^\d{10}$/.test(code)) a.KDEPUM = code.slice(0, 2) + '.' + code.slice(2, 4) + '.' + code.slice(4, 6) + '.' + code.slice(6);
      }
      a.NAMOBJ = a.NAMOBJ || a.namobj || a.NAMA_KEL || a.nama_kel;
      a.WADMKD = a.WADMKD || a.wadmkd || a.NAMA_KEL || a.nama_kel;
      a.WADMKC = a.WADMKC || a.wadmkc || a.NAMA_KEC || a.nama_kec;
      a.WADMKK = a.WADMKK || a.wadmkk || a.NAMA_KAB || a.nama_kab;
      a.WADMPR = a.WADMPR || a.wadmpr || a.NAMA_PROP || a.nama_prop;
      feature.attributes = a;
    });
    return data;
  }

  async function request(url, params, timeoutMs) {
    var target = url + '?' + params.toString();
    async function fetchJson(requestUrl) {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 9000) : null;
      try {
        var response = await fetch(requestUrl, { signal: controller ? controller.signal : undefined });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (data && data.error) throw new Error(data.error.message || 'ArcGIS REST error');
        return data;
      } finally { if (timer) clearTimeout(timer); }
    }
    try { return await fetchJson(target); }
    catch (directError) {
      try { return await fetchJson(PROXY + encodeURIComponent(target)); }
      catch (_) { throw directError; }
    }
  }

  window.fetchVillageBoundaryFallback = async function (options) {
    options = options || {};
    var params = new URLSearchParams();
    Object.keys(options).forEach(function (key) {
      if (key !== 'timeoutMs' && options[key] != null) params.set(key, String(options[key]));
    });
    if (!params.has('f')) params.set('f', 'json');
    if (!params.has('outSR')) params.set('outSR', '4326');
    if (!params.has('returnGeometry')) params.set('returnGeometry', 'true');
    if (!params.has('outFields')) params.set('outFields', '*');

    var errors = [];
    for (var i = 0; i < SOURCES.length; i++) {
      var sourceParams = new URLSearchParams(params);
      if (i === 0) {
        sourceParams.set('where', String(sourceParams.get('where') || '1=1').replace(/\bKDEPUM\b/gi, 'kdepum'));
        if (sourceParams.has('geometry')) sourceParams.set('outFields', '*');
      }
      if (i === 1) {
        sourceParams.set('where', bnpbWhere(sourceParams.get('where')) || '1=1');
        sourceParams.set('outFields', '*');
      }
      try {
        var data = await request(SOURCES[i], sourceParams, options.timeoutMs || 9000);
        normalizeBnpb(data);
        if (data && (Number(data.count) > 0 || data.features && data.features.length)) return data;
        errors.push('layanan tidak mengembalikan fitur');
      } catch (error) { errors.push(error && error.message || String(error)); }
    }
    throw new Error('Fallback batas desa gagal: ' + errors.join('; '));
  };
})();
