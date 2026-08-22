// Cloudflare Worker: proxy CORS untuk permintaan WMS/WFS lintas-origin.
// Deploy: wrangler deploy  (lihat wrangler.toml).
// Aplikasi memanggil: https://<worker>.<sub>.workers.dev/?url=<encoded-target>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing "url" query parameter', { status: 400, headers: CORS });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    try {
      const upstream = new Request(target, {
        method: request.method,
        headers: request.headers,
        redirect: 'follow',
      });
      const resp = await fetch(upstream);
      const headers = new Headers(resp.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      headers.set('Cache-Control', 'public, max-age=60');
      return new Response(resp.body, { status: resp.status, headers });
    } catch (err) {
      return new Response('Proxy error: ' + err.message, { status: 502, headers: CORS });
    }
  },
};
