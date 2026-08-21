/* ── Universal map-layer loading spinner overlay ──
 * Shows a transparent spinner over the map whenever a map-layer
 * checkbox is toggled on, and hides it when the layer finishes
 * loading. Works for all checkbox-driven layers without touching
 * individual toggle handlers (refcounted + Leaflet load events).
 */
(function () {
  'use strict';

  var SAFETY_TIMEOUT = 4000;

  var overlay = document.createElement('div');
  overlay.className = 'map-loading-overlay';
  overlay.innerHTML = '<div class="map-loading-spinner" role="status" aria-label="Memuat layer..."></div>';

  var mapEl = document.getElementById('map');
  if (mapEl) mapEl.appendChild(overlay);

  var pending = 0;

  function show() {
    if (pending === 0 && overlay) overlay.classList.add('active');
    pending++;
  }

  function hideOne() {
    pending = Math.max(0, pending - 1);
    if (pending === 0 && overlay) overlay.classList.remove('active');
  }

  // 1. Detect map-layer checkbox toggles (capture phase, works before handlers run)
  document.addEventListener('change', function (e) {
    var cb = e.target;
    if (!cb || cb.type !== 'checkbox' || !cb.checked) return;
    var isLayer = /^(toggle|geoidToggle)/.test(cb.id) ||
      (cb.closest && (cb.closest('.cctv-layer-toggle') || cb.closest('.geoid-check')));
    if (isLayer) {
      show();
      setTimeout(hideOne, SAFETY_TIMEOUT);
    }
  }, true);

  // 2. Hide when the added layer actually finishes loading
  if (typeof map !== 'undefined') {
    map.on('layeradd', function (ev) {
      var l = ev && ev.layer;
      if (l && typeof l.once === 'function') {
        l.once('load', hideOne);
        l.once('tileloadend', hideOne);
      }
    });
  }

  window.LayerLoading = { show: show, hide: hideOne };
})();
