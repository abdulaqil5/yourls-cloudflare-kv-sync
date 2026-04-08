/**
 * YOURLS edge redirect + KV cache + optional click logging.
 * KV binding: YOURLS_LINKS (see wrangler.toml). Secret: LOGGING_SECRET_KEY (same as user/config.php).
 */

/**
 * Bot categories (Cloudflare Bot Management) whose **verified** bots should **not** trigger
 * click logging to your origin (`log-click.php`). Strings must match the category names Cloudflare
 * exposes on `request.cf.botManagement` (when available on your plan).
 *
 * Docs: https://developers.cloudflare.com/bots/concepts/bot/ (Bot Management / verified bots).
 * Add or remove category names below to tune which bots are excluded from stats.
 */
const BOT_CATEGORY_DENYLIST = new Set([
  "Monitoring & Analytics",
  "Security Scanner",
  "Advertising",
]);

/**
 * Paths matching this regex are passed straight to the origin (`fetch(request)`) and never
 * treated as short keywords. Extend the pattern if you serve more static file types from the
 * same hostname (e.g. add `webp`, `map`, or `json` if needed).
 */
const STATIC_ASSETS = /\.(png|jpg|jpeg|gif|ico|css|js|woff2?|svg)$/i;

/**
 * HTML returned when there is **no KV hit** and the origin responds with **404**. Replace the
 * whole template string with your own branded page, or keep this minimal default.
 */
const CUSTOM_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: #f5f5f5;
      color: #111;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #eee; }
    }
    main { text-align: center; max-width: 22rem; }
    h1 { font-size: 3.5rem; font-weight: 700; line-height: 1; margin-bottom: 0.75rem; }
    p { font-size: 1rem; line-height: 1.5; opacity: 0.9; }
  </style>
</head>
<body>
  <main>
    <h1>404</h1>
    <p>The page you requested could not be found.</p>
  </main>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (
      path === "/" ||
      path.startsWith("/admin") ||
      path.includes("yourls-api.php") ||
      STATIC_ASSETS.test(path)
    ) {
      return fetch(request);
    }

    const shortcode = path.substring(1).replace(/\/$/, "");
    if (!shortcode) return fetch(request);

    const isStatsRequest = shortcode.endsWith("+");
    const actualShortcode = isStatsRequest ? shortcode.slice(0, -1) : shortcode;

    const longUrl = await env.YOURLS_LINKS.get(actualShortcode);

    if (longUrl) {
      if (isStatsRequest) return fetch(request);

      const botInfo = request.cf?.botManagement;
      const isDeniedBot =
        botInfo?.verifiedBot && BOT_CATEGORY_DENYLIST.has(botInfo?.category);
      if (!isDeniedBot) {
        ctx.waitUntil(logClickToOrigin(request, actualShortcode, env));
      }

      return new Response(null, {
        status: 301,
        headers: {
          Location: longUrl,
          "Cache-Control": "public, max-age=3600",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    const originResponse = await fetch(request);

    if (originResponse.status === 404) {
      return new Response(CUSTOM_404_HTML, {
        status: 404,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    return originResponse;
  },
};

async function logClickToOrigin(request, shortcode, env) {
  const urlObj = new URL(request.url);
  const logUrl = `https://${urlObj.hostname}/log-click.php`;
  const body = JSON.stringify({
    shortcode,
    ip: request.headers.get("CF-Connecting-IP"),
    userAgent: request.headers.get("User-Agent"),
    referrer: request.headers.get("Referer"),
    country: request.headers.get("CF-IPCountry"),
  });

  try {
    await fetch(logUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": env.LOGGING_SECRET_KEY,
      },
      body,
    });
  } catch {
    // Non-blocking
  }
}
