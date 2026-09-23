/* ── Sistem Lahan (MVT) — inaland.big.go.id ──
   Performance: interactive off, join-based symbology, lazy gz join map.
   Legend: Land System Map — KODE L SYS (m_symlsys). */
(function () {
  'use strict';

  var MVT_URL = 'https://inaland.big.go.id/panel/mvt/sistemlahan?z={z}&x={x}&y={y}';
  var JOIN_URL_GZ = 'assets/data/sistemlahan-join.json.gz';
  var JOIN_URL = 'assets/data/sistemlahan-join.json';
  var CODES_URL = 'assets/data/sistemlahan-codes.json';

  var _layer = null;
  var _active = false;
  var _legendOn = false;
  var _joinPromise = null;
  var _codeColor = Object.create(null);
  var _codeList = [];

  var COLOR_WATER = '#a8d4f0';
  var COLOR_NODATA = '#e5e7eb';
  var COLOR_LINE = '#6b7f5a';

  /* Pastel palette — KODE L SYS style (soft map colors) */
  var PASTELS = [
    '#f8c8c8', '#f5b8b8', '#f0a8a8', '#e89898', '#f4c4a8', '#f0b890',
    '#ecc078', '#f0d090', '#f5e0a0', '#e8e8a0', '#d4e8a0', '#b8e0a0',
    '#a0d8a0', '#90d0b0', '#80c8c0', '#80c0d8', '#90c8e8', '#a0d0f0',
    '#b0c8f5', '#c0c0f0', '#d0b8e8', '#e0b0e0', '#e8a8d0', '#f0b0c8',
    '#f8d0d8', '#e0e0c8', '#c8e0d0', '#b8d8e0', '#d0d8e8', '#e0d0e8',
    '#c8e8c0', '#a8e0b8', '#90d8c0', '#88d0d8', '#98d8f0', '#b0d8f8',
    '#c8d0f8', '#d8c8f8', '#e8c0f0', '#f0c0d8', '#f8d8c8', '#f0e0b8',
    '#e0e8a8', '#c8e8a8', '#a8e0c0', '#98e0d0', '#a0e0e8', '#b8e0f0',
    '#c8d8f0', '#d8d0f0', '#e8d0f0', '#f0d0e0', '#f0e0e0', '#e8e8d8',
    '#d8e8d8', '#c8e8e0', '#c0e0e8', '#d0e0f0', '#e0e0f0', '#e8e0f0',
    '#f0e0f0', '#f0e8e0', '#f0f0e0', '#e8f0e0', '#e0f0e8', '#e0f0f0',
    '#e0f0f8', '#e8f0f8', '#f0f0f8', '#f8f0f8', '#f8f0f0', '#f8f8f0',
    '#f0f8f0', '#f0f8f8', '#f0f8e8', '#e8f8e0', '#e0f8e0', '#d8f0d8',
    '#c8f0c8', '#b8e8b8', '#a8e0a8', '#98d898', '#90d090', '#88c888',
    '#80c080', '#78b878', '#70b070', '#68a868', '#60a060', '#589858',
    '#c8b8a0', '#d8c8b0', '#e0d0c0', '#e8d8c8', '#f0e0d0', '#f0e8d8',
    '#f0ece0', '#ecece0', '#e0e8d8', '#d8e0d0', '#d0d8c8', '#c8d0c0',
    '#b8c8b8', '#a8b8a8', '#98b0a0', '#90a8a0', '#88a0a0', '#8098a0'
  ];

  var WATER_CODES = {
    'tubuh air': 1, 'water': 1, 'air': 1, 'perairan': 1
  };
  var NODATA_CODES = {
    '-': 1, 'no data': 1, 'nodata': 1, 'n/a': 1, 'lain': 1
  };

  function normalizeCode(raw) {
    if (raw == null) return '-';
    var s = String(raw).trim();
    if (!s) return '-';
    var lower = s.toLowerCase();
    if (WATER_CODES[lower]) return 'Water';
    if (NODATA_CODES[lower]) return 'NO DATA';
    return s;
  }

  function hashColor(code) {
    var h = 0;
    for (var i = 0; i < code.length; i++) {
      h = ((h << 5) - h + code.charCodeAt(i)) | 0;
    }
    return PASTELS[Math.abs(h) % PASTELS.length];
  }

  function assignPalette(codes) {
    _codeColor = Object.create(null);
    _codeColor['Water'] = COLOR_WATER;
    _codeColor['NO DATA'] = COLOR_NODATA;
    _codeColor['-'] = COLOR_NODATA;
    var three = [];
    var i;
    for (i = 0; i < codes.length; i++) {
      var c = normalizeCode(codes[i]);
      if (c === 'Water' || c === 'NO DATA' || c === '-') continue;
      if (/^[A-Z]{2,4}$/.test(c)) three.push(c);
      else _codeColor[c] = hashColor(c);
    }
    three.sort();
    for (i = 0; i < three.length; i++) {
      _codeColor[three[i]] = PASTELS[i % PASTELS.length];
    }
    _codeList = three;
  }

  function colorForCode(code) {
    var c = normalizeCode(code);
    if (_codeColor[c]) return _codeColor[c];
    _codeColor[c] = hashColor(c);
    return _codeColor[c];
  }

  var _locidToCode = null;

  function codeFromProps(props) {
    if (!props) return '-';
    if (props.m_symlsys != null && props.m_symlsys !== '') {
      return normalizeCode(props.m_symlsys);
    }
    var locid = props.locid != null ? String(props.locid) : '';
    if (!locid || !_locidToCode) return '-';
    return normalizeCode(_locidToCode[locid]);
  }

  function styleFn(geojson) {
    var code = codeFromProps(geojson && geojson.properties);
    var fill = colorForCode(code);
    return {
      color: COLOR_LINE,
      weight: 0.25,
      opacity: 0.75,
      fill: true,
      fillColor: fill,
      fillOpacity: code === 'NO DATA' ? 0.35 : 0.62
    };
  }

  function decodeGzipBuffer(buf) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('no DecompressionStream'));
    }
    var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function fetchJoinText() {
    return fetch(JOIN_URL_GZ, { credentials: 'omit' }).then(function (res) {
      if (!res.ok) throw new Error('gz ' + res.status);
      return res.arrayBuffer().then(function (buf) {
        var u8 = new Uint8Array(buf);
        if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
          return decodeGzipBuffer(buf);
        }
        return new TextDecoder().decode(u8);
      });
    }).catch(function () {
      return fetch(JOIN_URL, { credentials: 'omit' }).then(function (res) {
        if (!res.ok) throw new Error('json ' + res.status);
        return res.text();
      });
    });
  }

  function applyJoin(text) {
    var data = JSON.parse(text);
    var codes = data.codes || [];
    var packed = data.packed || '';
    var map = Object.create(null);
    var parts = packed.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var k = p.lastIndexOf(':');
      if (k < 1) continue;
      map[p.slice(0, k)] = codes[+p.slice(k + 1)] || '-';
    }
    _locidToCode = map;
    assignPalette(codes);
    return true;
  }

  function loadJoin() {
    if (_joinPromise) return _joinPromise;
    _joinPromise = fetchJoinText()
      .then(applyJoin)
      .catch(function () {
        return fetch(CODES_URL, { credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : []; })
          .catch(function () { return []; })
          .then(function (list) {
            var codes = (list || []).map(function (x) { return x.code || x; });
            assignPalette(codes);
            return false;
          });
      });
    return _joinPromise;
  }

  function getMap() {
    if (typeof window._map !== 'undefined' && window._map) return window._map;
    if (typeof map !== 'undefined' && map) return map;
    return null;
  }

  function showLegend() {
    if (_legendOn) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'wind-legend sistemlahan-legend');
    L.DomEvent.disableClickPropagation(div);

    var items = '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:' +
      COLOR_WATER + ';"></span><span>Water</span></div>';
    var i;
    for (i = 0; i < _codeList.length; i++) {
      items += '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:' +
        (_codeColor[_codeList[i]] || hashColor(_codeList[i])) + ';"></span><span>' +
        _codeList[i] + '</span></div>';
    }
    items += '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:' +
      COLOR_NODATA + ';"></span><span>NO DATA</span></div>';

    div.innerHTML =
      '<div class="wind-legend-title">Land System Map</div>' +
      '<div class="sistemlahan-legend-sub">KODE L SYS</div>' +
      '<div class="wind-legend-items sistemlahan-legend-items">' + items + '</div>' +
      '<div class="wind-legend-unit">Sumber: InaLAND (BIG)</div>';

    if (typeof createLegendWithToggle === 'function') {
      addUnifiedLegend('toggleSistemLahan', createLegendWithToggle(div));
    } else {
      addUnifiedLegend('toggleSistemLahan', div);
    }
    _legendOn = true;
  }

  function hideLegend() {
    if (!_legendOn) return;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('toggleSistemLahan');
    _legendOn = false;
  }

  function createLayer(m) {
    if (!m.getPane('sistemLahanPane')) m.createPane('sistemLahanPane');
    m.getPane('sistemLahanPane').style.zIndex = '450';
    _layer = L.vectorGrid.protobuf(MVT_URL, {
      vectorTileLayerStyles: {
        sistemlahan: styleFn
      },
      minZoom: 4,
      maxZoom: 18,
      maxNativeZoom: 12,
      interactive: false,
      pane: 'sistemLahanPane',
      updateWhenIdle: true,
      keepBuffer: 1
    });
  }

  function show() {
    var m = getMap();
    if (!m) return;
    _active = true;
    if (!_layer) createLayer(m);
    if (!m.hasLayer(_layer)) _layer.addTo(m);
    showLegend();
    loadJoin().then(function () {
      if (!_active) return;
      var mm = getMap();
      if (!mm) return;
      if (_layer) {
        if (mm.hasLayer(_layer)) mm.removeLayer(_layer);
        _layer = null;
      }
      createLayer(mm);
      mm.addLayer(_layer);
      hideLegend();
      showLegend();
    });
  }

  function hide() {
    _active = false;
    var m = getMap();
    if (m && _layer && m.hasLayer(_layer)) m.removeLayer(_layer);
    if (m && m.closePopup) m.closePopup();
    hideLegend();
  }

  function isActive() {
    return _active;
  }

  function cleanup() {
    hide();
    _layer = null;
  }

  window.toggleSistemLahan = function (visible) {
    if (visible) show(); else hide();
  };
  window.isSistemLahanActive = isActive;
  window.sistemLahanCleanup = cleanup;
})();
