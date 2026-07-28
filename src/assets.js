(function () {
  "use strict";

  const ASSET_URLS = {
    appIcon: "assets/app-icon.svg",
    targetPaper: "assets/target-paper.svg",
    targetSteel: "assets/target-steel.svg",
    targetDummy: "assets/dummy-target.svg",
    targetSniper: "assets/sniper-target.svg",
    weaponPistol: "assets/pistol.svg",
    weaponRifle: "assets/rifle.svg",
    weaponSniper: "assets/sniper-rifle.svg",
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
