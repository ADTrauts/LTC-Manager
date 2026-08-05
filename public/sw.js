/* LTC Manager Phase 6A — native service worker.
 *
 * Cache policy: versioned application shell + public static assets only.
 * Never cache protected HTML, authentication responses, or arbitrary API GETs.
 */
const CACHE_VERSION = "ltc-offline-shell-v1";
const SHELL_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(SHELL_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ltc-offline-shell-") && k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAuthOrApiPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.includes("pin-login")
  );
}

function isProtectedHtmlPath(pathname) {
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/icons/")) return false;
  if (pathname === "/offline.html") return false;
  if (pathname === "/manifest.webmanifest") return false;
  // App routes under the protected shell must not be cached as HTML.
  return (
    pathname.startsWith("/unit/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/employees") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/staffing") ||
    pathname.startsWith("/today") ||
    pathname.startsWith("/units")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept auth/API — network only, no cache write.
  if (isAuthOrApiPath(url.pathname)) {
    return;
  }

  // Never cache protected HTML documents.
  if (req.mode === "navigate" || req.destination === "document") {
    if (isProtectedHtmlPath(url.pathname)) {
      event.respondWith(
        fetch(req).catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          const offline = await cache.match("/offline.html");
          return offline || new Response("Offline. Reconnect to continue.", { status: 503 });
        }),
      );
      return;
    }
  }

  // Shell assets: cache-first for allowlisted URLs only.
  if (SHELL_URLS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // Versioned Next static assets may be cached when fetched successfully.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (
            (await cache.match("/offline.html")) ||
            new Response("Offline", { status: 503 })
          );
        }
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
