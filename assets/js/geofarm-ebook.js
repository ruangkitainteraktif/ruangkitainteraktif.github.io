(() => {
  'use strict';
  const reader = document.getElementById('gfEbookReader');
  const frame = document.getElementById('gfReaderFrame');
  const title = document.getElementById('gfReaderTitle');
  const download = document.getElementById('gfReaderDownload');
  if (!reader || !frame || !title || !download) return;

  document.querySelectorAll('[data-ebook-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const url = button.dataset.url;
      if (!url) return;
      title.textContent = button.dataset.title || 'Publikasi pertanian';
      download.href = url;
      // Chrome/Edge use the fragment to show their native PDF reader controls.
      frame.src = `${url}#toolbar=1&navpanes=0&view=FitH`;
      if (typeof reader.showModal === 'function') reader.showModal();
      else window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

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
