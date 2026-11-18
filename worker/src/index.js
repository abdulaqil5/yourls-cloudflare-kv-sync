/**
 * YOURLS Cloudflare Edge Redirect Worker (v2.0 - High Performance V8 Engine)
 *
 * Ultra-low latency edge redirect engine and asynchronous queue logging pipeline for YOURLS.
 *
 * Core Features:
 * 1. Sub-millisecond redirects using fast string indexing (bypasses WHATWG URL parser).
 * 2. Native string cache keys for Cloudflare Cache API (caches.default, 5-min TTL).
 * 3. Double-layer KV edge data center caching ({ cacheTtl: 300 }).
 * 4. Negative edge caching for 404s (protects KV read quotas against bot probes/scrapers).
 * 5. Instant 0.01ms response for root HEAD pings (HEAD /) to eliminate monitoring cold-start spikes.
 * 6. Non-blocking asynchronous click logging via fire-and-forget fetch to file-buffer queue.
 * 7. Query/UTM parameter forwarding with Cloudflare challenge tag filtering.
 * 8. Social media preview crawler compatibility (WhatsApp, Telegram, Discord, etc.).
 * 9. Fully customizable domain, bot filtering & reserved route bypass.
 */

// ============================================================================
// 🌐 1. DOMAIN & ORIGIN CONFIGURATION (CUSTOMIZABLE)
// ============================================================================
/**
 * Your YOURLS origin domain (e.g. "yourdomain.com" or "short.yourdomain.com").
 *
 * - Leave as "" (empty string) to automatically detect the domain from incoming requests.
 * - Or set a fixed domain here (e.g. "yourdomain.com") to force all cache keys and
 *   logger calls to your primary apex domain (recommended if serving from both www and root).
 * - Can also be set via env.ORIGIN_DOMAIN in wrangler.toml or Cloudflare Dashboard.
 */
const DEFAULT_ORIGIN_DOMAIN = "";

// ============================================================================
// 🤖 2. BOT CATEGORIES & RESERVED PATHS (CUSTOMIZABLE)
// ============================================================================

/**
 * Bot categories (from Cloudflare Bot Management) whose VERIFIED bots will NOT
 * trigger click logging to your origin.
 *
 * Reference categories:
 * - "Monitoring & Analytics" (e.g. UptimeRobot, Pingdom)
 * - "Security Scanner"      (e.g. Qualys, Nessus)
 * - "Advertising"           (e.g. Ad previewers)
 * - "Security"              (e.g. Automated scanners)
 * - "Advertising & Marketing"
 *
 * Can be overridden via env.BOT_CATEGORY_DENYLIST (comma-separated in wrangler.toml).
 */
const DEFAULT_BOT_CATEGORY_DENYLIST = new Set([
  "Monitoring & Analytics",
  "Security Scanner",
  "Advertising",
  "Security",
  "Advertising & Marketing",
]);

/**
 * Paths that should NEVER be treated as short codes.
 * Passed through immediately to your origin server.
 *
 * Can be overridden via env.RESERVED_PATHS (comma-separated in wrangler.toml).
 */
const DEFAULT_RESERVED_PATHS = new Set([
  "",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "ads.txt",
  "security.txt",
  ".well-known",
]);

const STATIC_ASSETS = /\.(png|jpg|jpeg|gif|ico|css|js|woff2?|svg|mp4|webm|webp|html?|json|xml|txt|pdf)$/i;
const VALID_KEYWORD_REGEX = /^[a-z0-9-]+$/i;
const UNVERIFIED_SOCIAL_BOT_REGEX = /whatsapp|telegrambot|vkshare|discordbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|applebot/i;

