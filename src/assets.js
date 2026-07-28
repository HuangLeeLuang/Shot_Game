(function () {
  "use strict";

  const ASSET_URLS = {
    appIcon: "assets/app-icon.svg",
    targetPaper: "assets/ai/target-paper-real.png",
    targetSteel: "assets/ai/target-steel-real.png",
    targetDummy: "assets/ai/target-dummy-real.png",
    targetSniper: "assets/ai/target-sniper-real.png",
    targetDefenseHuman: "assets/ai/target-defense-human-real.png",
    targetSniperHuman: "assets/ai/target-sniper-human-real.png",
    levelDefense: "assets/ai/level-defense-real.png",
    levelSniper: "assets/ai/level-sniper-real.png",
    weaponPistol: "assets/ai/weapon-pistol-real.png",
    weaponRifle: "assets/ai/weapon-rifle-real.png",
    weaponSniper: "assets/ai/weapon-sniper-real.png",
  };

  const images = {};
  const ready = [];

  function loadImage(id, src) {
    if (typeof Image === "undefined") return;
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.src = src;
    images[id] = image;
    ready.push(
      new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }),
    );
  }

  Object.entries(ASSET_URLS).forEach(([id, src]) => loadImage(id, src));

  function get(id) {
    const image = images[id];
    if (!image || !image.complete || image.naturalWidth <= 0) return null;
    return image;
  }

  window.GameAssets = {
    urls: ASSET_URLS,
    get,
    ready: Promise.allSettled(ready),
  };
})();
