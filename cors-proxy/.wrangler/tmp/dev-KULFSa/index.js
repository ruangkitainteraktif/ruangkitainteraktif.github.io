var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://ruangkitainteraktif.github.io",
  "https://www.ruangkitainteraktif.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
var ALLOWED_HOST_SUFFIXES = [
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
var ALLOWED_HOST_EXACT = new Set(ALLOWED_HOST_SUFFIXES.filter((h) => !h.startsWith(".")));
function isHostAllowed(hostname) {
  const h = (hostname || "").toLowerCase();
  if (!h) return false;
  if (ALLOWED_HOST_EXACT.has(h)) return true;
  for (const s of ALLOWED_HOST_SUFFIXES) {
    if (s.startsWith(".")) {
      if (h.endsWith(s) || h === s.slice(1)) return true;
    }
  }
  if (h.endsWith(".go.id")) return true;
  return false;
}
__name(isHostAllowed, "isHostAllowed");
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
__name(isPrivateHost, "isPrivateHost");
function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, X-Requested-With, Authorization",
    "Access-Control-Max-Age": "86400",
    // X-RateLimit-* WAJIB ada di sini. Tanpa diexpose, browser tidak
    // boleh membacanya dari JavaScript, jadi klien tidak akan pernah tahu
    // kapan kuotanya pulih.
    "Access-Control-Expose-Headers": "Content-Length, Content-Type, X-Proxy-Status, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonError(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}
__name(jsonError, "jsonError");
var RATE_LIMIT_BPS = {
  // 2 request, bukan 1: satu analisis SLS di geotani-sls.js memanggil
  // findDesaId() lalu loadSlsOfDesa(), berurutan karena yang kedua memakai
  // iddesa dari yang pertama. Dengan kuota 1, analisis tidak pernah selesai.
  max: 2,
  windowMs: 24 * 60 * 60 * 1e3,
  // jendela bergulir 24 jam
  // Berapa lama respons 429 disimpan di cache edge, supaya klien tidak
  // membanjiri Worker dengan probing yang sama.
  blockedCacheTtl: 60
};
function isBpsHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return h === "bps.go.id" || h.endsWith(".bps.go.id");
}
__name(isBpsHost, "isBpsHost");
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "anon";
}
__name(clientIp, "clientIp");
async function bacaKuota(env, ip) {
  const kv = env && env.RATE_KV;
  if (!kv) return null;
  const key = "bps:" + ip;
  const now = Date.now();
  let rec = null;
  try {
    rec = await kv.get(key, "json");
  } catch {
    return null;
  }
  if (!rec || typeof rec.resetAt !== "number" || typeof rec.n !== "number") {
    return { key, n: 0, resetAt: now + RATE_LIMIT_BPS.windowMs, baru: true };
  }
  if (now >= rec.resetAt) {
    return { key, n: 0, resetAt: now + RATE_LIMIT_BPS.windowMs, baru: true };
  }
  return { key, n: rec.n, resetAt: rec.resetAt, baru: false };
}
__name(bacaKuota, "bacaKuota");
async function tulisKuota(env, k) {
  const kv = env && env.RATE_KV;
  if (!kv) return;
  try {
    await kv.put(k.key, JSON.stringify({ n: k.n, resetAt: k.resetAt }), {
      expirationTtl: Math.ceil(RATE_LIMIT_BPS.windowMs / 1e3) + 3600
    });
  } catch {
  }
}
__name(tulisKuota, "tulisKuota");
function headerKuota(k) {
  const sisa = Math.max(0, RATE_LIMIT_BPS.max - k.n);
  return {
    "X-RateLimit-Limit": String(RATE_LIMIT_BPS.max),
    "X-RateLimit-Remaining": String(sisa),
    "X-RateLimit-Reset": String(Math.ceil(k.resetAt / 1e3))
  };
}
__name(headerKuota, "headerKuota");
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
      detail: "Setiap alamat IP hanya boleh " + RATE_LIMIT_BPS.max + " request ke BPS per 24 jam, cukup untuk satu analisis polygon. Kuota berikutnya tersedia pukul " + teks + " WIB.",
      resetAt: k.resetAt,
      limit: RATE_LIMIT_BPS.max
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil((k.resetAt - Date.now()) / 1e3))),
        ...headerKuota(k),
        ...corsHeaders(origin)
      }
    }
  );
}
__name(respons429, "respons429");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
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
      "User-Agent": "Mozilla/5.0 (compatible; kta-cors-proxy/1.0)",
      "Accept": request.headers.get("Accept") || "*/*"
    };
    const contentType = request.headers.get("Content-Type");
    if (contentType) fwdHeaders["Content-Type"] = contentType;
    const isBhumiHost = target.hostname === "bhumi.atrbpn.go.id";
    const isBhumiMprx = isBhumiHost && (target.pathname === "/mprx" || target.pathname.startsWith("/mprx/"));
    const isBhumiExpapi = isBhumiHost && (target.pathname === "/expapi" || target.pathname.startsWith("/expapi/"));
    if (isBhumiMprx || isBhumiExpapi) {
      fwdHeaders["Referer"] = "https://bhumi.atrbpn.go.id/peta";
      fwdHeaders["Origin"] = "https://bhumi.atrbpn.go.id";
    }
    const authorization = request.headers.get("Authorization");
    if (authorization && isBhumiExpapi) fwdHeaders["Authorization"] = authorization;
    let body = null;
    if (method === "POST") {
      body = await request.arrayBuffer();
    }
    try {
      const upstream = await fetch(target.toString(), {
        method,
        headers: fwdHeaders,
        body: method === "POST" ? body : void 0,
        redirect: "follow",
        // Tile persil BHUMI bersifat publik dan nyaris tidak berubah; di-cache
        // di edge supaya pemetaan (ratusan tile per layar) tidak membebani
        // maupun menghafal ulang permintaan ke server ATR/BPN.
        cf: { cacheTtl: isBhumiMprx ? 86400 : 0 }
      });
      const outHeaders = new Headers(corsHeaders(origin));
      const ct = upstream.headers.get("Content-Type");
      if (ct) outHeaders.set("Content-Type", ct);
      outHeaders.set("X-Proxy-Status", String(upstream.status));
      if (isBhumiMprx && method === "GET" && upstream.ok) {
        outHeaders.set("Cache-Control", "public, max-age=86400");
      }
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

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-pxIeSc/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-pxIeSc/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
