/* ── Gerakan Tanah Indonesia — PVMBG/MAGMA ground movement layer ── */
(function () {
  'use strict';

  var GERTAN_URL = 'assets/data/gerakan-tanah.json';

  var gertanClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  var gertanLoaded = false;
  var gertanVisible = false;

  var ZKG_COLOR = {
    'RENDAH': '#22c55e',
    'MENENGAH': '#f59e0b',
    'TINGGI': '#dc2626'
  };

  var ZKG_LABEL = {
    'RENDAH': 'Rendah',
    'MENENGAH': 'Menengah',
    'TINGGI': 'Tinggi'
  };

  var TGT_ICON = {
    'Longsoran Translasi': '&#9660;',
    'Longsoran Rotasi/Nendatan': '&#9660;',
    'Aliran': '&#9654;',
    'Jatuhan': '&#9660;',
    'Gabungan/Kompleks': '&#9888;',
    'Lainnya': '&#9679;'
  };

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getMarkerColor(d) {
    var tgs = d.tanggapan;
    if (!tgs || !tgs.qls_zkg || !tgs.qls_zkg.length) return '#6b7280';
    var zones = tgs.qls_zkg;
    if (zones.indexOf('TINGGI') !== -1) return ZKG_COLOR['TINGGI'];
    if (zones.indexOf('MENENGAH') !== -1) return ZKG_COLOR['MENENGAH'];
    return ZKG_COLOR['RENDAH'];
  }

  function getMarkerIcon(color) {
    return L.divIcon({
      className: 'gertan-marker-icon',
      html: '<div style="'
        + 'width:16px;height:16px;'
        + 'background:' + color + ';'
        + 'border:2px solid #fff;'
        + 'border-radius:3px;'
        + 'box-shadow:0 1px 4px rgba(0,0,0,.35);'
        + 'display:flex;align-items:center;justify-content:center;'
        + 'font-size:9px;color:#fff;font-weight:700;'
        + '">&#9650;</div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -9]
    });
  }

  function buildPopup(d) {
    var tgs = d.tanggapan || {};
    var color = getMarkerColor(d);

    var zones = (tgs.qls_zkg || []).join(', ') || '-';
    var tgt = tgs.qls_tgt || '-';
    var mgt = tgs.qls_mgt || '-';
    var sba = (tgs.qls_sba || []).join(', ') || '-';
    var mrl = (tgs.qls_mrl || []).join(', ') || '-';
    var cau = (tgs.qls_cau || []).join(', ') || '-';
    var tgl = (tgs.qls_tgl || []).join(', ') || '-';
    var air = (tgs.qls_air || []).join(', ') || '-';
    var frm = tgs.qls_frm || '-';
    var jbt = tgs.qls_jbt || '-';
    var elv = tgs.qls_elv || '-';
    var rec = tgs.rekomendasi && tgs.rekomendasi.qls_rec ? tgs.rekomendasi.qls_rec : null;
    var foto = (tgs.foto_kejadian || []);

    var html = '<div class="agol-popup" style="min-width:260px">';
    html += '<div class="agol-popup-header agol-geo-gertan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Gerakan Tanah</div>';
    html += '<div class="agol-popup-title">' + esc(d.crs_cty || '-') + '</div>';
    html += '<div class="agol-popup-subtitle">' + esc(d.crs_prv || '-') + '</div>';
    html += '</div>';

    html += '<div class="agol-popup-body">';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">';
    html += '<span style="display:inline-block;background:' + color + ';color:#fff;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;">Zona ' + esc(zones) + '</span>';
    html += '<span style="display:inline-block;background:#f1f5f9;color:#475569;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600;">' + esc(tgt) + '</span>';
    html += '</div>';

    html += '<div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tanggal</span><span class="agol-popup-field-value">' + esc(d.date || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Material</span><span class="agol-popup-field-value">' + esc(mgt) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Topografi</span><span class="agol-popup-field-value">' + esc(sba) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kemiringan</span><span class="agol-popup-field-value">' + esc(mrl) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Elevasi</span><span class="agol-popup-field-value">' + esc(elv) + ' m</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tutupan Lahan</span><span class="agol-popup-field-value">' + esc(tgl) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Sumber Air</span><span class="agol-popup-field-value">' + esc(air) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Formasi</span><span class="agol-popup-field-value">' + esc(frm) + '</span></div>';
    html += '</div>';

    if (jbt && jbt !== '-') {
      html += '<div class="agol-popup-remark" style="border-left-color:#94a3b8;"><div class="agol-popup-remark-title">Jenis Batuan</div><div class="agol-popup-remark-text">' + esc(jbt) + '</div></div>';
    }

    if (cau && cau !== '-') {
      html += '<div class="agol-popup-remark" style="border-left-color:#ea580c;"><div class="agol-popup-remark-title">Penyebab</div><div class="agol-popup-remark-text">' + esc(cau) + '</div></div>';
    }

    if (rec) {
      html += '<div class="agol-popup-remark" style="border-left-color:#0891b2;"><div class="agol-popup-remark-title">Rekomendasi</div><div class="agol-popup-remark-text" style="font-style:italic;">' + esc(rec) + '</div></div>';
    }

    if (foto.length > 0) {
      html += '<div style="margin-top:10px">';
      html += '<div class="agol-popup-remark-title" style="margin-bottom:6px;">Foto Kejadian</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
      for (var i = 0; i < Math.min(foto.length, 3); i++) {
        if (foto[i].qls_fst) {
          html += '<a href="' + esc(foto[i].qls_fst) + '" target="_blank" rel="noopener">';
          html += '<img src="' + esc(foto[i].qls_fst) + '" style="width:60px;height:45px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;" loading="lazy">';
          html += '</a>';
        }
      }
      html += '</div></div>';
    }

    html += '</div>';
    html += '<div class="agol-popup-footer"><span>Sumber: PVMBG/MAGMA · ' + esc(d.crs_ids || '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function placeGertanMarkers(data) {
    gertanClusterGroup.clearLayers();
    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      var lat = parseFloat(d.crs_lat);
      var lon = parseFloat(d.crs_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      var color = getMarkerColor(d);
      var marker = L.marker([lat, lon], { icon: getMarkerIcon(color) });
      marker.bindPopup(buildPopup(d), { maxWidth: 360, className: 'agol-leaflet-popup' });
      gertanClusterGroup.addLayer(marker);
    }
  }

  async function fetchGertan() {
    if (gertanLoaded) return;
    var info = document.getElementById('gertanInfo');
    try {
      var res = await fetch(GERTAN_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      placeGertanMarkers(json);
      gertanLoaded = true;
      if (info) info.textContent = json.length + ' kejadian gerakan tanah';
    } catch (e) {
      console.error('[Gertan] Gagal memuat gerakan-tanah.json:', e);
      if (info) info.textContent = 'Gagal memuat data gerakan tanah';
    }
  }

  function showGertan() {
    if (gertanClusterGroup.getLayers().length === 0) return;
    if (!map.hasLayer(gertanClusterGroup)) gertanClusterGroup.addTo(map);
    gertanVisible = true;
  }

  function hideGertan() {
    if (map.hasLayer(gertanClusterGroup)) map.removeLayer(gertanClusterGroup);
    gertanVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleGertanLayer');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchGertan().then(function () { showGertan(); });
      } else {
        hideGertan();
      }
    });
  });

  window.isGertanLayerActive = function () { return gertanVisible; };
})();
