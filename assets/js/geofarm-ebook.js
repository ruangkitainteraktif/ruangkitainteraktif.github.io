(() => {
  'use strict';
  const reader = document.getElementById('gfEbookReader');
  const frame = document.getElementById('gfReaderFrame');
  const title = document.getElementById('gfReaderTitle');
  const download = document.getElementById('gfReaderDownload');
  if (!reader || !frame || !title || !download) return;

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ebook-open]');
    if (button) {
      const url = button.dataset.url;
      if (!url) return;
      title.textContent = button.dataset.title || 'Publikasi pertanian';
      download.href = url;
      // Chrome/Edge use the fragment to show their native PDF reader controls.
      frame.src = `${url}#toolbar=1&navpanes=0&view=FitH`;
      if (typeof reader.showModal === 'function') reader.showModal();
      else window.open(url, '_blank', 'noopener,noreferrer');
    }
  });

  const pressBooks = [
    ['Penerapan Diseminasi Teknologi Budi Daya Padi Lahan Pasang Surut', '82', '71', '920'],
    ['Budidaya Pegagan Tanaman Obat Berkhasiat', '75', '93', '759'],
    ['Teknologi Produksi Melalui Pengaturan Fase Pembungaan dan Pembuahan Durian', '73', '72', '787'],
    ['Teknik Mengendalikan Hama dan Penyakit Padi', '101', '80', '911'],
    ['Menjaga Keberlanjutan Swasembada Pangan', '85', '73', '538'],
    ['Potret Masa Depan Perkebunan Indonesia, 100 Tahun Kemerdekaan Karet', '83', '86', '716'],
    ['Petunjuk Teknis Pengambilan Contoh Pupuk dan Pembenah Tanah', '84', '95', '799'],
    ['Panduan Evaluasi Peraturan Perundang-undangan Sektoral', '88', '90', '755'],
    ['Budidaya Jagung Terstandar', '89', '75', '688'],
    ['Pengendalian Hama dan Penyakit Utama Tanaman Padi', '90', '91', '1784'],
    ['Buku Ajar Budidaya dan Pengolahan Kelapa', '91', '84', '707'],
    ['Pertanian Modern: Solusi Inovatif Menuju Kemandirian Pangan', '125', '112', '1108'],
    ['Kumpulan Standar Nasional (SNI) Indonesia Bidang Pertanian', '124', '111', '1102'],
    ['Jejak Kesuksesan: Kisah Perjalanan Petani Bersama Program READSI', '122', '', ''],
    ['Perubahan Paling Signifikan (Most Significant Change)', '123', '170', '1786'],
    ['Rekomendasi Pupuk N, P, dan K untuk Tanaman Hortikultura Buah per Kabupaten Edisi 2', '118', '', ''],
    ['Rekomendasi Pupuk N, P, dan K untuk Perkebunan dan Biofarmaka per Kabupaten Edisi 2', '121', '104', '975'],
    ['Ekonomi dan Kebijakan Perberasan di Negara Produsen Beras', '117', '183', '1553'],
    ['Analisis Potensi Pengembangan Komoditas Unggulan Perkebunan Indonesia', '116', '101', '955'],
    ['Mengintip Kesuksesan Beternak Ayam KUB di Jawa Tengah', '115', '', ''],
    ['Peta Jalan Pembangunan Peternakan Nasional', '114', '195', '1580'],
    ['Kemiri Sunan: Sumber Energi Terbarukan', '112', '', ''],
    ['Menjemput Asa Pertanian Digdaya: Langkah Penyuluh dari Diseminator hingga Inovator', '111', '110', '1111'],
    ['Rekomendasi Pupuk N, P, dan K untuk Tanaman Pangan per Kabupaten Edisi 2', '119', '106', '1199'],
    ['Lembaga Keuangan Mikro Pertanian Mengubah Kegagalan Menjadi Keberhasilan', '109', '', '']
  ];
  const pressBooksPage3 = [
    ['Mengenal SNI Pupuk dan Pembenah Tanah: Mendukung Pertanian Berkelanjutan', '110'],
    ['Diversifikasi Olahan Pala', '106'],
    ['Pedoman Teknis Pembangunan Screen House Buah', '108'],
    ['25 Teknologi Unggulan Agroklimat dan Hidrologi Pertanian', '107'],
    ['Rekomendasi Pupuk N, P, dan K untuk Tanaman Hortikultura (per kabupaten) Buku II', '96', '105', '981'],
    ['Praktik Terbaik SIMURP (Best Practice of SIMURP)', '127'],
    ['Praktik Terbaik IPDMIP (Best Practice of IPDMIP)', '126'],
    ['Kisah Sukses Petani Muda YESS Pacitan', '137'],
    ['Panduan Kesejahteraan Hewan Pada Kuda Pekerja', '92'],
    ['Sawit Indonesia dalam Dinamika Pasar Dunia', '99'],
    ['Urgensi Standardisasi Instrumen Dalam Pembangunan Pertanian', '102'],
    ['Brigade Pangan: Gerakan Inovatif Petani Muda Menuju Swasembada Pangan', '164'],
    ['Komunikasi Publik Mendukung Swasembada Pangan', '160'],
    ['Pendayagunaan Penyuluh Pertanian Mendukung Swasembada Pangan', '161'],
    ['Pompanisasi Solusi Cepat Atasi Krisis Pangan', '162'],
    ['Lika Liku Menumbuhkan dan Mengembangkan Kelembagaan Penyuluhan di Desa: Praktik Pendampingan Posluhdes serta Implikasi Kebijakannya ke Depan', '163'],
    ['Buku Pintar Penyuluh Pertanian', '159'],
    ['1000 Teknologi Pertanian Terapan', '295'],
    ['Pedoman Kesejahteraan Hewan pada Ayam Pedaging (Broiler)', '294'],
    ['Operasionalisasi BP: Perjalanan Menuju Swasembada Pangan', '235'],
    ['Ergonomi dan Penerapannya pada Mekanisasi Pertanian', '232'],
    ['Pedoman Budi Daya Anggur Konsumsi (Table Grape)', '213'],
    ['Kekayaan Varietas Lokal Padi Terdaftar di Indonesia Tahun 2005â€“2025', '205'],
    ['Pemanfaatan Burung Hantu untuk Pengendalian Tikus Sawah', '212'],
    ['Deskripsi Varietas Unggul Baru Padi 2025', '203']
  ].map(([name, bookId, fileId = '', galleyId = '']) => [name, bookId, fileId, galleyId]);
  const pressBooksByPage = {
    2: pressBooks,
    3: pressBooksPage3,
    4: [
      ['Budi Daya Ayam Petelur Bebas Sangkar Skala Komersial di Indonesia', '202'], ['Senarai Anggrek Hibrida', '200'], ['Buku Pedoman Pengenalan dan Pengendalian OPT Kelapa', '195'], ['Buku Pedoman Pengenalan dan Pengendalian OPT Tanaman Penyegar dan Tahunan (Kakao, Kopi, dan Jambu Mete)', '196'], ['Buku Saku Pengelolaan OPT Tanaman Tebu', '193'], ['Buku Saku Pengelolaan OPT Tanaman Lada dan Pala', '194'], ['Strategi Layanan Pengembangan Usaha bagi Pemuda di Sektor Pertanian: Pengalaman Implementasi BDSP Program YESS', '197'], ['Menghimpun Petani Muda ke Dalam Klaster Pertanian untuk Memperkuat Ekosistem Agribisnis', '198'], ['Kisah Sukses Program YESS Membuka Akses Dunia Kerja bagi Petani Muda', '199'], ['Budi Daya Padi di Lahan Rawa', '188'], ['Peluang Berwirausaha Tani bagi Pemuda Perdesaan: Lesson Learned Program YESS', '192'], ['Perubahan Signifikan Petani Muda dalam Berwirausaha dan Bekerja di Sektor Pertanian', '187'], ['Dua Dekade Perlindungan Varietas Tanaman Indonesia (2004â€“2025)', '185'], ['Pembelajaran Teknik Greenhouse', '184'], ['Cara Pintar Kreasi Ubi', '183'], ['Akses Modal Anti Gagal untuk Brigade Pangan', '182'], ['Standar Perdagangan Internasional untuk Daging Sapi (Nama, Kode, dan Batas Potongan)', '179'], ['Sekilas Pandang Sehitam Manis, True Seed of Shallot (TSS)', '180'], ['Antalogi Puisi Buah Karya Guru dan Murid SMK PP Negeri Banjarbaru â€œNegeri di Bawah Mejaâ€', '178'], ['Local Champion: Gerakan Petani Muda Berbasis Komunitas', '176'], ['Young Ambassador Agriculture', '177'], ['Best Practice Of YESS Programme 2', '175'], ['A to Z Yess Programme', '174'], ['Meritrokrasi Mendukung Swasembada Pangan', '167'], ['Pengembangan Investasi dan Hilirisasi Pertanian', '168']
    ].map(([name, id, fileId = '', galleyId = '']) => [name, id, fileId, galleyId]),
    5: [
      ['Meritrokrasi Mendukung Swasembada Pangan', '167'], ['Cetak Sawah: Jaminan Swasembada Pangan Jangka Panjang', '153'], ['Efisiensi Anggaran Untuk Peningkatan Produksi Pertanian', '158'], ['Satu Komando Pertanian Wujudkan Swasembada Pangan', '154'], ['Transformasi Pertanian: dari â€œMekani-Sapiâ€ ke Mekanisasi', '155'], ['Optimasi Lahan Mendukung Swasembada Pangan Berkelanjutan', '151'], ['Strategi Pencapaian Swasembada Pangan Nasional', '156'], ['Penegakan Hukum Dan Anti Mafia Sektor Pangan', '152'], ['Pupuk Subsidi Kunci Swasembada Pangan', '157'], ['Kisah Sukses Petani Muda YESS Banyuwangi', '138'], ['Kisah Sukses Petani Muda YESS Gowa', '144'], ['Kisah Sukses Petani Muda YESS Hulu Sungai Selatan', '134'], ['Kisah Sukses Petani Muda Yess Bogor', '149'], ['Kisah Sukses Petani Muda YESS Sukabumi', '139'], ['Kisah Sukses Petani Muda YESS Banjar', '130'], ['Kisah Sukses Petani Muda YESS Bone', '145'], ['Kisah Sukses Petani Muda YESS Tanah Bumbu', '135'], ['Kisah Sukses Petani Muda YESS Cianjur', '140'], ['Kisah Sukses Petani Muda YESS Tulungagung', '131'], ['Kisah Sukses Petani Muda YESS Bantaeng', '146'], ['Kisah Sukses Petani Muda YESS Bulukumba', '141'], ['Kisah Sukses Petani Muda YESS Malang', '132'], ['Kisah Sukses Petani Muda YESS Tasikmalaya', '147'], ['Kisah Sukses Petani Muda YESS Maros', '142'], ['Kisah Sukses Petani Muda YESS Tanah Laut', '133']
    ].map(([name, id, fileId = '', galleyId = '']) => [name, id, fileId, galleyId]),
    6: [
      ['Kisah Sukses Petani Muda YESS Malang', '132'], ['Kisah Sukses Petani Muda â€œNanang Galuh Pertanian Kalimantan Selatanâ€', '129'], ['Kisah Sukses Petani Muda YESS Pasuruan', '136'], ['xxx Judul Contoh Buku', '150'], ['Menuju Laboratorium Pengujian Terstandar SNI ISO/IEC17025:2017', '104'], ['Perjalanan Merintis Penerapan Standar: Kisah Manis di Tahun Pertama BSIP', '105'], ['Kisah Sukses Petani Muda Yess', '93'], ['Best Practices Of Yess Programme', '94'], ['Teknologi Pembungaan Lengkeng', '74'], ['Kinerja dan Prospek Investasi Pertanian', '65'], ['Teknologi Hemat Air Komoditas Hortikultura', '66'], ['Budi Daya Padi Ramah Lingkungan, Menuju Pertanian Lebih Baik', '77'], ['The SYL Way: I Love My Job', '39'], ['Pengenalan dan Pengendalian OPT Kubis', '36'], ['Pengembangan Pertanian Presisi Solusi dan Jawaban Pembangunan Pertanian Ke Depan', '87'], ['Katalog Green House dan Shading House Kampung Flori', '86'], ['Solusi SYL Memenuhi Kebutuhan Pembiayaan Pertanian Melalui Optimalisasi KUR', '34'], ['Menjadikan Milenial Petani Pengusaha', '30'], ['Pengelolaan Lahan Untuk Pertanaman Kedelai di Lahan Kering Suboptimal', '26'], ['Pengukuran Stok Karbon Tanaman Buah Tahunan', '31'], ['Pengukuran Emisi Gas Rumah Kaca (GRK) Lahan Budidaya Cabai', '27'], ['Pengukuran Gas Rumah Kaca (GRK) Pada Lahan Budidaya Bawang Merah', '33'], ['Suplemen Farmakope Obat Hewan Indonesia: Sediaan Farmasetik dan Premiks', '28'], ['Profil Manggis Mendukung Ekspor', '29'], ['Metode Pengamatan Kutu Putih dan Semut Pada Tanaman Hortikultura', '22']
    ].map(([name, id, fileId = '', galleyId = '']) => [name, id, fileId, galleyId]),
    7: [
      ['Karakteristik Pembeda Pada Beberapa Varietas Kedelai', '21'], ['Model Pemberdayaan Masyarakat Mendukung Daya Saing Kampung Flori', '18'], ['Riset Pengembangan Inovatif Kolaboratif: Upaya Peningkatan Kemandirian Pakan', '19'], ['Pupuk Organik: Dibuatnya Mudah, Hasil Tanam Melimpah', '46'], ['Diversifikasi Produk Olahan Pala', '47'], ['Potensi Vegetasi Perkebunan Kelapa Sawit Sebagai Pakan Ruminansia', '11'], ['Panduan Teknis Budidaya Tanaman Hias Daun Seri 2: Scindapsus', '7'], ['Rekomendasi Pupuk N,P,K untuk Tanaman Ubi Kayu Per Kabupaten', '10'], ['Buku Pedoman Budidaya Semangka', '12'], ['Untaian Pemikiran ASN Mewujudkan Pertanian Maju, Mandiri, Modern', '16'], ['Budidaya Jeruk Teknologi Bujangseta', '17'], ['Langkah SYL Mewujudkan Swasembada Beras Ditengah Tantangan yang Tidak Biasa', '4'], ['The SYL Ways: The Miracle of Hardworking', '5'], ['Panduan Teknis Budidaya Tanaman Hias Daun Seri 1: Aglaonema', '6'], ['Profil Sentra Anggur', '45'], ['Budidaya Jeruk Teknologi Sitara', '14'], ['Buku Lapang Budidaya Mangga Teknologi UHDP', '15'], ['Peluang Investasi Tanaman Pangan', '44'], ['Panduan Teknis Budidaya Mawar Potong', '42'], ['Senarai Krisan', '231']
    ].map(([name, id, fileId = '', galleyId = '']) => [name, id, fileId, galleyId])
  };
  const pressList = document.getElementById('gfPressList');
  const pressSearch = document.getElementById('gfPressSearch');
  const pressStatus = document.getElementById('gfPressStatus');
  const pressSource = document.getElementById('gfPressSource');
  const pressPagination = document.getElementById('gfPressPagination');
  let pressPage = 2;
  const renderPressBooks = () => {
    if (!pressList) return;
    const query = (pressSearch?.value || '').trim().toLocaleLowerCase('id');
    const currentBooks = pressBooksByPage[pressPage] || pressBooks;
    const filtered = currentBooks.filter(([name]) => name.toLocaleLowerCase('id').includes(query));
    if (pressStatus) pressStatus.textContent = `Halaman ${pressPage} Â· ${filtered.length}${query ? ` dari ${currentBooks.length} judul cocok` : ' judul'}.`;
    if (pressSource) pressSource.href = `https://epublikasi.pertanian.go.id/pertanianpress/catalog/page/${pressPage}`;
    pressList.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'gf-press-empty';
      empty.textContent = 'Judul tidak ditemukan.';
      pressList.append(empty);
    }
    filtered.forEach(([name, bookId, fileId, galleyId]) => {
      const detailUrl = bookId
        ? `https://epublikasi.pertanian.go.id/pertanianpress/catalog/book/${bookId}`
        : `https://epublikasi.pertanian.go.id/pertanianpress/catalog/page/${pressPage}`;
      const url = fileId && galleyId
        ? `https://epublikasi.pertanian.go.id/pertanianpress/catalog/download/${bookId}/${fileId}/${galleyId}?inline=1`
        : detailUrl;
      const item = document.createElement('article');
      item.className = 'gf-press-item';
      const heading = document.createElement('strong');
      heading.textContent = name;
      const source = document.createElement('small');
      source.textContent = `Pertanian Press Â· halaman ${pressPage}`;
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'gf-press-open';
      action.dataset.ebookOpen = '';
      action.dataset.title = name;
      action.dataset.url = url;
      action.textContent = fileId && galleyId ? 'Baca PDF' : 'Lihat katalog';
      if (!fileId || !galleyId) {
        action.addEventListener('click', () => window.open(detailUrl, '_blank', 'noopener,noreferrer'), { once: true });
        action.removeAttribute('data-ebook-open');
      }
      item.append(heading, source, action);
      pressList.append(item);
    });
    if (pressPagination) {
      pressPagination.replaceChildren();
      const addPageButton = (label, page, { disabled = false, current = false, ariaLabel = '' } = {}) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.disabled = disabled;
        if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
        if (current) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          pressPage = page;
          renderPressBooks();
        });
        pressPagination.append(button);
      };
      addPageButton('â€¹', Math.max(2, pressPage - 1), { disabled: pressPage === 2, ariaLabel: 'Halaman sebelumnya' });
      for (let page = 2; page <= 7; page += 1) addPageButton(String(page), page, { current: pressPage === page });
      addPageButton('â€º', Math.min(7, pressPage + 1), { disabled: pressPage === 7, ariaLabel: 'Halaman berikutnya' });
    }
  };
  if (pressList) {
    renderPressBooks();
    pressSearch?.addEventListener('input', renderPressBooks);
  }

  const close = () => {
    if (reader.open) reader.close();
    frame.removeAttribute('src');
  };
  reader.querySelectorAll('[data-reader-close]').forEach((button) => button.addEventListener('click', close));
  reader.addEventListener('click', (event) => {
    if (event.target === reader) close();
  });
  reader.addEventListener('close', () => frame.removeAttribute('src'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && reader.open) close();
  });
})();
