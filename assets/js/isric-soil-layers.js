/* SoilGrids WMS overlays from ISRIC. */
(function () {
  'use strict';

  var BASE_URL = 'https://maps.isric.org/mapserv/';
  var DEFINITIONS = {
    wrb: { service: 'wrb', layer: 'MostProbable', label: 'WRB · Kelas tanah paling mungkin' },
    bdod: { service: 'bdod', layer: 'bdod_0-5cm_mean', label: 'Bulk density · 0–5 cm' },
    cec: { service: 'cec', layer: 'cec_0-5cm_mean', label: 'Kapasitas tukar kation (CEC) · 0–5 cm' },
    cfvo: { service: 'cfvo', layer: 'cfvo_0-5cm_mean', label: 'Fragmen kasar volumetrik · 0–5 cm' },
    clay: { service: 'clay', layer: 'clay_0-5cm_mean', label: 'Kandungan liat · 0–5 cm' },
    nitrogen: { service: 'nitrogen', layer: 'nitrogen_0-5cm_mean', label: 'Nitrogen · 0–5 cm' },
    phh2o: { service: 'phh2o', layer: 'phh2o_0-5cm_mean', label: 'pH tanah dalam H₂O · 0–5 cm' },
    sand: { service: 'sand', layer: 'sand_0-5cm_mean', label: 'Kandungan pasir · 0–5 cm' },
    silt: { service: 'silt', layer: 'silt_0-5cm_mean', label: 'Kandungan debu · 0–5 cm' },
    soc: { service: 'soc', layer: 'soc_0-5cm_mean', label: 'Karbon organik tanah · 0–5 cm' },
    ocs: { service: 'ocs', layer: 'ocs_0-30cm_mean', label: 'Stok karbon organik · 0–30 cm' },
    ocd: { service: 'ocd', layer: 'ocd_0-5cm_mean', label: 'Kerapatan karbon organik · 0–5 cm' },
    wv1500: { service: 'wv1500', layer: 'wv1500_0-5cm_mean', label: 'Kadar air volumetrik · 1500 kPa · 0–5 cm' },
    wv0033: { service: 'wv0033', layer: 'wv0033_0-5cm_mean', label: 'Kadar air volumetrik · 33 kPa · 0–5 cm' },
    wv0010: { service: 'wv0010', layer: 'wv0010_0-5cm_mean', label: 'Kadar air volumetrik · 10 kPa · 0–5 cm' }
  };
  var active = {};
  var selectedKey = null;
  var identifyMap = null;
  var identifyHandler = null;
  var identifyRequestId = 0;
  var wrbClipGeometry = null;

  function createClippedWrbLayer(map, L) {
    var GridLayer = L.GridLayer.extend({
      createTile: function (coords, done) {
        var tile = document.createElement('canvas');
        var size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        var context = tile.getContext('2d');
        var tileNW = map.unproject(L.point(coords.x * size.x, coords.y * size.y), coords.z);
        var tileSE = map.unproject(L.point((coords.x + 1) * size.x, (coords.y + 1) * size.y), coords.z);
        var nw = map.options.crs.project(tileNW);
        var se = map.options.crs.project(tileSE);
        var params = new URLSearchParams({
          SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'MostProbable',
          STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE', SRS: 'EPSG:3857',
          WIDTH: String(size.x), HEIGHT: String(size.y),
          BBOX: [nw.x, se.y, se.x, nw.y].join(',')
        });
        var image = new Image();
        image.onload = function () {
          try {
            context.save();
            context.beginPath();
            var geometry = wrbClipGeometry;
            var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
            polygons.forEach(function (polygon) {
              polygon.forEach(function (ring) {
                ring.forEach(function (point, index) {
                  var projected = map.project([point[1], point[0]], coords.z);
                  var x = projected.x - coords.x * size.x;
                  var y = projected.y - coords.y * size.y;
                  if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
                });
                context.closePath();
              });
            });
            context.clip('evenodd');
            context.drawImage(image, 0, 0, size.x, size.y);
            context.restore();
            done(null, tile);
          } catch (error) { done(error, tile); }
        };
        image.onerror = function () { done(new Error('Tile WRB gagal dimuat.'), tile); };
        image.src = BASE_URL + 'wrb?' + params.toString();
        return tile;
      }
    });
    var clipBounds = L.geoJSON(wrbClipGeometry).getBounds();
    var clipped = new GridLayer({ tileSize: 256, opacity: 0.75, bounds: clipBounds, attribution: 'SoilGrids © ISRIC' });
    clipped._isricClipped = true;
    return clipped;
  }

  function makeLayer(key, map, L) {
    if (key === 'wrb' && wrbClipGeometry) return createClippedWrbLayer(map, L);
    var definition = DEFINITIONS[key];
    return L.tileLayer.wms(BASE_URL + definition.service, {
      layers: definition.layer,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      crs: L.CRS.EPSG4326,
      opacity: 0.75,
      attribution: 'SoilGrids © ISRIC'
    });
  }

  window.setIsricSoilWrbClipGeometry = function (geometry) {
    wrbClipGeometry = geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') ? geometry : null;
    var map = window.map;
    var L = window.L;
    if (!map || !L || selectedKey !== 'wrb' || !active.wrb || !map.hasLayer(active.wrb)) return;
    map.removeLayer(active.wrb);
    active.wrb = makeLayer('wrb', map, L);
    active.wrb.addTo(map);
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatProbability(value) {
    var number = Number(value);
    if (!isFinite(number)) return escapeHtml(value);
    return (number <= 1 ? number * 100 : number).toFixed(1) + '%';
  }

  function renderClassification(data, latlng) {
    var className = data && (data.wrb_class_name || data.class_name || data.name);
    var probabilities = data && (data.wrb_class_probability || data.probabilities || data.classes);
    var html = '<div class="isric-wrb-popup"><strong>SoilGrids · Kelas WRB</strong>';
    if (className) html += '<div class="isric-wrb-main-class">Kelas paling mungkin: ' + escapeHtml(className) + '</div>';
    if (Array.isArray(probabilities) && probabilities.length) {
      html += '<table><thead><tr><th>Kelas tanah</th><th>Probabilitas</th></tr></thead><tbody>';
      probabilities.slice(0, 5).forEach(function (item, index) {
        var label = item && typeof item === 'object'
          ? (item.class_name || item.wrb_class_name || item.name || item.class || item.label || ('Kelas ' + (index + 1)))
          : (typeof item === 'string' ? item : ('Kelas ' + (index + 1)));
        var probability = item && typeof item === 'object'
          ? (item.probability != null ? item.probability : (item.probability_percent != null ? item.probability_percent : item.value))
          : (typeof item === 'number' ? item : null);
        html += '<tr><td>' + escapeHtml(label) + '</td><td>' + (probability == null ? '—' : formatProbability(probability)) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    if (!className && !Array.isArray(probabilities)) {
      html += '<div>Data kelas tanah tidak tersedia pada titik ini.</div>';
    }
    html += '<small>' + Number(latlng.lat).toFixed(5) + ', ' + Number(latlng.lng).toFixed(5) + ' · SoilGrids 250 m · ISRIC</small></div>';
    return html;
  }

  function identifyWrb(event) {
    if (selectedKey !== 'wrb' || !event || !event.latlng) return;
    var map = window.map;
    var L = window.L;
    if (!map || !L) return;
    var requestId = ++identifyRequestId;
    var popup = L.popup({ maxWidth: 340, className: 'isric-wrb-leaflet-popup' })
      .setLatLng(event.latlng)
      .setContent('<div class="isric-wrb-popup"><strong>SoilGrids · Kelas WRB</strong><div>Memuat informasi kelas tanah…</div></div>')
      .openOn(map);
    var url = new URL('https://rest.isric.org/soilgrids/v2.0/classification/query');
    url.search = new URLSearchParams({ lon: event.latlng.lng, lat: event.latlng.lat, number_classes: 5 }).toString();
    fetch(url.toString(), { headers: { Accept: 'application/json' } }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (requestId !== identifyRequestId || selectedKey !== 'wrb' || !map.hasLayer(popup)) return;
      popup.setContent(renderClassification(data, event.latlng));
    }).catch(function (error) {
      if (requestId !== identifyRequestId || selectedKey !== 'wrb') return;
      console.warn('[SoilGrids WRB] Gagal mengambil data titik:', error);
      popup.setContent('<div class="isric-wrb-popup"><strong>SoilGrids · Kelas WRB</strong><div>Informasi titik tidak dapat dimuat. Coba klik kembali beberapa saat lagi.</div><small>Data identifikasi berasal dari API SoilGrids ISRIC.</small></div>');
    });
  }

  function setWrbIdentifyEnabled(enabled) {
    var map = window.map;
    if (identifyMap && identifyHandler) identifyMap.off('click', identifyHandler);
    identifyMap = null;
    identifyHandler = null;
    identifyRequestId++;
    if (!enabled || !map) return;
    identifyMap = map;
    identifyHandler = identifyWrb;
    identifyMap.on('click', identifyHandler);
  }

  function updateLegend(key) {
    var def = DEFINITIONS[key];
    if (!def) {
      if (window.removeUnifiedLegend) window.removeUnifiedLegend('isric-soil');
      return;
    }

    var div = document.createElement('div');
    div.className = 'isric-soil-legend';
    var title = document.createElement('div');
    title.className = 'isric-soil-legend-title';
    title.textContent = def.label;
    div.appendChild(title);
    var legendUrl = new URL(BASE_URL + def.service);
    legendUrl.search = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetLegendGraphic',
      LAYER: def.layer, FORMAT: 'image/png'
    }).toString();
    var image = document.createElement('img');
    image.className = 'isric-soil-legend-image';
    image.alt = 'Legenda ' + def.label;
    image.onerror = function () { image.style.display = 'none'; };
    image.src = legendUrl.toString();
    if (def.service === 'wrb') {
      image.style.cssText = 'display:block;width:auto;max-width:100%;max-height:280px;margin:0;background:#fff;border-radius:4px';
    } else {
      image.style.cssText = 'display:block;width:auto;height:230px;max-width:100%;object-fit:contain;margin:2px 0 0;background:#fff;border-radius:4px';
    }
    div.appendChild(image);
    if (key === 'wrb') {
      var coordinateForm = document.createElement('form');
      coordinateForm.className = 'isric-wrb-coordinate-form';
      coordinateForm.innerHTML = '<label>Identifikasi berdasarkan koordinat</label><div class="isric-wrb-coordinate-fields"><input name="lat" type="number" step="any" min="-90" max="90" placeholder="Latitude" aria-label="Latitude" required><input name="lon" type="number" step="any" min="-180" max="180" placeholder="Longitude" aria-label="Longitude" required><button type="submit">Cari</button></div><small>Format desimal, contoh: -6.20, 106.82</small>';
      coordinateForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var lat = Number(coordinateForm.elements.lat.value);
        var lon = Number(coordinateForm.elements.lon.value);
        if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          if (window.showToast) window.showToast('Koordinat tidak valid. Periksa latitude dan longitude.', 'error');
          return;
        }
        var map = window.map;
        var L = window.L;
        if (!map || !L) return;
        var coordinate = L.latLng(lat, lon);
        map.setView(coordinate, Math.max(map.getZoom(), 8));
        identifyWrb({ latlng: coordinate });
      });
      div.appendChild(coordinateForm);
    }
    var source = document.createElement('small');
    source.className = 'isric-soil-legend-source';
    source.textContent = 'Sumber: SoilGrids · ISRIC';
    div.appendChild(source);
    if (window.addUnifiedLegend) {
      window.addUnifiedLegend('isric-soil', window.createLegendWithToggle ? window.createLegendWithToggle(div) : div);
    }
  }

  window.toggleIsricSoilLayer = function (id, visible) {
    var key = String(id || '').replace(/^isric-soil-/, '');
    var definition = DEFINITIONS[key];
    var map = window.map;
    var L = window.L;
    if (!definition || !map || !L) return;

    if (visible) {
      if (key !== 'wrb') wrbClipGeometry = null;
      Object.keys(active).forEach(function (otherKey) {
        if (otherKey !== key && map.hasLayer(active[otherKey])) {
          map.removeLayer(active[otherKey]);
          if (window.setLayerCatalogCheckboxState) {
            window.setLayerCatalogCheckboxState('isric-soil-' + otherKey, false);
          }
        }
      });
      if (key === 'wrb' && active[key] && active[key]._isricClipped !== !!wrbClipGeometry) {
        if (map.hasLayer(active[key])) map.removeLayer(active[key]);
        active[key] = null;
      }
      if (!active[key]) {
        active[key] = key === 'wrb' && wrbClipGeometry ? createClippedWrbLayer(map, L) : L.tileLayer.wms(BASE_URL + definition.service, {
          layers: definition.layer,
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          crs: L.CRS.EPSG4326,
          opacity: 0.75,
          attribution: 'SoilGrids © ISRIC'
        });
      }
      if (!map.hasLayer(active[key])) active[key].addTo(map);
      selectedKey = key;
      updateLegend(key);
      setWrbIdentifyEnabled(key === 'wrb');
    } else if (active[key] && map.hasLayer(active[key])) {
      map.removeLayer(active[key]);
      if (selectedKey === key) {
        selectedKey = null;
        updateLegend(null);
        setWrbIdentifyEnabled(false);
      }
    }
  };
})();
