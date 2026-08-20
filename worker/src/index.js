/**
 * YOURLS Cloudflare Edge Redirect Worker
 *
 * High-performance edge redirection and analytics bridge for YOURLS.
 *
 * Core Features:
 * 1. Edge KV lookup backed by Cloudflare Cache API (5-min tier to minimize KV reads).
 * 2. Negative edge caching for 404s (protects KV read quotas against bot probes/scrapers).
 * 3. Fully customizable bot filtering & reserved route bypass.
 * 4. Social media link preview compatibility (WhatsApp, Telegram, Discord, Twitter, etc.).
 * 5. Transparent query/UTM parameter forwarding.
 * 6. Asynchronous background click logging (non-blocking) with loopback prevention.
 */

// ============================================================================
// 🤖 1. BOT CATEGORY DENYLIST (CUSTOMIZABLE)
// ============================================================================
/**
 * Bot categories (from Cloudflare Bot Management) whose VERIFIED bots will NOT
 * trigger click logging to your origin (`cf-click-logger.php`).
 *
 * Why this is useful:
 * Prevents uptime monitors, pingers, and ad scrapers from skewing your real click analytics.
 *
 * Cloudflare Bot Management Categories reference:
 * - "Monitoring & Analytics" (e.g., UptimeRobot, Pingdom, Google Analytics bots)
 * - "Security Scanner"      (e.g., Qualys, Nessus, Netcraft)
 * - "Advertising"           (e.g., Ad previewers, pixel trackers)
 * - "Security"              (e.g., Security scanners & automated crawlers)
 * - "Advertising & Marketing"
 * - "Search Engine Crawler" (e.g., Googlebot, Bingbot - optional, remove if you want search bots logged)
 * - "AI Crawler"            (e.g., GPTBot, ClaudeBot, Bytespider)
 *
 * Customization options:
 * - Option A: Add/remove string categories in the Set below.
 * - Option B: Set `BOT_CATEGORY_DENYLIST` environment variable in wrangler.toml or Cloudflare Dashboard (comma-separated).
 */
const DEFAULT_BOT_CATEGORY_DENYLIST = new Set([
  "Monitoring & Analytics",
  "Security Scanner",
  "Advertising",
  "Security",
  "Advertising & Marketing",
]);

// ============================================================================
// 🛑 2. RESERVED PATHS (CUSTOMIZABLE)
// ============================================================================
/**
 * Paths that should NEVER be treated as YOURLS short codes.
 * Requests matching any of these paths are immediately passed through to your origin server.
 *
 * Add your own custom roots, landing pages, or public files here.
 * (Path comparison is case-insensitive and trims leading/trailing slashes).
 *
 * Examples:
 * - Standard web roots: "favicon.ico", "robots.txt", "sitemap.xml", "ads.txt", "security.txt"
 * - Custom origin pages: "about", "contact", "pricing", "terms", "privacy", "blog"
 * - Custom apps/endpoints: "api", "docs", "app", "status", ".well-known"
 *
 * Customization options:
 * - Option A: Add paths to the Set below.
 * - Option B: Set `RESERVED_PATHS` environment variable in wrangler.toml or Cloudflare Dashboard (comma-separated).
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

// ============================================================================
// ⚙️ 3. STATIC ASSETS & KEYWORD PATTERNS (CUSTOMIZABLE)
// ============================================================================
/**
 * Regex matching static file extensions that bypass short-code resolution and fetch directly from origin.
 */
const STATIC_ASSETS = /\.(png|jpg|jpeg|gif|ico|css|js|woff2?|svg|webp|map|json|txt|xml|pdf)$/i;

/**
 * Regex matching valid YOURLS keywords.
 * Default allows alphanumeric characters, dashes, and underscores (e.g., /my-link_123).
 * Any request not matching this pattern bypasses KV lookup and goes straight to origin.
 */
const VALID_KEYWORD_REGEX = /^[a-z0-9-]+$/i;

