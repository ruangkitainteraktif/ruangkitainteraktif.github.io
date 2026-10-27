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
 *
 * Rate limit (BPS only):
 *  - See RATE_LIMIT_BPS. Menahan beban ke BPS dari modul SLS, yang satu
 *    analisisnya menarik dua berurutan (lookup desa lalu ambil SLS).
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
  ".arcgis.com",
  ".arcgisonline.com",
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
  "maps.isric.org",
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

const GISTARU_RDTR_EXPORT_PREFIX =
  "https://gistaru-proxy.atrbpn.go.id/proxy.ashx?https://gistaru.atrbpn.go.id/arcgis/rest/services/044_RDTR_PROVINSI_ACEH/_RDTR_11A3_KAWASAN_PERKOTAAN_TAKENGON/MapServer/export?";
const GISTARU_INTERACTIVE_API_PREFIXES = [
  "https://gistaru-proxy.atrbpn.go.id/proxy.ashx?https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/data?",
  "https://gistaru-proxy.atrbpn.go.id/proxy.ashx?https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/activities?"
];
const GISTARU_ARCGIS_SERVICES_PREFIX =
  "https://gistaru-proxy.atrbpn.go.id/proxy.ashx?https://gistaru.atrbpn.go.id/arcgis/rest/services/";
const GISTARU_DIRECT_ARCGIS_SERVICES_PREFIX =
  "https://gistaru.atrbpn.go.id/arcgis/rest/services/";
const GISTARU_TRES_ARCGIS_SERVICES_PREFIX =
  "https://gistaru.atrbpn.go.id/tres/proxy.ashx?https://gistaru.atrbpn.go.id/arcgis/rest/services/";

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
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Origin, X-Requested-With, Authorization, X-Timestamp, X-Signature, X-Client-Pubkey",
    "Access-Control-Max-Age": "86400",
    // X-RateLimit-* WAJIB ada di sini. Tanpa diexpose, browser tidak
    // boleh membacanya dari JavaScript, jadi klien tidak akan pernah tahu
    // kapan kuotanya pulih.
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Type, X-Proxy-Status, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
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

/* ══ Batas kuota BPS ══
   Hanya berlaku untuk host BPS. Semua host lain di allowlist -- arcgis,
   big.go.id, BMKG, dan sisanya -- tidak tersentuh. */
const RATE_LIMIT_BPS = {
  // 2 request, bukan 1: satu analisis SLS di geotani-sls.js memanggil
  // findDesaId() lalu loadSlsOfDesa(), berurutan karena yang kedua memakai
  // iddesa dari yang pertama. Dengan kuota 1, analisis tidak pernah selesai.
  max: 2,
  windowMs: 24 * 60 * 60 * 1000, // jendela bergulir 24 jam
  // Berapa lama respons 429 disimpan di cache edge, supaya klien tidak
  // membanjiri Worker dengan probing yang sama.
  blockedCacheTtl: 60
};

// Hanya bps.go.id beserta seluruh subdomainnya. Dipakai juga untuk
// Kellogin, bukan ALLOWED_HOST_SUFFIXES, supaya ".go.id" yang ada di sana
// tidak ikut membawa seluruhnamespace pemerintah ke dalam pembatasan.
function isBpsHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return h === "bps.go.id" || h.endsWith(".bps.go.id");
}

// CF-Connecting-IP diisi Cloudflare di edge. Saat wrangler dev lokal
// header ini tidak ada, jadi jatuh ke "anon" -- kuota lokal ikut terhitung
// dan mudah diuji, cuma tidak mewakili perilaku produksi.
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "anon";
}

// Kuotanya disimpan sebagai { n, resetAt }. resetAt hanya di-set sekali,
// saat request pertama yang benar-benar berhasil, sehingga jendela 24 jam
// bergulir dari akses pertama dan tidak bergeser setiap kali ada request.
async function bacaKuota(env, ip) {
  const kv = env && env.RATE_KV;
  if (!kv) return null;
  const key = "bps:" + ip;
  const now = Date.now();
  let rec = null;
  try {
    rec = await kv.get(key, "json");
  } catch {
    return null; // KV bermasalah: lebih baik melayani daripada menolak
  }
  if (!rec || typeof rec.resetAt !== "number" || typeof rec.n !== "number") {
    return { key: key, n: 0, resetAt: now + RATE_LIMIT_BPS.windowMs, baru: true };
  }
  if (now >= rec.resetAt) {
    // Jendela lama sudah lewat: mulai yang baru.
    return { key: key, n: 0, resetAt: now + RATE_LIMIT_BPS.windowMs, baru: true };
  }
  return { key: key, n: rec.n, resetAt: rec.resetAt, baru: false };
}

