/* ── PMTiles layers (local files from assets/data/pmtiles/) ── */
(function () {
  'use strict';

  /* ── Shared ── */
  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* ── Label mapping for nicer popup display ── */
  var FIELD_LABELS = {
    id: 'ID', type: 'Tipe', name: 'Nama', company: 'Perusahaan',
    area_ha: 'Luas (ha)', status: 'Status', provinsi: 'Provinsi',
    kabupaten: 'Kabupaten', kecamatan: 'Kecamatan', source: 'Sumber',
    year: 'Tahun', data_year: 'Tahun Data', cat: 'Kategori',
    iucn: 'Kategori IUCN', desig: 'Designasi', desig_eng: 'Designasi (EN)',
   gis_areas: 'Luas (GIS)', metadata: 'Metadata', wdpaid: 'WDPA ID',
    iso3: 'Negara', level3: 'Provinsi (ISO)', orig_name: 'Nama Asli',
    marine: 'Marine', rep_area: 'Luas Resmi', legend: 'Legenda',
    shape_area: 'Luas Shape', shape_len: 'Panjang Shape',
    objectid: 'Object ID',luas: 'Luas', polygon_type: 'Tipe Polygon',
    layer: 'Layer', tileset: 'Tileset'
  };

  function allPropsPopup(p, badge, badgeColor) {
    var html = '<div class="agol-popup" style="min-width:240px;max-height:350px;overflow-y:auto;">';
    html += '<div class="agol-popup-header agol-geo-geologi">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + badgeColor + '"></span>' + esc(badge) + '</div>';
    var title = p.name || p.nama || p.cat || p.type || p.label || badge;
    html += '<div class="agol-popup-title">' + esc(title) + '</div>';
    html += '</div><div class="agol-popup-body"><div class="agol-popup-fields">';
    var keys = Object.keys(p);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = p[k];
      if (val === undefined || val === null || val === '' || val === '-' || String(val) === 'undefined' || String(val) === 'null') continue;
      if (typeof val === 'object') {
        try { val = JSON.stringify(val); } catch (e) { continue; }
      }
      var label = FIELD_LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(label) + '</span><span class="agol-popup-field-value">' + esc(String(val)) + '</span></div>';
    }
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: Mandum Rimba / GFW</span></div></div>';
    return html;
  }

  /* ── Colors ── */
  var CONC_COLORS = { palm_hgu: '#fb8c00', pulp_hti: '#f4511e', logging: '#ffb300', mining: '#e53935' };
  var CONC_LABELS = { palm_hgu: 'Sawit (HGU)', pulp_hti: 'Pulpwood (HTI)', logging: 'Kayu', mining: 'Tambang' };
  var PROT_COLORS = { TN: '#283593', CA: '#3949ab', SM: '#3f51b5', HL: '#5c6bc0', KK: '#7986cb', moratorium: '#9fa8da' };

  function concColor(f) { var t = f && f.props ? f.props.type : ''; return CONC_COLORS[t] || '#fb8c00'; }
  function protColor(f) { var c = f && f.props ? f.props.cat : ''; return PROT_COLORS[c] || '#3949ab'; }

  /* ── Legend control ── */
  var legendCtrl = null;

  function refreshLegend() {
    if (legendCtrl) { try { map.removeControl(legendCtrl); } catch (e) {} legendCtrl = null; }
    var entries = [];
    Object.keys(layers).forEach(function (k) {
      if (layers[k].layer && map.hasLayer(layers[k].layer) && LAYERS[k].legendItems) {
        entries = entries.concat(LAYERS[k].legendItems);
      }
    });
    if (entries.length === 0) return;
    var LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var el = L.DomUtil.create('div', 'airvisual-legend leaflet-bar');
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
        var html = '<div class="airvisual-legend-title">Legenda</div><div class="airvisual-legend-items">';
        for (var i = 0; i < entries.length; i++) {
          html += '<div class="airvisual-legend-item"><span class="airvisual-legend-swatch" style="background:' + entries[i].color + '"></span><span class="airvisual-legend-label">' + esc(entries[i].label) + '</span></div>';
        }
        html += '</div>';
        el.innerHTML = html;
        return el;
      }
    });
    legendCtrl = new LegendControl();
    legendCtrl.addTo(map);
  }

  /* ── Layer definitions ── */
  var LAYERS = {
    concessions: {
      url: 'assets/data/pmtiles/concessions.pmtiles',
      paintFn: function () {
        return [{ dataLayer: 'concessions', symbolizer: new protomapsL.PolygonSymbolizer({
          fill: function (z, f) { return concColor(f); }, fillOpacity: 0.2,
          stroke: function (z, f) { return concColor(f); }, strokeWidth: 1, strokeOpacity: 0.9
        })}];
      },
      popupColor: function (p) { return CONC_COLORS[p.type] || '#fb8c00'; },
      legendItems: [
        { color: '#fb8c00', label: 'Sawit (HGU)' },
        { color: '#f4511e', label: 'Pulpwood (HTI)' },
        { color: '#ffb300', label: 'Kayu (Logging)' },
        { color: '#e53935', label: 'Tambang (Mining)' }
      ]
    },
    protected: {
      url: 'assets/data/pmtiles/protected.pmtiles',
      paintFn: function () {
        return [{ dataLayer: 'protected', symbolizer: new protomapsL.PolygonSymbolizer({
          fill: function (z, f) { return protColor(f); }, fillOpacity: 0.2,
          stroke: function (z, f) { return protColor(f); }, strokeWidth: 1, strokeOpacity: 0.9
        })}];
      },
      popupColor: function (p) { return PROT_COLORS[p.cat] || '#3949ab'; },
      legendItems: [
        { color: '#283593', label: 'Taman Nasional' },
        { color: '#3949ab', label: 'Cagar Alam' },
        { color: '#3f51b5', label: 'Suaka Margasatwa' },
        { color: '#5c6bc0', label: 'Hutan Lindung' },
        { color: '#7986cb', label: 'Kawasan Konservasi Lain' },
        { color: '#9fa8da', label: 'Moratorium' }
      ]
    },
    mangrove: {
      url: 'assets/data/pmtiles/mangrove.pmtiles',
      paintFn: function () {
        return [{ dataLayer: 'mangrove', symbolizer: new protomapsL.PolygonSymbolizer({
          fill: '#00b0ff', fillOpacity: 0.2, stroke: '#00b0ff', strokeWidth: 1, strokeOpacity: 0.9
        })}];
      },
      popupColor: function () { return '#00b0ff'; },
      legendItems: [{ color: '#00b0ff', label: 'Mangrove' }]
    },
    peatland: {
      url: 'assets/data/pmtiles/peatland.pmtiles',
      paintFn: function () {
        return [{ dataLayer: 'peatland', symbolizer: new protomapsL.PolygonSymbolizer({
          fill: '#6d4c41', fillOpacity: 0.2, stroke: '#6d4c41', strokeWidth: 1, strokeOpacity: 0.8
        })}];
      },
      popupColor: function () { return '#6d4c41'; },
      legendItems: [{ color: '#6d4c41', label: 'Lahan Gambut' }]
    }
  };

  /* ── Layer instances ── */
  var layers = {};
  var highlightLayer = L.layerGroup().addTo(map);

  function clearHighlight() { highlightLayer.clearLayers(); }

  function highlightFeature(geom) {
    clearHighlight();
    if (!geom || geom.length === 0) return;
    for (var i = 0; i < geom.length; i++) {
      var ring = geom[i];
      if (!ring || ring.length < 3) continue;
      var latlngs = [];
      for (var j = 0; j < ring.length; j++) {
        var pt = ring[j];
        if (pt.x !== undefined && pt.y !== undefined) {
          latlngs.push(L.latLng(pt.y, pt.x));
        } else if (Array.isArray(pt) && pt.length >= 2) {
          latlngs.push(L.latLng(pt[1], pt[0]));
        }
      }
      if (latlngs.length >= 3) {
        L.polygon(latlngs, {
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillColor: '#ffffff',
          fillOpacity: 0.15,
          interactive: false
        }).addTo(highlightLayer);
      }
    }
  }

  Object.keys(LAYERS).forEach(function (key) {
    var cfg = LAYERS[key];
    layers[key] = {
      layer: null,
      show: function () {
        if (typeof protomapsL === 'undefined') { console.error('[PMTiles] protomapsL belum dimuat'); return; }
        if (this.layer) { if (!map.hasLayer(this.layer)) this.layer.addTo(map); refreshLegend(); return; }
        try {
          this.layer = protomapsL.leafletLayer({ url: cfg.url, paintRules: cfg.paintFn(), labelRules: [] });
          this.layer.addTo(map);
          refreshLegend();
        } catch (err) { console.error('[PMTiles] Gagal:', key, err); }
      },
      hide: function () {
        if (this.layer && map.hasLayer(this.layer)) map.removeLayer(this.layer);
        refreshLegend();
      },
      cleanup: function () { this.hide(); this.layer = null; }
    };
  });

  /* ── Single click handler using queryTileFeaturesDebug ── */
  map.on('click', function (e) {
    var found = false;
    var keys = Object.keys(layers);
    for (var i = 0; i < keys.length; i++) {
      var layerObj = layers[keys[i]];
      if (!layerObj.layer || !map.hasLayer(layerObj.layer)) continue;
      try {
        var results = layerObj.layer.queryTileFeaturesDebug(e.latlng.lng, e.latlng.lat);
        if (!results || results.size === 0) continue;
        var firstKey = results.keys().next().value;
        var features = results.get(firstKey);
        if (features && features.length > 0) {
          var feat = features[0];
          var featureData = feat.feature || feat;
          var props = featureData.props || featureData.properties || feat;
          if (!props) continue;
          if (featureData.geom) highlightFeature(featureData.geom);
          var color = LAYERS[keys[i]].popupColor(props);
          var badge = keys[i] === 'concessions' ? 'Konsesi' :
                      keys[i] === 'protected' ? 'Konservasi' :
                      keys[i] === 'mangrove' ? 'Mangrove' : 'Gambut';
          var html = allPropsPopup(props, badge, color);
          L.popup({ maxWidth: 340, className: 'agol-leaflet-popup' })
            .setLatLng(e.latlng).setContent(html).openOn(map);
          found = true;
          return;
        }
      } catch (err) { console.warn('[PMTiles] query error:', keys[i], err); }
    }
    if (!found) clearHighlight();
  });

  /* ── Checkbox wiring ── */
  var CB_MAP = {
    toggleConcessionsLayer: 'concessions',
    toggleProtectedLayer: 'protected',
    toggleMangroveLayer: 'mangrove',
    togglePeatlandLayer: 'peatland'
  };

  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(CB_MAP).forEach(function (cbId) {
      var cb = document.getElementById(cbId);
      var key = CB_MAP[cbId];
      if (cb) cb.addEventListener('change', function () {
        if (this.checked) layers[key].show(); else layers[key].hide();
      });
    });
  });

  /* ── Reset ── */
  window.pmtilesCleanup = function () {
    Object.keys(layers).forEach(function (k) { layers[k].cleanup(); });
    clearHighlight();
    if (legendCtrl) { try { map.removeControl(legendCtrl); } catch (e) {} legendCtrl = null; }
  };
})();
