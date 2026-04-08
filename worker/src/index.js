/**
 * Cloudflare Worker: KV lookup → 302 redirect + async click logging to YOURLS.
 * Expects KV values to be plain destination URLs (same as YOURLS plugin PUT body).
 */
export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return proxyToOrigin(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");
    const firstSegment = path.split("/")[0];

    if (!firstSegment) {
      return proxyToOrigin(request, env);
    }

    const reserved = new Set([
      "admin",
      "yourls-loader.php",
      "yourls-infos.php",
      "readme.html",
      "css",
      "images",
      "js",
      "includes",
      "user",
      "log-click.php",
    ]);

    if (reserved.has(firstSegment.toLowerCase())) {
      return proxyToOrigin(request, env);
    }

    const keyword = firstSegment;
    let destination = await env.KV.get(keyword);

    if (!destination) {
      return proxyToOrigin(request, env);
    }

    destination = destination.trim();
    if (!/^https?:\/\//i.test(destination)) {
      return proxyToOrigin(request, env);
    }

    if (request.method === "GET") {
      ctx.waitUntil(logClick(env, request, keyword));
    }

    return Response.redirect(destination, 302);
  },
};

function proxyToOrigin(request, env) {
  const originBase = env.ORIGIN_URL.replace(/\/$/, "");
  const url = new URL(request.url);
  const target = new URL(originBase + url.pathname + url.search);
  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers: request.headers,
      redirect: "manual",
    })
  );
}

async function logClick(env, request, shortcode) {
  const secret = env.LOGGING_SECRET;
  if (!secret || !env.LOG_ENDPOINT) {
    return;
  }

  const body = JSON.stringify({
    shortcode,
    ip: request.headers.get("CF-Connecting-IP") || "",
    referrer: request.headers.get("Referer") || "",
    userAgent: request.headers.get("User-Agent") || "",
    country: request.headers.get("CF-IPCountry") || "",
  });

  try {
    await fetch(env.LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": secret,
      },
      body,
    });
  } catch {
    // Non-blocking: redirect already sent
  }
}
