/* ── Kawasan Rawan Bencana Gunung Api — BIG SatuPeta layer ── */
(function () {
  'use strict';

  var KRB_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/11';
  var krbLayer = null;
  var krbLoaded = false;
  var krbVisible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getKrbColor(indga) {
    if (indga === 3) return { color: '#dc2626', fillColor: '#dc2626' };
    if (indga === 2) return { color: '#ec4899', fillColor: '#ec4899' };
    return { color: '#eab308', fillColor: '#eab308' };
  }

  function getKrbLabel(indga) {
    if (indga === 3) return 'KRB III';
    if (indga === 2) return 'KRB II';
    return 'KRB I';
  }

  function buildPopup(p) {
    var indga = p.indga || 0;
    var label = getKrbLabel(indga);
    var c = getKrbColor(indga);
    var namobj = p.namobj || '-';
    var thterbit = p.thterbit || '-';
    var remark = p.remark || '-';
    var clapi = p.clapi != null ? p.clapi : '-';
    var eru = p.eru != null ? p.eru : '-';
    var vei = p.vei != null ? p.vei : '-';
    var lav = p.lav != null ? p.lav : '-';
    var matga = p.matga != null ? p.matga : '-';
    var vic = p.vic != null ? p.vic : '-';
    var dur = p.dur != null ? p.dur : '-';

    var html = '<div class="quake-popup" style="min-width:260px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + c.color + '"></span>Kawasan Rawan Bencana</div>';
    html += '<div class="quake-popup-region">' + esc(namobj) + '</div>';
    html += '</div>';

    html += '<div style="padding:10px 14px">';
    html += '<span style="display:inline-block;background:' + c.color + ';color:#fff;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:8px;">' + esc(label) + '</span>';
    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kode</span><span class="quake-popup-detail-value">' + esc(p.lcode || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Tahun Terbit</span><span class="quake-popup-detail-value">' + esc(thterbit) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">VEI</span><span class="quake-popup-detail-value">' + esc(vei) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Jenis Letusan</span><span class="quake-popup-detail-value">' + esc(eru) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Material</span><span class="quake-popup-detail-value">' + esc(matga) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Lava</span><span class="quake-popup-detail-value">' + esc(lav) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Korban Jiwa</span><span class="quake-popup-detail-value">' + esc(vic) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Durasi (jam)</span><span class="quake-popup-detail-value">' + esc(dur) + '</span></div>';
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

  function toggleKrbGunungApi(visible) {
    if (!visible) {
      if (krbLayer && map.hasLayer(krbLayer)) {
        map.removeLayer(krbLayer);
      }
      krbVisible = false;
      return;
    }

    if (krbLayer) {
      if (!map.hasLayer(krbLayer)) krbLayer.addTo(map);
      krbVisible = true;
      return;
    }

    krbLayer = L.esri.featureLayer({
      url: KRB_URL,
      where: '1=1',
      outFields: ['namobj', 'lcode', 'thterbit', 'clapi', 'depmag', 'eru', 'indga', 'lav', 'matga', 'mon', 'remark', 'srs_id', 'tek', 'vei', 'vic', 'dur'],
      style: function (feature) {
        var indga = feature.properties.indga;
        var c = getKrbColor(indga);
        return { color: c.color, weight: 1, fillColor: c.fillColor, fillOpacity: 0.35 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 340, className: 'quake-leaflet-popup' });
      }
    });

    krbLayer.addTo(map);
    krbVisible = true;

    krbLayer.on('error', function (e) {
      console.error('[KRB Gunung Api] Layer error:', e);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleKrbGunungApi');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      toggleKrbGunungApi(this.checked);
      var info = document.getElementById('krbGunungApiInfo');
      if (info) {
        info.textContent = this.checked ? 'Layer aktif' : '74 gunung api aktif beserta status aktivitas dari MAGMA PVMBG';
      }
    });
  });

  window.isKrbGunungApiActive = function () { return krbVisible; };
})();
