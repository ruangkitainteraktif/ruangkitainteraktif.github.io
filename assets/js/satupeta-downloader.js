(function () {
  'use strict';

  var API_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/3/query';
  var KAB_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var DESA_URL = 'assets/data/kode_wilayah.json';
  var BOUNDARY_API = 'https://wilayah.smartartstudio.my.id/api/boundaries/';
  var PAGE_SIZE = 1000;

  var COLORS = {
    'Sawah Irigasi 2x Padi/thn': '#2ecc71',
    'Sawah Irigasi 1x Padi/thn': '#27ae60',
    'Sawah Tadah Hujan': '#1abc9c',
    '2x Padi + Palawija/thn': '#16a085',
    'Tegalan/Ladang': '#f39c12',
    'Kampung Jarang Tidak Teratur': '#e74c3c',
    'Kampung Padat Tidak Teratur': '#c0392b',
    'Semak': '#27ae60',
    'Tanah Kosong Sudah Diperuntukan': '#95a5a6',
    'Tanah Kosong Belum Diperuntukan': '#7f8c8d',
    'Perkebunan Sudah Menghasilkan': '#9b59b6',
    'Perkebunan Belum Menghasilkan': '#8e44ad',
    'Kebun Campuran': '#16a085',
    'Hutan Rakyat': '#006400',
    'Hutan Tanaman Industri': '#228b22',
    'Hutan Produksi Tetap': '#2d6a4f',
    'Pasir': '#d4a574',
    'Kolam Air Tawar': '#3498db',
    'Tambak': '#2980b9',
    'Kuburan/Pemakaman': '#7f8c8d',
    'Bangunan': '#95a5a6',
    'Jalan': '#636e72',
    'Sungai': '#0984e3',
    'Danau/Waduk': '#74b9ff',
    'Rawa': '#00cec9'
  };
  var DEFAULT_COLOR = '#3498db';

  var state = {
    level: 'desa',
    layer: null,
    visible: false,
    kabData: null,
    desaData: null,
    selectedFeature: null,
    selectedBoundary: null,
    clipped: [],
    loading: false,
    fetchAbort: null
  };

  function getColor(name) {
    if (!name) return DEFAULT_COLOR;
    if (COLORS[name]) return COLORS[name];
    var key = Object.keys(COLORS).find(function (k) {
      return k.toLowerCase() === name.toLowerCase();
    });
    return key ? COLORS[key] : DEFAULT_COLOR;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '-' : s);
    return d.innerHTML;
  }

  function formatLuas(m2) {
    if (m2 == null || isNaN(m2)) return '-';
    var ha = m2 / 10000;
    if (ha >= 1) return ha.toFixed(2) + ' ha';
    return m2.toFixed(0) + ' m\u00B2';
  }

  function formatDate(epoch) {
    if (!epoch) return '-';
    var d = new Date(epoch);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function attrToGeoJSON(feature) {
    if (!feature.geometry) return null;
    var geom = feature.geometry;
    var props = feature.attributes ? Object.assign({}, feature.attributes) : {};

    if (geom.rings) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'Polygon', coordinates: geom.rings }
      };
    }
    if (geom.paths) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'MultiLineString', coordinates: geom.paths }
      };
    }
    if (geom.points) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'MultiPoint', coordinates: geom.points }
      };
    }
    return null;
  }

  function ensureMultiPolygon(gj) {
    if (!gj || !gj.geometry) return gj;
    if (gj.geometry.type === 'MultiPolygon') return gj;
    if (gj.geometry.type === 'Polygon') {
      gj.geometry = { type: 'MultiPolygon', coordinates: [gj.geometry.coordinates] };
    }
    return gj;
  }

  /* ---- Load Kabupaten GeoJSON ---- */
  function loadKab() {
    if (state.kabData) return Promise.resolve(state.kabData);
    return fetch(KAB_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.kabData = data;
        return data;
      });
  }

  /* ---- Load Desa (kode_wilayah.json) ---- */
  function loadDesa() {
    if (state.desaData) return Promise.resolve(state.desaData);
    return fetch(DESA_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.desaData = data.filter(function (item) {
          return item.kode && item.kode.split('.').length === 4;
        });
        return state.desaData;
      });
  }

  /* ---- Fetch boundary from API ---- */
  function fetchBoundary(kode) {
    var url = BOUNDARY_API + kode;
    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, 15000);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(timeout);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.path || !data.path.length) return null;
        var rings = data.path.map(function (ring) {
          return ring.map(function (p) { return [p[1], p[0]]; });
        });
        return {
          type: 'Feature',
          properties: { name: data.nama || '' },
          geometry: { type: 'Polygon', coordinates: rings }
        };
      })
      .catch(function (e) {
        clearTimeout(timeout);
        console.warn('[Satupeta] fetchBoundary failed:', e.message);
        return null;
      });
  }

  /* ---- Fetch pages with spatial filter ---- */
  function fetchPagesWithBBox(bbox, signal) {
    var minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
    var envelopeJson = JSON.stringify({ xmin: minX, ymin: minY, xmax: maxX, ymax: maxY, spatialReference: { wkid: 4326 } });
    var offset = 0;
    var all = [];

    var info = document.getElementById('satupetaInfo');

    var loop = function () {
      var url = API_URL
        + '?where=1%3D1&outFields=*&returnGeometry=true'
        + '&geometry=' + encodeURIComponent(envelopeJson)
        + '&geometryType=esriGeometryEnvelope'
        + '&spatialRel=esriSpatialRelIntersects'
        + '&inSR=4326'
        + '&resultOffset=' + offset + '&resultRecordCount=' + PAGE_SIZE
        + '&f=json';

      if (info) {
        info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Mengambil data... (halaman ' + (Math.floor(offset / PAGE_SIZE) + 1) + ')</div>';
      }

      return fetch(url, { signal: signal })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.features) all = all.concat(data.features);
          if (info) {
            info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Mengambil data... ' + all.length + ' polygon</div>';
          }
          if (data.exceededTransferLimit && data.features && data.features.length > 0) {
            offset += PAGE_SIZE;
            return loop();
          }
          return all;
        });
    };
    return loop();
  }

  /* ---- Search ---- */
  function searchWilayah(query) {
    var container = document.getElementById('satupetaKabResults');
    if (!query || query.length < 2) {
      container.style.display = 'none';
      return;
    }
    var q = query.toUpperCase();

    if (state.level === 'kabupaten') {
      if (!state.kabData) { container.style.display = 'none'; return; }
      var results = state.kabData.features.filter(function (f) {
        var name = (f.properties.nmkab || '').toUpperCase();
        var prov = (f.properties.nmprov || '').toUpperCase();
        return name.indexOf(q) !== -1 || prov.indexOf(q) !== -1;
      }).slice(0, 10);

      if (!results.length) {
        container.innerHTML = '<div class="satupeta-kab-item satupeta-kab-empty">Tidak ditemukan</div>';
      } else {
        container.innerHTML = results.map(function (f) {
          var p = f.properties;
          var idx = state.kabData.features.indexOf(f);
          return '<div class="satupeta-kab-item" data-type="kab" data-idx="' + idx + '">'
            + '<span class="satupeta-kab-name">' + esc(p.nmkab) + '</span>'
            + '<span class="satupeta-kab-prov">' + esc(p.nmprov) + '</span>'
            + '</div>';
        }).join('');
      }
    } else {
      if (!state.desaData) { container.style.display = 'none'; return; }
      var results = state.desaData.filter(function (item) {
        return item.nama.toUpperCase().indexOf(q) !== -1;
      }).slice(0, 10);

      if (!results.length) {
        container.innerHTML = '<div class="satupeta-kab-item satupeta-kab-empty">Tidak ditemukan</div>';
      } else {
        container.innerHTML = results.map(function (item, i) {
          return '<div class="satupeta-kab-item" data-type="desa" data-kode="' + esc(item.kode) + '">'
            + '<span class="satupeta-kab-name">' + esc(item.nama) + '</span>'
            + '<span class="satupeta-kab-prov">' + esc(item.kode) + '</span>'
            + '</div>';
        }).join('');
      }
    }
    container.style.display = 'block';

    container.querySelectorAll('.satupeta-kab-item:not(.satupeta-kab-empty)').forEach(function (el) {
      el.addEventListener('click', function () {
        var type = el.getAttribute('data-type');
        var input = document.getElementById('satupetaKabSearch');
        container.style.display = 'none';
        if (type === 'kab') {
          var idx = parseInt(el.getAttribute('data-idx'), 10);
          var feat = state.kabData.features[idx];
          input.value = feat.properties.nmkab;
          selectKabupaten(feat);
        } else {
          var kode = el.getAttribute('data-kode');
          var item = state.desaData.find(function (d) { return d.kode === kode; });
          input.value = item ? item.nama : kode;
          selectDesa(kode, item ? item.nama : '');
        }
      });
    });
  }

  function hideResults() {
    var c = document.getElementById('satupetaKabResults');
    if (c) c.style.display = 'none';
  }

  function updateSelectedLabel(name, sub) {
    var sel = document.getElementById('satupetaKabSelected');
    if (sel) {
      sel.innerHTML = '<span>' + esc(name) + (sub ? ', ' + esc(sub) : '') + '</span>';
      sel.style.display = 'flex';
    }
  }

  function selectKabupaten(feature) {
    state.selectedFeature = feature;
    state.selectedBoundary = ensureMultiPolygon({
      type: 'Feature',
      properties: feature.properties,
      geometry: feature.geometry
    });
    updateSelectedLabel(feature.properties.nmkab, feature.properties.nmprov);
    fetchAndDisplay();
  }

  function selectDesa(kode, nama) {
    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Memuat batas wilayah...</div>';
    }

    fetchBoundary(kode).then(function (boundary) {
      if (!boundary) {
        if (info) info.innerHTML = 'Gagal memuat batas desa. Coba lagi.';
        return;
      }
      state.selectedFeature = { properties: { kode: kode, nama: nama }, geometry: boundary.geometry };
      state.selectedBoundary = boundary;
      updateSelectedLabel(nama, kode);
      fetchAndDisplay();
    });
  }

  function clearSelection() {
    state.selectedFeature = null;
    state.selectedBoundary = null;
    state.clipped = [];
    var sel = document.getElementById('satupetaKabSelected');
    if (sel) sel.style.display = 'none';
    var input = document.getElementById('satupetaKabSearch');
    if (input) input.value = '';
    if (state.layer && window.map) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    var info = document.getElementById('satupetaInfo');
    if (info) info.style.display = 'none';
  }

  /* ---- Main: fetch + clip + display ---- */
  function fetchAndDisplay() {
    if (!state.selectedBoundary || !window.map) return;
    if (state.loading) return;
    state.loading = true;

    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Memuat data penggunaan tanah...</div>';
    }

    if (state.layer) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    state.clipped = [];

    var ctrl = new AbortController();
    state.fetchAbort = ctrl;

    var boundaryBbox = turf.bbox(state.selectedBoundary);
    var props = state.selectedFeature.properties;

    fetchPagesWithBBox(boundaryBbox, ctrl.signal)
      .then(function (features) {
        var totalFetched = features.length;
        var clipped = [];
        var skipped = 0;
        features.forEach(function (f) {
          var gj = attrToGeoJSON(f);
          if (!gj) { skipped++; return; }

          try {
            var intersection = turf.intersect(turf.featureCollection([gj, state.selectedBoundary]));
            if (intersection && intersection.geometry) {
              var p = gj.properties || {};
              p._area_ha = (turf.area(intersection) / 10000).toFixed(2);
              clipped.push({
                type: 'Feature',
                properties: p,
                geometry: intersection.geometry
              });
            }
          } catch (e) { skipped++; }
        });

        state.clipped = clipped;
        state.loading = false;

        if (!clipped.length) {
          if (info) info.innerHTML = 'Tidak ada polygon penggunaan tanah di wilayah ini.';
          return;
        }

        var types = {};
        clipped.forEach(function (f) {
          var name = f.properties.ptnobjname || 'Lainnya';
          if (!types[name]) types[name] = 0;
          types[name]++;
        });
        var typeList = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; });
        var typeHtml = typeList.map(function (t) {
          var color = getColor(t);
          return '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 0;font-size:10px;">'
            + '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';flex-shrink:0;"></span>'
            + esc(t) + ' <strong>' + types[t] + '</strong></span>';
        }).join('');

        var areaTotal = clipped.reduce(function (s, f) { return s + parseFloat(f.properties._area_ha || 0); }, 0);
        var labelName = props.nmkab || props.nama || props.kode || '-';
        var labelSub = props.nmprov || props.kode || '';

        var detailHtml = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
          + '<div>'
          + '<div style="font-weight:700;font-size:12px;">' + esc(labelName) + (labelSub ? ', ' + esc(labelSub) : '') + '</div>'
          + '<div style="font-size:10px;color:#64748b;margin-top:2px;">'
          + 'API: <strong>' + totalFetched + '</strong> feature &middot; Di dalam wilayah: <strong>' + clipped.length + '</strong> polygon &middot; Luas: <strong>' + areaTotal.toFixed(2) + ' ha</strong>'
          + (skipped > 0 ? ' &middot; Skip: ' + skipped : '')
          + '</div>'
          + '</div>'
          + '<button class="satupeta-close-btn" onclick="SatupetaDownloader.clearSelection()" title="Tutup layer">'
          + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          + '</button></div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:6px;padding-top:6px;border-top:1px solid #f0f0f0;">' + typeHtml + '</div>';

        if (info) info.innerHTML = detailHtml;

        var layer = L.geoJSON(turf.featureCollection(clipped), {
          style: function (f) {
            var color = getColor(f.properties.ptnobjname);
            return {
              color: color,
              weight: 1.2,
              opacity: 0.9,
              fillColor: color,
              fillOpacity: 0.35
            };
          },
          onEachFeature: function (f, l) {
            l.bindPopup(buildPopup(f), { maxWidth: 320, className: 'agol-leaflet-popup' });
          }
        });
        layer.addTo(window.map);
        state.layer = layer;

        var bbox4326 = [boundaryBbox[0], boundaryBbox[1], boundaryBbox[2], boundaryBbox[3]];
        window.map.fitBounds([[bbox4326[1], bbox4326[0]], [bbox4326[3], bbox4326[2]]], { padding: [40, 40] });
      })
      .catch(function (err) {
        state.loading = false;
        if (err.name === 'AbortError') return;
        if (info) info.innerHTML = 'Gagal memuat data. Coba lagi.';
        console.error('SatupetaDownloader:', err);
      });
  }

  /* ---- Popup HTML ---- */
  function buildPopup(feature) {
    var p = feature.properties || {};
    var color = getColor(p.ptnobjname);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-satupeta">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>Penggunaan Tanah 10K</div>';
    html += '<div class="agol-popup-title">' + esc(p.ptnobjname || p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas</span><span class="agol-popup-field-value">' + formatLuas(p.ig25k_penggunaan10k_ar_area) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas (Clip)</span><span class="agol-popup-field-value">' + (p._area_ha ? p._area_ha + ' ha' : '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tanggal</span><span class="agol-popup-field-value">' + formatDate(p.ptndate) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kode</span><span class="agol-popup-field-value">' + esc(p.fcode || '-') + '</span></div>';
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: KSP SatuPeta</span></div>';
    html += '</div>';
    return html;
  }

  /* ---- Toggle panel visibility ---- */
  function toggleLayer(show) {
    state.visible = show;
    if (show) {
      loadKab();
      loadDesa();
    }
  }

  /* ---- Cleanup ---- */
  function cleanup() {
    if (state.fetchAbort) {
      state.fetchAbort.abort();
      state.fetchAbort = null;
    }
    if (state.layer && window.map) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    state.clipped = [];
    state.loading = false;
    state.selectedFeature = null;
    state.selectedBoundary = null;
  }

  /* ---- Level mode change ---- */
  function onLevelChange() {
    var sel = document.getElementById('satupetaLevelMode');
    var label = document.getElementById('satupetaLevelLabel');
    var input = document.getElementById('satupetaKabSearch');
    if (sel) state.level = sel.value;
    if (label) label.textContent = state.level === 'desa' ? 'Cari nama desa' : 'Cari nama kabupaten';
    if (input) {
      input.value = '';
      input.placeholder = state.level === 'desa' ? 'Ketik nama desa...' : 'Ketik nama kabupaten...';
    }
    clearSelection();
  }

  /* ---- Init ---- */
  function init() {
    var searchInput = document.getElementById('satupetaKabSearch');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        var q = this.value;
        debounce = setTimeout(function () { searchWilayah(q); }, 250);
      });
      searchInput.addEventListener('focus', function () {
        if (this.value.length >= 2) searchWilayah(this.value);
      });
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest('#satupetaKabSearch') && !e.target.closest('#satupetaKabResults')) {
        hideResults();
      }
    });

    var levelSel = document.getElementById('satupetaLevelMode');
    if (levelSel) {
      levelSel.addEventListener('change', onLevelChange);
    }

    loadKab();
    loadDesa();

    var origOpenGeotani = window.openGeotaniAnalysisTab;
    window.openGeotaniAnalysisTab = function (tabId) {
      if (origOpenGeotani) origOpenGeotani(tabId);
      if (tabId === 'satupeta') {
        state.visible = true;
        loadKab();
        loadDesa();
      }
    };
  }

  window.SatupetaDownloader = {
    toggleLayer: toggleLayer,
    searchWilayah: searchWilayah,
    clearSelection: clearSelection,
    cleanup: cleanup,
    run: function (kode) {
      loadKab().then(function (data) {
        var feat = data.features.find(function (f) {
          return f.properties.idkab === kode;
        });
        if (feat) selectKabupaten(feat);
      });
    }
  };

  window.isSatupetaActive = function () { return state.visible; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