/**
 * Fallback regex for unverified social bots / link preview scrapers.
 * Allows rich OpenGraph link preview embeds to load properly on chat & social apps.
 */
const UNVERIFIED_SOCIAL_BOT_REGEX =
  /whatsapp|telegrambot|vkshare|discordbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|applebot/i;

// ============================================================================
// 🎨 4. CUSTOM ERROR TEMPLATES (CUSTOMIZABLE)
// ============================================================================
const CUSTOM_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: #f8fafc;
      color: #0f172a;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0f172a; color: #f8fafc; }
    }
    main { text-align: center; max-width: 26rem; }
    h1 { font-size: 4rem; font-weight: 800; line-height: 1; margin-bottom: 0.75rem; letter-spacing: -0.05em; color: #6366f1; }
    h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { font-size: 0.95rem; line-height: 1.5; opacity: 0.8; }
  </style>
</head>
<body>
  <main>
    <h1>404</h1>
    <h2>Link Not Found</h2>
    <p>The short link you requested does not exist or has been removed.</p>
  </main>
</body>
</html>`;

const getCustomErrorHtml = (errorCode) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${errorCode} Server Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: #f8fafc;
      color: #0f172a;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0f172a; color: #f8fafc; }
    }
    main { text-align: center; max-width: 26rem; }
    h1 { font-size: 4rem; font-weight: 800; line-height: 1; margin-bottom: 0.75rem; letter-spacing: -0.05em; color: #ef4444; }
    h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { font-size: 0.95rem; line-height: 1.5; opacity: 0.8; }
  </style>
</head>
<body>
  <main>
    <h1>${errorCode}</h1>
    <h2>Service Temporarily Unavailable</h2>
    <p>We are having trouble connecting to the destination server. Please try again later.</p>
  </main>
</body>
</html>`;

// ============================================================================
// 🚀 5. MAIN WORKER ROUTING HANDLER
// ============================================================================
export default {
  async fetch(request, env, ctx) {
    // 1. Safeguard: stop logger loopbacks instantly
    if (request.headers.get("X-From-Logger") === "1") {
      return fetch(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 2. Direct passthrough for homepage, admin, API, log bridge, or static assets
    if (
      path === "/" ||
      path.startsWith("/admin") ||
      path.includes("yourls-api.php") ||
      path === "/cf-click-logger.php" ||
      STATIC_ASSETS.test(path)
    ) {
      return fetch(request);
    }

    const shortcode = path.substring(1).replace(/\/$/, "");
    if (!shortcode) return fetch(request);

    const isStats = shortcode.endsWith("+");
    const actualCode = isStats ? shortcode.slice(0, -1) : shortcode;

    // Helper resolution for dynamic/custom configuration
    const activeReservedPaths = getReservedPaths(env);
    const activeBotDenylist = getBotCategoryDenylist(env);

    // Bypass KV if path is reserved or not a valid keyword format
    if (activeReservedPaths.has(actualCode.toLowerCase())) return fetch(request);
    if (!VALID_KEYWORD_REGEX.test(actualCode)) return fetch(request);

    // --- 3. EDGE CACHE LOOKUP (5 MINUTES) ---
    const cache = caches.default;
    const cacheKey = new Request(
      `https://${url.hostname}/__kv_cache__/${encodeURIComponent(actualCode)}`
    );

    let longUrl = null;
    let isKnownNotFound = false;

    // A. Check Cloudflare Edge Cache first
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      if (cachedResponse.status === 404) {
        isKnownNotFound = true;
      } else {
        longUrl = await cachedResponse.text();
      }
    }

    // B. Check KV Database if not in Edge Cache
    if (!longUrl && !isKnownNotFound) {
      longUrl = await env.YOURLS_LINKS.get(actualCode);

      if (longUrl) {
        // Cache successful URL result in Edge Cache for 5 minutes (300 seconds)
        ctx.waitUntil(
          cache.put(
            cacheKey,
            new Response(longUrl, {
              headers: { "Cache-Control": "max-age=300" },
            })
          )
        );
      } else {
        // Cache 404s for 5 minutes so scanning bots don't exhaust KV read quotas
        ctx.waitUntil(
          cache.put(
            cacheKey,
            new Response("not found", {
              status: 404,
              headers: { "Cache-Control": "max-age=300" },
            })
          )
        );
      }
    }

    const botCategory = request.cf?.botManagement?.category;

    // If we have a long URL (from Cache or KV), process the redirect
    if (longUrl) {
      if (isStats) return fetch(request);

      // Denylist bot check against active bot category filters
      const isBadBot =
        request.cf?.botManagement?.verifiedBot &&
        activeBotDenylist.has(botCategory);

      // Asynchronously log click to origin if not a denied bot
      if (!isBadBot) {
        ctx.waitUntil(logClick(request, actualCode, env, url.hostname));
      }

      // Preserve incoming query params / UTM tags & filter Cloudflare challenge tags
      const destinationUrl = new URL(longUrl);
      url.searchParams.forEach((value, key) => {
        if (!key.startsWith("__cf_chl_")) {
          destinationUrl.searchParams.append(key, value);
        }
      });

      return new Response(null, {
        status: 301,
        headers: {
          Location: destinationUrl.toString(),
          "Cache-Control": "public, max-age=60",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    // 4. Smart Origin Fallback (Happens if KV or Cache returned Not Found)
    try {
      const originRes = await fetch(request);
      const userAgent = request.headers.get("User-Agent") || "";

      // Check if it's a social/link preview bot
      const isSocialBot =
        botCategory === "Page Preview" ||
        UNVERIFIED_SOCIAL_BOT_REGEX.test(userAgent);

      if (originRes.status === 404) {
        // Feed bots 200 OK so OpenGraph/meta tags parse cleanly; feed humans 404
        const statusCode = isSocialBot ? 200 : 404;
        return new Response(CUSTOM_404_HTML, {
          status: statusCode,
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      if (originRes.status >= 500) {
        const statusCode = isSocialBot ? 200 : originRes.status;
        return new Response(getCustomErrorHtml(originRes.status), {
          status: statusCode,
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      return originRes;
    } catch {
      const userAgent = request.headers.get("User-Agent") || "";
      const isSocialBot =
        botCategory === "Page Preview" ||
        UNVERIFIED_SOCIAL_BOT_REGEX.test(userAgent);

      const statusCode = isSocialBot ? 200 : 503;
      return new Response(getCustomErrorHtml(503), {
        status: statusCode,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
  },
};

// ============================================================================
// 🛠️ 6. HELPER FUNCTIONS
// ============================================================================

/**
 * Resolves active bot category denylist (merges defaults with optional env.BOT_CATEGORY_DENYLIST).
 */
function getBotCategoryDenylist(env) {
  if (env?.BOT_CATEGORY_DENYLIST) {
    return new Set(
      env.BOT_CATEGORY_DENYLIST.split(",").map((item) => item.trim())
    );
  }
  return DEFAULT_BOT_CATEGORY_DENYLIST;
}

/**
 * Resolves active reserved paths (merges defaults with optional env.RESERVED_PATHS).
 */
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

/**
 * Asynchronously sends click metrics to origin cf-click-logger.php bridge.
 */
async function logClick(request, shortcode, env, hostname) {
  const logHost = hostname || new URL(request.url).hostname;
  const endpoint = env?.LOGGING_ENDPOINT || "/cf-click-logger.php";
  const formattedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const logUrl = `https://${logHost}${formattedEndpoint}`;

  try {
    await fetch(logUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": env.LOGGING_SECRET_KEY,
        "X-From-Logger": "1",
      },
      body: JSON.stringify({
        shortcode,
        ip: request.headers.get("CF-Connecting-IP"),
        userAgent: request.headers.get("User-Agent"),
        referrer: request.headers.get("Referer"),
        country: request.headers.get("CF-IPCountry"),
      }),
    });
  } catch {
    // Non-blocking background log
  }
}
