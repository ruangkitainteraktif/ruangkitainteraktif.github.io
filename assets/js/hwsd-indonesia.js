/* HWSD v2.01 soil mapping units for Indonesia, clipped to provincial boundaries. */
(function () {
  'use strict';

  var DATA = 'assets/data/hwsd-indonesia/';
  var SOURCE = 'https://www.fao.org/land-water/resources/tools/databases/hwsd/en';
  var layer = null;
  var districtLayer = null;
  var rows = null;
  var legend = null;
  var metadata = null;
  var loadPromise = null;
  var active = false;
  var hasAutoFitted = false;
  var districtGeneration = 0;
  var identifyMap = null;
  var identifyHandler = null;
  var identifyToken = 0;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadData() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(DATA + 'units.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(DATA + 'legend.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(DATA + 'metadata.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    ]).then(function (parts) {
      rows = parts[0];
      legend = parts[1];
      metadata = parts[2];
      window.hwsdIndonesiaLegend = legend;
      var byColor = Object.create(null);
      rows.forEach(function (row) { byColor[String(row._color || '').toLowerCase()] = row; });
      window.hwsdIndonesiaRows = rows;
      window.hwsdIndonesiaByColor = byColor;
      return parts;
    }).catch(function (error) {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function createLayer() {
    if (layer || !metadata) return layer;
    var b = metadata.extent;
    layer = L.tileLayer(DATA + 'tiles/{z}/{x}/{y}.png', {
      minZoom: metadata.minZoom,
      maxZoom: metadata.maxZoom,
      maxNativeZoom: metadata.maxZoom,
      bounds: [[b[1], b[0]], [b[3], b[2]]],
      opacity: 0.86,
      attribution: '<a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">FAO HWSD v2.01</a>'
    });
    return layer;
  }

  function createDistrictLayer(geometry) {
    var map = window.map || window._map;
    var DistrictGridLayer = L.GridLayer.extend({
      createTile: function (coords, done) {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        canvas.dataset.hwsdDistrictTile = 'true';
        var ctx = canvas.getContext('2d');
        var sourceZoom = Math.max(metadata.minZoom, Math.min(coords.z, metadata.maxZoom));
        var scale = Math.pow(2, coords.z - sourceZoom);
        var sourceX = Math.floor(coords.x / scale);
        var sourceY = Math.floor(coords.y / scale);
        var image = new Image();
        image.onload = function () {
          var sourceSize = 256 / scale;
          var sourceOffsetX = (coords.x - sourceX * scale) * sourceSize;
          var sourceOffsetY = (coords.y - sourceY * scale) * sourceSize;
          ctx.drawImage(image, sourceOffsetX, sourceOffsetY, sourceSize, sourceSize, 0, 0, 256, 256);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.beginPath();
          function traceRing(ring) {
            ring.forEach(function (point, index) {
              var pixel = map.project(L.latLng(point[1], point[0]), coords.z);
              var x = pixel.x - coords.x * 256;
              var y = pixel.y - coords.y * 256;
              if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.closePath();
          }
          function tracePolygon(polygon) { polygon.forEach(traceRing); }
          if (geometry.type === 'Polygon') tracePolygon(geometry.coordinates);
          else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(tracePolygon);
          ctx.fillStyle = '#fff';
          ctx.fill('evenodd');
          done(null, canvas);
        };
        image.onerror = function (error) { done(error, canvas); };
        image.src = DATA + 'tiles/' + sourceZoom + '/' + sourceX + '/' + sourceY + '.png';
        return canvas;
      }
    });
    var b = metadata.extent;
    return new DistrictGridLayer({
      tileSize: 256,
      minZoom: metadata.minZoom,
      maxZoom: 19,
      opacity: 0.86,
      bounds: [[b[1], b[0]], [b[3], b[2]]]
    });
  }

  function showLegend() {
    if (!legend || !window.addUnifiedLegend) return;
    var box = document.createElement('div');
    box.className = 'hwsd-id-legend';
    var title = document.createElement('strong');
    title.textContent = 'HWSD v2.01 · Kelompok tanah WRB';
    box.appendChild(title);
    var list = document.createElement('div');
    list.className = 'hwsd-id-legend-list';
    legend.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'hwsd-id-legend-row';
      row.innerHTML = '<i style="background:' + esc(item.color) + '"></i><span>' + esc(item.label) + '</span>';
      list.appendChild(row);
    });
    box.appendChild(list);
    var source = document.createElement('small');
    source.textContent = 'Sumber: FAO · resolusi sekitar 1 km';
    box.appendChild(source);
    window.addUnifiedLegend('hwsd-indonesia', window.createLegendWithToggle ? window.createLegendWithToggle(box) : box);
  }

  function popup(row, latlng) {
    var props = row || {};
    var title = props['Kelas WRB'] || 'Jenis tanah HWSD';
    var html = '<div class="agol-popup tanah-popup"><div class="agol-popup-header agol-geo-tanah">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>HWSD v2.01</div>';
    html += '<div class="agol-popup-title">' + esc(title) + '</div>';
    html += '<div class="agol-popup-subtitle">Satuan peta tanah ' + esc(props.HWSD2_SMU_ID || '') + '</div></div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    [['Kode WRB', 'Kode WRB'], ['Kelompok WRB', 'Kelompok WRB'], ['FAO 1990', 'FAO 1990'],
      ['Tekstur USDA', 'Tekstur USDA'], ['Drainase', 'Drainase']].forEach(function (field) {
      if (!props[field[0]]) return;
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(field[1]) + '</span><span class="agol-popup-field-value">' + esc(props[field[0]]) + '</span></div>';
    });
    html += '</div></div><div class="agol-popup-footer"><span><a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">Sumber: FAO HWSD v2.01</a></span></div></div>';
    return html;
  }

  function identify(event) {
    if (!active || !event || !event.latlng || !window.hwsdIndonesiaByColor) return;
    var map = window.map || window._map;
    if (!map) return;
    var token = ++identifyToken;
    // Always identify against the finest packaged grid. Lower display zooms
    // generalize pixels and can hide small mapping units from the visible tile.
    var zoom = metadata.maxZoom;
    var pixel = map.project(event.latlng, zoom);
    var tileX = Math.floor(pixel.x / 256);
    var tileY = Math.floor(pixel.y / 256);
    var localX = Math.max(0, Math.min(255, Math.floor(pixel.x - tileX * 256)));
    var localY = Math.max(0, Math.min(255, Math.floor(pixel.y - tileY * 256)));
    var image = new Image();
    image.onload = function () {
      if (token !== identifyToken || !active) return;
      try {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        var rgba = ctx.getImageData(localX, localY, 1, 1).data;
        var key = '#' + [rgba[0], rgba[1], rgba[2]].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
        var row = window.hwsdIndonesiaByColor[key];
        if (row) L.popup({ maxWidth: 340, className: 'agol-leaflet-popup' }).setLatLng(event.latlng).setContent(popup(row, event.latlng)).openOn(map);
        else if (window.showToast) window.showToast('Tidak ada nilai tanah HWSD pada sel sekitar titik ini.', 'info');
      } catch (error) {
        console.warn('[HWSD Indonesia] Gagal mengidentifikasi sel:', error);
      }
    };
    image.onerror = function () { if (token === identifyToken && window.showToast) window.showToast('Tile HWSD untuk titik ini tidak tersedia.', 'info'); };
    image.src = DATA + 'tiles/' + zoom + '/' + tileX + '/' + tileY + '.png';
  }

  function setIdentify(enabled) {
    var map = window.map || window._map;
    if (identifyMap && identifyHandler) identifyMap.off('click', identifyHandler);
    identifyMap = null;
    identifyHandler = null;
    identifyToken++;
    if (!enabled || !map) return;
    identifyMap = map;
    identifyHandler = identify;
    identifyMap.on('click', identifyHandler);
  }

  window.toggleHwsdIndonesia = function (visible) {
    var map = window.map || window._map;
    if (!map || !window.L) return;
    active = !!visible;
    if (!active) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
      districtLayer = null;
      districtGeneration++;
      setIdentify(false);
      if (window.removeUnifiedLegend) window.removeUnifiedLegend('hwsd-indonesia');
      return;
    }
    loadData().then(function () {
      if (!active) return;
      if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
      districtLayer = null;
      createLayer().addTo(map);
      if (!hasAutoFitted && metadata && metadata.extent && typeof map.flyToBounds === 'function') {
        var extent = metadata.extent;
        map.flyToBounds([[extent[1], extent[0]], [extent[3], extent[2]]], {
          padding: [24, 24],
          maxZoom: 6,
          duration: 0.8
        });
        hasAutoFitted = true;
      }
      showLegend();
      setIdentify(true);
    }).catch(function (error) {
      console.error('[HWSD Indonesia] Gagal memuat layer:', error);
      if (window.showToast) window.showToast('Data HWSD Indonesia gagal dimuat. Coba lagi.', 'error');
    });
  };

  window.toggleHwsdDistrictLayer = function (geometry, visible) {
    var map = window.map || window._map;
    var run = ++districtGeneration;
    if (!map || !window.L) return Promise.resolve();
    if (!visible || !geometry) {
      active = false;
      if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
      districtLayer = null;
      setIdentify(false);
      return Promise.resolve();
    }
    active = true;
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    if (districtLayer && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
    districtLayer = null;
    if (window.removeUnifiedLegend) window.removeUnifiedLegend('hwsd-indonesia');
    return loadData().then(function () {
      if (!active || run !== districtGeneration) return;
      districtLayer = createDistrictLayer(geometry).addTo(map);
      setIdentify(true);
    }).catch(function (error) {
      if (run === districtGeneration) {
        active = false;
        console.error('[HWSD Kabupaten] Gagal memuat layer:', error);
        if (window.showToast) window.showToast('Data HWSD untuk kabupaten gagal dimuat.', 'error');
      }
      throw error;
    });
  };

  window.getHwsdIndonesiaLayer = function () { return layer; };
})();
