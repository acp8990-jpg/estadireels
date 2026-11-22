// EstadíReels · service worker: la app funciona sin conexión y los reels ya vistos se guardan en el móvil.
const VERSION = "v6";
const SHELL = `shell-${VERSION}`, VIDEOS = "videos-v2";
const BASE = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "iconos/icono-192.png", "iconos/icono-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())));
// Borra del móvil las copias de vídeos que ya no están en el temario actual (versiones antiguas).
const limpiarVideos = async () => {
  try {
    const d = await (await fetch("datos/reels.json", { cache: "no-cache" })).json();
    const vale = new Set(d.reels.filter((r) => r.video).map((r) => new URL(r.video, self.registration.scope)).map((u) => u.pathname + u.search));
    const c = await caches.open(VIDEOS);
    for (const k of await c.keys()) {
      const u = new URL(k.url);
      if (!vale.has(u.pathname + u.search)) await c.delete(k);
    }
  } catch { /* sin conexión: ya se limpiará */ }
};
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith("shell-") && k !== SHELL) || (k.startsWith("videos-") && k !== VIDEOS)).map((k) => caches.delete(k)))).then(() => self.clients.claim()).then(limpiarVideos)),
);

// Respuesta 206 a partir del vídeo completo guardado (sin conexión; Safari pide los vídeos por rangos).
const rango = async (req, res) => {
  const h = req.headers.get("range");
  if (!h) return res;
  const buf = await res.arrayBuffer();
  const n = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(h) || [];
  let ini, fin;
  if (!m[1] && m[2]) { ini = Math.max(0, n - Number(m[2])); fin = n - 1; } // «bytes=-N»: los N últimos
  else { ini = m[1] ? Number(m[1]) : 0; fin = m[2] ? Math.min(Number(m[2]), n - 1) : n - 1; }
  if (ini >= n) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${n}` } });
  return new Response(buf.slice(ini, fin + 1), {
    status: 206,
    headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${ini}-${fin}/${n}`, "Content-Length": String(fin - ini + 1), "Accept-Ranges": "bytes" },
  });
};

// Guarda una copia completa del vídeo para verlo sin conexión y borra las versiones anteriores del mismo reel.
const enCurso = new Set();
const guardarVideo = async (url) => {
  const clave = url.pathname + url.search; // ?v=… cambia cuando se rehace el vídeo
  if (enCurso.has(clave)) return;
  enCurso.add(clave);
  try {
    const c = await caches.open(VIDEOS);
    if (await c.match(clave)) return;
    const r = await fetch(clave);
    if (!(r.ok && r.status === 200)) return;
    await c.put(clave, r);
    for (const k of await c.keys()) {
      const u = new URL(k.url);
      if (u.pathname === url.pathname && u.search !== url.search) await c.delete(k);
    }
  } catch { /* sin conexión o sin espacio: se intentará otra vez */ } finally { enCurso.delete(clave); }
};

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith(".mp4")) {
    // Con conexión el navegador reproduce el vídeo directamente (lo más fiable) y aquí solo se guarda una copia.
    if (self.navigator.onLine !== false) { e.waitUntil(guardarVideo(url)); return; }
    // Sin conexión: desde la copia guardada.
    e.respondWith((async () => {
      const c = await caches.open(VIDEOS);
      const g = (await c.match(url.pathname + url.search)) || (await c.match(url.pathname, { ignoreSearch: true }));
      return g ? rango(e.request, g) : new Response(null, { status: 504 });
    })());
    return;
  }
  // resto (app, datos, portadas): red primero para tener siempre la última versión; caché si no hay conexión
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((r) => {
        if (r.ok) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
