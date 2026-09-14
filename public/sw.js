const CACHE_NAME = "leadflow-v4";

// Cache static Next.js assets cache-first
const STATIC_RE = /^\/_next\/static\//;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// ── Web Push ────────────────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  const data = e.data ? e.data.json() : {};
  const title = data.title ?? "ข้อความใหม่";
  const options = {
    body: data.body ?? "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    data: { convId: data.convId },
    tag: data.convId ?? "msg",   // group by conversation — replaces previous notification
    renotify: true,
  };

  e.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      if (data.badge != null && "setAppBadge" in self.navigator) {
        return self.navigator.setAppBadge(data.badge);
      }
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const convId = e.notification.data?.convId;

  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window and tell it to open the conversation
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            client.postMessage({ type: "OPEN_CONV", convId });
            return client.focus();
          }
        }
        // No window open — open a new one with convId in query
        return self.clients.openWindow(convId ? `/?convId=${convId}` : "/");
      }),
  );
});

// ── Fetch cache ─────────────────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle GET; skip API and Supabase calls
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co")
  ) {
    return;
  }

  // Cache-first for immutable Next.js chunks
  if (STATIC_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for HTML and icons
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (url.pathname === "/" || url.pathname.startsWith("/icons/"))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
