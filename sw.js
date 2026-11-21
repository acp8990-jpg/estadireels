// EstadíReels · service worker: la app funciona sin conexión y los reels ya vistos se guardan en el móvil.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`, VIDEOS = "videos-v1";
const BASE = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "iconos/icono-192.png", "iconos/icono-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);

// Respuesta 206 a partir del vídeo completo guardado (Safari pide los vídeos por rangos).
const rango = async (req, res) => {
  const h = req.headers.get("range");
  if (!h) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(h) || [];
  const ini = m[1] ? Number(m[1]) : 0, fin = m[2] ? Number(m[2]) : buf.byteLength - 1;
  return new Response(buf.slice(ini, fin + 1), {
    status: 206,
    headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${ini}-${fin}/${buf.byteLength}`, "Content-Length": String(fin - ini + 1), "Accept-Ranges": "bytes" },
  });
};

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith(".mp4")) {
    e.respondWith((async () => {
      const c = await caches.open(VIDEOS);
      const guardado = await c.match(url.pathname);
      if (guardado) return rango(e.request, guardado);
      // primera vez: se sirve de la red y se descarga entero en segundo plano para la próxima
      e.waitUntil(fetch(url.pathname).then((r) => (r.ok && r.status === 200 ? c.put(url.pathname, r) : null)).catch(() => {}));
      return fetch(e.request);
    })());
    return;
  }
  // resto (app, datos, portadas): red primero para tener siempre la última versión; caché si no hay conexión
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
