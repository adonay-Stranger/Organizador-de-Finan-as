// Service worker: guarda os arquivos do app para abrir sem internet.
// Ao mudar algum arquivo do app, aumente a versão abaixo.
const VERSAO = "minha-obra-v3";
const ARQUIVOS = [
  "./", "./index.html", "./styles.css", "./app.js", "./store.js", "./firebase-config.js",
  "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  // bibliotecas do Firebase e fontes: guarda a cópia para uso offline
  const estatico = url.hostname === "www.gstatic.com" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname === "fonts.gstatic.com";
  if (!mesmoSite && !estatico) return; // chamadas ao banco de dados passam direto

  // arquivos do app: tenta a rede primeiro (para pegar atualizações), cai no cache se offline
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: mesmoSite }).then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined))),
  );
});
