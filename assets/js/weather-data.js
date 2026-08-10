  // ==============================================================
  // DATA ADM4 KEMENDAGRI, SEARCH AUTOCOMPLETE & 38 MARKER BMKG
  // ==============================================================

  let kemendagriData = [];
  let weatherSearchLocations = [];
  let kecamatanSearchIndex = [];
  let provinsiSearchIndex = [];
  let kabkotaSearchIndex = [];
  let weatherSearchTimer;
  const WEATHER_SEARCH_LIMIT = 3;

  function normalizeWeatherSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('id-ID');
  }

  function isAdm4Code(kode) {
    return /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(String(kode || ''));
  }

  // Muat kode wilayah lokal. Berkas hanya berisi kode/nama bertingkat,
  // sehingga konteks administrasi dibentuk dari kode induknya.
  async function loadKemendagriData() {
    try {
      const response = await fetch('assets/data/kode_wilayah.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      kemendagriData = Array.isArray(payload) ? payload : (payload.value || []);
      if (!Array.isArray(kemendagriData)) throw new Error('Format kode_wilayah.json tidak valid');

      const wilayahByKode = new Map(kemendagriData.map(item => [String(item.kode), item]));
      weatherSearchLocations = kemendagriData
        .filter(item => isAdm4Code(item.kode))
        .map(item => {
          const [provinsiKode, kabKotaKode, kecamatanKode] = String(item.kode).split('.');
          const kecamatan = wilayahByKode.get(`${provinsiKode}.${kabKotaKode}.${kecamatanKode}`)?.nama || '';
          const kabkota = wilayahByKode.get(`${provinsiKode}.${kabKotaKode}`)?.nama || '';
          const provinsi = wilayahByKode.get(provinsiKode)?.nama || '';
          const location = {
            kode: String(item.kode),
            desa: item.nama || '',
            kecamatan,
            kabkota,
            provinsi
          };
          location.searchText = normalizeWeatherSearch([
            location.desa,
            location.kecamatan,
            location.kabkota,
            location.provinsi,
            location.kode
          ].join(' '));
          return location;
        });



      const kecSeen = new Map();
      for (const loc of weatherSearchLocations) {
        const parts = loc.kode.split('.');
        const kecCode = [parts[0], parts[1], parts[2]].join('.');
        const key = `${loc.kecamatan}|${loc.kabkot}|${loc.provinsi}`;
        if (!kecSeen.has(key)) {
          kecSeen.set(key, {
            level: 'kecamatan',
            name: loc.kecamatan,
            kabkot: loc.kabkot,
            provinsi: loc.provinsi,
            kode: kecCode,
            searchText: normalizeWeatherSearch([loc.kecamatan, loc.kabkot, loc.provinsi].join(' '))
          });
        }
      }
      kecamatanSearchIndex = [...kecSeen.values()];


      const kabkotSeen = new Map();
      for (const loc of weatherSearchLocations) {
        const parts = loc.kode.split('.');
        const kabkotCode = [parts[0], parts[1]].join('.');
        if (!kabkotSeen.has(kabkotCode)) {
          kabkotSeen.set(kabkotCode, {
            level: 'kabkot',
            name: loc.kabkot,
            provinsi: loc.provinsi,
            kode: kabkotCode,
            searchText: normalizeWeatherSearch([loc.kabkot, loc.provinsi].join(' '))
          });
        }
      }
      kabkotaSearchIndex = [...kabkotSeen.values()];


      const provSeen = new Map();
      for (const loc of weatherSearchLocations) {
        const parts = loc.kode.split('.');
        const provCode = parts[0];
        if (!provSeen.has(provCode)) {
          provSeen.set(provCode, {
            level: 'provinsi',
            name: loc.provinsi,
            kode: provCode,
            searchText: normalizeWeatherSearch(loc.provinsi)
          });
        }
      }
      provinsiSearchIndex = [...provSeen.values()];


      generate38RandomWeatherMarkers();
    } catch (err) {
      console.error('Gagal memuat data kode_wilayah.json:', err);
    }
  }

  loadKemendagriData();

  // Autocomplete Listener
  const weatherSearchInput = document.getElementById('weatherSearchInput');
  const autocompleteResults = document.getElementById('autocompleteResults');

  weatherSearchInput.addEventListener('input', function() {
    const input = this;
    clearTimeout(weatherSearchTimer);

    if (normalizeWeatherSearch(input.value.trim()).length < 2) {
      autocompleteResults.style.display = 'none';
      return;
    }

    weatherSearchTimer = setTimeout(() => {
      const query = normalizeWeatherSearch(input.value.trim());
      const matches = [];

      // Berhenti setelah hasil cukup; tidak membuat array baru dari 83 ribu ADM4.
      for (const item of weatherSearchLocations) {
        if (item.searchText.includes(query)) {
          matches.push(item);
          if (matches.length === WEATHER_SEARCH_LIMIT) break;
        }
      }
      renderAutocompleteResults(matches);
    }, 120);
  });

  function renderAutocompleteResults(items) {
    if (items.length === 0) {
      autocompleteResults.innerHTML = '<div class="autocomplete-item" style="color:#888;">Lokasi tidak ditemukan...</div>';
      autocompleteResults.style.display = 'block';
      return;
    }

    autocompleteResults.replaceChildren(...items.map(item => {
      const result = document.createElement('div');
      result.className = 'autocomplete-item';

      const title = document.createElement('strong');
      title.textContent = item.desa || 'Desa';
      result.append(title, `, Kec. ${item.kecamatan || '-'}`, document.createElement('br'));

      const detail = document.createElement('small');
      detail.style.color = '#777';
      detail.textContent = `${item.kabkota || '-'}, ${item.provinsi || '-'} (Kode: ${item.kode})`;
      result.appendChild(detail);
      result.addEventListener('click', () => selectWeatherLocation(item.kode, item.desa, item.kecamatan));
      return result;
    }));

    autocompleteResults.style.display = 'block';
  }

  function selectWeatherLocation(kodeADM4, desa, kec) {
    weatherSearchInput.value = `${desa}, Kec. ${kec}`;
    autocompleteResults.style.display = 'none';
    
    fetchWeatherBMKG(kodeADM4);
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-weather-container')) {
      autocompleteResults.style.display = 'none';
    }
  });
