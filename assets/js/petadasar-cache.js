/* ═══════════════════════════════════════════════════════
   Petadasar BPN — Cached WMS Tile Layer
   ═══════════════════════════════════════════════════════
   Menyimpan tile PNG di IndexedDB agar tidak request
   ulang ke server saat user kembali ke area yang sama.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DB_NAME  = 'petadasar-bpn-cache';
  var DB_STORE = 'tiles';
  var DB_VER   = 1;
  var MAX_CACHE = 800;

  var _db = null;
  function openDB(cb) {
    if (_db) return cb(_db);
    if (!window.indexedDB) return cb(null);
    var req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = function (e) { _db = e.target.result; cb(_db); };
    req.onerror = function () { cb(null); };
  }

  function dbGet(key, cb) {
    openDB(function (db) {
      if (!db) return cb(null);
      try {
        var tx = db.transaction(DB_STORE, 'readonly');
        var r = tx.objectStore(DB_STORE).get(key);
        r.onsuccess = function () { cb(r.result || null); };
        r.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }

  function dbPut(key, val) {
    openDB(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(val, key);
      } catch (e) {}
    });
  }

  function dbCount(cb) {
    openDB(function (db) {
      if (!db) return cb(0);
      try {
        var tx = db.transaction(DB_STORE, 'readonly');
        var r = tx.objectStore(DB_STORE).count();
        r.onsuccess = function () { cb(r.result || 0); };
        r.onerror = function () { cb(0); };
      } catch (e) { cb(0); }
    });
  }

  function dbEvict(n) {
    openDB(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(DB_STORE, 'readwrite');
        var st = tx.objectStore(DB_STORE);
        var keys = [];
        st.openCursor().onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) { keys.push(cursor.key); cursor.continue(); }
          else {
            for (var i = 0; i < n && i < keys.length; i++) st.delete(keys[i]);
          }
        };
      } catch (e) {}
    });
  }

  function cacheKey(coords) {
    return coords.z + '/' + coords.x + '/' + coords.y;
  }

  /* ── Custom Cached WMS Tile Layer ── */
  L.TileLayer.WMS_Cached = L.TileLayer.WMS.extend({

    _createTile: function (coords, done) {
      var tile = L.DomUtil.create('img', '');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');

      this._loadTileCached(tile, coords, done);
      return tile;
    },

    _loadTileCached: function (tile, coords, done) {
      var self = this;
      var key  = cacheKey(coords);
      var src  = this.getTileUrl(coords);

      dbGet(key, function (cached) {
        if (cached) {
          var blobUrl = URL.createObjectURL(cached);
          tile.onload = function () {
            URL.revokeObjectURL(blobUrl);
            L.DomEvent.on(tile, 'load', L.bind(self._tileOnLoad, self, done, tile));
          };
          tile.onerror = L.bind(self._tileOnError, self, done, tile);
          tile.src = blobUrl;
          return;
        }

        fetch(src)
          .then(function (res) { return res.blob(); })
          .then(function (blob) {
            if (blob && blob.size > 100) {
              dbCount(function (cnt) {
                if (cnt >= MAX_CACHE) dbEvict(100);
                dbPut(key, blob);
              });
            }
            var blobUrl = URL.createObjectURL(blob);
            tile.onload = function () {
              URL.revokeObjectURL(blobUrl);
              L.DomEvent.on(tile, 'load', L.bind(self._tileOnLoad, self, done, tile));
            };
            tile.onerror = L.bind(self._tileOnError, self, done, tile);
            tile.src = blobUrl;
          })
          .catch(function () {
            tile.onload = L.bind(self._tileOnLoad, self, done, tile);
            tile.onerror = L.bind(self._tileOnError, self, done, tile);
            tile.src = src;
          });
      });
    }
  });

  L.TileLayer.wmsCached = function (url, options) {
    return new L.TileLayer.WMS_Cached(url, options);
  };

})();