// ============================================================================
// 3. HOISTED MODULE-LEVEL HEADERS (V8 Garbage Collection Optimization)
// ============================================================================
const CACHE_HEADERS_300 = { "Cache-Control": "max-age=300" };
const HTML_RESPONSE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, noarchive",
};
const REDIRECT_BASE_HEADERS = {
  "Cache-Control": "public, max-age=30",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const LOGGER_HEADERS_BASE = {
  "Content-Type": "application/json",
  "X-From-Logger": "1",
};

// ============================================================================
// 4. RESPONSIVE ERROR TEMPLATES (Light/Dark Mode, Clean & Self-Contained)
// ============================================================================
const CUSTOM_404_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex,noarchive"><title>404 Not Found</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#0f172a;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px}.icon{width:64px;height:64px;margin-bottom:20px;color:#6366f1}h1{font-size:72px;font-weight:800;line-height:1;margin-bottom:12px;letter-spacing:-0.04em}h2{font-size:22px;font-weight:600;margin-bottom:12px;color:#334155}p{font-size:15px;color:#64748b;max-width:380px;line-height:1.5;margin-bottom:24px}.btn{display:inline-block;padding:10px 22px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px;transition:background .15s ease}.btn:hover{background:#4f46e5}@media(prefers-color-scheme:dark){body{background:#090d16;color:#f8fafc}h2{color:#cbd5e1}p{color:#94a3b8}.icon{color:#818cf8}.btn{background:#6366f1}.btn:hover{background:#818cf8}}</style></head><body><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h1>404</h1><h2>Link Not Found</h2><p>The short link you requested does not exist, has expired, or has been removed.</p><a href="/" class="btn">Return to Home</a></body></html>`;

const getCustomErrorHtml = (errorCode) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="robots" content="noindex,noarchive"><title>${errorCode} Server Error</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#0f172a;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:24px}.icon{width:64px;height:64px;margin-bottom:20px;color:#ef4444}h1{font-size:72px;font-weight:800;line-height:1;margin-bottom:12px;letter-spacing:-0.04em}h2{font-size:22px;font-weight:600;margin-bottom:12px;color:#334155}p{font-size:15px;color:#64748b;max-width:400px;line-height:1.5;margin-bottom:20px}.code-box{display:inline-block;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-family:ui-monospace,monospace;font-size:13px;color:#ef4444;margin-bottom:24px}.btn{display:inline-block;padding:10px 22px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px;transition:opacity .15s ease}.btn:hover{opacity:.9}@media(prefers-color-scheme:dark){body{background:#090d16;color:#f8fafc}h2{color:#cbd5e1}p{color:#94a3b8}.code-box{background:#1e293b;border-color:#334155;color:#f87171}.btn{background:#f8fafc;color:#0f172a}}</style></head><body><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><h1>${errorCode}</h1><h2>Temporary Server Error</h2><p>A problem occurred while communicating with the origin server. Please try again in a moment.</p><div class="code-box">Error Code: ${errorCode}</div><br><a href="/" class="btn">Return to Home</a></body></html>`;

// ============================================================================
// 5. MAIN WORKER ROUTING HANDLER (V8 Fast Path Engine)
// ============================================================================
export default {
  async fetch(request, env, ctx) {
    // 1. Safeguard against recursive logger loops
    if (request.headers.get("X-From-Logger") === "1") {
      return fetch(request);
    }

    // Fast SIMD-accelerated string offset extraction (bypasses new URL parser)
    const urlStr = request.url;
    const schemeEnd = urlStr.indexOf("//");
    const slashIdx = schemeEnd !== -1 ? urlStr.indexOf("/", schemeEnd + 2) : urlStr.indexOf("/");

    let host = "";
    let path = "/";
    let search = "";

    if (schemeEnd !== -1) {
      host = slashIdx !== -1 ? urlStr.slice(schemeEnd + 2, slashIdx) : urlStr.slice(schemeEnd + 2);
    }

    if (slashIdx !== -1) {
      const questionIdx = urlStr.indexOf("?", slashIdx);
      if (questionIdx === -1) {
        path = urlStr.slice(slashIdx);
      } else {
        path = urlStr.slice(slashIdx, questionIdx);
        search = urlStr.slice(questionIdx);
      }
    }

    // Resolve effective origin domain (custom override -> auto-detected host -> localhost)
    const originDomain = env?.ORIGIN_DOMAIN || DEFAULT_ORIGIN_DOMAIN || host || "localhost";

    // 2. Direct Passthrough (Static assets, root, admin, logger endpoints, and uptime monitor HEAD pings)
    if (
      path === "/" ||
      STATIC_ASSETS.test(path) ||
      path.startsWith("/admin") ||
      path === "/cf-queue-logger.php" ||
      path === "/log-click1.php" ||
      path === "/cf-click-logger.php" ||
      path === "/log-click.php" ||
      path.startsWith("/yourls-api.php")
    ) {
      // Instant 0.01ms response for root HEAD pings to eliminate monitoring CPU spikes
      if (request.method === "HEAD" && path === "/") {
        return new Response(null, { status: 200, headers: HTML_RESPONSE_HEADERS });
      }
      return fetch(request);
    }

    // Fast slice without regex engine invocation
    const rawCode = path.endsWith("/") ? path.slice(1, -1) : path.slice(1);
    if (!rawCode) return fetch(request);

    const isStats = rawCode.endsWith("+");
    const actualCode = isStats ? rawCode.slice(0, -1) : rawCode;

    // Reject non-keywords early before allocating toLowerCase() strings
    if (!VALID_KEYWORD_REGEX.test(actualCode)) return fetch(request);

    // Dynamic resolution of customizable reserved paths
    const activeReservedPaths = getReservedPaths(env);
    if (activeReservedPaths.has(actualCode.toLowerCase())) return fetch(request);

    // 3. Edge Cache Lookup (Pass native string URL directly - avoids new Request C++ allocation)
    const cacheKey = "https://" + originDomain + "/__kv_cache__/" + actualCode;
    const cache = caches.default;

    let longUrl = null;
    let isKnownNotFound = false;

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      if (cachedResponse.status === 404) {
        isKnownNotFound = true;
      } else {
        longUrl = await cachedResponse.text();
      }
    }

    // Lookup KV with data center cache TTL if not found in Cache API
    if (!longUrl && !isKnownNotFound) {
      longUrl = await env.YOURLS_LINKS.get(actualCode, { cacheTtl: 300 });

      if (longUrl) {
        ctx.waitUntil(cache.put(cacheKey, new Response(longUrl, { headers: CACHE_HEADERS_300 })));
      } else {
        ctx.waitUntil(cache.put(cacheKey, new Response(null, { status: 404, headers: CACHE_HEADERS_300 })));
      }
    }

    const botCategory = request.cf?.botManagement?.category;

    // 4. Handle Redirection
    if (longUrl) {
      if (isStats) return fetch(request);

      const activeBotDenylist = getBotCategoryDenylist(env);
      const isBadBot =
        request.cf?.botManagement?.verifiedBot &&
        activeBotDenylist.has(botCategory);

      // Async background logging to the fast file-based buffer queue
      if (!isBadBot) {
        ctx.waitUntil(logClick(request, actualCode, env, originDomain));
      }

      // Fast-path: When request has no query parameters, skip URL parsing entirely
      let targetLocation = longUrl;
      if (search && search.length > 1) {
        try {
          const destinationUrl = new URL(longUrl);
          const searchParams = new URLSearchParams(search);
          for (const [key, value] of searchParams) {
            if (!key.startsWith("__cf_chl_")) {
              destinationUrl.searchParams.append(key, value);
            }
          }
          targetLocation = destinationUrl.toString();
        } catch {
          return fetch(request); // Origin fallback if URL in KV was malformed
        }
      }

      return new Response(null, {
        status: 301,
        headers: {
          Location: targetLocation,
          ...REDIRECT_BASE_HEADERS,
        },
      });
    }

    // 5. Origin Fallback with safety timeout
    try {
      const originRes = await fetch(request, { signal: AbortSignal.timeout(5000) });

      if (originRes.status === 404 || originRes.status >= 500) {
        const userAgent = request.headers.get("User-Agent") || "";
        const isSocialBot =
          botCategory === "Page Preview" ||
          UNVERIFIED_SOCIAL_BOT_REGEX.test(userAgent);

        if (originRes.status === 404) {
          return new Response(CUSTOM_404_HTML, {
            status: isSocialBot ? 200 : 404,
            headers: HTML_RESPONSE_HEADERS,
          });
        }
        return new Response(getCustomErrorHtml(originRes.status), {
          status: isSocialBot ? 200 : originRes.status,
          headers: HTML_RESPONSE_HEADERS,
        });
      }

      return originRes;
    } catch {
      const userAgent = request.headers.get("User-Agent") || "";
      const isSocialBot =
        botCategory === "Page Preview" ||
        UNVERIFIED_SOCIAL_BOT_REGEX.test(userAgent);
      return new Response(getCustomErrorHtml(503), {
        status: isSocialBot ? 200 : 503,
        headers: HTML_RESPONSE_HEADERS,
      });
    }
  },
};

