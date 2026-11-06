/* Vssyl offline shell — native service worker.
 *
 * Cache policy: versioned application shell + public static assets only.
 * Never cache protected HTML, authentication responses, or arbitrary API GETs.
 */
const CACHE_VERSION = "ltc-offline-shell-v4";
const SHELL_URLS = [
  "/offline.html",
  "/space-offline.js",
  "/space-offline-store.js",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
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

const PUSH_TITLE = "Vssyl";
const PUSH_BODY = "Operational attention requires review";
const ATTENTION_ID = /^[A-Za-z0-9_-]{8,64}$/;

function attentionClickPath(data) {
  const attentionId = data && typeof data.attentionId === "string" ? data.attentionId : "";
  if (ATTENTION_ID.test(attentionId)) {
    return `/notifications?attention=${encodeURIComponent(attentionId)}`;
  }
  return "/notifications";
}

self.addEventListener("push", (event) => {
  let attentionId = "";
  let renotify = false;
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed.attentionId === "string" && ATTENTION_ID.test(parsed.attentionId)) {
        attentionId = parsed.attentionId;
      }
      if (parsed && parsed.renotify === true) renotify = true;
    } catch {
      attentionId = "";
      renotify = false;
    }
  }
  event.waitUntil(
    self.registration.showNotification(PUSH_TITLE, {
      body: PUSH_BODY,
      tag: attentionId ? `attention-${attentionId}` : "vssyl-attention",
      renotify,
      data: attentionId ? { attentionId } : {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(attentionClickPath(event.notification.data), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        let sameOrigin = false;
        try {
          sameOrigin = new URL(client.url).origin === self.location.origin;
        } catch {
          sameOrigin = false;
        }
        if (!sameOrigin) continue;
        try {
          if (typeof client.focus === "function") await client.focus();
        } catch {
          continue;
        }
        if (typeof client.navigate !== "function") continue;
        try {
          const navigated = await client.navigate(target);
          if (navigated) return;
        } catch {
          // This window could not move. Try another, then open one.
        }
      }
      if (typeof self.clients.openWindow === "function") {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
