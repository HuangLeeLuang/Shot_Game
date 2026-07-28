const CACHE_NAME = "shooting-game-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/data.js",
  "./src/storage.js",
  "./src/audio.js",
  "./src/assets.js",
  "./src/gameplay.js",
  "./src/app.js",
  "./assets/README.md",
  "./assets/app-icon.svg",
  "./assets/ai/target-paper-real.png",
  "./assets/ai/target-steel-real.png",
  "./assets/ai/target-dummy-real.png",
  "./assets/ai/target-sniper-real.png",
  "./assets/ai/target-defense-human-real.png",
  "./assets/ai/target-sniper-human-real.png",
  "./assets/ai/level-defense-real.png",
  "./assets/ai/level-sniper-real.png",
  "./assets/ai/weapon-pistol-real.png",
  "./assets/ai/weapon-rifle-real.png",
  "./assets/ai/weapon-sniper-real.png",
  "./assets/target-paper.svg",
  "./assets/target-steel.svg",
  "./assets/dummy-target.svg",
  "./assets/sniper-target.svg",
  "./assets/pistol.svg",
  "./assets/rifle.svg",
  "./assets/sniper-rifle.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