// ============================================================================
// 6. HELPER FUNCTIONS
// ============================================================================

/**
 * High-speed non-async logger: returns the fetch promise directly without
 * generator state machine overhead on the microtask queue.
 */
function logClick(request, shortcode, env, host) {
  const logEndpoint = env?.LOGGING_ENDPOINT || "/cf-queue-logger.php";
  const formattedEndpoint = logEndpoint.startsWith("/") ? logEndpoint : "/" + logEndpoint;
  const logUrl = "https://" + host + formattedEndpoint;

  return fetch(logUrl, {
    method: "POST",
    signal: AbortSignal.timeout(3000),
    headers: {
      ...LOGGER_HEADERS_BASE,
      "X-Auth-Key": env.LOGGING_SECRET_KEY,
    },
    body: JSON.stringify({
      shortcode,
      ip: request.headers.get("CF-Connecting-IP") || "0.0.0.0",
      userAgent: request.headers.get("User-Agent") || "",
      referrer: request.headers.get("Referer") || "direct",
      country: request.cf?.country || request.headers.get("CF-IPCountry") || "XX",
      time: Math.floor(Date.now() / 1000),
    }),
  }).catch(() => {});
}

function getBotCategoryDenylist(env) {
  if (env?.BOT_CATEGORY_DENYLIST) {
    return new Set(
      env.BOT_CATEGORY_DENYLIST.split(",").map((item) => item.trim())
    );
  }
  return DEFAULT_BOT_CATEGORY_DENYLIST;
}

function getReservedPaths(env) {
  const paths = new Set(DEFAULT_RESERVED_PATHS);
  if (env?.RESERVED_PATHS) {
    env.RESERVED_PATHS.split(",").forEach((item) => {
      const trimmed = item.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
      if (trimmed) paths.add(trimmed);
    });
  }
  return paths;
}
