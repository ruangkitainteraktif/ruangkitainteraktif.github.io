/* ── Sampling elevasi dari AWS Terrain Tiles (format Terrarium) ── */
/* elev = (R*256 + G + B/256) - 32768, satu piksel per 256px tile. */
(function () {
  'use strict';

  var TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var TILE_SIZE = 256;
  var BASE_ZOOM = 13;
  var MIN_ZOOM = 6;
  var MAX_TILES = 64;
  var CONCURRENCY = 8;
  var TILE_TIMEOUT = 30000;
  var CACHE_LIMIT = 256;
  // Batas nilai wajar; di luar itu dianggap tanpa data (mis. laut = RGB 0,0,0).
  var MIN_ELEV = -500;
  var MAX_ELEV = 9000;
  var EARTH_RADIUS_M = 6378137;

  var tileCache = new Map();

  function tileXY(lat, lng, z) {
    var n = Math.pow(2, z);
    var latRad = lat * Math.PI / 180;
    var safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    latRad = safeLat * Math.PI / 180;
    return {
      x: (lng + 180) / 360 * n,
      y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
    };
  }

  function loadTile(z, x, y) {
    var key = z + '/' + x + '/' + y;
    if (tileCache.has(key)) return tileCache.get(key);

    var promise = new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var timer = setTimeout(function () {
        reject(new Error('Tile ' + key + ' waktu habis.'));
      }, TILE_TIMEOUT);

      img.onload = function () {
        clearTimeout(timer);
        try {
          var canvas = document.createElement('canvas');
          canvas.width = TILE_SIZE;
          canvas.height = TILE_SIZE;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('Canvas tile elevasi tidak tersedia.');
          ctx.drawImage(img, 0, 0);
          var rgba = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
          var values = new Float32Array(TILE_SIZE * TILE_SIZE);
          for (var i = 0, j = 0; i < values.length; i++, j += 4) {
            values[i] = (rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256) - 32768;
          }
          resolve(values);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = function () {
        clearTimeout(timer);
        reject(new Error('Tile ' + key + ' gagal dimuat.'));
      };
      img.src = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });

    tileCache.set(key, promise);
    promise.catch(function () { tileCache.delete(key); });

    if (tileCache.size > CACHE_LIMIT) {
      var oldest = tileCache.keys().next().value;
      if (oldest !== undefined) tileCache.delete(oldest);
    }
    return promise;
  }

  function uniqueTiles(points, z) {
    var seen = {};
    var count = 0;
    for (var i = 0; i < points.length; i++) {
      var pos = tileXY(points[i].lat, points[i].lng, z);
      var tx = Math.floor(pos.x);
      var ty = Math.floor(pos.y);
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || ty < 0) continue;
      var key = z + '/' + tx + '/' + ty;
      if (!seen[key]) { seen[key] = true; count++; }
    }
    return { count: count, seen: seen };
  }

  async function prefetch(tiles) {
    var keys = Object.keys(tiles);
    var index = 0;
    var values = {};
    var firstError = null;

    async function worker() {
      while (index < keys.length) {
        var key = keys[index++];
        var parts = key.split('/');
        try {
          values[key] = await loadTile(Number(parts[0]), Number(parts[1]), Number(parts[2]));
        } catch (error) {
          if (!firstError) firstError = error;
        }
      }
    }

    var workers = [];
    for (var w = 0; w < Math.min(CONCURRENCY, keys.length); w++) workers.push(worker());
    await Promise.all(workers);
    return { values: values, error: firstError };
  }

  function metersPerPixel(lat, z) {
    return Math.cos(lat * Math.PI / 180) * 2 * Math.PI * EARTH_RADIUS_M / (TILE_SIZE * Math.pow(2, z));
  }

  /**
   * Ambil elevasi untuk sekumpulan titik dari AWS Terrain Tiles (Terrarium).
   * @param {Array<{lat:number,lng:number}>} points
   * @param {number[]} bbox [minX,minY,maxX,maxY]
   * @param {function(number,string):void} [progressCb]
   * @returns {Promise<{results:Array, resolutionM:number, coverage:number}>}
   */
  async function fetchTerrariumElevations(points, bbox, progressCb) {
    if (!points || !points.length) throw new Error('Tidak ada titik sample untuk diambil.');

    var z = BASE_ZOOM;
    while (z > MIN_ZOOM && uniqueTiles(points, z).count > MAX_TILES) z--;

    var centerLat = (bbox[1] + bbox[3]) / 2;
    var resolutionM = metersPerPixel(centerLat, z);

    if (progressCb) progressCb(20, 'Memuat tile elevasi (~' + Math.round(resolutionM) + ' m)...');
    var tiles = uniqueTiles(points, z).seen;
    var fetched = await prefetch(tiles);
    if (progressCb) progressCb(28, 'Membaca elevasi ' + Object.keys(tiles).length + ' tile...');

    var results = [];
    for (var i = 0; i < points.length; i++) {
      var point = points[i];
      var pos = tileXY(point.lat, point.lng, z);
      var tx = Math.floor(pos.x);
      var ty = Math.floor(pos.y);
      var limit = Math.pow(2, z);
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || tx < 0 || tx >= limit || ty < 0 || ty >= limit) continue;
      var key = z + '/' + tx + '/' + ty;
      var tile = fetched.values[key];
      if (!tile) continue;

      var px = Math.floor((pos.x - tx) * TILE_SIZE);
      var py = Math.floor((pos.y - ty) * TILE_SIZE);
      if (px < 0) px = 0; else if (px >= TILE_SIZE) px = TILE_SIZE - 1;
      if (py < 0) py = 0; else if (py >= TILE_SIZE) py = TILE_SIZE - 1;

      var elev = tile[py * TILE_SIZE + px];
      if (!Number.isFinite(elev) || elev < MIN_ELEV || elev > MAX_ELEV) continue;
      results.push({ lat: point.lat, lng: point.lng, elev: elev });
    }

    if (!results.length) {
      throw new Error(fetched.error
        ? 'Tile elevasi tidak dapat dimuat: ' + fetched.error.message
        : 'Tidak ada piksel elevasi valid pada titik sample.');
    }

    return {
      results: results,
      resolutionM: resolutionM,
      coverage: results.length / points.length
    };
  }

  window.fetchTerrariumElevations = fetchTerrariumElevations;
})();
