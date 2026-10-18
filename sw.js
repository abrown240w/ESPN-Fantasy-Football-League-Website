// Service worker: keeps a copy of the site on the device so the home-screen app opens instantly,
// and saves the last data it loaded so the app still shows something with a weak or no signal.
//
// - Site files (page, script, styles, icons): served from the saved copy right away, then quietly
//   re-checked; when a new version has been published the page is told to reload.
// - League data (/api/...): always tries the network first. If there's no answer within a few
//   seconds (or no connection), the last saved copy is used and the page shows an "offline" note.
// - Images from other sites (team logos, headshots): saved after the first load.

const VERSION = "v1";
const SHELL = `shell-${VERSION}`, DATA = "data-v1", IMAGES = "images-v1";
const SHELL_FILES = ["/", "/app.js", "/demo.js", "/styles.css", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
const API_TIMEOUT_MS = 4000;
const MAX_IMAGES = 400;

const tell = async (msg) => { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); };
const versionOf = (res) => res && (res.headers.get("etag") || res.headers.get("last-modified"));

async function saveShell() {
  const cache = await caches.open(SHELL);
  await Promise.all(SHELL_FILES.map(async (f) => {
    try {
      const res = await fetch(f, { cache: "no-cache" });
      if (res.ok) await cache.put(f, res);
    } catch { /* keep the old copy */ }
  }));
}

self.addEventListener("install", (e) => {
  e.waitUntil(saveShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, DATA, IMAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page asks for a fresh copy of the site files before reloading for a new version.
self.addEventListener("message", (e) => {
  if (e.data?.type === "refresh") e.waitUntil(saveShell().then(() => e.ports[0]?.postMessage("done")));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/auth") return; // always live
      e.respondWith(networkFirst(e, req));
    } else if (req.cache === "no-store") {
      return; // the page's own "is there a new version?" check
    } else if (req.mode === "navigate" || SHELL_FILES.includes(url.pathname)) {
      e.respondWith(siteFile(e, req, req.mode === "navigate" ? "/" : url.pathname));
    }
  } else if (req.destination === "image") {
    e.respondWith(savedImage(e, req));
  }
});

// Saved copy first (instant), then check the network in the background for a newer version.
async function siteFile(e, req, key) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match(key);
  const update = fetch(key, { cache: "no-cache" }).then(async (res) => {
    if (!res.ok) return res;
    const changed = saved && versionOf(saved) && versionOf(res) && versionOf(saved) !== versionOf(res);
    await cache.put(key, res.clone());
    if (changed && key === "/app.js") tell({ type: "updated" });
    return res;
  }).catch(() => null);
  if (saved) { e.waitUntil(update); return saved; }
  return (await update) || Response.error();
}

// Network first; after a few seconds (or with no connection) fall back to the last saved copy.
async function networkFirst(e, req) {
  const cache = await caches.open(DATA);
  const network = fetch(req).then(async (res) => {
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set("x-saved-at", String(Date.now()));
      await cache.put(req, new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers }));
      tell({ type: "online" });
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  const timeout = new Promise((r) => setTimeout(r, API_TIMEOUT_MS, "timeout"));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== "timeout") return first;
  } catch { /* no connection */ }
  const saved = await cache.match(req);
  if (saved) {
    tell({ type: "offline", at: Number(saved.headers.get("x-saved-at")) || null });
    return saved;
  }
  return network; // nothing saved yet: wait for the network (or fail as before)
}

// Logos and headshots from other sites: saved after the first load.
async function savedImage(e, req) {
  const cache = await caches.open(IMAGES);
  const saved = await cache.match(req);
  if (saved) return saved;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      e.waitUntil(cache.put(req, res.clone()).then(async () => {
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_IMAGES))) await cache.delete(k);
      }));
    }
    return res;
  } catch {
    return Response.error();
  }
}
