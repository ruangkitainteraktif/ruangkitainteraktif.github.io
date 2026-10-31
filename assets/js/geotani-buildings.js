/* GeoTani: jejak bangunan dari layanan OpenBuilding BNPB ArcGIS REST. */
(function () {
  'use strict';

  var QUERY_URL = 'https://gis.bnpb.go.id/server/rest/services/Basemap/OpenBuilding_AR/MapServer/0/query';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PAGE_SIZE = 500;
  var MAX_FEATURES = 10000;
  var REQUEST_TIMEOUT_MS = 45000;
  /* WKT .prj yang sama dengan modul GeoTani lain. Query keluar memakai
     outSR=4326, jadi koordinat SHP memang WGS 84. Catatan: bundle shp-write
     yang dimuat halaman (0.4.3) menulis .prj miliknya sendiri dan mengabaikan
     opsi `prj` -- isinya ESRI WKT untuk WGS 84, setara EPSG:4326 dan tetap
     dibaca benar oleh QGIS/ArcGIS. Opsi ini tetap dikirim supaya ikut berlaku
     bila pustakanya diperbarui ke versi yang menghormatinya. */
  var WGS84_PRJ = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
  var selectedKode = null;
  var selectedNama = null;
  var activeLayer = null;
  var inFlight = new Map();
  var cache = new Map();
  var generation = 0;

  function collectRings(value, output) {
    if (!Array.isArray(value)) return;
    if (value.length >= 4 && Array.isArray(value[0]) && typeof value[0][0] === 'number') {
      output.push(value);
      return;
    }
    value.forEach(function (item) { collectRings(item, output); });
  }

  function toLonLat(point) {
    var first = Number(point[0]);
    var second = Number(point[1]);
    // Koordinat Indonesia membedakan urutannya dengan jelas: bujur > 90°,
    // sedangkan lintang berada di antara -12° dan 7°.
    if (Math.abs(first) > 90 && Math.abs(first) <= 180) return [first, second];
    if (Math.abs(second) > 90 && Math.abs(second) <= 180) return [second, first];
    return [second, first];
  }

  function parseBoundary(data) {
    var paths = [];
    collectRings(data && data.path, paths);
    var polygons = paths.map(function (ring) {
      return [ring.map(toLonLat)];
    }).filter(function (polygon) {
      return polygon[0].every(function (point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]); });
    });
    if (!polygons.length) throw new Error('Geometri batas desa tidak ditemukan.');

    var geometry = { type: 'MultiPolygon', coordinates: polygons };
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    polygons.forEach(function (polygon) {
      polygon[0].forEach(function (point) {
        minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
        minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
      });
    });
    if (minX < 90 || maxX > 180 || minY < -12 || maxY > 8) {
      throw new Error('Koordinat batas desa tidak terbaca sebagai bujur-lintang Indonesia.');
    }
    return {
      type: 'Feature',
      properties: { nama: data.nama || '' },
      geometry: geometry,
      bbox: [minX, minY, maxX, maxY]
    };
  }

  async function parseResponse(response) {
    var text = await response.text();
    var payload;
    try { payload = JSON.parse(text); }
    catch (error) {
      var contentType = response.headers.get('content-type') || 'tipe konten tidak diketahui';
      var detail = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
      var nonJson = new Error('Endpoint BNPB mengirim respons non-JSON (HTTP ' + response.status
        + ', ' + contentType + ')' + (detail ? ': ' + detail : '.') );
      nonJson.nonJson = true;
      throw nonJson;
    }
    if (!response.ok) throw new Error('Layanan mengembalikan HTTP ' + response.status + '.');
    if (payload && payload.error) {
      var details = payload.error.details && payload.error.details.length
        ? ' ' + payload.error.details.join(' ')
        : '';
      throw new Error((payload.error.message || 'ArcGIS menolak permintaan.') + details);
    }
    return payload;
  }

  async function fetchJson(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || REQUEST_TIMEOUT_MS);
    var retryViaProxy = false;
    try {
      var response = await fetch(url, { signal: controller.signal });
      try { return await parseResponse(response); }
      catch (error) {
        if (!error.nonJson) throw error;
        retryViaProxy = true;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Permintaan data bangunan timeout.');
      if (!(error instanceof TypeError)) throw error;
      retryViaProxy = true;
    } finally {
      clearTimeout(timer);
    }
    if (!retryViaProxy) throw new Error('Permintaan data bangunan gagal.');

    var proxyController = new AbortController();
    var proxyTimer = setTimeout(function () { proxyController.abort(); }, timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      var proxyResponse = await fetch(PROXY + encodeURIComponent(url), { signal: proxyController.signal });
      return await parseResponse(proxyResponse);
    } catch (proxyError) {
      if (proxyError && proxyError.name === 'AbortError') throw new Error('Permintaan data bangunan timeout.');
      throw proxyError;
    } finally {
      clearTimeout(proxyTimer);
    }
  }

  function boundaryUrl(kode) {
    return 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(kode);
  }

  function makeQueryUrl(boundary, offset) {
    var bbox = boundary.bbox.join(',');
    var params = new URLSearchParams({
      where: '1=1',
      geometry: bbox,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'OBJECTID,FID_1,Shape_Length,Shape_Area',
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '6',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      orderByFields: 'OBJECTID ASC',
      f: 'json'
    });
    return QUERY_URL + '?' + params.toString();
  }

  function toGeoJsonFeature(feature) {
    if (!feature || !feature.geometry) return null;
    var geometry = feature.geometry;
    if (geometry.rings && geometry.rings.length) {
      return {
        type: 'Feature',
        properties: feature.attributes || {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: geometry.rings.map(function (ring) {
            return [ring.map(function (point) { return [Number(point[0]), Number(point[1])]; })];
          })
        }
      };
    }
    return feature.type === 'Feature' ? feature : null;
  }

  async function loadBuildings(kode) {
    if (cache.has(kode)) return cache.get(kode);
    if (inFlight.has(kode)) return inFlight.get(kode);

    var request = (async function () {
      var boundary = parseBoundary(await fetchJson(boundaryUrl(kode), 15000));
      var candidates = [];
      var exceededLimit = false;
      for (var offset = 0; offset < MAX_FEATURES; offset += PAGE_SIZE) {
        var payload = await fetchJson(makeQueryUrl(boundary, offset));
        var page = (payload && payload.features || []).map(toGeoJsonFeature).filter(Boolean);
        candidates = candidates.concat(page);
        if (!page.length) break;
        if (payload.exceededTransferLimit) exceededLimit = true;
        if (page.length < PAGE_SIZE) break;
      }

      if (!window.turf || typeof window.turf.booleanIntersects !== 'function') {
        throw new Error('Library geometri peta belum tersedia. Muat ulang halaman lalu coba lagi.');
      }
      var buildings = [];
      candidates.forEach(function (feature) {
        if (!feature || !feature.geometry) return;
        try {
          if (window.turf.booleanIntersects(feature, boundary)) buildings.push(feature);
        } catch (e) { /* geometri yang tidak valid dilewati */ }
      });

      var result = {
        buildings: buildings,
        truncated: exceededLimit || candidates.length >= MAX_FEATURES,
        candidateCount: candidates.length,
        boundary: boundary
      };
      cache.set(kode, result);
      return result;
    })();
    inFlight.set(kode, request);
    try { return await request; }
    finally { inFlight.delete(kode); }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function clearLayer() {
    if (activeLayer && window.map && window.map.hasLayer(activeLayer)) window.map.removeLayer(activeLayer);
    activeLayer = null;
  }

  function clear(clearSelection) {
    generation += 1;
    clearLayer();
    if (clearSelection) {
      selectedKode = null;
      selectedNama = null;
      var input = document.getElementById('geotaniBuildingVillageSearch');
      var picked = document.getElementById('geotaniBuildingVillageSelected');
      if (input) input.value = '';
      if (picked) { picked.textContent = ''; picked.hidden = true; }
    }
    var status = document.getElementById('geotani-building-status');
    var output = document.getElementById('geotani-building-output');
    if (status) { status.className = 'geotani-sls-status'; status.textContent = ''; }
    if (output) output.textContent = '';
    syncExportButton();
  }

  function daftarDesa() {
    var api = window.GeoTaniSls;
    return api && typeof api.daftarDesa === 'function' ? api.daftarDesa() : [];
  }

  function cariDesa(query) {
    var api = window.GeoTaniSls;
    return api && typeof api.cariDesa === 'function' ? api.cariDesa(query) : [];
  }

  function kodeDariPanelLain() {
    return window._selectedVillageKode || (window._lastGeotaniLocation && window._lastGeotaniLocation.kode) || null;
  }

  function setSelected(kode, nama) {
    generation += 1;
    selectedKode = kode ? String(kode) : null;
    selectedNama = selectedKode ? (nama || null) : null;
    clearLayer();
    syncExportButton();
    var picked = document.getElementById('geotaniBuildingVillageSelected');
    if (!picked) return;
    picked.textContent = selectedKode ? '✓ ' + (nama || selectedKode) + ' (' + selectedKode + ')' : '';
    picked.hidden = !selectedKode;
  }

  function setStatus(message) {
    var status = document.getElementById('geotani-building-status');
    if (status) status.textContent = message;
  }

  function draw(buildings, token) {
    clearLayer();
    if (!window.L || !window.map || !buildings.length) return false;
    var layer = window.L.geoJSON(buildings, {
      style: { color: '#2563eb', weight: 0.8, opacity: 0.9, fillColor: '#60a5fa', fillOpacity: 0.42 },
      onEachFeature: function (feature, featureLayer) {
        var props = feature.properties || {};
        var fid = props.FID_1 != null ? props.FID_1 : props.OBJECTID;
        if (fid != null) featureLayer.bindPopup('<b>Bangunan OpenBuilding</b><br>ID fitur: ' + escapeHtml(fid));
      }
    });
    if (token !== generation) return false;
    layer.addTo(window.map);
    activeLayer = layer;
    var bounds = layer.getBounds();
    if (bounds.isValid()) window.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
    return true;
  }

  async function showBuildings(kode) {
    var token = generation;
    var result = await loadBuildings(kode);
    if (token !== generation) return null;
    if (!result.buildings.length) {
      if (!result.candidateCount) throw new Error('Layanan BNPB tidak menemukan bangunan di sekitar desa ini.');
      throw new Error('Fitur bangunan ditemukan di sekitar desa, tetapi tidak beririsan dengan batas desa.');
    }
    draw(result.buildings, token);
    var message = result.buildings.length.toLocaleString('id-ID') + ' bangunan ditampilkan.';
    if (result.truncated) message += ' Batas 10.000 fitur tercapai; sebagian data mungkin belum tampil.';
    var output = document.getElementById('geotani-building-output');
    if (output) output.textContent = message;
    return result;
  }

  /* ── Ekspor SHP ──
     Bangunan datang sebagai MultiPolygon (rings ArcGIS), jadi penulis SHP
     memakai tipe "polygon". Pada shp-write, opsi `types` HANYA menentukan nama
     berkas keluaran: geojson.multipolygon() melaporkan type "POLYGON", sehingga
     kuncinya memang "polygon" dan hasilnya polygons.shp + .shx + .dbf + .prj. */

  /* Nama kolom DBF dibatasi 10 karakter. Tanpa pemotongan ini shpwrite
     menulis "Shape_Length" apa adanya dan pembaca seperti QGIS salah memetakan
     kolom sesudahnya. */
  function shpSafeProperties(properties) {
    var safe = {};
    Object.keys(properties || {}).forEach(function (key) {
      var base = String(key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'field';
      var field = base, suffix = 1;
      while (Object.prototype.hasOwnProperty.call(safe, field)) {
        var tail = String(suffix++);
        field = base.slice(0, 10 - tail.length) + tail;
      }
      var value = properties[key];
      safe[field] = value == null || (typeof value === 'number' && !Number.isFinite(value)) ? ''
        : typeof value === 'boolean' ? (value ? 1 : 0)
          : typeof value === 'object' ? JSON.stringify(value) : value;
    });
    return safe;
  }

  /* Nama berkas dijaga ASCII: karakter non-ASCII pada nama shapefile sering
     membuat ArcGIS/QGIS keliru membaca berkasnya. */
  function exportFileBase(kode, nama) {
    var base = 'openbuilding-' + (nama || kode || 'desa');
    if (base.normalize) base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return base.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60)
      || 'openbuilding';
  }

  /* Nama desa untuk nama berkas. Daftar resmi diutamakan; selectedNama hanya
     cadangan bila katalog belum termuat. Tanpa urutan ini nama desa lama bisa
     terbawa ke berkas desa lain -- clear() mereset keduanya, tetapi kode desa
     juga bisa datang dari panel lain tanpa melewati setSelected(). */
  function namaDesaUntuk(kode) {
    var found = daftarDesa().find(function (item) { return String(item.kode) === String(kode); });
    if (found) return found.nama;
    return (selectedNama && String(selectedKode) === String(kode)) ? selectedNama : '';
  }

  /* Tombol ekspor aktif begitu ada desa terpilih. Kalau datanya belum pernah
     dimuat, ekspor yang mengambilnya -- satu langkah saja bagi pengguna. */
  function syncExportButton() {
    var btn = document.getElementById('geotani-building-export');
    if (!btn) return;
    btn.disabled = !(selectedKode || kodeDariPanelLain());
  }

  /**
   * Ekspor bangunan desa terpilih sebagai satu ZIP berisi .shp + .shx + .dbf +
   * .prj. Mengembalikan { ok, message } dan tidak melempar, supaya tombol bisa
   * menampilkan pesannya sendiri.
   */
  async function exportShp() {
    var kode = selectedKode || kodeDariPanelLain();
    if (!kode) return { ok: false, message: 'Pilih desa terlebih dahulu.' };
    kode = String(kode);

    var writer = window.shpwrite || (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') {
      return { ok: false, message: 'Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.' };
    }

    /* Bangunan yang sedang tampil diambil dari cache; bila belum pernah dimuat,
       ambil dulu supaya tombol ini tetap bekerja tanpa langkah tambahan. */
    var result = cache.get(kode);
    if (!result) result = await loadBuildings(kode);

    var features = (result.buildings || [])
      .filter(function (feature) {
        return feature && feature.geometry && feature.geometry.type && Array.isArray(feature.geometry.coordinates);
      })
      .map(function (feature) {
        return { type: 'Feature', geometry: feature.geometry, properties: shpSafeProperties(feature.properties) };
      });
    if (!features.length) return { ok: false, message: 'Tidak ada geometri bangunan yang bisa diekspor.' };

    var fileName = exportFileBase(kode, namaDesaUntuk(kode));
    var archive = await writer.zip({ type: 'FeatureCollection', features: features }, {
      folder: fileName,
      filename: fileName,
      outputType: 'blob',
      types: { polygon: 'polygons' },
      prj: WGS84_PRJ
    });
    var blob = archive instanceof Blob ? archive : new Blob([archive], { type: 'application/zip' });
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName + '.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);

    var message = features.length.toLocaleString('id-ID') + ' bangunan diekspor ke ' + fileName + '.zip.';
    if (result.truncated) message += ' Data mencapai batas 10.000 fitur, jadi mungkin belum lengkap.';
    return { ok: true, message: message };
  }

  function init() {
    var card = document.getElementById('geotani-building-card');
    if (!card || card.__geotaniBuildingBound) return;
    card.__geotaniBuildingBound = true;
    var input = document.getElementById('geotaniBuildingVillageSearch');
    var results = document.getElementById('geotaniBuildingVillageResults');
    var button = document.getElementById('geotani-building-load');
    var reset = document.getElementById('geotani-building-reset');
    var exportBtn = document.getElementById('geotani-building-export');

    var inheritedKode = kodeDariPanelLain();
    if (inheritedKode) {
      var inherited = daftarDesa().find(function (item) { return String(item.kode) === String(inheritedKode); });
      setSelected(inheritedKode, inherited && inherited.nama);
    }

    if (input && results) {
      input.addEventListener('input', function () {
        var found = cariDesa(input.value);
        results.innerHTML = '';
        if (!found.length) { results.hidden = true; return; }
        found.forEach(function (item) {
          var option = document.createElement('div');
          option.className = 'geotani-sls-result';
          option.textContent = item.nama + ' (' + item.kode + ')';
          option.addEventListener('mousedown', function (event) {
            event.preventDefault();
            input.value = item.nama;
            results.hidden = true;
            setSelected(item.kode, item.nama);
          });
          results.appendChild(option);
        });
        results.hidden = false;
      });
      document.addEventListener('click', function (event) {
        if (!results.contains(event.target) && event.target !== input) results.hidden = true;
      });
    }

    if (button) button.addEventListener('click', async function () {
      var kode = selectedKode || kodeDariPanelLain();
      if (!kode) { setStatus('Pilih desa terlebih dahulu.'); if (input) input.focus(); return; }
      selectedKode = String(kode);
      var token = ++generation;
      button.disabled = true;
      clearLayer();
      var output = document.getElementById('geotani-building-output');
      if (output) output.textContent = '';
      setStatus('Mengambil data bangunan...');
      try {
        await showBuildings(selectedKode);
        if (token === generation) setStatus('');
      } catch (error) {
        if (token === generation) setStatus(error && error.message ? error.message : 'Gagal mengambil data bangunan.');
      } finally {
        button.disabled = false;
      }
    });
    if (reset) reset.addEventListener('click', function () { clear(true); });

    if (exportBtn) exportBtn.addEventListener('click', async function () {
      var kode = selectedKode || kodeDariPanelLain();
      if (!kode) { setStatus('Pilih desa terlebih dahulu.'); if (input) input.focus(); return; }
      selectedKode = String(kode);
      exportBtn.disabled = true;
      setStatus(cache.has(selectedKode) ? 'Menyiapkan berkas SHP...' : 'Mengambil data bangunan...');
      try {
        var result = await exportShp();
        setStatus(result.message);
      } catch (error) {
        setStatus('Gagal mengekspor SHP: ' + (error && error.message ? error.message : String(error)));
      } finally {
        syncExportButton();
      }
    });

    syncExportButton();
  }

  window.GeoTaniBuildings = {
    init: init,
    clear: clear,
    loadBuildings: loadBuildings,
    showBuildings: showBuildings,
    exportShp: exportShp
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
