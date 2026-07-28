(function () {
  "use strict";

  const STORAGE_KEY = "shooting-game-save-v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultCustomConfig() {
    const sliders = {};
    window.GameData.SLIDERS.forEach((slider) => {
      sliders[slider.id] = slider.neutral;
    });

    return {
      name: "",
      sliders,
      attachments: {
        optic: "redDot",
        muzzle: "standard",
        grip: "none",
        magazine: "standard",
        stock: "standard",
        ammoType: "standard",
      },
    };
  }

  function defaultCustomConfigs() {
    const configs = {};
    Object.keys(window.GameData.WEAPONS).forEach((weaponId) => {
      configs[weaponId] = [defaultCustomConfig(), defaultCustomConfig(), defaultCustomConfig()];
    });
    return configs;
  }

  function createDefaultSave() {
    return {
      version: 1,
      settings: clone(window.GameData.DEFAULT_SETTINGS),
      records: {
        formal: {},
        custom: {},
      },
      customConfigs: defaultCustomConfigs(),
      tutorialSeen: {},
    };
  }

  function mergeSettings(settings) {
    const defaults = clone(window.GameData.DEFAULT_SETTINGS);
    const merged = Object.assign(defaults, settings || {});
    merged.bindings = Object.assign(
      clone(window.GameData.DEFAULT_BINDINGS),
      defaults.bindings || {},
      (settings && settings.bindings) || {},
    );
    merged.touchLayout = Object.assign(
      clone(window.GameData.DEFAULT_TOUCH_LAYOUT),
      defaults.touchLayout || {},
      (settings && settings.touchLayout) || {},
    );
    return merged;
  }

  function normalizeSave(raw) {
    const base = createDefaultSave();
    if (!raw || typeof raw !== "object") return base;
    base.version = raw.version || 1;
    base.settings = mergeSettings(raw.settings);
    base.records = {
      formal: Object.assign({}, raw.records && raw.records.formal),
      custom: Object.assign({}, raw.records && raw.records.custom),
    };
    base.customConfigs = Object.assign(base.customConfigs, raw.customConfigs || {});
    Object.keys(window.GameData.WEAPONS).forEach((weaponId) => {
      if (!Array.isArray(base.customConfigs[weaponId])) {
        base.customConfigs[weaponId] = [defaultCustomConfig(), defaultCustomConfig(), defaultCustomConfig()];
      }
      while (base.customConfigs[weaponId].length < 3) {
        base.customConfigs[weaponId].push(defaultCustomConfig());
      }
    });
    base.tutorialSeen = Object.assign({}, raw.tutorialSeen || {});
    return base;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeSave(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn("Failed to load save data", error);
      return createDefaultSave();
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function recordScore(data, mode, key, record) {
    const bucket = mode === "custom" ? data.records.custom : data.records.formal;
    const previous = bucket[key];
    if (!previous || isBetterRecord(record, previous)) {
      bucket[key] = record;
      save(data);
      return true;
    }
    return false;
  }

  function ratingValue(rating) {
    return { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 }[rating] || 0;
  }

  function isBetterRecord(next, previous) {
    if (ratingValue(next.rating) !== ratingValue(previous.rating)) {
      return ratingValue(next.rating) > ratingValue(previous.rating);
    }
    if (Math.round(next.score) !== Math.round(previous.score)) {
      return next.score > previous.score;
    }
    return next.timeMs < previous.timeMs;
  }

  window.GameStorage = {
    STORAGE_KEY,
    clone,
    createDefaultSave,
    defaultCustomConfig,
    load,
    save,
    clear,
    recordScore,
  };
})();
