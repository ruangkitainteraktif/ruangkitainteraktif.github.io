/* Katalog dan overlay RDTR Interaktif GISTARU untuk GeoTools > GeoPortal. */
(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var CATALOG_URL = 'assets/data/geooss/rdtr-catalog.json';
  var GISTARU_PROXY = 'https://gistaru-proxy.atrbpn.go.id/proxy.ashx?';
  var GISTARU_METADATA_PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var GISTARU_SERVICES = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/';
  /* Jalur utama overlay: relay PHP di hosting sendiri. Hanya di sanalah
     User-Agent Chrome dan Referer GISTARU benar-benar bisa disisipkan.
     Browser dilarang mengaturnya pada request <img>/fetch, sementara
     Cloudflare Workers dan Netlify Functions sama-sama membuang header
     Referer pada subrequest -- teruji 2026-10-30: set header identik dari
     Node/curl -> 200 image/png, dari kedua platform itu -> 403
     "Akses Tidak Sah." Tanpa jalur ini seluruh tile gagal. */
  var GISTARU_PHP_PROXY = 'https://proxy.ruangkita.net/proxy-gistaru.php?url=';
  var catalog = [];
  var active = new Map();
  var extentCache = new Map();
  var page = 0;

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').trim();
  }

  function safeText(node, value) {
    node.textContent = value == null ? '' : String(value);
  }

  function wilayahIndex() {
    var result = new Map();
    var rows = window.KODE_WILAYAH_DATA;
    if (!Array.isArray(rows)) return result;
    rows.forEach(function (row) {
      var code = String(row.kode || '').replace(/\D/g, '');
      if (code.length === 4 && !result.has(code)) result.set(code, row.nama || '');
    });
    return result;
  }

  function currentResults() {
    var input = document.getElementById('rdtrCatalogSearch');
    var query = normalize(input && input.value);
    if (!query) return catalog;
    return catalog.filter(function (item) {
      return normalize(item.rtr + ' ' + item.wilayahName + ' ' + item.wilayah).indexOf(query) !== -1;
    });
  }

  function setStatus(message, isError) {
    var node = document.getElementById('rdtrCatalogStatus');
    if (!node) return;
    safeText(node, message);
    node.classList.toggle('is-error', !!isError);
  }

  function makeLayerKey(item) {
    return item.url_mapserver + '/' + item.sublayer;
  }

  function render() {
    var root = document.getElementById('rdtrCatalogResults');
    var pageNode = document.getElementById('rdtrCatalogPage');
    var prev = document.getElementById('rdtrCatalogPrev');
    var next = document.getElementById('rdtrCatalogNext');
    if (!root) return;

    var found = currentResults();
    var pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
    page = Math.max(0, Math.min(page, pages - 1));
    var start = page * PAGE_SIZE;
    var showing = found.slice(start, start + PAGE_SIZE);
    root.replaceChildren();

    if (!showing.length) {
      var empty = document.createElement('div');
      empty.className = 'rdtr-catalog-empty';
      safeText(empty, 'Tidak ada RDTR yang cocok dengan pencarian.');
      root.appendChild(empty);
    }

    showing.forEach(function (item) {
      var key = makeLayerKey(item);
      var isActive = active.has(key);
      var row = document.createElement('article');
      row.className = 'rdtr-catalog-item' + (isActive ? ' is-active' : '');
      var details = document.createElement('div');
      details.className = 'rdtr-catalog-item-details';
      var title = document.createElement('strong');
      safeText(title, item.rtr || 'RDTR tanpa nama');
      var subtitle = document.createElement('small');
      safeText(subtitle, item.wilayahName + (item.integration_date ? ' | Integrasi ' + item.integration_date : ''));
      details.append(title, subtitle);

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rdtr-catalog-toggle' + (isActive ? ' is-on' : '');
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      safeText(button, isActive ? 'Sembunyikan' : 'Tampilkan');
      button.addEventListener('click', function () {
        if (active.has(key)) removeLayer(key);
        else addLayer(item, key, button);
        render();
      });
      row.append(details, button);
      root.appendChild(row);
    });

    if (pageNode) safeText(pageNode, found.length ? (start + 1) + '-' + Math.min(start + PAGE_SIZE, found.length) + ' dari ' + found.length : '0 hasil');
    if (prev) prev.disabled = page <= 0;
    if (next) next.disabled = page >= pages - 1;
    var clear = document.getElementById('rdtrCatalogClear');
    if (clear) clear.disabled = active.size === 0;
  }

  function addLayer(item, key, button) {
    if (!window.map || !window.L || !window.L.GridLayer || !window.L.point) {
      setStatus('Peta belum siap. Muat ulang halaman lalu coba lagi.', true);
      return;
    }
    var layer = createOverlay(item, window.map);
    var firstTileLoaded = false;
    layer.on('tileload', function () {
      if (firstTileLoaded) return;
      firstTileLoaded = true;
      setStatus(active.size + ' overlay aktif dari ' + catalog.length + ' RDTR.', false);
    });
    layer.on('tileerror', function (event) {
      console.error('[RDTR Interaktif] Tile overlay gagal:', item.rtr, event);
      if (!firstTileLoaded) {
        setStatus('Overlay ' + (item.rtr || 'RDTR') + ' gagal dimuat. Layanan GISTARU atau proxy gambar tidak merespons.', true);
      }
    });
    active.set(key, { layer: layer, item: item });
    layer.addTo(window.map);
    zoomToRdtr(item, key, layer);
    setStatus('Memuat overlay ' + (item.rtr || 'RDTR') + '…', false);
  }

  function removeLayer(key) {
    var entry = active.get(key);
    if (!entry) return;
    if (window.map && window.map.hasLayer(entry.layer)) window.map.removeLayer(entry.layer);
    active.delete(key);
    setStatus(active.size + ' overlay aktif dari ' + catalog.length + ' RDTR.', false);
  }

  // Klik overlay RDTR memakai panel identifikasi Persil Nasional yang sama.
  function identifyRdtrAtClick(event) {
    if (!active.size || !event || !event.latlng || !window.map) return;
    if (event.__bhumiPersilIdentifyHandled) return;
    if (typeof window.identifyBhumiPersilAt !== 'function') return;
    window.identifyBhumiPersilAt(event);
  }

  function esriExtentBounds(extent, fallbackSpatialReference) {
    if (!extent || !window.L) return null;
    var sr = extent.spatialReference || fallbackSpatialReference || {};
    var wkid = Number(sr.latestWkid || sr.wkid);
    var southWest, northEast;
    if (wkid === 4326 || wkid === 4269 || (!wkid && Math.abs(extent.xmin) <= 180 && Math.abs(extent.xmax) <= 180 && Math.abs(extent.ymin) <= 90 && Math.abs(extent.ymax) <= 90)) {
      southWest = [extent.ymin, extent.xmin];
      northEast = [extent.ymax, extent.xmax];
    } else if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
      var radius = 6378137;
      function toLatLng(x, y) {
        return [(2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI, x / radius * 180 / Math.PI];
      }
      southWest = toLatLng(extent.xmin, extent.ymin);
      northEast = toLatLng(extent.xmax, extent.ymax);
    } else {
      return null;
    }
    var bounds = window.L.latLngBounds(southWest, northEast);
    return bounds.isValid() ? bounds : null;
  }

  function fetchArcGISMetadata(url) {
    /* Kandidat pertama lewat relay PHP: hanya di sanalah User-Agent Chrome
       dan Referer GISTARU bisa disisipkan, dan tanpa keduanya /proxy.ashx
       membalas 403 "Akses Tidak Sah." Dua kandidat berikutnya disimpan
       sebagai cadangan kalau hosting relay sedang tidak terjangkau. */
    var candidates = [
      GISTARU_PHP_PROXY + encodeURIComponent(GISTARU_PROXY + url),
      GISTARU_PROXY + url,
      GISTARU_METADATA_PROXY + url
    ];
    function tryCandidate(index, lastError) {
      if (index >= candidates.length) return Promise.reject(lastError || new Error('Semua proxy metadata gagal'));
      return fetch(candidates[index]).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (metadata) {
        if (metadata && metadata.error) throw new Error(metadata.error.message || 'ArcGIS metadata error');
        return metadata;
      }).catch(function (error) {
        return tryCandidate(index + 1, error);
      });
    }
    return tryCandidate(0, null);
  }

  function zoomToRdtr(item, key, layer) {
    var cached = extentCache.get(key);
    if (cached) {
      if (active.has(key) && window.map.hasLayer(layer)) {
        window.map.flyToBounds(cached, { padding: [20, 20], maxZoom: 15, duration: 1.1 });
      }
      return;
    }
    var metadataUrl = GISTARU_SERVICES + item.url_mapserver + '/' + item.sublayer + '?f=json';
    fetchArcGISMetadata(metadataUrl).then(function (metadata) {
      if (metadata && metadata.error) throw new Error(metadata.error.message || 'ArcGIS metadata error');
      var bounds = esriExtentBounds(metadata && (metadata.extent || metadata.fullExtent), metadata && metadata.spatialReference);
      if (bounds) return bounds;
      var queryUrl = GISTARU_SERVICES + item.url_mapserver + '/' + item.sublayer +
        '/query?where=1%3D1&returnExtentOnly=true&outSR=4326&f=json';
      return fetchArcGISMetadata(queryUrl).then(function (queryMetadata) {
        if (queryMetadata && !queryMetadata.error) {
          var queryBounds = esriExtentBounds(queryMetadata.extent, queryMetadata.spatialReference);
          if (queryBounds) return queryBounds;
        }
        return null;
      }).catch(function () {
        return null;
      }).then(function (queryBounds) {
        if (queryBounds) return queryBounds;
        var serviceUrl = GISTARU_SERVICES + item.url_mapserver + '?f=json';
        return fetchArcGISMetadata(serviceUrl).then(function (serviceMetadata) {
          if (serviceMetadata && serviceMetadata.error) throw new Error(serviceMetadata.error.message || 'ArcGIS service metadata error');
          return esriExtentBounds(serviceMetadata && (serviceMetadata.fullExtent || serviceMetadata.initialExtent), serviceMetadata && serviceMetadata.spatialReference);
        });
      });
    }).then(function (bounds) {
      if (!bounds) throw new Error('Extent layer dan service tidak tersedia atau proyeksinya tidak dikenal');
      extentCache.set(key, bounds);
      if (active.has(key) && window.map.hasLayer(layer)) {
        window.map.flyToBounds(bounds, { padding: [20, 20], maxZoom: 15, duration: 1.1 });
      }
    }).catch(function (error) {
      console.warn('[RDTR Interaktif] Gagal membaca extent:', item.rtr, error);
      if (active.has(key) && item.fallbackView && item.fallbackView.center) {
        var center = item.fallbackView.center;
        window.map.setView(center, item.fallbackView.zoom || 14, { animate: true });
        setStatus('Overlay aktif. Bounds resmi tidak tersedia; peta diarahkan ke titik fokus perkiraan.', false);
        return;
      }
      if (active.has(key)) setStatus('Overlay aktif, tetapi bounds ' + (item.rtr || 'RDTR') + ' gagal dibaca: ' + ((error && error.message) || 'metadata tidak tersedia') + '.', true);
    });
  }

  function buildExportTileUrl(item, coords, map) {
    var tileSize = 256;
    var northWest = map.unproject(window.L.point(coords.x * tileSize, coords.y * tileSize), coords.z);
    var southEast = map.unproject(window.L.point((coords.x + 1) * tileSize, (coords.y + 1) * tileSize), coords.z);
    var northWestMeters = map.options.crs.project(northWest);
    var southEastMeters = map.options.crs.project(southEast);
    var bbox = [northWestMeters.x, southEastMeters.y, southEastMeters.x, northWestMeters.y].join(',');
    var service = GISTARU_SERVICES + item.url_mapserver + '/export';
    var target = GISTARU_PROXY + service + '?bbox=' + bbox +
      '&bboxSR=102100&imageSR=102100&size=' + tileSize + ',' + tileSize +
      '&dpi=96&format=png32&transparent=true&layers=show%3A' + encodeURIComponent(item.sublayer) + '&f=image';
    /* /proxy.ashx milik GISTARU menolak tile yang Referer-nya bukan situs
       mereka -- balasannya 403 "Akses Tidak Sah.", sehingga overlay tidak
       pernah tampil sama sekali. Browser DILARANG mengganti User-Agent dan
       Referer pada request <img>, jadi keduanya harus disisipkan oleh relay
       PHP di server. Memuat langsung /proxy.ashx dari browser tidak akan
       pernah berhasil; jalur inilah yang membalas 200 image/png. Relay juga
       menyetel Cache-Control, sehingga tile tersimpan di browser dan
       panning/zoom terasa lancar. */
    return GISTARU_PHP_PROXY + encodeURIComponent(target);
  }

  function createOverlay(item, map) {
    var tileSize = 256;
    var GridLayer = window.L.GridLayer.extend({
      createTile: function (coords, done) {
        var tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.onload = function () { done(null, tile); };
        tile.onerror = function (error) {
          console.error('[RDTR Interaktif] URL tile gagal:', tile.src);
          done(error, tile);
        };
        tile.src = buildExportTileUrl(item, coords, map);
        return tile;
      }
    });
    return new GridLayer({
      tileSize: tileSize,
      opacity: 0.72,
      updateWhenIdle: true,
      keepBuffer: 1,
      attribution: 'ATR/BPN GISTARU · RDTR Interaktif'
    });
  }

  function init() {
    var root = document.getElementById('rdtrInteraktifCard');
    if (!root || root.dataset.rdtrReady) return;
    root.dataset.rdtrReady = '1';

    if (window.map && !window.map.__rdtrIdentifyBound) {
      window.map.__rdtrIdentifyBound = true;
      window.map.on('click', identifyRdtrAtClick);
    }

    var search = document.getElementById('rdtrCatalogSearch');
    if (search) search.addEventListener('input', function () { page = 0; render(); });
    document.getElementById('rdtrCatalogPrev').addEventListener('click', function () { page -= 1; render(); });
    document.getElementById('rdtrCatalogNext').addEventListener('click', function () { page += 1; render(); });
    document.getElementById('rdtrCatalogClear').addEventListener('click', function () {
      Array.from(active.keys()).forEach(removeLayer);
      render();
      setStatus('Semua overlay RDTR dinonaktifkan.', false);
    });

    fetch(CATALOG_URL).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (payload) {
      var names = wilayahIndex();
      catalog = (payload.data || []).map(function (item) {
        var key = String(item.wilayah || '');
        return Object.assign({}, item, { wilayahName: names.get(key.slice(0, 4)) || ('Wilayah ' + key) });
      }).sort(function (a, b) {
        return (a.wilayahName + a.rtr).localeCompare(b.wilayahName + b.rtr, 'id');
      });
      render();
      setStatus(catalog.length + ' RDTR tersedia dalam katalog; pilih overlay untuk ditampilkan.', false);
    }).catch(function (error) {
      console.error('[RDTR Interaktif] Gagal memuat katalog:', error);
      setStatus('Katalog RDTR gagal dimuat. Periksa koneksi lalu muat ulang halaman.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
