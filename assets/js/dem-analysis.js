/* ── DEM Topography Analysis — Open-Meteo Elevation API ── */
(function () {
  'use strict';

  var ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
  var BOUNDARY_API = 'https://wilayah.smartartstudio.my.id/api/boundaries/';
  var KODE_WILAYAH_URL = 'assets/data/kode_wilayah.json';

  var demOverlayGroup = L.layerGroup();
  var demPolygonLayer = null;
  var demPolygonGeoJSON = null;
  var demnasLayer = null;
  var demKabData = [];
  var demDesaData = [];
  var demDataLoaded = false;
  var demLoadPromise = null;

  /* ── Data loading ── */
  function ensureDemData() {
    if (demLoadPromise) return demLoadPromise;
    demLoadPromise = (async function () {
      try {
        var res = await fetch(KODE_WILAYAH_URL);
        if (!res.ok) return;
        var all = await res.json();
        demKabData = all.filter(function (i) { return i.kode && (i.kode.match(/\./g) || []).length === 1; });
        demDesaData = all.filter(function (i) { return i.kode && (i.kode.match(/\./g) || []).length === 3; });
        demDataLoaded = true;
      } catch (e) { /* ignore */ }
    })();
    return demLoadPromise;
  }

  function searchDemAreas(query, level) {
    if (!query || query.length < 2) return [];
    var q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var pool = level === 'kabupaten' ? demKabData : demDesaData;
    return pool.filter(function (item) {
      var name = item.nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q);
    }).slice(0, 20);
  }

  async function fetchBoundary(kode) {
    var url = BOUNDARY_API + kode;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 15000);
        var res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        if (!data.path || !data.path.length) return null;
        var rings = data.path.map(function (ring) { return ring.map(function (p) { return [p[1], p[0]]; }); });
        return { geometry: { rings: rings }, attributes: { name: data.nama || '' } };
      } catch (e) {
        console.warn('[DEM] fetchBoundary attempt ' + (attempt + 1) + ' failed:', e.message);
        if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1000); });
      }
    }
    return null;
  }

  /* ── Grid generation ── */
  function generateGridPoints(polygon, spacingDeg) {
    var bbox = turf.bbox(polygon);
    var points = [];
    var lng = bbox[0];
    while (lng <= bbox[2]) {
      var lat = bbox[1];
      while (lat <= bbox[3]) {
        var pt = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(pt, polygon)) {
          points.push({ lat: lat, lng: lng });
        }
        lat += spacingDeg;
      }
      lng += spacingDeg;
    }
    return points;
  }

  /* ── Elevation API ── */
  async function fetchElevationBatch(points) {
    var BATCH = 100;
    var MAX_RETRIES = 2;
    var results = [];
    for (var i = 0; i < points.length; i += BATCH) {
      var batch = points.slice(i, i + BATCH);
      var lats = batch.map(function (p) { return p.lat.toFixed(6); }).join(',');
      var lngs = batch.map(function (p) { return p.lng.toFixed(6); }).join(',');
      var success = false;
      for (var attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
        try {
          var res = await fetch(ELEVATION_API + '?latitude=' + lats + '&longitude=' + lngs);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var json = await res.json();
          if (json.elevation) {
            for (var j = 0; j < batch.length; j++) {
              results.push({ lat: batch[j].lat, lng: batch[j].lng, elev: json.elevation[j] });
            }
            success = true;
          }
        } catch (e) {
          if (attempt < MAX_RETRIES) await new Promise(function (r) { setTimeout(r, 300 * (attempt + 1)); });
          else console.warn('[DEM] Batch failed after retries:', i / BATCH + 1);
        }
      }
      if (i + BATCH < points.length) await new Promise(function (r) { setTimeout(r, 150); });
    }
    return results;
  }

  /* ── Grid computation ── */
  function buildElevationGrid(elevData, bbox) {
    var lngs = [];
    var lats = [];
    var map = {};
    elevData.forEach(function (d) {
      var li = Math.round((d.lng - bbox[0]) * 100000);
      var la = Math.round((d.lat - bbox[1]) * 100000);
      if (lngs.indexOf(li) === -1) lngs.push(li);
      if (lats.indexOf(la) === -1) lats.push(la);
      map[li + '_' + la] = d.elev;
    });
    lngs.sort(function (a, b) { return a - b; });
    lats.sort(function (a, b) { return a - b; });
    var rows = lats.length;
    var cols = lngs.length;
    var grid = [];
    for (var r = 0; r < rows; r++) {
      grid[r] = [];
      for (var c = 0; c < cols; c++) {
        var key = lngs[c] + '_' + lats[r];
        grid[r][c] = map[key] !== undefined ? map[key] : null;
      }
    }
    return { grid: grid, lngs: lngs, lats: lats, rows: rows, cols: cols };
  }

  /* ── Slope (Horn's method) ── */
  function computeSlope(grid, rows, cols, spacing) {
    var slope = [];
    for (var r = 0; r < rows; r++) {
      slope[r] = [];
      for (var c = 0; c < cols; c++) {
        if (grid[r][c] === null) { slope[r][c] = null; continue; }
        var dzdx = 0, dzdy = 0, count = 0;
        if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
          var tl = grid[r - 1][c - 1], tc = grid[r - 1][c], tr = grid[r - 1][c + 1];
          var ml = grid[r][c - 1], mr = grid[r][c + 1];
          var bl = grid[r + 1][c - 1], bc = grid[r + 1][c], br = grid[r + 1][c + 1];
          if ([tl, tc, tr, ml, mr, bl, bc, br].every(function (v) { return v !== null; })) {
            dzdx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) / (8 * spacing);
            dzdy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) / (8 * spacing);
            slope[r][c] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
          } else {
            slope[r][c] = 0;
          }
        } else {
          slope[r][c] = 0;
        }
      }
    }
    return slope;
  }

  /* ── Aspect ── */
  function computeAspect(grid, rows, cols, spacing) {
    var aspect = [];
    for (var r = 0; r < rows; r++) {
      aspect[r] = [];
      for (var c = 0; c < cols; c++) {
        if (grid[r][c] === null || r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          aspect[r][c] = null; continue;
        }
        var tl = grid[r - 1][c - 1], tc = grid[r - 1][c], tr = grid[r - 1][c + 1];
        var ml = grid[r][c - 1], mr = grid[r][c + 1];
        var bl = grid[r + 1][c - 1], bc = grid[r + 1][c], br = grid[r + 1][c + 1];
        if ([tl, tc, tr, ml, mr, bl, bc, br].some(function (v) { return v === null; })) {
          aspect[r][c] = null; continue;
        }
        var dzdx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) / (8 * spacing);
        var dzdy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) / (8 * spacing);
        var az = Math.atan2(-dzdy, dzdx) * (180 / Math.PI);
        if (az < 0) az += 360;
        aspect[r][c] = az;
      }
    }
    return aspect;
  }

  /* ── Terrain classification ── */
  function classifyTerrain(slopeVal) {
    if (slopeVal === null) return 'unknown';
    if (slopeVal < 3) return 'datar';
    if (slopeVal < 8) return 'gentle';
    if (slopeVal < 15) return 'moderate';
    if (slopeVal < 25) return 'steep';
    return 'very_steep';
  }

  function aspectToCompass(az) {
    if (az === null) return '-';
    var dirs = [' Utara', ' Timur Laut', ' Timur', ' Tenggara', ' Selatan', ' Barat Daya', ' Barat', ' Barat Laut'];
    var idx = Math.round(az / 45) % 8;
    return dirs[idx];
  }

  function detectDepressions(grid, rows, cols) {
    var count = 0;
    for (var r = 1; r < rows - 1; r++) {
      for (var c = 1; c < cols - 1; c++) {
        if (grid[r][c] === null) continue;
        var val = grid[r][c];
        var isMin = true;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = r + dr, nc = c + dc;
            if (grid[nr] && grid[nr][nc] !== null && grid[nr][nc] < val) { isMin = false; break; }
          }
          if (!isMin) break;
        }
        if (isMin) count++;
      }
    }
    return count;
  }

  /* ── Area computation ── */
  function computeAreaHa(elevData, polygon) {
    if (elevData.length === 0) return 0;
    var totalArea = turf.area(polygon) / 10000;
    return totalArea;
  }

  /* ── Main analysis ── */
  async function runDemAnalysis(kode, level, progressCb) {
    if (progressCb) progressCb(5, 'Memuat batas wilayah...');

    var boundary = await fetchBoundary(kode);
    if (!boundary || !boundary.geometry || !boundary.geometry.rings) {
      throw new Error('Gagal memuat batas wilayah');
    }

    var rings = boundary.geometry.rings;
    var polygon;
    if (rings.length === 1) {
      polygon = turf.polygon([rings[0]]);
    } else {
      var outerRing = rings[0];
      var holes = [];
      var outerPoly = turf.polygon([outerRing]);
      for (var i = 1; i < rings.length; i++) {
        var pt = turf.point(rings[i][0]);
        if (turf.booleanPointInPolygon(pt, outerPoly)) {
          holes.push(rings[i]);
        }
      }
      polygon = turf.polygon([outerRing].concat(holes));
    }

    var areaHa = turf.area(polygon) / 10000;
    var bbox = turf.bbox(polygon);
    var polygonAreaKm2 = turf.area(polygon) / 1e6;

    var targetPoints = Math.min(1000, Math.max(150, Math.round(areaHa / 3)));
    var spacingDeg = Math.sqrt(polygonAreaKm2 / targetPoints) / 111;
    spacingDeg = Math.max(0.0005, Math.min(0.012, spacingDeg));

    if (progressCb) progressCb(15, 'Membuat grid titik sample (spacing: ' + (spacingDeg * 111000).toFixed(0) + 'm)...');
    var gridPoints = generateGridPoints(polygon, spacingDeg);

    if (progressCb) progressCb(20, 'Mengambil data elevasi (' + gridPoints.length + ' titik)...');
    var elevData = await fetchElevationBatch(gridPoints);

    if (progressCb) progressCb(60, 'Menghitung slope & aspect...');
    var gridInfo = buildElevationGrid(elevData, bbox);
    var spacingM = spacingDeg * 111000;
    var slopeGrid = computeSlope(gridInfo.grid, gridInfo.rows, gridInfo.cols, spacingM);
    var aspectGrid = computeAspect(gridInfo.grid, gridInfo.rows, gridInfo.cols, spacingM);

    if (progressCb) progressCb(80, 'Menghitung statistik...');

    var elevations = elevData.map(function (d) { return d.elev; }).filter(function (e) { return e !== null && e !== undefined; });
    var slopes = [];
    var aspects = [];
    var terrainCounts = { datar: 0, gentle: 0, moderate: 0, steep: 0, very_steep: 0 };
    var validPixels = 0;

    for (var r = 0; r < gridInfo.rows; r++) {
      for (var c = 0; c < gridInfo.cols; c++) {
        if (slopeGrid[r][c] !== null) {
          slopes.push(slopeGrid[r][c]);
          var cls = classifyTerrain(slopeGrid[r][c]);
          terrainCounts[cls]++;
          validPixels++;
        }
        if (aspectGrid[r][c] !== null) aspects.push(aspectGrid[r][c]);
      }
    }

    var elevMin = Math.min.apply(null, elevations);
    var elevMax = Math.max.apply(null, elevations);
    var elevAvg = elevations.reduce(function (a, b) { return a + b; }, 0) / elevations.length;
    var elevSorted = elevations.slice().sort(function (a, b) { return a - b; });
    var elevMedian = elevSorted[Math.floor(elevSorted.length / 2)];

    var slopeAvg = slopes.length > 0 ? slopes.reduce(function (a, b) { return a + b; }, 0) / slopes.length : 0;
    var slopeMax = slopes.length > 0 ? Math.max.apply(null, slopes) : 0;

    var aspectBins = { N: 0, NE: 0, E: 0, SE: 0, S: 0, SW: 0, W: 0, NW: 0 };
    aspects.forEach(function (az) {
      var idx = Math.round(az / 45) % 8;
      var keys = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      aspectBins[keys[idx]]++;
    });
    var dominantAspect = 'N';
    var maxCount = 0;
    for (var k in aspectBins) {
      if (aspectBins[k] > maxCount) { maxCount = aspectBins[k]; dominantAspect = k; }
    }

    var pixelAreaHa = (spacingM * spacingM) / 10000;
    var flatCount = terrainCounts.datar + terrainCounts.gentle;
    var steepCount = terrainCounts.steep + terrainCounts.very_steep;
    var flatPct = validPixels > 0 ? (flatCount / validPixels * 100) : 0;
    var steepPct = validPixels > 0 ? (steepCount / validPixels * 100) : 0;

    var floodAreaHa = 0;
    var erosionAreaHa = 0;
    for (var r2 = 0; r2 < gridInfo.rows; r2++) {
      for (var c2 = 0; c2 < gridInfo.cols; c2++) {
        var sv = slopeGrid[r2][c2];
        var ev = gridInfo.grid[r2][c2];
        if (sv !== null && ev !== null) {
          if (ev < 100 && sv < 3) floodAreaHa += pixelAreaHa;
          if (sv > 25) erosionAreaHa += pixelAreaHa;
        }
      }
    }

    var depressions = detectDepressions(gridInfo.grid, gridInfo.rows, gridInfo.cols);

    var results = {
      name: boundary.attributes.name || kode,
      level: level,
      kode: kode,
      areaHa: areaHa,
      pointCount: elevData.length,
      elevMin: elevMin,
      elevMax: elevMax,
      elevAvg: elevAvg,
      elevMedian: elevMedian,
      slopeAvg: slopeAvg,
      slopeMax: slopeMax,
      terrainCounts: terrainCounts,
      flatPct: flatPct,
      steepPct: steepPct,
      dominantAspect: dominantAspect,
      aspectBins: aspectBins,
      floodAreaHa: floodAreaHa,
      erosionAreaHa: erosionAreaHa,
      depressions: depressions,
      elevData: elevData,
      polygon: polygon
    };

    if (progressCb) progressCb(90, 'Membuat overlay peta...');
    createElevationOverlay(elevData, results);

    if (progressCb) progressCb(100, 'Selesai');
    return results;
  }

  /* ── Map overlay ── */
  function elevToColor(elev) {
    if (elev < 0) return '#3b82f6';
    if (elev < 100) return '#22c55e';
    if (elev < 300) return '#65a30d';
    if (elev < 500) return '#84cc16';
    if (elev < 1000) return '#eab308';
    if (elev < 1500) return '#f97316';
    if (elev < 2000) return '#ef4444';
    if (elev < 3000) return '#dc2626';
    return '#991b1b';
  }

  /* ── Terrain Tiles Overlay (AWS Terrarium) ── */
  var TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

  function terrariumDecode(r, g, b) {
    return (r * 256 + g + b / 256) - 32768;
  }

  function elevToRgba(elev) {
    if (elev < 0) return [30, 100, 200, 140];
    if (elev < 10) return [65, 182, 196, 160];
    if (elev < 50) return [126, 210, 110, 160];
    if (elev < 100) return [170, 220, 50, 160];
    if (elev < 200) return [220, 220, 50, 160];
    if (elev < 500) return [232, 180, 50, 160];
    if (elev < 1000) return [210, 130, 50, 160];
    if (elev < 1500) return [190, 80, 60, 160];
    if (elev < 2000) return [175, 50, 50, 160];
    return [140, 30, 40, 160];
  }

  function tileBounds(z, x, y) {
    var n = Math.pow(2, z);
    var west = (x / n) * 360 - 180;
    var east = ((x + 1) / n) * 360 - 180;
    var northRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    var southRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
    return {
      west: west,
      east: east,
      north: northRad * 180 / Math.PI,
      south: southRad * 180 / Math.PI
    };
  }

  function latLngToTilePixel(lat, lng, tb) {
    var px = ((lng - tb.west) / (tb.east - tb.west)) * 256;
    var py = ((tb.north - lat) / (tb.north - tb.south)) * 256;
    return [px, py];
  }

  function polyBboxIntersects(polyCoords, tb) {
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var i = 0; i < polyCoords.length; i++) {
      var lng = polyCoords[i][0], lat = polyCoords[i][1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return !(minLng > tb.east || maxLng < tb.west || minLat > tb.north || maxLat < tb.south);
  }

  var TerrainTileLayer = L.GridLayer.extend({
    options: {
      tileSize: 256,
      attribution: '© <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      updateWhenZooming: false,
      updateWhenIdle: true
    },

    createTile: function (coords, done) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var size = this.getTileSize();
      canvas.width = size.x;
      canvas.height = size.y;

      var tb = tileBounds(coords.z, coords.x, coords.y);
      var poly = demPolygonGeoJSON;

      if (poly) {
        var geom = poly.geometry;
        var rings = [];
        if (geom.type === 'Polygon') {
          rings.push(geom.coordinates[0]);
        } else if (geom.type === 'MultiPolygon') {
          for (var r = 0; r < geom.coordinates.length; r++) {
            rings.push(geom.coordinates[r][0]);
          }
        }

        var anyIntersect = false;
        for (var ri = 0; ri < rings.length; ri++) {
          if (polyBboxIntersects(rings[ri], tb)) { anyIntersect = true; break; }
        }
        if (!anyIntersect) {
          done(null, canvas);
          return canvas;
        }

        ctx.beginPath();
        for (var ri = 0; ri < rings.length; ri++) {
          var ring = rings[ri];
          for (var pi = 0; pi < ring.length; pi++) {
            var px = latLngToTilePixel(ring[pi][1], ring[pi][0], tb);
            if (pi === 0) ctx.moveTo(px[0], px[1]);
            else ctx.lineTo(px[0], px[1]);
          }
          ctx.closePath();
        }
        ctx.clip();
      }

      var img = new Image();
      img.crossOrigin = 'anonymous';
      var url = TERRARIUM_URL
        .replace('{z}', coords.z)
        .replace('{x}', coords.x)
        .replace('{y}', coords.y);

      img.onload = function () {
        var w = img.width, h = img.height;
        var srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        var srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        var data = srcCtx.getImageData(0, 0, w, h);
        var px = data.data;

        var out = srcCtx.createImageData(w, h);
        var od = out.data;

        for (var i = 0; i < px.length; i += 4) {
          var elev = terrariumDecode(px[i], px[i + 1], px[i + 2]);
          if (elev < -1000) {
            od[i + 3] = 0;
            continue;
          }
          var c = elevToRgba(elev);
          od[i]     = c[0];
          od[i + 1] = c[1];
          od[i + 2] = c[2];
          od[i + 3] = c[3];
        }

        srcCtx.putImageData(out, 0, 0);
        ctx.drawImage(srcCanvas, 0, 0);
        done(null, canvas);
      };

      img.onerror = function () {
        done(new Error('Tile load failed: ' + url), canvas);
      };

      img.src = url;
      return canvas;
    }
  });

  function showDemnas() {
    if (demnasLayer && map.hasLayer(demnasLayer)) return;
    try {
      demnasLayer = new TerrainTileLayer({ opacity: 0.7 });
      demnasLayer.addTo(map);
      if (map.hasLayer(demOverlayGroup)) {
        map.removeLayer(demOverlayGroup);
        demOverlayGroup.addTo(map);
      }
    } catch (e) {
      console.warn('[DEM] Terrain overlay error:', e.message);
    }
  }

  function hideDemnas() {
    if (demnasLayer && map.hasLayer(demnasLayer)) {
      map.removeLayer(demnasLayer);
    }
    demnasLayer = null;
  }

  function createElevationOverlay(elevData, results) {
    demOverlayGroup.clearLayers();
    demPolygonGeoJSON = results.polygon || null;

    // Add polygon boundary
    if (results.polygon) {
      var polyCoords = [];
      var geom = results.polygon.geometry;
      if (geom.type === 'Polygon') {
        polyCoords = geom.coordinates[0].map(function (c) { return [c[1], c[0]]; });
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(function (polygon) {
          polyCoords = polyCoords.concat(polygon[0].map(function (c) { return [c[1], c[0]]; }));
        });
      }
      if (polyCoords.length > 0) {
        demPolygonLayer = L.polygon(polyCoords, {
          color: '#7c3aed',
          weight: 2.5,
          opacity: 0.9,
          fillColor: '#7c3aed',
          fillOpacity: 0.08,
          dashArray: '6,4'
        });
        demPolygonLayer.bindPopup(buildPolygonPopup(results), { maxWidth: 320, className: 'dem-poly-popup' });
        demOverlayGroup.addLayer(demPolygonLayer);
      }
    }

    // Add elevation points
    elevData.forEach(function (d) {
      if (d.elev === null || d.elev === undefined) return;
      var color = elevToColor(d.elev);
      var marker = L.circleMarker([d.lat, d.lng], {
        radius: 3,
        color: color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.8
      });
      var slopeInfo = findSlopeAtPoint(d.lat, d.lng, results);
      var color = elevToColor(d.elev);
      var aspectVal = findAspectAtPoint(d.lat, d.lng, results);
      var aspectLabel = aspectVal !== null ? aspectToCompass(aspectVal) : '-';
      var slopeLabel = slopeInfo.slope !== null ? slopeInfo.slope.toFixed(1) + '°' : '-';

      var popupHtml = '<div class="dem-popup">';
      popupHtml += '<div class="dem-popup-header" style="background:linear-gradient(135deg,' + color + ',' + color + 'cc);">';
      popupHtml += '<div class="dem-popup-elev">' + d.elev.toFixed(1) + '<span class="dem-popup-unit"> mdpl</span></div>';
      popupHtml += '<div class="dem-popup-coord">' + d.lat.toFixed(4) + ', ' + d.lng.toFixed(4) + '</div>';
      popupHtml += '</div>';
      popupHtml += '<div class="dem-popup-body">';
      popupHtml += '<div class="dem-popup-row"><span class="dem-popup-icon">📐</span><span class="dem-popup-label">Kemiringan</span><span class="dem-popup-val">' + slopeLabel + '</span></div>';
      popupHtml += '<div class="dem-popup-row"><span class="dem-popup-icon">🧭</span><span class="dem-popup-label">Arah Lereng</span><span class="dem-popup-val">' + aspectLabel + '</span></div>';
      popupHtml += '<div class="dem-popup-row"><span class="dem-popup-icon">📏</span><span class="dem-popup-label">Ketinggian</span><span class="dem-popup-val">' + d.elev.toFixed(0) + ' m</span></div>';
      popupHtml += '</div></div>';

      marker.bindPopup(popupHtml, { maxWidth: 220, className: 'dem-leaflet-popup' });
      demOverlayGroup.addLayer(marker);
    });
    if (map && !map.hasLayer(demOverlayGroup)) demOverlayGroup.addTo(map);
  }

  function buildPolygonPopup(r) {
    var aspectLabel = aspectToCompass(
      { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }[r.dominantAspect] || 0
    );
    var flowText = r.depressions > 5 ? 'Tinggi' : r.depressions > 2 ? 'Sedang' : 'Rendah';
    var flowColor = r.depressions > 5 ? '#dc2626' : r.depressions > 2 ? '#f59e0b' : '#22c55e';

    var html = '<div class="dem-popup">';
    html += '<div class="dem-popup-header" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);">';
    html += '<div class="dem-popup-elev" style="font-size:16px;">Topografi ' + escapeHtml(r.name) + '</div>';
    html += '<div class="dem-popup-coord">' + r.areaHa.toFixed(1) + ' ha · ' + r.pointCount + ' titik sample</div>';
    html += '</div>';
    html += '<div class="dem-popup-body" style="padding:8px 14px 12px;">';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;">';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">⛰️</span><span class="dem-popup-label">Elevasi</span><span class="dem-popup-val">' + r.elevMin.toFixed(0) + '–' + r.elevMax.toFixed(0) + ' m</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">📊</span><span class="dem-popup-label">Rata-rata</span><span class="dem-popup-val">' + r.elevAvg.toFixed(0) + ' m</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">📐</span><span class="dem-popup-label">Kemiringan</span><span class="dem-popup-val">' + r.slopeAvg.toFixed(1) + '°</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">🧭</span><span class="dem-popup-label">Aspek</span><span class="dem-popup-val">' + aspectLabel + '</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">🟢</span><span class="dem-popup-label">Datar</span><span class="dem-popup-val">' + r.flatPct.toFixed(0) + '%</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">🔴</span><span class="dem-popup-label">Curam</span><span class="dem-popup-val">' + r.steepPct.toFixed(0) + '%</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">💧</span><span class="dem-popup-label">Genangan</span><span class="dem-popup-val" style="color:#2563eb;">' + r.floodAreaHa.toFixed(1) + ' ha</span></div>';
    html += '<div class="dem-popup-row" style="border:none;"><span class="dem-popup-icon">⚠️</span><span class="dem-popup-label">Erosi</span><span class="dem-popup-val" style="color:#dc2626;">' + r.erosionAreaHa.toFixed(1) + ' ha</span></div>';
    html += '</div>';

    html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;font-size:9px;color:#94a3b8;text-align:center;">';
    html += 'Klik titik grid untuk detail elevasi · Data: SRTM ~30m';
    html += '</div></div></div>';
    return html;
  }

  function findSlopeAtPoint(lat, lng, results) {
    return { slope: null, aspect: null };
  }

  function findAspectAtPoint(lat, lng, results) {
    return null;
  }

  function clearDemOverlay() {
    if (map && map.hasLayer(demOverlayGroup)) map.removeLayer(demOverlayGroup);
    demOverlayGroup.clearLayers();
    demPolygonLayer = null;
    demPolygonGeoJSON = null;
    hideDemnas();
    var cb = document.getElementById('toggleDemnasOverlay');
    if (cb) cb.checked = false;
    var wrap = document.getElementById('demnasToggleWrap');
    if (wrap) wrap.style.display = 'none';
    var clearButton = document.getElementById('btnClearDem');
    if (clearButton) clearButton.style.display = 'none';
    var reportContainer = document.getElementById('dem-report-container');
    if (reportContainer) {
      reportContainer.innerHTML = '';
      reportContainer.style.display = 'none';
    }
  }

  /* ── Report card HTML ── */
  function buildTopoReport(r) {
    var aspectLabel = aspectToCompass(
      { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }[r.dominantAspect] || 0
    );

    var flowText = r.depressions > 5 ? 'Tinggi' : r.depressions > 2 ? 'Sedang' : 'Rendah';
    var floodText = r.floodAreaHa > 50 ? 'tinggi' : r.floodAreaHa > 10 ? 'sedang' : 'rendah';
    var erosionText = r.erosionAreaHa > 50 ? 'tinggi' : r.erosionAreaHa > 10 ? 'sedang' : 'rendah';

    var html = '<div class="topo-report-card">';
    html += '<div class="topo-header">Topografi ' + escapeHtml(r.name) + '</div>';

    html += '<div class="topo-grid">';

    html += '<div class="topo-stat"><div class="topo-stat-label">Elevasi</div>';
    html += '<div class="topo-stat-value">' + r.elevMin.toFixed(0) + '–' + r.elevMax.toFixed(0) + ' mdpl</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Rata-rata</div>';
    html += '<div class="topo-stat-value">' + r.elevAvg.toFixed(0) + ' mdpl</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Kemiringan rata-rata</div>';
    html += '<div class="topo-stat-value">' + r.slopeAvg.toFixed(1) + '°</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Kemiringan maks</div>';
    html += '<div class="topo-stat-value">' + r.slopeMax.toFixed(1) + '°</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Lahan datar</div>';
    html += '<div class="topo-stat-value">' + r.flatPct.toFixed(0) + '%</div>';
    html += '<div class="topo-bar"><div class="topo-bar-fill" style="width:' + r.flatPct + '%;background:#22c55e;"></div></div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Lahan curam</div>';
    html += '<div class="topo-stat-value">' + r.steepPct.toFixed(0) + '%</div>';
    html += '<div class="topo-bar"><div class="topo-bar-fill" style="width:' + r.steepPct + '%;background:#ef4444;"></div></div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Arah lereng dominan</div>';
    html += '<div class="topo-stat-value">' + aspectLabel + '</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Potensi konsentrasi aliran</div>';
    html += '<div class="topo-stat-value">' + flowText + '</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Area rawan genangan</div>';
    html += '<div class="topo-stat-value">' + r.floodAreaHa.toFixed(1) + ' ha</div></div>';

    html += '<div class="topo-stat"><div class="topo-stat-label">Area erosi tinggi</div>';
    html += '<div class="topo-stat-value">' + r.erosionAreaHa.toFixed(1) + ' ha</div></div>';

    html += '</div>';

    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;font-size:9px;color:#64748b;">';
    html += '<span>Luas: ' + r.areaHa.toFixed(1) + ' ha</span>';
    html += '<span>·</span>';
    html += '<span>' + r.pointCount + ' titik sample</span>';
    html += '<span>·</span>';
    html += '<span>Data: Open-Meteo SRTM ~30m</span>';
    html += '</div></div>';

    html += '<div style="margin-top:8px;">';
    html += '<div style="font-size:9px;font-weight:600;color:#64748b;margin-bottom:4px;">ELEVASI</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    var eScale = [
      { min: 0, max: 100, color: '#22c55e', label: '<100m' },
      { min: 100, max: 300, color: '#65a30d', label: '100-300m' },
      { min: 300, max: 500, color: '#84cc16', label: '300-500m' },
      { min: 500, max: 1000, color: '#eab308', label: '500-1000m' },
      { min: 1000, max: 1500, color: '#f97316', label: '1000-1500m' },
      { min: 1500, max: 2000, color: '#ef4444', label: '1500-2000m' },
      { min: 2000, max: 99999, color: '#991b1b', label: '>2000m' }
    ];
    eScale.forEach(function (s) {
      html += '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#475569;">';
      html += '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + s.color + ';"></span>';
      html += s.label + '</span>';
    });
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* ── Public API ── */
  window.ensureDemData = ensureDemData;
  window.searchDemAreas = searchDemAreas;
  window.runDemAnalysis = runDemAnalysis;
  window.clearDemOverlay = clearDemOverlay;
  window.buildTopoReport = buildTopoReport;

  /* ── UI initialization ── */
  document.addEventListener('DOMContentLoaded', function () {
    ensureDemData();

    var searchInput = document.getElementById('demVillageSearch');
    var resultsDiv = document.getElementById('demVillageResults');
    var selectedDiv = document.getElementById('demVillageSelected');
    var levelSelect = document.getElementById('demLevelMode');
    var levelLabel = document.getElementById('demLevelLabel');
    var btnRun = document.getElementById('btnRunDem');
    var btnClear = document.getElementById('btnClearDem');
    var progressDiv = document.getElementById('dem-progress');
    var progressFill = document.getElementById('dem-progress-fill');
    var progressText = document.getElementById('dem-progress-text');
    var reportContainer = document.getElementById('dem-report-container');

    if (!searchInput || !btnRun) return;

    var selectedKode = null;
    var selectedName = null;

    if (levelSelect) {
      levelSelect.addEventListener('change', function () {
        if (levelLabel) levelLabel.textContent = this.value === 'kabupaten' ? 'Kabupaten/Kota' : 'Desa/Kelurahan';
        searchInput.value = '';
        selectedKode = null;
        selectedName = null;
        if (selectedDiv) selectedDiv.style.display = 'none';
        if (resultsDiv) resultsDiv.style.display = 'none';
      });
    }

    var searchTimeout = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      var query = this.value.trim();
      if (query.length < 2) { resultsDiv.style.display = 'none'; return; }
      searchTimeout = setTimeout(function () {
        var level = levelSelect ? levelSelect.value : 'desa';
        var results = searchDemAreas(query, level);
        if (results.length === 0) { resultsDiv.style.display = 'none'; return; }
        resultsDiv.innerHTML = '';
        results.forEach(function (item) {
          var div = document.createElement('div');
          div.style.cssText = 'padding:8px 10px;cursor:pointer;font-size:11px;border-bottom:1px solid #f1f5f9;';
          div.textContent = item.nama;
          div.addEventListener('mouseenter', function () { this.style.background = '#f1f5f9'; });
          div.addEventListener('mouseleave', function () { this.style.background = ''; });
          div.addEventListener('click', function () {
            selectedKode = item.kode;
            selectedName = item.nama;
            searchInput.value = item.nama;
            resultsDiv.style.display = 'none';
            if (selectedDiv) { selectedDiv.textContent = item.nama + ' (' + item.kode + ')'; selectedDiv.style.display = 'block'; }
          });
          resultsDiv.appendChild(div);
        });
        resultsDiv.style.display = 'block';
      }, 200);
    });

    document.addEventListener('click', function (e) {
      if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = 'none';
      }
    });

    btnRun.addEventListener('click', async function () {
      if (!selectedKode) { alert('Pilih wilayah terlebih dahulu'); return; }

      btnRun.disabled = true;
      btnRun.innerHTML = '<span class="dem-spinner"></span> Memproses...';
      progressDiv.style.display = 'block';
      reportContainer.style.display = 'none';
      reportContainer.innerHTML = '';

      try {
        var level = levelSelect ? levelSelect.value : 'desa';
        var results = await runDemAnalysis(selectedKode, level, function (pct, msg) {
          progressFill.style.width = pct + '%';
          progressText.textContent = msg;
        });

        var html = buildTopoReport(results);
        reportContainer.innerHTML = html;
        reportContainer.style.display = 'block';
        if (btnClear) btnClear.style.display = 'block';
        if (demnasWrap) demnasWrap.style.display = 'flex';

        if (map && results.polygon) {
          var bounds = turf.bbox(results.polygon);
          map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]], { padding: [40, 40] });
        }
      } catch (err) {
        console.error('[DEM] Analysis error:', err);
        reportContainer.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:12px;text-align:center;">Gagal: ' + escapeHtml(err.message) + '</div>';
        reportContainer.style.display = 'block';
      } finally {
        btnRun.disabled = false;
        btnRun.innerHTML = 'Analisis Topografi';
        progressDiv.style.display = 'none';
      }
    });

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        clearDemOverlay();
        btnClear.style.display = 'none';
      });
    }

    var demnasCheckbox = document.getElementById('toggleDemnasOverlay');
    var demnasWrap = document.getElementById('demnasToggleWrap');
    if (demnasCheckbox) {
      demnasCheckbox.addEventListener('change', function () {
        if (this.checked) {
          showDemnas();
        } else {
          hideDemnas();
        }
      });
    }
  });
})();
