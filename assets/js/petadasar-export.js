/* ═══════════════════════════════════════════════════════
   Export GeoTIFF Petadasar — extent viewport aktif
   WMS GetMap (PNG) → proxy CORS → encode GeoTIFF client-side
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var WMS_URL = 'https://petadasar.meritech.cloud/wms';
  var MAX_DIM = 4096;
  var PROXIES = [
    function (u) {
      return 'https://images.weserv.nl/?url=' + encodeURIComponent(u) + '&output=png';
    },
    function (u) {
      return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);
    }
  ];

  function setStatus(msg, isError) {
    var el = document.getElementById('petadasarTiffStatus');
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
  }

  function setBusy(busy) {
    var btn = document.getElementById('petadasarTiffBtn');
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('petadasar-export-busy', busy);
  }

  function getExportSize() {
    var map = window.map;
    if (!map) throw new Error('Peta tidak siap.');
    var size = map.getSize();
    var w = size.x;
    var h = size.y;
    var longest = Math.max(w, h);
    if (longest > MAX_DIM) {
      var scale = MAX_DIM / longest;
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    return { w: w, h: h };
  }

  function getWebMercatorBbox() {
    var map = window.map;
    if (!map) throw new Error('Peta tidak siap.');
    var b = map.getBounds();
    var sw = L.CRS.EPSG3857.project(b.getSouthWest());
    var ne = L.CRS.EPSG3857.project(b.getNorthEast());
    return {
      minX: sw.x,
      minY: sw.y,
      maxX: ne.x,
      maxY: ne.y
    };
  }

  function buildGetMapUrl(bbox, width, height) {
    return WMS_URL
      + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
      + '&LAYERS=petadasar&STYLES='
      + '&FORMAT=image/png&TRANSPARENT=true'
      + '&CRS=EPSG:3857'
      + '&BBOX=' + bbox.minX + ',' + bbox.minY + ',' + bbox.maxX + ',' + bbox.maxY
      + '&WIDTH=' + width + '&HEIGHT=' + height;
  }

  async function fetchPng(url) {
    var lastErr = null;
    for (var i = 0; i < PROXIES.length; i++) {
      var proxied = PROXIES[i](url);
      try {
        var res = await fetch(proxied, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var blob = await res.blob();
        if (!blob || blob.size < 50) throw new Error('Respons kosong');
        return blob;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Gagal mengunduh citra WMS.');
  }

  async function decodeRgbFlattened(blob) {
    var bitmap;
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    } else {
      bitmap = await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('Gagal decode PNG.')); };
        img.src = URL.createObjectURL(blob);
      });
    }
    var w = bitmap.width;
    var h = bitmap.height;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    var rgba = ctx.getImageData(0, 0, w, h).data;
    var rgb = new Uint8Array(w * h * 3);
    for (var i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    return { rgb: rgb, width: w, height: h };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function buildFilename(zoom, w, h) {
    var d = new Date();
    var date = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    return 'petadasar-' + date + '-z' + zoom + '-' + w + 'x' + h + '.tif';
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

  async function exportPetadasarGeoTiff() {
    if (typeof window.GeoTIFF === 'undefined' || typeof window.GeoTIFF.writeArrayBuffer !== 'function') {
      setStatus('Library geotiff.js belum termuat. Muat ulang halaman.', true);
      return;
    }
    if (!window.map || !L) {
      setStatus('Peta tidak siap.', true);
      return;
    }

    setBusy(true);
    setStatus('Menyiapkan extent viewport…');

    try {
      var size = getExportSize();
      var bbox = getWebMercatorBbox();
      var wmsUrl = buildGetMapUrl(bbox, size.w, size.h);

      if (window.currentBasemapName !== 'petadasar-bpn') {
        setStatus('Info: basemap aktif bukan Peta Dasar ATR/BPN — export tetap memakai WMS petadasar.');
      } else {
        setStatus('Mengunduh citra WMS (' + size.w + '×' + size.h + ')…');
      }

      var pngBlob = await fetchPng(wmsUrl);
      setStatus('Decode & encode GeoTIFF…');

      var decoded = await decodeRgbFlattened(pngBlob);
      var sx = (bbox.maxX - bbox.minX) / decoded.width;
      var sy = (bbox.maxY - bbox.minY) / decoded.height;

      var metadata = {
        width: decoded.width,
        height: decoded.height,
        SamplesPerPixel: [3],
        BitsPerSample: [8, 8, 8],
        PhotometricInterpretation: 2,
        PlanarConfiguration: 1,
        Compression: 1,
        ModelPixelScale: [sx, sy, 0],
        ModelTiepoint: [0, 0, 0, bbox.minX, bbox.maxY, 0],
        GTModelTypeGeoKey: 1,
        GTRasterTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 3857
      };

      var buffer = await window.GeoTIFF.writeArrayBuffer(decoded.rgb, metadata);
      var zoom = window.map.getZoom();
      var name = buildFilename(zoom, decoded.width, decoded.height);
      downloadArrayBuffer(buffer, name);
      setStatus('Berhasil: ' + name + ' (' + decoded.width + '×' + decoded.height + ', EPSG:3857).');
    } catch (err) {
      console.error('[petadasar-export]', err);
      setStatus('Gagal export: ' + (err && err.message ? err.message : err), true);
    } finally {
      setBusy(false);
    }
  }

  window.exportPetadasarGeoTiff = exportPetadasarGeoTiff;
})();
