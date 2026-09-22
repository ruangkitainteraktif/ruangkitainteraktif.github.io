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
  var DB_VER   = 2;
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

    createTile: function (coords, done) {
      var tile = L.DomUtil.create('img', '');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');

      this._loadTileCached(tile, coords, done);
      return tile;
    },

    _loadTileCached: function (tile, coords, done) {
      var self = this;
      var src  = this.getTileUrl(coords);
      // Include the rendered URL so a change to the WMS request cannot reuse
      // an incompatible tile from a previous layer configuration.
      var key  = src;

      function setTileSource(source) {
        tile.onload = function () {
          if (source.indexOf('blob:') === 0) URL.revokeObjectURL(source);
          self._tileOnLoad(done, tile);
        };
        tile.onerror = function () {
          if (source.indexOf('blob:') === 0) URL.revokeObjectURL(source);
          self._tileOnError(done, tile);
        };
        tile.src = source;
      }

      dbGet(key, function (cached) {
        if (cached) {
          setTileSource(URL.createObjectURL(cached));
          return;
        }

        fetch(src)
          .then(function (res) {
            if (!res.ok) throw new Error('WMS request failed: ' + res.status);
            return res.blob();
          })
          .then(function (blob) {
            if (blob && blob.size > 100) {
              dbCount(function (cnt) {
                if (cnt >= MAX_CACHE) dbEvict(100);
                dbPut(key, blob);
              });
            }
            setTileSource(URL.createObjectURL(blob));
          })
          .catch(function () {
            setTileSource(src);
          });
      });
    }
  });

  L.TileLayer.wmsCached = function (url, options) {
    return new L.TileLayer.WMS_Cached(url, options);
  };

})();
