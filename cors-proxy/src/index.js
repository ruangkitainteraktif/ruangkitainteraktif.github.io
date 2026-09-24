/**
 * kta-cors-proxy — CORS reverse proxy for ruangkitainteraktif.github.io
 *
 * Usage:
 *   GET  /?url=<encoded absolute URL>
 *   POST /?url=<encoded absolute URL>   (body forwarded)
 *
 * Security:
 *  - Only http(s) targets
 *  - No private/loopback hosts
 *  - Origin allowlist (site + localhost)
 *  - Host allowlist ( government / known public APIs used by the site )
 */

const ALLOWED_ORIGINS = new Set([
  "https://ruangkitainteraktif.github.io",
  "https://www.ruangkitainteraktif.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

// Host suffixes / exact hosts that may be proxied.
const ALLOWED_HOST_SUFFIXES = [
  ".go.id",
  ".go.jp",
  ".or.id",
  ".ac.id",
  ".web.id",
  ".mil.id",
  "bi.go.id",
  "bps.go.id",
  "bmkg.go.id",
  "bnpb.go.id",
  "big.go.id",
  "atrbpn.go.id",
  "bappenas.go.id",
  "badanpangan.go.id",
  "pertanian.go.id",
  "kehutanan.go.id",
  "esdm.go.id",
  "mbgwatch.org",
  "wilayah.web.id",
  "wilayah.smartartstudio.my.id",
  "open-meteo.com",
  "api.aladhan.com",
  "api.bmkg.go.id",
  "data.bmkg.go.id",
  "geospasial.bappenas.go.id",
  "geoportal.badanpangan.go.id",
  "petadasar.meritech.cloud",
  "petadasar.atrbpn.go.id",
  "kspservices.big.go.id",
  "geoservices.big.go.id",
  "sig02.pertanian.go.id",
  "simontana.kehutanan.go.id",
  "gis.bnpb.go.id",
  "gis.bmkg.go.id",
  "satellite.bmkg.go.id",
  "spartan.bmkg.go.id",
  "maritim.bmkg.go.id",
  "webapi.bps.go.id",
  "geoserver.bps.go.id",
  "www.bi.go.id",
  "tanahair.indonesia.go.id",
  "mapservice.atrbpn.go.id",
  "bhumi.atrbpn.go.id",
  "geoportal.esdm.go.id",
  "rainviewer.com",
  "api.rainviewer.com",
  "api.open-meteo.com",
  "geocode.arcgis.com",
  "overpass-api.de",
  "rupabumi.com",
  "opsroom.sipongidata.my.id",
  "ic.imagery1.arcgis.com",
  "sentinel.arcgis.com",
  "server.arcgisonline.com",
  "script.google.com"
];

const ALLOWED_HOST_EXACT = new Set(ALLOWED_HOST_SUFFIXES.filter((h) => !h.startsWith(".")));

function isHostAllowed(hostname) {
  const h = (hostname || "").toLowerCase();
  if (!h) return false;
  if (ALLOWED_HOST_EXACT.has(h)) return true;
  for (const s of ALLOWED_HOST_SUFFIXES) {
    if (s.startsWith(".")) {
      if (h.endsWith(s) || h === s.slice(1)) return true;
    }
  }
  // *.go.id catch-all
  if (h.endsWith(".go.id")) return true;
  return false;
}

function isPrivateHost(hostname) {
  const h = (hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "Content-Length, Content-Type"
  };
}

function jsonError(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health
    if (url.pathname === "/" && !url.searchParams.has("url")) {
      return new Response(JSON.stringify({ ok: true, service: "kta-cors-proxy" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
      });
    }

    const targetRaw = url.searchParams.get("url");
    if (!targetRaw) {
      return jsonError(400, "Missing ?url= parameter", origin);
    }

    let target;
    try {
      target = new URL(targetRaw);
    } catch {
      return jsonError(400, "Invalid target URL", origin);
    }

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return jsonError(400, "Only http/https allowed", origin);
    }
    if (isPrivateHost(target.hostname)) {
      return jsonError(403, "Private/loopback host blocked", origin);
    }
    if (!isHostAllowed(target.hostname)) {
      return jsonError(403, "Host not allowed: " + target.hostname, origin);
    }

    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "POST" && method !== "HEAD") {
      return jsonError(405, "Method not allowed", origin);
    }

    const fwdHeaders = {
      "User-Agent": "Mozilla/5.0 (compatible; kta-cors-proxy/1.0)",
      "Accept": request.headers.get("Accept") || "*/*"
    };
    // Forward useful client headers if present
    const contentType = request.headers.get("Content-Type");
    if (contentType) fwdHeaders["Content-Type"] = contentType;

    let body = null;
    if (method === "POST") {
      body = await request.arrayBuffer();
    }

    try {
      const upstream = await fetch(target.toString(), {
        method,
        headers: fwdHeaders,
        body: method === "POST" ? body : undefined,
        redirect: "follow",
        cf: { cacheTtl: 0 }
      });

      const outHeaders = new Headers(corsHeaders(origin));
      const ct = upstream.headers.get("Content-Type");
      if (ct) outHeaders.set("Content-Type", ct);
      outHeaders.set("X-Proxy-Status", String(upstream.status));

      return new Response(upstream.body, {
        status: upstream.status,
        headers: outHeaders
      });
    } catch (err) {
      return jsonError(502, "Upstream fetch failed: " + (err && err.message ? err.message : "unknown"), origin);
    }
  }
};