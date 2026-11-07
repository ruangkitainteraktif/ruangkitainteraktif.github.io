/* =============================================================================
 * GEOPROCESSING WORKER (assets/js/geoprocessing-worker.js)
 *
 * Web Worker untuk eksekusi tool Geoprocessing di latar belakang sehingga UI
 * tidak freeze saat layer besar. Pesan yang masuk:
 *
 *   { type: 'run', seq, job }   -> job = { op, params, inputs, env }
 *
 * Balasan (dengan seq yang sama):
 *   { type: 'progress', value, label }
 *   { type: 'result',   payload }     payload = { features, crs, skipped }
 *   { type: 'error',    message, cancelled }
 *
 * Pembatalan dilakukan utama lewat worker.terminate() dari halaman; seandainya
 * ada pesan run yang tertinggal, isCancelled() di bawah langsung membuangnya.
 *
 * importScripts di bawah membutuhkan header Access-Control-Allow-Origin;
 * unpkg dan cdnjs sama-sama mengirim `*`, jadi keduanya aman dipakai.
 * Bila salah satu gagal dimuat, event `error` pada halaman menjatuhkan eksekusi
 * ke fallback main thread (lihat GPC.execute di geoprocessing-core.js).
 * ============================================================================= */
'use strict';

importScripts(
  'https://unpkg.com/jsts@2.12.0/dist/jsts.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js',
  'geoprocessing-core.js'
);

var currentSeq = null;

onmessage = function (event) {
  var msg = event.data;
  if (!msg || msg.type !== 'run') return;
  currentSeq = msg.seq;
  GPC.runJob(msg.job, {
    onProgress: function (value, label) {
      postMessage({ seq: msg.seq, type: 'progress', value: value, label: label });
    },
    isCancelled: function () { return currentSeq !== msg.seq; }
  }).then(function (payload) {
    postMessage({ seq: msg.seq, type: 'result', payload: payload });
  }, function (error) {
    postMessage({
      seq: msg.seq,
      type: 'error',
      message: (error && error.message) || String(error),
      cancelled: !!(error && error.cancelled)
    });
  });
};
