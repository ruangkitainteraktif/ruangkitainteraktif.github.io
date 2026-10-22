/* Two-point route and network travel estimate on BIG road features. */
(function () {
  'use strict';

  var SERVICE = 'https://geoservices.big.go.id/gis/rest/services/DRPWD/DASHBOARD_INFRATRUKTUR_SEKOLAH/MapServer';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var panel = document.getElementById('alat-tab-network-routing');
  var map = window.map;
  if (!panel || !map || !window.L) return;

  var points = { origin: null, destination: null };
  var picking = null;
  var routeLayer = null;
  var markerLayer = L.layerGroup().addTo(map);
  var requestSeq = 0;
  var metadataPromise = null;
  var roadFeatureCache = Object.create(null);
  var statusEl = document.getElementById('networkRouteStatus');
  var resultEl = document.getElementById('networkRouteResult');
  var originInput = document.getElementById('networkRouteOrigin');
  var destinationInput = document.getElementById('networkRouteDestination');
  var modeInput = document.getElementById('networkRouteMode');

  function status(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function arcgisUrl(url) { return PROXY + encodeURIComponent(url); }

  function requestJson(url) {
    return fetch(arcgisUrl(url)).then(function (response) {
      if (!response.ok) throw new Error('Proxy BIG menjawab HTTP ' + response.status + '.');
      return response.json();
    }).then(function (json) {
      if (json && json.error) {
        var error = json.error;
        var detail = [error.message || 'Layanan BIG menolak permintaan.'];
        if (error.code != null) detail.push('kode ' + error.code);
        if (Array.isArray(error.details) && error.details.length) detail.push(error.details.join(' '));
        throw new Error(detail.join(' — '));
      }
      return json;
    });
  }

  function loadMetadata() {
    if (!metadataPromise) metadataPromise = requestJson(SERVICE + '?f=json').then(function (data) {
      var layers = data.layers || [];
      var byId = Object.create(null);
      layers.forEach(function (layer) { byId[layer.id] = layer; });
      var roadGroups = Object.create(null);
      layers.forEach(function (layer) {
        if (layer.type === 'Group Layer' && /^JALAN_(25K|50K)$/i.test(layer.name || '')) roadGroups[layer.id] = true;
      });
      var roads = layers.filter(function (layer) {
        if (layer.type !== 'Feature Layer') return false;
        var parentId = layer.parentLayerId;
        while (parentId != null && parentId !== -1) {
          if (roadGroups[parentId]) return true;
          parentId = byId[parentId] ? byId[parentId].parentLayerId : -1;
        }
        return false;
      });
      if (!roads.length) throw new Error('Layer jalan JALAN_25K / JALAN_50K tidak ditemukan pada layanan BIG.');
      return roads;
    }).catch(function (error) {
      metadataPromise = null;
      throw error;
    });
    return metadataPromise;
  }

  function pointBounds(a, b) {
    var deltaKm = distance(a, b) / 1000;
    if (deltaKm > 120) throw new Error('Jarak garis lurus lebih dari 120 km. Analisis dibatasi agar unduhan ruas jalan tetap ringan.');
    var pad = Math.max(0.06, Math.min(0.65, deltaKm / 111 * 0.28));
    var meanLat = (a[0] + b[0]) / 2;
    var lonPad = pad / Math.max(0.2, Math.cos(meanLat * Math.PI / 180));
    return {
      xmin: Math.min(a[1], b[1]) - lonPad,
      ymin: Math.min(a[0], b[0]) - pad,
      xmax: Math.max(a[1], b[1]) + lonPad,
      ymax: Math.max(a[0], b[0]) + pad
    };
  }

  function extentIntersects(extent, box) {
    if (!extent || !extent.xmin) return true;
    return extent.xmin <= box.xmax && extent.xmax >= box.xmin && extent.ymin <= box.ymax && extent.ymax >= box.ymin;
  }

  function queryRoadLayer(layer, box) {
    var cacheKey = layer.id + ':' + [box.xmin, box.ymin, box.xmax, box.ymax].map(function (n) { return n.toFixed(2); }).join(',');
    if (roadFeatureCache[cacheKey]) return Promise.resolve(roadFeatureCache[cacheKey]);
    var features = [];
    var offset = 0;
    var pageSize = Math.min(2000, layer.maxRecordCount || 2000);
    function page() {
      var params = new URLSearchParams({
        // Jangan mengunci nama field yang belum tentu tersedia di semua
        // sublayer JALAN_25K/JALAN_50K. ArcGIS menolak query jika salah satu
        // field outFields tidak ada pada layer yang sedang ditanyakan.
        f: 'json', where: '1=1', outFields: '*',
        returnGeometry: 'true', outSR: '4326', inSR: '4326',
        geometry: JSON.stringify({ xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
        resultOffset: String(offset), resultRecordCount: String(pageSize)
      });
      return requestJson(SERVICE + '/' + layer.id + '/query?' + params.toString()).then(function (data) {
        var batch = data.features || [];
        batch.forEach(function (feature) {
          var paths = feature.geometry && feature.geometry.paths;
          if (!paths) return;
          var props = feature.attributes || {};
          paths.forEach(function (path) {
            if (path && path.length > 1) features.push({ coordinates: path, properties: props });
          });
        });
        offset += batch.length;
        if (features.length > 30000) throw new Error('Area rute memiliki terlalu banyak ruas. Coba titik yang lebih berdekatan.');
        if (batch.length && (data.exceededTransferLimit || batch.length === pageSize)) return page();
        return features;
      });
    }
    return page().then(function (result) {
      roadFeatureCache[cacheKey] = result;
      return result;
    }).catch(function (error) {
      throw new Error('Query ruas BIG layer ' + layer.id + ' (' + layer.name + ') gagal: ' +
        (error && error.message ? error.message : 'respons layanan tidak valid.'));
    });
  }

  function mapLimit(items, max, fn) {
    var cursor = 0, results = new Array(items.length);
    var workers = new Array(Math.min(max, items.length)).fill(0).map(function () {
      function next() {
        var index = cursor++;
        if (index >= items.length) return Promise.resolve();
        return fn(items[index]).then(function (value) { results[index] = value; return next(); });
      }
      return next();
    });
    return Promise.all(workers).then(function () { return results; });
  }

  function loadRoads(box) {
    return loadMetadata().then(function (layers) {
      var relevant = layers.filter(function (layer) { return extentIntersects(layer.extent, box); });
      if (!relevant.length) throw new Error('Tidak ada layer ruas jalan BIG yang mencakup area kedua titik.');
      return mapLimit(relevant, 5, function (layer) { return queryRoadLayer(layer, box); })
        .then(function (parts) { return [].concat.apply([], parts); });
    });
  }

  function distance(a, b) {
    var rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function roadSpeed(props, mode) {
    if (mode === 'walk') return 5;
    var kind = String(props.FUNGSI_REN || props.FUNGSI || props.REMARK || '').toLowerCase();
    var code = Number(props.FGSRJL);
    if (/arteri/.test(kind) || code === 1) return 60;
    if (/kolektor/.test(kind) || code === 2) return 40;
    if (/lokal/.test(kind) || code === 3) return 30;
    if (/lingkungan/.test(kind) || code === 4) return 20;
    return 25;
  }

  function buildGraph(lines, mode) {
    var nodes = Object.create(null), count = 0;
    function nodeAt(c) {
      var lon = Number(c[0]), lat = Number(c[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      var key = lon.toFixed(4) + ':' + lat.toFixed(4);
      if (!nodes[key]) { nodes[key] = { key: key, coordinate: [lon, lat], edges: [] }; count++; }
      return nodes[key];
    }
    lines.forEach(function (line) {
      var coords = line.coordinates, speed = roadSpeed(line.properties || {}, mode);
      for (var i = 1; i < coords.length; i++) {
        var a = nodeAt(coords[i - 1]), b = nodeAt(coords[i]);
        if (!a || !b || a.key === b.key) continue;
        var meters = distance(a.coordinate, b.coordinate);
        if (!(meters > 0) || meters > 20000) continue;
        var seconds = meters / (speed * 1000 / 3600);
        a.edges.push({ to: b.key, meters: meters, seconds: seconds });
        b.edges.push({ to: a.key, meters: meters, seconds: seconds });
      }
    });
    return { nodes: nodes, count: count };
  }

  function nearestNode(nodes, point) {
    var best = null, bestDistance = Infinity;
    Object.keys(nodes).forEach(function (key) {
      var d = distance(point, nodes[key].coordinate);
      if (d < bestDistance) { best = nodes[key]; bestDistance = d; }
    });
    return best && bestDistance <= 1500 ? { node: best, distance: bestDistance } : null;
  }

  function shortestPath(nodes, start, end) {
    var costs = Object.create(null), meters = Object.create(null), previous = Object.create(null), done = Object.create(null), heap = [];
    function push(item) {
      heap.push(item); var i = heap.length - 1;
      while (i > 0) { var parent = (i - 1) >> 1; if (heap[parent].cost <= item.cost) break; heap[i] = heap[parent]; i = parent; }
      heap[i] = item;
    }
    function pop() {
      var first = heap[0], last = heap.pop();
      if (heap.length) { var i = 0; while (true) { var l = i * 2 + 1, r = l + 1; if (l >= heap.length) break; var c = r < heap.length && heap[r].cost < heap[l].cost ? r : l; if (heap[c].cost >= last.cost) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
      return first;
    }
    costs[start.key] = 0; meters[start.key] = 0; push({ key: start.key, cost: 0 });
    while (heap.length) {
      var current = pop();
      if (done[current.key]) continue;
      if (current.key === end.key) break;
      done[current.key] = true;
      nodes[current.key].edges.forEach(function (edge) {
        if (done[edge.to]) return;
        var candidate = current.cost + edge.seconds;
        if (costs[edge.to] == null || candidate < costs[edge.to]) {
          costs[edge.to] = candidate; meters[edge.to] = meters[current.key] + edge.meters; previous[edge.to] = current.key;
          push({ key: edge.to, cost: candidate });
        }
      });
    }
    if (costs[end.key] == null) return null;
    var path = [], cursor = end.key;
    while (cursor) { path.push(nodes[cursor].coordinate); if (cursor === start.key) break; cursor = previous[cursor]; }
    if (path[path.length - 1] !== nodes[start.key].coordinate) return null;
    path.reverse();
    return { coordinates: path, meters: meters[end.key], seconds: costs[end.key] };
  }

  function parseInput(value) {
    var parts = String(value || '').trim().split(/[\s,;]+/).map(Number);
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null;
    return [parts[0], parts[1]];
  }

  function showPoint(which) {
    if (!points[which]) return;
    var color = which === 'origin' ? '#0284c7' : '#e11d48';
    L.circleMarker(points[which], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(markerLayer);
  }

  function setPoint(which, latlng) {
    points[which] = [latlng.lat, latlng.lng];
    var input = which === 'origin' ? originInput : destinationInput;
    input.value = points[which].map(function (n) { return n.toFixed(5); }).join(', ');
    markerLayer.clearLayers(); showPoint('origin'); showPoint('destination');
    if (routeLayer && map.hasLayer(routeLayer)) map.removeLayer(routeLayer);
    resultEl.hidden = true;
    status(which === 'origin' ? 'Titik asal ditetapkan. Pilih titik tujuan.' : 'Titik tujuan ditetapkan. Tekan Hitung rute dan waktu.', false);
  }

  function formatDuration(seconds) {
    var mins = Math.max(1, Math.round(seconds / 60));
    var hours = Math.floor(mins / 60); mins %= 60;
    return hours ? hours + ' jam ' + mins + ' menit' : mins + ' menit';
  }

  function displayResult(route, roadCount, startAccess, endAccess) {
    var mode = modeInput.value;
    var totalMeters = route.meters + startAccess + endAccess;
    var km = totalMeters / 1000;
    var elapsed = route.seconds + (startAccess + endAccess) / ((mode === 'walk' ? 5 : 25) * 1000 / 3600);
    var lineCoords = [points.origin].concat(route.coordinates, [points.destination]);
    if (routeLayer && map.hasLayer(routeLayer)) map.removeLayer(routeLayer);
    routeLayer = L.polyline(lineCoords, { color: '#0284c7', weight: 6, opacity: .9, lineCap: 'round', lineJoin: 'round', className: 'network-trip-line' }).addTo(map);
    markerLayer.clearLayers(); showPoint('origin'); showPoint('destination');
    map.fitBounds(routeLayer.getBounds(), { padding: [60, 60], maxZoom: 16 });
    resultEl.innerHTML = '<div class="network-route-metric"><b>' + km.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' km</b><span>Jarak jaringan</span></div>'
      + '<div class="network-route-metric"><b>' + formatDuration(elapsed) + '</b><span>Estimasi waktu</span></div>'
      + '<div class="network-route-result-detail">Jalur dihitung sebagai rute tercepat perkiraan pada ruas jalan yang tersedia. Menggunakan ' + roadCount.toLocaleString('id-ID') + ' ruas; akses titik ke ruas terdekat ' + Math.round(startAccess) + ' m dan ' + Math.round(endAccess) + ' m. Waktu tidak mencakup lalu lintas, berhenti, atau kondisi jalan.</div>';
    resultEl.hidden = false;
    status('Analisis jaringan selesai.', false);
  }

  panel.addEventListener('click', function (event) {
    var pickButton = event.target.closest('[data-network-pick]');
    if (pickButton) {
      picking = pickButton.getAttribute('data-network-pick');
      panel.querySelectorAll('[data-network-pick]').forEach(function (button) { button.classList.toggle('is-picking', button === pickButton); });
      status(picking === 'origin' ? 'Klik peta untuk menetapkan titik asal.' : 'Klik peta untuk menetapkan titik tujuan.', false);
      return;
    }
    if (event.target.id === 'networkRouteClear') {
      requestSeq++;
      if (routeLayer && map.hasLayer(routeLayer)) map.removeLayer(routeLayer);
      routeLayer = null; markerLayer.clearLayers();
      status('Rute dihapus. Koordinat titik tetap tersedia.', false);
      resultEl.hidden = true;
      return;
    }
    if (event.target.id === 'networkRouteCalculate') calculateRoute();
  });

  map.getContainer().addEventListener('click', function (event) {
    if (!picking) return;
    var which = picking; picking = null;
    panel.querySelectorAll('[data-network-pick]').forEach(function (button) { button.classList.remove('is-picking'); });
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    setPoint(which, map.mouseEventToLatLng(event));
  }, true);

  function bindCoordinateInput(input, which) {
    input.addEventListener('change', function () {
      var coords = parseInput(input.value);
      if (!coords) { status('Masukkan koordinat sebagai lintang, bujur (contoh: -6.20, 106.82).', true); return; }
      setPoint(which, { lat: coords[0], lng: coords[1] });
    });
  }
  bindCoordinateInput(originInput, 'origin');
  bindCoordinateInput(destinationInput, 'destination');

  function calculateRoute() {
    points.origin = parseInput(originInput.value);
    points.destination = parseInput(destinationInput.value);
    if (!points.origin || !points.destination) { status('Tetapkan koordinat asal dan tujuan terlebih dahulu.', true); return; }
    if (distance(points.origin, points.destination) < 5) { status('Titik asal dan tujuan terlalu berdekatan.', true); return; }
    var seq = ++requestSeq;
    resultEl.hidden = true;
    status('Memuat metadata dan ruas jalan BIG di sekitar kedua titik…', false);
    var box;
    try { box = pointBounds(points.origin, points.destination); }
    catch (error) { status(error.message, true); return; }
    loadRoads(box).then(function (lines) {
      if (seq !== requestSeq) return;
      if (!lines.length) throw new Error('Tidak ditemukan ruas jalan BIG di area ini.');
      status('Menyusun jaringan dari ' + lines.length.toLocaleString('id-ID') + ' ruas dan menghitung rute…', false);
      var graph = buildGraph(lines, modeInput.value);
      var start = nearestNode(graph.nodes, points.origin), end = nearestNode(graph.nodes, points.destination);
      if (!start || !end) throw new Error('Salah satu titik berjarak lebih dari 1,5 km dari jaringan jalan yang tersedia.');
      var route = shortestPath(graph.nodes, start.node, end.node);
      if (!route) throw new Error('Ruas jalan di antara kedua titik tidak tersambung pada data BIG yang tersedia.');
      displayResult(route, lines.length, start.distance, end.distance);
    }).catch(function (error) {
      if (seq !== requestSeq) return;
      status(error && error.message ? error.message : 'Rute gagal dihitung. Periksa koneksi lalu coba lagi.', true);
    });
  }
})();