async function tulisKuota(env, k) {
  const kv = env && env.RATE_KV;
  if (!kv) return;
  try {
    await kv.put(k.key, JSON.stringify({ n: k.n, resetAt: k.resetAt }), {
      expirationTtl: Math.ceil(RATE_LIMIT_BPS.windowMs / 1000) + 3600
    });
  } catch {
    // Gagal menulis tidak boleh menggagalkan request; paling bawah
    // pengguna melihat kuota sedikit lebih longgar, bukan error.
  }
}

function headerKuota(k) {
  const sisa = Math.max(0, RATE_LIMIT_BPS.max - k.n);
  return {
    "X-RateLimit-Limit": String(RATE_LIMIT_BPS.max),
    "X-RateLimit-Remaining": String(sisa),
    "X-RateLimit-Reset": String(Math.ceil(k.resetAt / 1000))
  };
}

function respons429(origin, k) {
  const jam = new Date(k.resetAt);
  const teks = jam.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short"
  });
  return new Response(
    JSON.stringify({
      error: "Kuota data SLS BPS harian sudah habis.",
      detail:
        "Setiap alamat IP hanya boleh " +
        RATE_LIMIT_BPS.max +
        " request ke BPS per 24 jam, cukup untuk satu analisis polygon. " +
        "Kuota berikutnya tersedia pukul " +
        teks +
        " WIB.",
      resetAt: k.resetAt,
      limit: RATE_LIMIT_BPS.max
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil((k.resetAt - Date.now()) / 1000))),
        ...headerKuota(k),
        ...corsHeaders(origin)
      }
    }
  );
}

/* ══ Sesi BHUMI ══
   Endpoint persil BHUMI (/mprx/service WMS dan /expapi/*) menolak permintaan
   yang tidak membawa cookie sesi yang diterbitkan F5 saat halaman BHUMI
   dimuat -- balasannya 403 "Forbidden" dari nginx, terlihat oleh klien sebagai
   layer yang diam kosong.

   Cookie itu TIDAK bisa diambil dari browser: Set-Cookie tidak pernah
   diekspos ke JavaScript lintas origin, dan bhm_gt (satu-satunya cookie yang
   cukup untuk /mprx) ber-SameSite=Lax sehingga tidak dikirim pada request
   <img> lintas situs. Satu-satunya tempat yang bisa memegang sesi adalah
   Worker ini.

   Caranya: sekali memuat halaman BHUMI untuk mengambil cookie, menyimpannya
   di KV selama 30 menit, lalu menyertakannya di setiap request lanjutan.
   Kalau upstream tetap menolak, sesi dianggap kedaluwarsa: dibuang, dibuat
   baru, dan request dicoba ulang satu kali. */
const BHUMI_SESI_KEY = "bhumi:sesi";
const BHUMI_SESI_TTL = 30 * 60;
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function bacaSesiBhumi(env) {
  const kv = env && env.RATE_KV;
  if (kv) {
    try {
      const tersimpan = await kv.get(BHUMI_SESI_KEY);
      if (tersimpan) return tersimpan;
    } catch {
      /* KV bermasalah: sesi dibuat ulang, bukan gagal total. */
    }
  }
  return "";
}

async function buatSesiBhumi(env) {
  const kv = env && env.RATE_KV;
  const res = await fetch("https://bhumi.atrbpn.go.id/peta", {
    headers: {
      "User-Agent": UA_BROWSER,
      "Accept": "text/html,application/xhtml+xml",
      "Referer": "https://bhumi.atrbpn.go.id/",
      "Origin": "https://bhumi.atrbpn.go.id"
    },
    cf: { cacheTtl: 0 }
  });
  const daftar =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const cookie = daftar
    .map((baris) => baris.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) return "";
  if (kv) {
    try {
      await kv.put(BHUMI_SESI_KEY, cookie, { expirationTtl: BHUMI_SESI_TTL });
    } catch {
      /* Gagal menyimpan tidak menggagalkan request: sesi tetap dipakai
         untuk request ini, hanya tidak dipakai ulang di request berikutnya. */
    }
  }
  return cookie;
}

