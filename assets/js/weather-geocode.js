  // Geocoding Reverse Klik Peta ke ADM4
  function stripAdmPrefix(name) {
    return normalizeWeatherSearch(name)
      .replace(/^(kabupaten|kab|kota administrasi|kota adm|kota|provinsi|daerah khusus ibukota|daerah khusus ibu kota|daerah istimewa|di|dki)\b\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchesToken(a, b) {
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  // Cocokkan hierarki Provinsi -> Kab/Kota -> Kecamatan -> Desa dengan
  // pencocokan nama yang toleran agar desa dengan nama sama di wilayah lain
  // tidak salah dipilih. Fallback ke level administrasi terdekat.
  function matchKemendagri({ desa, kecamatan, kabkota, provinsi }) {
    const pool = provinsi
      ? weatherSearchLocations.filter(item => matchesToken(stripAdmPrefix(item.provinsi), provinsi))
      : weatherSearchLocations;

    const byKabkota = kabkota
      ? pool.filter(item => matchesToken(stripAdmPrefix(item.kabkota), kabkota))
      : pool;
    const candidates = byKabkota.length ? byKabkota : pool;

    const byKecamatan = kecamatan
      ? candidates.filter(item => matchesToken(stripAdmPrefix(item.kecamatan), kecamatan))
      : [];
    const kecPool = byKecamatan.length ? byKecamatan : candidates;

    if (desa) {
      const byDesa = kecPool.find(item => matchesToken(stripAdmPrefix(item.desa), desa));
      if (byDesa) return byDesa;
    }
    if (kecPool.length) return kecPool[0];
    if (candidates.length) return candidates[0];
    return pool[0] || null;
  }

  // Geocoding Reverse Klik Peta ke ADM4.
  // Memakai ArcGIS (bukan Nominatim) karena geocode.arcgis.com mengizinkan CORS
  // dari browser, sedangkan Nominatim tidak mengirim header Access-Control-Allow-Origin
  // sehingga request lintas origin dari browser selalu diblokir.
  async function findAdm4ByCoordinates(lat, lng) {
    window._lastClickLat = lat;
    window._lastClickLng = lng;
    const fallback = () => fetchWeatherBMKG('31.71.03.1001');
    try {
      const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=${lng},${lat}`);
      const data = await res.json();

      if (data && data.address) {
        const addr = data.address;
        const provinsi = stripAdmPrefix(addr.Region || '');
        const kabkota = stripAdmPrefix(addr.Subregion || addr.MetroArea || '');
        const kecamatan = stripAdmPrefix(addr.City || addr.District || '');
        const desa = stripAdmPrefix(addr.Neighborhood || addr.PlaceName || '');

        const matched = matchKemendagri({ desa, kecamatan, kabkota, provinsi });
        if (matched) {
          console.info('Reverse geocode cuaca:', matched.desa, '-', matched.kecamatan, '-', matched.kabkota, '(', matched.kode, ')');
          fetchWeatherBMKG(matched.kode);
          return;
        }
      }

      fallback();
    } catch (err) {
      console.warn("Geocoding cuaca gagal, fallback ke default:", err);
      fallback();
    }
  }
