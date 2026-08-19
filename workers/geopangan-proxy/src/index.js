const BI_HARGA_URL = 'https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataKomoditas';

const ALLOWED_ORIGINS = new Set([
  'https://ruangkita.net',
  'https://www.ruangkita.net',
  'https://ruangkitainteraktif.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

const ALLOWED_PARAMS = new Set([
  'price_type_id', 'comcat_id', 'province_id', 'regency_id',
  'showKota', 'showPasar', 'tipe_laporan', 'start_date', 'end_date'
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = new Headers({
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonError(message, status, headers) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export default {
  async fetch(request) {
    const headers = corsHeaders(request);
    const origin = request.headers.get('Origin');

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonError('Origin tidak diizinkan.', 403, headers);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return jsonError('Method tidak diizinkan.', 405, headers);

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== '/api/geopangan/harga') {
      return jsonError('Endpoint tidak ditemukan.', 404, headers);
    }

    const upstreamUrl = new URL(BI_HARGA_URL);
    for (const [key, value] of requestUrl.searchParams) {
      if (ALLOWED_PARAMS.has(key)) upstreamUrl.searchParams.set(key, value);
    }

    try {
      const upstream = await fetch(upstreamUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RuangKita-GeoPangan/1.0 (+https://ruangkita.net)'
        },
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      const responseHeaders = new Headers(headers);
      responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
      responseHeaders.set('Cache-Control', 'public, max-age=300');
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (error) {
      return jsonError('Sumber harga pangan sementara tidak dapat dihubungi.', 502, headers);
    }
  }
};