async function hapusSesiBhumi(env) {
  const kv = env && env.RATE_KV;
  if (!kv) return;
  try {
    await kv.delete(BHUMI_SESI_KEY);
  } catch {
    /* Aman diabaikan: sesi lama akan tergantikan oleh sesi baru. */
  }
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

    /* ── gerbang kuota BPS ──
       Diperiksa sebelum meneruskan ke upstream supaya request yang sudah
       pasti ditolak tidak membebani BPS. Penghitungannya sendiri baru
       dinaikkan SESUDAH upstream membalas sukses (lihat bawah), supaya
       request yang gagal atau timeout tidak memotong kuota pengguna. */
    const dikuota = isBpsHost(target.hostname);
    let ip = null;
    let k = null;
    if (dikuota) {
      ip = clientIp(request);
      k = await bacaKuota(env, ip);
      if (k && k.n >= RATE_LIMIT_BPS.max) {
        return respons429(origin, k);
      }
    }

    const fwdHeaders = {
      // UA harus terlihat seperti browser biasa; BHUMI menolak request
      // dengan UA ber-ekor "kta-cors-proxy" (404 "Forbidden" dari nginx).
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": request.headers.get("Accept") || "*/*"
    };
    // Forward useful client headers if present
    const contentType = request.headers.get("Content-Type");
    if (contentType) fwdHeaders["Content-Type"] = contentType;

    // Endpoint WMS persil BHUMI (/mprx/service) dan API ekspor (/expapi:
    // loginApi, getPersil) menolak permintaan yang Referer/Origin-nya bukan
    // domainnya sendiri (balasannya 403 nginx / 401 aplikasi). Untuk /expapi
    // Origin sendiri WAJIB ada dan bernilai domain bhumi -- tanpa Origin
    // loginApi selalu 401 meski Referer benar. Browser DILARANG memalsukan
    // kedua header ini, jadi hanya bisa diisi di server -- di sinilah
    // tempatnya.
    const isBhumiHost = target.hostname === "bhumi.atrbpn.go.id";
    const isBhumiMprx =
      isBhumiHost &&
      (target.pathname === "/mprx" || target.pathname.startsWith("/mprx/"));
    const isBhumiExpapi =
      isBhumiHost &&
      (target.pathname === "/expapi" || target.pathname.startsWith("/expapi/"));
    // Ekspor gambar RDTR Takengon harus tampak berasal dari halaman GISTARU.
    // Batasi penyisipan header ke endpoint dan service ekspor ini saja.
    const isGistaruRdtrExport =
      target.origin === "https://gistaru-proxy.atrbpn.go.id" &&
      target.pathname === "/proxy.ashx" &&
      target.href.startsWith(GISTARU_RDTR_EXPORT_PREFIX);
    const isGistaruInteractiveApi =
      target.origin === "https://gistaru-proxy.atrbpn.go.id" &&
      target.pathname === "/proxy.ashx" &&
      GISTARU_INTERACTIVE_API_PREFIXES.some((prefix) => target.href.startsWith(prefix));
    const isGistaruArcgisService =
      target.origin === "https://gistaru-proxy.atrbpn.go.id" &&
      target.pathname === "/proxy.ashx" &&
      target.href.startsWith(GISTARU_ARCGIS_SERVICES_PREFIX);
    const isGistaruDirectArcgisService =
      target.origin === "https://gistaru.atrbpn.go.id" &&
      target.href.startsWith(GISTARU_DIRECT_ARCGIS_SERVICES_PREFIX);
    const isGistaruTresArcgisService =
      target.origin === "https://gistaru.atrbpn.go.id" &&
      target.pathname === "/tres/proxy.ashx" &&
      target.href.startsWith(GISTARU_TRES_ARCGIS_SERVICES_PREFIX);
    if (isBhumiMprx || isBhumiExpapi) {
      fwdHeaders["Referer"] = "https://bhumi.atrbpn.go.id/peta";
      fwdHeaders["Origin"] = "https://bhumi.atrbpn.go.id";
      /* Tanpa cookie sesi BHUMI, nginx membalas 403 "Forbidden" dan seluruh
         layer persil jadi kosong tanpa keterangan apa pun. */
      try {
        let sesi = await bacaSesiBhumi(env);
        if (!sesi) sesi = await buatSesiBhumi(env);
        if (sesi) fwdHeaders["Cookie"] = sesi;
      } catch {
        /* Sesi gagal dibuat: request tetap diteruskan, jadi kalau suatu saat
           layanan BHUMI tidak lagi menuntut cookie, semuanya tetap jalan. */
      }
    }
    if (isGistaruRdtrExport || isGistaruInteractiveApi || isGistaruArcgisService || isGistaruDirectArcgisService || isGistaruTresArcgisService) {
      fwdHeaders["Referer"] = isGistaruInteractiveApi
        ? "https://gistaru.atrbpn.go.id/rdtrinteraktif/"
        : isGistaruTresArcgisService
          ? "https://gistaru.atrbpn.go.id/tres/"
          : "https://gistaru.atrbpn.go.id/";
      fwdHeaders["Origin"] = "https://gistaru.atrbpn.go.id";
      fwdHeaders["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    }
    // JWT dari /expapi/loginApi dikirim kembali oleh klien lewat header
    // Authorization; kalau tidak diteruskan, getPersil selalu 401.
    const authorization = request.headers.get("Authorization");
    if (authorization && isBhumiExpapi) fwdHeaders["Authorization"] = authorization;

    // Sejak 2026-10-22 /expapi menuntut tanda tangan request:
    //   x-signature = SHA256(x-timestamp + ":" + rahasia)
    // dihitung di klien (sama seperti app resmi) dan diteruskan ke sini.
    // Tanpa dua header ini server membalas 401 "Missing request signature".
    const xTs = request.headers.get("X-Timestamp");
    const xSig = request.headers.get("X-Signature");
    if (xTs && xSig && isBhumiExpapi) {
      fwdHeaders["X-Timestamp"] = xTs;
      fwdHeaders["X-Signature"] = xSig;
    }
    // 2026-10-22 (rotasi kedua): getPersil juga menuntut x-client-pubkey
    // (kunci pub ECDH P-256, dibuat baru per permintaan di klien untuk
    // dekripsi sesi) serta User-Agent bergaya browser -- tanpa UA,
    // server membalas 401 "Invalid signature" meski tanda tangan benar
    // (serupa aturan UA di /mprx yang sudah ditemukan kemarin).
    const xPub = request.headers.get("X-Client-Pubkey");
    if (xPub && isBhumiExpapi) fwdHeaders["X-Client-Pubkey"] = xPub;
    if (isBhumiMprx || isBhumiExpapi) {
      fwdHeaders["User-Agent"] = request.headers.get("User-Agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    }

    let body = null;
    if (method === "POST") {
      body = await request.arrayBuffer();
    }

    const opsiUpstream = {
      method,
      headers: fwdHeaders,
      body: method === "POST" ? body : undefined,
      redirect: "follow",
      // Tile persil BHUMI bersifat publik dan nyaris tidak berubah; di-cache
      // di edge supaya pemetaan (ratusan tile per layar) tidak membebani
      // maupun menghafal ulang permintaan ke server ATR/BPN.
      cf: { cacheTtl: isBhumiMprx ? 86400 : isGistaruRdtrExport ? 3600 : isGistaruInteractiveApi ? 300 : 0 }
    };

    try {
      let upstream = await fetch(target.toString(), opsiUpstream);

      /* Cookie sesi BHUMI kedaluwarsa (atau tidak pernah terbentuk): buat
         yang baru dan ulangi persis satu kali. Tanpa langkah ini layer persil
         akan tetap kosong selama sisa masa berlaku sesi lama. */
      const perluSesiUlang =
        (isBhumiMprx || isBhumiExpapi) &&
        (upstream.status === 403 || upstream.status === 401) &&
        Boolean(fwdHeaders.Cookie);
      if (perluSesiUlang) {
        try {
          if (upstream.body) await upstream.body.cancel();
        } catch {
          /* Body lama tidak terpakai; membatalkannya hanya rapi-rapi. */
        }
        await hapusSesiBhumi(env);
        const sesiBaru = await buatSesiBhumi(env).catch(() => "");
        if (sesiBaru) {
          fwdHeaders.Cookie = sesiBaru;
          upstream = await fetch(target.toString(), opsiUpstream);
        }
      }

      const outHeaders = new Headers(corsHeaders(origin));
      const ct = upstream.headers.get("Content-Type");
      if (ct) outHeaders.set("Content-Type", ct);
      outHeaders.set("X-Proxy-Status", String(upstream.status));
      if (isBhumiMprx && method === "GET" && upstream.ok) {
        outHeaders.set("Cache-Control", "public, max-age=86400");
      }
      if (isGistaruRdtrExport && method === "GET" && upstream.ok) {
        outHeaders.set("Cache-Control", "public, max-age=3600");
      }
      if (isGistaruInteractiveApi && method === "GET" && upstream.ok) {
        outHeaders.set("Cache-Control", "public, max-age=300");
      }

      // Penghitungan naik hanya setelah upstream benar-benar berhasil.
      // Kalau BPS sedang lambat atau errornya di sisi mereka, pengguna
      // masih punya kuota penuh untuk mencoba lagi.
      if (dikuota && k && upstream.ok) {
        k.n += 1;
        await tulisKuota(env, k);
        for (const [name, value] of Object.entries(headerKuota(k))) {
          outHeaders.set(name, value);
        }
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: outHeaders
      });
    } catch (err) {
      return jsonError(502, "Upstream fetch failed: " + (err && err.message ? err.message : "unknown"), origin);
    }
  }
};
