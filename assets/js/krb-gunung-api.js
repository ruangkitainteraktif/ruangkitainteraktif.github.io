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

    var html = '<div class="agol-popup" style="min-width:260px">';
    html += '<div class="agol-popup-header agol-geo-krb">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Kawasan Rawan Bencana</div>';
    html += '<div class="agol-popup-title">' + esc(namobj) + '</div>';
    html += '<div class="agol-popup-subtitle">' + esc(label) + '</div>';
    html += '</div>';

    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kode</span><span class="agol-popup-field-value">' + esc(p.lcode || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tahun Terbit</span><span class="agol-popup-field-value">' + esc(thterbit) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">VEI</span><span class="agol-popup-field-value">' + esc(vei) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis Letusan</span><span class="agol-popup-field-value">' + esc(eru) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Material</span><span class="agol-popup-field-value">' + esc(matga) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Lava</span><span class="agol-popup-field-value">' + esc(lav) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Korban Jiwa</span><span class="agol-popup-field-value">' + esc(vic) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Durasi (jam)</span><span class="agol-popup-field-value">' + esc(dur) + '</span></div>';
    html += '</div>';

    if (remark && remark !== '-') {
      html += '<div class="agol-popup-remark"><div class="agol-popup-remark-title">Keterangan</div><div class="agol-popup-remark-text">' + esc(remark) + '</div></div>';
    }

    html += '</div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BIG SatuPeta · ' + esc(p.srs_id || '-') + '</span></div>';
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
        layer.bindPopup(buildPopup(feature.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
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
