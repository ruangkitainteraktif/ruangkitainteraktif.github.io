(function () {
  'use strict';

  var steps = [
    { title: 'Cari wilayah', text: 'Ketik nama provinsi, kabupaten/kota, kecamatan, atau desa pada kolom pencarian. Pilih hasil yang sesuai untuk memusatkan peta.', target: '#unifiedSearch', action: null },
    { title: 'Atur basemap', text: 'Di sheet Alat, buka bagian Basemap. Pilih salah satu kartu peta untuk mengganti tampilan dasar; layer tematik yang sudah aktif tetap tersimpan.', target: '#drawBasemapHost .lc-category', fallback: '#dmBasemapCard', action: function () { closeSheets(['al', 'geodata']); if (window.openDrawSidebar) window.openDrawSidebar(); var e = document.getElementById('dmBasemapCard'); if (e) e.open = true; } },
    { title: 'Pilih peta tematik', text: 'Di GeoData, buka Katalog Peta. Telusuri kategori atau gunakan kolom pencarian, lalu tambahkan layer yang dibutuhkan ke Layer Aktif.', target: '#mapCatalogList .lc-category', fallback: '#mapCatalogSearchHost', action: function () { closeSheets(['al', 'dm']); if (window.openGeoDataSheet) window.openGeoDataSheet(); var e = document.getElementById('mapCatalogCard'); if (e) e.open = true; } },
    { title: 'Kelola Layer Aktif', text: 'Layer yang sudah ditambahkan dikelola dari sheet Layer Aktif. Di sana Anda dapat menyalakan atau mematikan layer, mengatur urutannya, dan membuka tabel jika tersedia.', target: '#activeLayersSidebar', action: function () { closeSheets(['geodata', 'dm']); if (window.openActiveLayersSidebar) window.openActiveLayersSidebar(); } },
    { title: 'Impor data sendiri', text: 'Buka GeoData untuk mengimpor SHP, GeoJSON, GPX, KMZ, tabel koordinat X,Y, atau menambahkan layanan ArcGIS REST dan GeoServer. Periksa sistem koordinat sebelum menampilkan data.', target: '#geodata-sheet', action: function () { closeSheets(['al', 'dm']); if (window.openGeoDataSheet) window.openGeoDataSheet(); } },
    { title: 'Gambar dan ukur', text: 'Pada bagian Draw, pilih Point, Line, Polygon, Rectangle, atau Circle untuk menggambar. Gulir sedikit ke bagian Measure di bawahnya untuk mengukur jarak atau luas.', target: '#dmDrawCard', action: function () { closeSheets(['al', 'geodata']); var basemap = document.getElementById('dmBasemapCard'); if (basemap) basemap.open = false; var draw = document.getElementById('dmDrawCard'); if (draw) draw.open = true; var measure = document.getElementById('dmMeasureCard'); if (measure) measure.open = true; if (window.openDrawSidebar) window.openDrawSidebar(); } },
    { title: 'Baca legenda dan tabel', text: 'Legenda menjelaskan simbol layer yang aktif. Tabel menampilkan atribut fitur. Klik objek pada peta untuk membuka detailnya jika layer menyediakan informasi fitur.', target: '#legendSidebar', action: function () { if (window.openLegendSidebar) window.openLegendSidebar(); } },
    { title: 'Siap menjelajah', text: 'Aktifkan hanya layer yang diperlukan agar peta mudah dibaca. Anda bisa membuka panduan ini lagi melalui tombol bantuan di pojok kanan atas.', target: '#unifiedSearch', action: null }
  ];
  var current = 0, overlay, card, spotlight, resizeTimer, welcomeWasOpen = false;

  function closeSheets(ids) {
    if (!window.SheetDrag) return;
    ids.forEach(function (id) { window.SheetDrag.close(id); });
  }

  function build() {
    if (overlay) return;
    addGuideFab();

    overlay = document.createElement('div'); overlay.className = 'rk-guide-overlay'; overlay.hidden = true;
    overlay.innerHTML = '<div class="rk-guide-spotlight" aria-hidden="true"></div><section class="rk-guide-card" role="dialog" aria-modal="true" aria-labelledby="rkGuideTitle"><div class="rk-guide-top"><span class="rk-guide-kicker">PANDUAN RUANGKITA</span><button type="button" class="rk-guide-close" aria-label="Tutup panduan">×</button></div><div class="rk-guide-progress"></div><h2 id="rkGuideTitle"></h2><p class="rk-guide-copy"></p><div class="rk-guide-actions"><button type="button" class="rk-guide-prev">Sebelumnya</button><span class="rk-guide-count"></span><button type="button" class="rk-guide-next">Lanjut</button></div></section>';
    document.body.appendChild(overlay);
    card = overlay.querySelector('.rk-guide-card'); spotlight = overlay.querySelector('.rk-guide-spotlight');
    overlay.querySelector('.rk-guide-close').addEventListener('click', stop);
    overlay.querySelector('.rk-guide-prev').addEventListener('click', function () { show(current - 1); });
    overlay.querySelector('.rk-guide-next').addEventListener('click', function () { if (current === steps.length - 1) stop(); else show(current + 1); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) stop(); });
    document.addEventListener('keydown', function (e) { if (!overlay.hidden && e.key === 'Escape') stop(); });
    window.addEventListener('resize', function () { if (!overlay.hidden) position(); });
  }
  function addGuideFab() {
    var items = document.querySelector('.map-fab-items');
    if (!items) return;
    var item = items.querySelector('.rk-guide-fab');
    if (!item) {
      item = document.createElement('button');
      item.type = 'button'; item.className = 'map-fab-item rk-guide-fab';
      item.title = 'Panduan'; item.setAttribute('aria-label', 'Buka panduan RUANGKITA');
      item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.6 9a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.7"></path><path d="M12 17h.01"></path></svg>';
      item.addEventListener('click', function (e) { e.stopPropagation(); start(); });
    }
    var legend = items.querySelector('.legend-sidebar-btn');
    if (legend && legend.nextElementSibling !== item) legend.insertAdjacentElement('afterend', item);
    else if (!legend && !item.parentNode) items.appendChild(item);
  }
  function start() {
    build();
    var welcome = document.getElementById('welcomeFeatureModal');
    welcomeWasOpen = !!(welcome && welcome.classList.contains('open'));
    if (welcome) welcome.classList.remove('open');
    overlay.hidden = false; document.body.classList.add('rk-guide-open'); show(0);
  }
  function stop() {
    if (!overlay) return;
    overlay.hidden = true; document.body.classList.remove('rk-guide-open'); spotlight.classList.remove('is-visible');
    if (welcomeWasOpen && typeof window.closeWelcomeModal === 'function') window.closeWelcomeModal();
    welcomeWasOpen = false;
  }
  function show(index) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    var step = steps[current];
    if (step.action) step.action();
    overlay.querySelector('#rkGuideTitle').textContent = step.title;
    overlay.querySelector('.rk-guide-copy').textContent = step.text;
    overlay.querySelector('.rk-guide-count').textContent = (current + 1) + ' / ' + steps.length;
    overlay.querySelector('.rk-guide-progress').style.width = (((current + 1) / steps.length) * 100) + '%';
    overlay.querySelector('.rk-guide-prev').disabled = current === 0;
    overlay.querySelector('.rk-guide-next').textContent = current === steps.length - 1 ? 'Selesai' : 'Lanjut';
    clearTimeout(resizeTimer); resizeTimer = setTimeout(position, step.action ? 420 : 120);
  }
  function position() {
    var step = steps[current], target = step && document.querySelector(step.target);
    if ((!target || !target.getClientRects().length) && step && step.fallback) target = document.querySelector(step.fallback);
    spotlight.classList.remove('is-visible');
    if (target && target.getClientRects().length) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      requestAnimationFrame(function () {
        if (!overlay || overlay.hidden) return;
        var r = target.getBoundingClientRect(), pad = 7;
        spotlight.style.left = Math.max(4, r.left - pad) + 'px'; spotlight.style.top = Math.max(4, r.top - pad) + 'px';
        spotlight.style.width = Math.max(24, Math.min(window.innerWidth - 8, r.width + pad * 2)) + 'px';
        spotlight.style.height = Math.max(24, Math.min(window.innerHeight - 8, r.height + pad * 2)) + 'px';
        spotlight.classList.add('is-visible');
        var pindahKeAtas = r.top > window.innerHeight * (window.innerWidth <= 767 ? 0.38 : 0.55);
        card.style.top = pindahKeAtas ? (window.innerWidth <= 767 ? '12px' : '18px') : 'auto';
        card.style.bottom = pindahKeAtas ? 'auto' : (window.innerHeight < 640 ? '18px' : '28px');
      });
    } else {
      card.style.top = 'auto'; card.style.bottom = window.innerHeight < 640 ? '18px' : '28px';
    }
    card.style.left = '50%'; card.style.transform = 'translateX(-50%)';
  }
  window.startRuangKitaWalkthrough = start;
  document.addEventListener('DOMContentLoaded', build);
  window.setTimeout(addGuideFab, 700);
})();
