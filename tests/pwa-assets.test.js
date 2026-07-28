const fs = require("fs");
const assert = require("assert");

const index = fs.readFileSync("index.html", "utf8");
assert(index.includes('rel="manifest"'), "index links the web app manifest");
assert(index.includes("src/assets.js"), "index loads the asset preloader");

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
assert.strictEqual(manifest.display, "fullscreen", "manifest uses fullscreen display");
assert.strictEqual(manifest.orientation, "landscape", "manifest requests landscape play");
assert(manifest.icons.length > 0, "manifest has an install icon");

const serviceWorker = fs.readFileSync("sw.js", "utf8");
const cachedPaths = [...serviceWorker.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
assert(cachedPaths.includes("index.html"), "service worker caches index.html");
assert(cachedPaths.includes("src/assets.js"), "service worker caches the asset loader");
assert(cachedPaths.includes("assets/app-icon.svg"), "service worker caches the app icon");
assert(cachedPaths.includes("assets/ai/target-paper-real.png"), "service worker caches AI target assets");
assert(cachedPaths.includes("assets/ai/weapon-rifle-real.png"), "service worker caches AI weapon assets");
assert(cachedPaths.includes("assets/ai/target-defense-human-real.png"), "service worker caches defense human target asset");
assert(cachedPaths.includes("assets/ai/target-sniper-human-real.png"), "service worker caches sniper human target asset");
assert(cachedPaths.includes("assets/ai/level-defense-real.png"), "service worker caches defense background asset");
assert(cachedPaths.includes("assets/ai/level-sniper-real.png"), "service worker caches sniper background asset");
assert(serviceWorker.includes("shooting-game-v9"), "service worker cache version is bumped for effect toggles");

for (const path of cachedPaths) {
  assert(fs.existsSync(path), `cached path exists: ${path}`);
}

console.log("pwa assets ok");
