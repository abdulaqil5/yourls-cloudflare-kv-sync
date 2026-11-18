# 📋 Changelog

All notable changes, optimizations, and security updates for the Cloudflare Worker & YOURLS integration are documented in this file.

---

## [v2.0.0] — 2026-11-18 [V8 FAST PATH & QUEUE SYSTEM ARCHITECTURE]

### ⚡ V8 Performance & Worker Engine
- **Fast String Indexing (Bypassing `new URL`)**: Replaced `new URL(request.url)` on the main request path with string slicing (`indexOf` / `slice`) to bypass heavy V8 URL parser overhead and eliminate heap allocation churn.
- **Native String Cache Keys**: Used URL strings directly in `caches.default.match()` and `put()` instead of allocating `new Request(...)`.
- **Double-Layer Datacenter Caching**: Added `{ cacheTtl: 300 }` to `env.YOURLS_LINKS.get(actualCode, { cacheTtl: 300 })` to cache KV reads in the local Cloudflare data center for 5 minutes during Tier 1 Cache misses.
- **Root HEAD Monitoring Fast-Path**: Instant 200 OK for `HEAD /` pings (`request.method === 'HEAD' && path === '/'`) to eliminate uptime monitor cold-start CPU spikes.
- **Fast Path Query Parameter Bypass**: When incoming requests contain no query string, bypasses `new URL(longUrl)` parsing and query param loop entirely.
- **Regex Elimination on Slashes**: Replaced `.replace(/\/$/, "")` with string slice (`path.endsWith('/') ? path.slice(1, -1) : path.slice(1)`).
- **Module-Level Header Hoisting**: Hoisted reusable static headers (`CACHE_HEADERS_300`, `HTML_RESPONSE_HEADERS`, `REDIRECT_BASE_HEADERS`, `LOGGER_HEADERS_BASE`) to module scope to eliminate V8 Minor GC garbage collection cycles.
- **Streamlined Non-Async Logger**: Returned fetch promise directly from `logClick()` without `async`/`await` generator state overhead.
- **Clean Self-Contained Error Templates**: Replaced external tracking scripts and third-party assets in 404 and 5xx error templates with modern, fully responsive, self-contained SVG light/dark mode designs.
- **Dynamic & Configurable Origin Domain**: Worker auto-detects incoming request host by default, or allows pinning a primary apex domain via `DEFAULT_ORIGIN_DOMAIN` or `env.ORIGIN_DOMAIN`.
- **Single-Line Minified Build**: Generated `worker.min.js` (~4.5 KB) for direct copy-paste deployment via Cloudflare Dashboard console.

### 📬 Asynchronous File-Buffered Queue System (`cf-queue-logger.php` & `process-clicks.php`)
- **Zero-Database Atomic File Buffer (`cf-queue-logger.php`)**: Implemented non-blocking atomic file append (`FILE_APPEND`) into `cf-clicks/click_buffer.log`, dropping origin wall time from 150 ms down to **< 0.5 ms** and eliminating database connection spikes.
- **Lock-Free POSIX Writes**: Individual click JSON payloads (~220 bytes) write atomically under the Linux kernel 4 KB buffer boundary without `LOCK_EX` mutex locking contention.
- **Cron Batch Processor (`process-clicks.php`)**: Scheduled 1-minute batch job that atomically rotates the buffer, aggregates keyword click counts in memory (1 UPDATE query per keyword), and performs bulk multi-row inserts into `yourls_log` (500 rows per batch).
- **Dual-Mode Logging Support**: Retained support for both Queue Mode (`cf-queue-logger.php`) and Direct Database Mode (`cf-click-logger.php`).

### 🛡️ Origin Security Hardening
- **Master Logging Switch**: Added `const ENABLE_LOG_CLICK = true;` to instantly drop all incoming click logs with zero disk/database overhead.
- **Constant-Time Comparison**: Enforced `hash_equals(LOGGING_SECRET_KEY, ...)` against `HTTP_X_AUTH_KEY` to prevent microsecond side-channel timing attacks.
- **Strict POST Enforcement**: Rejects non-POST requests with HTTP 405 Method Not Allowed.
- **Payload Bound**: Maximum 2 KB payload limit (`strlen > 2048`) returning HTTP 400.
- **Directory Privacy Shield**: Created `cf-clicks/.htaccess` (`Require all denied`) to prevent public HTTP access to buffer logs.

---

## [v1.2.0] — 2026-08-20 [EDGE CACHE & DIRECT DB LOGGING]

Associated Git Commits: [`6cecb1f`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/6cecb1f) .. [`aa5ff94`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/aa5ff94)

- [`aa5ff94`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/aa5ff94): `docs: polish README with clean layout, minimal emojis, and verified Cloudflare doc links`
- [`308ef62`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/308ef62): `docs: add note welcoming users to clone and improvise the code`
- [`3ebb4fd`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/3ebb4fd): `docs: add personal project note and Cloudflare dashboard worker routes bypass instructions`
- [`6cecb1f`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/6cecb1f): `feat: upgrade to v1.2 with Edge caching, bot denylist, social previews, and rename logger to cf-click-logger`
  - Added Cloudflare Edge Cache API Layer (5-minute memory cache via `caches.default`).
  - Added Negative 404 Caching for 5 minutes at edge to block brute-force scanners.
  - Added Keyword Renaming Sync in `plugin.php` (v1.2).
  - Added UTM and campaign query string passthrough with `__cf_chl_*` challenge token stripping.
  - Added Social link preview crawler detection (WhatsApp, Telegram, Discord, Twitter, Facebook, LinkedIn) returning HTTP 200.
  - Added Cloudflare Bot Management category denylist filtering.
  - Added `X-From-Logger` loopback prevention token.

---

## [v1.0.0] — 2026-04-08 [INITIAL RELEASE]

Associated Git Commits: [`8b57fa6`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/8b57fa6) .. [`c77f502`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/c77f502)

- [`c77f502`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/c77f502): `docs: update README title`
- [`8045076`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/8045076): `docs: frame README around personal goals (less DB load, fast redirects)`
- [`692ae20`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/692ae20): `refactor: move plugin to cloudflare-kv-sync at repo root`
- [`0766f0d`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/0766f0d): `docs: simplify README for a less technical audience`
- [`46e6193`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/46e6193): `worker: generic 404, inline docs for KV/bots/assets; README tweaks`
- [`ec52b62`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/ec52b62): `worker: align with production (YOURLS_LINKS, 301, bots, custom 404)`
- [`439309c`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/439309c): `docs: add GitHub push instructions`
- [`8b57fa6`](https://github.com/abdulaqil5/yourls-cloudflare-kv-sync/commit/8b57fa6): `Initial commit: YOURLS Cloudflare KV sync plugin and Worker`
  - Initial YOURLS plugin syncing `add_new_link`, `edit_link`, and `delete_link` to Cloudflare KV.
  - Initial edge redirect worker querying `env.YOURLS_LINKS`.
  - Direct HTTP logging bridge (`log-click.php`).
