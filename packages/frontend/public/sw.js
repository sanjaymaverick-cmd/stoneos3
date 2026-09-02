// StoneOS service worker.
//
// Deliberately minimal. The factory has both Wi-Fi and mobile data, so this is
// NOT an offline-first app — building write queuing, sync and conflict
// resolution would be a large, risky feature that the connectivity does not
// justify. What this does instead:
//
//   1. Makes the app installable, so it launches from the home screen without
//      browser chrome.
//   2. Keeps the shell responsive when the signal drops for a few seconds
//      walking between the yard and the shed — a cached shell beats Chrome's
//      dinosaur page.
//
// API responses are NEVER cached. Stale production or stock figures are worse
// than an honest error: a supervisor acting on yesterday's slab count causes
// real problems, and this app is the source of truth for what is standing in
// the yard.

const CACHE = "stoneos-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch the API or Clerk — auth and data must always hit the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  // Network-first for pages, falling back to a plain offline notice. No stale
  // page is served in place of a real one.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Static build assets are content-hashed by Next, so serving them from cache
  // can never return a stale version of a changed file.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
