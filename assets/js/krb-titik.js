/* ── KRB Gunung Api Titik — BIG SatuPeta volcanic gas point layer ── */
(function () {
  'use strict';

  var KRB_TITIK_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/10';
  var krbTitikLayer = null;
  var krbTitikVisible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  var GAS_LABEL = { 1: 'Fumarol', 2: 'Gas Vulkanik Beracun', 3: 'Solfatara' };
  var GAS_COLOR = { 1: '#a855f7', 2: '#dc2626', 3: '#f59e0b' };

  function buildPopup(p) {
    var gasvul = p.gasvul || 0;
    var label = GAS_LABEL[gasvul] || 'Tidak Diketahui';
    var color = GAS_COLOR[gasvul] || '#6b7280';
    var namobj = p.namobj || '-';
    var remark = p.remark || '-';
    var indga = p.indga != null ? p.indga : '-';
    var vei = p.vei != null ? p.vei : '-';
    var eru = p.eru != null ? p.eru : '-';
    var lav = p.lav != null ? p.lav : '-';
    var matga = p.matga != null ? p.matga : '-';
    var victim = p.victim != null ? p.victim : '-';
    var koordx = p.koordx != null ? p.koordx : '-';
    var koordy = p.koordy != null ? p.koordy : '-';

    var html = '<div class="quake-popup" style="min-width:260px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>Gas Vulkanik</div>';
    html += '<div class="quake-popup-region">' + esc(namobj) + '</div>';
    html += '</div>';

    html += '<div style="padding:10px 14px">';
    html += '<span style="display:inline-block;background:' + color + ';color:#fff;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:8px;">' + esc(label) + '</span>';
    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kode</span><span class="quake-popup-detail-value">' + esc(p.lcode || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Indeks Ancaman</span><span class="quake-popup-detail-value">' + esc(indga) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">VEI</span><span class="quake-popup-detail-value">' + esc(vei) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Tipe Erupsi</span><span class="quake-popup-detail-value">' + esc(eru) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Tipe Lava</span><span class="quake-popup-detail-value">' + esc(lav) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Material</span><span class="quake-popup-detail-value">' + esc(matga) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Korban</span><span class="quake-popup-detail-value">' + esc(victim) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Koordinat</span><span class="quake-popup-detail-value">' + esc(koordy) + ', ' + esc(koordx) + '</span></div>';
    html += '</div></div>';

    if (remark && remark !== '-') {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
      html += '<div style="font-size:10px;font-weight:600;color:#64748b;margin-bottom:2px">KETERANGAN</div>';
      html += '<div style="font-size:11px;color:#475569;line-height:1.4">' + esc(remark) + '</div>';
      html += '</div>';
    }

    html += '<div class="quake-popup-footer"><span>Sumber: BIG SatuPeta · ' + esc(p.srs_id || '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function toggleKrbTitik(visible) {
    if (!visible) {
      if (krbTitikLayer && map.hasLayer(krbTitikLayer)) {
        map.removeLayer(krbTitikLayer);
      }
      krbTitikVisible = false;
      return;
    }

    if (krbTitikLayer) {
      if (!map.hasLayer(krbTitikLayer)) krbTitikLayer.addTo(map);
      krbTitikVisible = true;
      return;
    }

    krbTitikLayer = L.esri.featureLayer({
      url: KRB_TITIK_URL,
      where: '1=1',
      outFields: ['namobj', 'lcode', 'indga', 'vei', 'eru', 'lav', 'matga', 'gasvul', 'victim', 'remark', 'srs_id', 'koordx', 'koordy'],
      pointToLayer: function (feature, latlng) {
        var gasvul = feature.properties.gasvul;
        var color = GAS_COLOR[gasvul] || '#6b7280';
        return L.circleMarker(latlng, {
          radius: 6,
          color: color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.8
        });
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 340, className: 'quake-leaflet-popup' });
      }
    });

    krbTitikLayer.addTo(map);
    krbTitikVisible = true;

    krbTitikLayer.on('error', function (e) {
      console.error('[KRB Titik] Layer error:', e);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleKrbTitik');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      toggleKrbTitik(this.checked);
      var info = document.getElementById('krbTitikInfo');
      if (info) {
        info.textContent = this.checked ? 'Layer aktif' : 'Fumarol, Gas Vulkanik Beracun, Solfatara';
      }
    });
  });

  window.isKrbTitikActive = function () { return krbTitikVisible; };
})();
