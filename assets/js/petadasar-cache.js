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

  /* ── Sumber tile ──
     Utamakan endpoint XYZ: ~150-200 ms per tile dan berisi data asli
     (16-51 KB). Endpoint WMS hanya jadi cadangan: dari pengujian ia
     mengembalikan PNG putih kosong 919 B pada semua lokasi yang dicek,
     dan untuk tile kecil butuh 7-12 detik.

     PENTING soal IndexedDB: NEITHER endpoint mengirim header
     Access-Control-Allow-Origin (dan OPTIONS membalas 405). Artinya
     fetch() di browser SELALU gagal CORS -- bukan karena tile rusak,
     tapi karena browser menolak membacanya. Versi lama memakai fetch()
     lebih dulu, jadi setiap tile melakukan dua unduhan penuh: satu
     fetch yang percuma gagal, lalu satu <img>. Flag corsBlocked di
     bawah membuat kelas ini mencoba fetch() hanya sekali; setelah itu
     semua tile langsung lewat <img> dan di-cache oleh HTTP cache
     browser (server mengirim max-age 604800 untuk XYZ). */
  var XYZ_BASE = 'https://petadasar.meritech.cloud/tile/';
  var XYZ_MIN_Z = 16;
  var XYZ_MAX_Z = 21;

  /* Tileplaceholder yang koordinatnya salah sudah terukur 776 B, sedangkan
     tile berisi 16-51 KB. Ambang 3 KB memisahkan keduanya dengan jauh,
     sehingga tile yang pasti kosong tidak dianggap Request Sukses. */
  var MIN_PLAUSIBLE_BYTES = 3000;

  /* null = belum dicoba, true = fetch berhasil, false = diblokir CORS. */
  var corsWorks = null;

  function xyzUrl(coords) {
    if (coords.z < XYZ_MIN_Z || coords.z > XYZ_MAX_Z) return null;
    return XYZ_BASE + coords.z + '/' + coords.x + '/' + coords.y + '.jpg';
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
      var wmsUrl = this.getTileUrl(coords);
      var xyz = xyzUrl(coords);

      /* Urutan sumber: XYZ dulu, WMS cadangan. WMS tetap dimasukkan walau
         di luar rentang XYZ (mis. di bawah z16) supaya perlakuannya
         tidak berubah mendadak saat pengguna zoom. */
      var sources = [];
      if (xyz) sources.push(xyz);
      if (wmsUrl) sources.push(wmsUrl);
      if (!sources.length) { self._tileOnError(done, tile); return; }

      function setTileSource(source, onFail) {
        var isBlob = source.indexOf('blob:') === 0;
        tile.onload = function () {
          if (isBlob) URL.revokeObjectURL(source);
          self._tileOnLoad(done, tile);
        };
        tile.onerror = function () {
          if (isBlob) URL.revokeObjectURL(source);
          if (typeof onFail === 'function') onFail();
          else self._tileOnError(done, tile);
        };
        tile.src = source;
      }

      function attempt(index) {
        if (index >= sources.length) { self._tileOnError(done, tile); return; }
        var src = sources[index];
        var next = function () { attempt(index + 1); };

        /* Sudah tahu fetch diblokir CORS → langsung <img>, satu unduhan. */
        if (corsWorks === false) { setTileSource(src, next); return; }

        dbGet(src, function (cached) {
          if (cached) { setTileSource(URL.createObjectURL(cached), next); return; }

          fetch(src)
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.blob();
            })
            .then(function (blob) {
              if (blob && blob.size < MIN_PLAUSIBLE_BYTES) {
                /* Terlalu kecil untuk jadi data asli: perlakukan sebagai
                 * placeholder, jangan sampai tersimpan dan di-cache. */
                next();
                return;
              }
              corsWorks = true;
              if (blob && blob.size > 100) {
                dbCount(function (cnt) {
                  if (cnt >= MAX_CACHE) dbEvict(100);
                  dbPut(src, blob);
                });
              }
              setTileSource(URL.createObjectURL(blob), next);
            })
            .catch(function () {
              /* Network gagal atau -- jauh lebih mungkin -- CORS. Sekali
                 tahu, jangan ulangi percobaan mahal ini untuk tiap tile. */
              if (corsWorks === null) corsWorks = false;
              setTileSource(src, next);
            });
        });
      }

      attempt(0);
    }
  });

  L.TileLayer.wmsCached = function (url, options) {
    return new L.TileLayer.WMS_Cached(url, options);
  };

})();
