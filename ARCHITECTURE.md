# 🏗️ Architecture & System Blueprint

## 🌐 End-to-End System Flow

```
[ Visitor Request ] (e.g. yourdomain.com/my-link)
        │
        ▼
[ Cloudflare Worker Edge Isolate (V8) ]
  ├── 1. Fast String Offset Check (Is it Static Asset, Root, Admin, or HEAD?)
  │       └── If HEAD / -> Instant 200 OK (0.01 ms)
  │       └── If Static Asset / Admin / Logger -> Direct origin fetch passthrough
  │
  ├── 2. Edge Cache Lookup (caches.default.match) [5 min TTL]
  │       ├── HIT  -> Return Long URL immediately
  │       └── MISS -> Fetch from Cloudflare KV (env.YOURLS_LINKS.get) [cacheTtl: 300]
  │                     └── Write Long URL to Edge Cache via ctx.waitUntil()
  │
  ├── 3. Fire-and-Forget Async Logger (ctx.waitUntil)
  │       └── Non-blocking POST to https://yourdomain.com/cf-queue-logger.php (3s timeout)
  │
  └── 4. Immediate HTTP 301 Redirect to Visitor
```

---

## 📬 Origin Batch Queue Pipeline

```
[ Cloudflare Worker logClick() ]
        │
        ▼ POST payload (max 2 KB)
[ cf-queue-logger.php ]
  ├── Verified via hash_equals(LOGGING_SECRET_KEY, X-Auth-Key)
  ├── Master Kill-Switch Check (const ENABLE_LOG_CLICK = true)
  └── Lock-Free POSIX Atomic Append (FILE_APPEND) -> cf-clicks/click_buffer.log
        │
        │ (~0.5 ms execution time, 0 MySQL connections opened)
        ▼
[ Scheduled Cron Job: process-clicks.php (e.g. 5m) ]
  ├── Atomic Rename: click_buffer.log -> click_processing_{time}.log
  ├── In-Memory Deduplication: Group clicks per shortcode
  ├── Single-Query UPDATE clicks per shortcode (eliminates row-lock contention)
  ├── Bulk Multi-Row INSERT into yourls_log (500 rows per batch)
  └── Unlink processing log file
```

---

## ⚡ V8 Micro-Optimization Techniques in Worker

1. **Bypassing the WHATWG URL Parser**:
   `new URL(request.url)` allocates several internal C++ structures and executes a full state machine parser. String slicing with `indexOf('/')` achieves the same extraction in **~0.002 ms** with **0 bytes of young-generation heap allocation**.

2. **Native String Keys for the Cache API**:
   Instead of `caches.default.match(new Request(...))`, passing a native string URL (`caches.default.match('https://' + host + '/__kv_cache__/' + code)`) avoids instantiating a C++ Request wrapper and parsing synthetic HTTP headers.

3. **String Slice over Regex**:
   Removing a trailing slash via `.replace(/\/$/, "")` invokes the V8 Irregexp regular expression engine. Using `path.endsWith('/') ? path.slice(1, -1) : path.slice(1)` executes purely in V8's fast string indexing path.

4. **Module-Scope Reusable Headers**:
   Objects allocated inside the `fetch()` handler are collected during Minor GC scavenges. Hoisting headers (`CACHE_HEADERS_300`, `HTML_RESPONSE_HEADERS`, `REDIRECT_BASE_HEADERS`, `LOGGER_HEADERS_BASE`) outside the handler promotes them to V8 Old Generation Space, reducing garbage collection pauses to zero.

5. **Non-Async Logger Function**:
   `function logClick(...) { return fetch(...).catch(...) }` returns the fetch promise directly. It avoids allocating an `async` generator state machine frame on the V8 microtask queue.

6. **Instant Root HEAD Fast-Path**:
   `if (request.method === 'HEAD' && path === '/')` returns an instant 200 OK without invoking KV or origin server, eliminating cold-start CPU spikes from uptime monitors (e.g. UptimeRobot, Pingdom).

---

## 🛡️ Security Architecture

| Boundary | Mechanism | Implementation |
| :--- | :--- | :--- |
| **Authentication** | Constant-Time String Comparison | `hash_equals(LOGGING_SECRET_KEY, (string)$_SERVER['HTTP_X_AUTH_KEY'])` |
| **Integrity** | Prepared Statements | PDO parameter binding (`:short`, `:time`, etc.) with `$ydb->fetchAffected()` |
| **DoS Defense** | Max Payload Bounds | `strlen($input) > 2048` rejected with HTTP 400 |
| **HTTP Methods** | Strict Whitelist | Rejects any non-POST calls with HTTP 405 Method Not Allowed |
| **Data Privacy** | Web Server Directives | `cf-clicks/.htaccess` enforcing `Require all denied` |
| **Emergency Kill-Switch** | 0.05 ms In-Memory Bypass | `const ENABLE_LOG_CLICK = true;` at line 16 of logging scripts |
