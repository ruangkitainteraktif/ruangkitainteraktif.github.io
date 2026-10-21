/* ═══════════════════════════════════════════════════════
   Export GeoTIFF Persil Nasional (BHUMI) — extent viewport aktif
   Pola mengikuti petadasar-export.js, tetapi server persil hanya
   melayani tile tepat 512×512, jadi viewport di-mozzaik dari
   tile /mprx/service LAYERS=bhumi_persil → crop → GeoTIFF.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var UPSTREAM = 'https://bhumi.atrbpn.go.id/mprx/service';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var TILE = 512;
  var HALF = 20037508.342789244;
  var MAX_DIM = 4096;
  var MAX_TILES = 80;
  var MIN_ZOOM = 10;
  var RECOMMENDED_ZOOM = 14;

  var _statusTimer = null;
  var _cancelled = false;

  function setStatus(msg, isError, autoHideMs) {
    var el = document.getElementById('persilTiffStatus');
    if (_statusTimer) {
      clearTimeout(_statusTimer);
      _statusTimer = null;
    }
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('petadasar-tiff-status--error');
      return;
    }
    el.style.display = '';
    el.textContent = msg;
    el.classList.toggle('petadasar-tiff-status--error', !!isError);
    if (autoHideMs) {
      _statusTimer = setTimeout(function () {
        _statusTimer = null;
        setStatus('');
      }, autoHideMs);
    }
  }

  function setBusy(busy) {
    var btn = document.getElementById('persilTiffBtn');
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('petadasar-export-busy', busy);
  }

  function getWebMercatorBbox() {
    var map = window.map;
    if (!map) throw new Error('Peta tidak siap.');
    var b = map.getBounds();
    var sw = L.CRS.EPSG3857.project(b.getSouthWest());
    var ne = L.CRS.EPSG3857.project(b.getNorthEast());
    return { minX: sw.x, minY: sw.y, maxX: ne.x, maxY: ne.y };
  }

  function tileUrl(tx, ty, z) {
    var span = (HALF * 2) / Math.pow(2, z - 1);
    var minX = -HALF + tx * span;
    var maxY = HALF - ty * span;
    var bbox = minX + ',' + (maxY - span) + ',' + (minX + span) + ',' + maxY;
    var upstream = UPSTREAM +
      '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
      '&FORMAT=image%2Fpng&TRANSPARENT=true' +
      '&LAYERS=bhumi_persil&STYLES=' +
      '&SRS=EPSG:3857&CRS=EPSG:3857&TILED=true' +
      '&WIDTH=' + TILE + '&HEIGHT=' + TILE +
      '&BBOX=' + bbox;
    return PROXY + encodeURIComponent(upstream);
  }

  function looksLikePng(buf) {
    if (!buf || buf.byteLength < 24) return false;
    var u8 = new Uint8Array(buf, 0, 8);
    return u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
  }

  async function fetchTile(tx, ty, z) {
    var lastErr = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var res = await fetch(tileUrl(tx, ty, z), { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 50) throw new Error('Respons kosong');
        if (!looksLikePng(buf)) throw new Error('Respons bukan PNG');
        if (typeof createImageBitmap === 'function') {
          return await createImageBitmap(new Blob([buf], { type: 'image/png' }));
        }
        return await new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error('Gagal decode PNG.')); };
          img.src = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
        });
      } catch (e) {
        lastErr = e;
        if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1200); });
      }
    }
    throw lastErr || new Error('Gagal mengunduh tile ' + tx + '/' + ty);
  }

  function downloadArrayBuffer(buffer, filename) {
    var blob = new Blob([buffer], { type: 'image/tiff' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function buildFilename(zoom, w, h) {
    var d = new Date();
    var date = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var jam = pad2(d.getHours()) + pad2(d.getMinutes());
    return 'persil-nasional-' + date + '-' + jam + '-z' + zoom + '-' + w + 'x' + h + '.tif';
  }

  function isPersilActive() {
    return !!(window.isBhumiPersilNasionalLayerActive && window.isBhumiPersilNasionalLayerActive());
  }

  function syncExportVisibility() {
    var block = document.getElementById('persilTiffExportBlock');
    var hint = document.getElementById('persilTiffHint');
    if (!block) return;
    var show = isPersilActive();
    block.style.display = show ? '' : 'none';
    if (hint) hint.style.display = show ? '' : 'none';
    if (!show) {
      setStatus('');
      block.style.top = '';
      block.style.bottom = '';
      var btn = document.getElementById('persilTiffBtn');
      if (btn) { btn.disabled = false; btn.classList.remove('petadasar-export-busy'); }
      return;
    }
    // Posisi dinamis: menempel di bawah quick layer; bila blok Petadasar
    // ikut tampil, digeser 6px di bawahnya agar tidak tumpang tindih
    // (tinggi blok Petadasar berubah-ubah karena hint/status).
    var pet = document.getElementById('petadasarExportBlock');
    var petShow = pet && pet.style.display !== 'none';
    var mobile = window.innerWidth <= 700;
    if (mobile) {
      block.style.top = '';
      block.style.bottom = petShow ? Math.max(60, Math.round(pet.getBoundingClientRect().top - 6)) + 'px' : '';
    } else {
      block.style.bottom = '';
      block.style.top = petShow ? Math.round(pet.getBoundingClientRect().bottom + 6) + 'px' : '';
    }
  }

  function bindVisibility() {
    syncExportVisibility();
    if (syncExportVisibility._bound) return;
    syncExportVisibility._bound = true;
    // Pantau toggle layer lewat checkbox katalog + interval ringan (layer bisa
    // diaktifkan dari kartu alat lain tanpa event khusus).
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.layerId === 'toggleBhumiPersilNasionalLayer') {
        syncExportVisibility();
      }
    }, true);
    setInterval(syncExportVisibility, 800);
  }

  async function exportPersilGeoTiff() {
    if (typeof window.GeoTIFF === 'undefined' || typeof window.GeoTIFF.writeArrayBuffer !== 'function') {
      setStatus('Library geotiff.js belum termuat. Muat ulang halaman.', true, 8000);
      return;
    }
    if (!window.map || !L) {
      setStatus('Peta tidak siap.', true, 8000);
      return;
    }
    if (!isPersilActive()) {
      setStatus('Aktifkan dulu layer Persil Nasional (BHUMI).', true, 8000);
      return;
    }

    var zoom = window.map.getZoom();
    if (zoom < MIN_ZOOM) {
      setStatus('Zoom minimal ' + MIN_ZOOM + ' untuk export persil.', true, 8000);
      return;
    }
    if (zoom === 13) {
      setStatus('Zoom 13 bermasalah di server BHUMI. Gunakan zoom 12 atau 14+.', true, 8000);
      return;
    }
    if (zoom < RECOMMENDED_ZOOM) {
      setStatus('Zoom ' + zoom + ': detail persil minimal terlihat pada zoom ' + RECOMMENDED_ZOOM + '. Lanjut…', false, 4000);
    }

    _cancelled = false;
    setBusy(true);

    try {
      var bbox = getWebMercatorBbox();
      var span = (HALF * 2) / Math.pow(2, zoom - 1);
      var eps = span / 1e6;
      var tx0 = Math.floor((bbox.minX + HALF) / span + eps);
      var tx1 = Math.floor((bbox.maxX + HALF) / span - eps);
      var ty0 = Math.floor((HALF - bbox.maxY) / span + eps);
      var ty1 = Math.floor((HALF - bbox.minY) / span - eps);
      var nTiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
      if (nTiles < 1 || nTiles > MAX_TILES) {
        throw new Error('Area viewport membutuhkan ' + nTiles + ' tile (maks ' + MAX_TILES + '). Perbesar zoom.');
      }

      var originX = -HALF + tx0 * span;
      var originY = HALF - ty0 * span;
      var mosaicW = (tx1 - tx0 + 1) * TILE;
      var mosaicH = (ty1 - ty0 + 1) * TILE;
      var canvas = document.createElement('canvas');
      canvas.width = mosaicW;
      canvas.height = mosaicH;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

      setStatus('Mengunduh ' + nTiles + ' tile persil (zoom ' + zoom + ')…');
      var done = 0;
      var failed = [];
      var queue = [];
      for (var ty = ty0; ty <= ty1; ty++) {
        for (var tx = tx0; tx <= tx1; tx++) queue.push([tx, ty]);
      }
      var workers = Math.min(4, queue.length);
      async function worker() {
        while (queue.length) {
          if (_cancelled) return;
          var pair = queue.shift();
          var wtx = pair[0], wty = pair[1];
          try {
            var bmp = await fetchTile(wtx, wty, zoom);
            ctx.drawImage(bmp, (wtx - tx0) * TILE, (wty - ty0) * TILE);
            if (bmp.close) bmp.close();
          } catch (eTile) {
            failed.push(wtx + '/' + wty + ': ' + (eTile && eTile.message));
          }
          done++;
          setStatus('Mengunduh tile ' + done + '/' + nTiles + '…');
        }
      }
      await Promise.all(Array.from({ length: workers }, worker));
      if (_cancelled) { setStatus('Dibatalkan.', true, 4000); return; }
      if (failed.length === nTiles) {
        throw new Error('Semua tile gagal. Coba lagi atau perbesar zoom.');
      }

      // Crop mozaik ke extent viewport yang presisi
      var sx = (bbox.minX - originX) / span * TILE;
      var sy = (originY - bbox.maxY) / span * TILE;
      var sw = (bbox.maxX - bbox.minX) / span * TILE;
      var sh = (bbox.maxY - bbox.minY) / span * TILE;
      var outW = Math.max(1, Math.round(sw));
      var outH = Math.max(1, Math.round(sh));
      if (Math.max(outW, outH) > MAX_DIM) {
        var scale = MAX_DIM / Math.max(outW, outH);
        outW = Math.max(1, Math.round(outW * scale));
        outH = Math.max(1, Math.round(outH * scale));
      }

      var outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      var octx = outCanvas.getContext('2d', { willReadFrequently: true });
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, outW, outH);
      octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, outW, outH);

      setStatus('Encode GeoTIFF…');
      var rgba = octx.getImageData(0, 0, outW, outH).data;
      var rgb = new Uint8Array(outW * outH * 3);
      for (var i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
      }

      var resX = (bbox.maxX - bbox.minX) / outW;
      var resY = (bbox.maxY - bbox.minY) / outH;
      var metadata = {
        width: outW,
        height: outH,
        SamplesPerPixel: [3],
        BitsPerSample: [8, 8, 8],
        PhotometricInterpretation: 2,
        PlanarConfiguration: 1,
        Compression: 1,
        ModelPixelScale: [resX, resY, 0],
        ModelTiepoint: [0, 0, 0, bbox.minX, bbox.maxY, 0],
        GTModelTypeGeoKey: 1,
        GTRasterTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 3857
      };

      var buffer = await window.GeoTIFF.writeArrayBuffer(rgb, metadata);
      var name = buildFilename(zoom, outW, outH);
      downloadArrayBuffer(buffer, name);
      var note = failed.length ? ' (' + failed.length + ' tile kosong/gagal, diganti putih)' : '';
      setStatus('Berhasil: ' + name + ' (' + outW + '×' + outH + ' m/piksel ' + resX.toFixed(2) + ', EPSG:3857)' + note + '.', false, 5000);
    } catch (err) {
      console.error('[persil-geotiff-export]', err);
      setStatus('Gagal export: ' + (err && err.message ? err.message : err), true, 8000);
    } finally {
      setBusy(false);
    }
  }

  window.exportPersilGeoTiff = exportPersilGeoTiff;
  window.cancelPersilGeoTiff = function () { _cancelled = true; };
  window.syncPersilTiffExportVisibility = syncExportVisibility;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindVisibility);
  } else {
    bindVisibility();
  }
  if (!window.map) {
    var bootTries = 0;
    var bootTimer = setInterval(function () {
      bootTries++;
      if (window.map) {
        clearInterval(bootTimer);
        bindVisibility();
      } else if (bootTries > 40) {
        clearInterval(bootTimer);
        syncExportVisibility();
      }
    }, 250);
  }
})();
