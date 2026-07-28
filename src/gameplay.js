(function () {
  "use strict";

  const { LEVELS, DIFFICULTIES, WEAPONS, ATTACHMENTS } = window.GameData;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomVisibleCoord(center, min, max, radius) {
    const low = Math.max(min, center - radius);
    const high = Math.min(max, center + radius);
    if (low > high) return clamp(center, min, max);
    return random(low, high);
  }

  function normalizeAngle(angle) {
    return ((Math.round(angle) % 360) + 360) % 360;
  }

  function settingNumber(settings, key, fallback) {
    const value = Number(settings && settings[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function deltaAngle(current, previous) {
    let delta = current - previous;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return clamp(delta, -18, 18);
  }

  function curveGyroRate(rate, settings) {
    const deadzone = settingNumber(settings, "gyroDeadzone", 0.55);
    const acceleration = settingNumber(settings, "gyroAcceleration", 1.22);
    const magnitude = Math.abs(rate);
    if (magnitude <= deadzone) return 0;
    const trimmed = magnitude - deadzone;
    const fastTurn = clamp((trimmed - 35) / 160, 0, 1);
    return Math.sign(rate) * trimmed * lerp(1, acceleration, fastTurn);
  }

  function shapeMotionAxis(gravity) {
    const deadzone = 0.18;
    const range = 4.8;
    const magnitude = Math.abs(gravity);
    if (magnitude <= deadzone) return 0;
    const normalized = clamp((magnitude - deadzone) / range, 0, 1);
    return Math.sign(gravity) * normalized ** 1.12;
  }

  const AIM_BOUNDS = {
    minX: -0.44,
    maxX: 0.44,
    minY: -0.38,
    maxY: 0.36,
  };

  const FIRING_AREAS = {
    test: { left: 0.05, right: 0.95, top: 0.08, bottom: 0.9 },
    range: { left: 0.06, right: 0.94, top: 0.08, bottom: 0.9 },
    defense: { left: 0.06, right: 0.94, top: 0.1, bottom: 0.9 },
    sniper: { left: 0.06, right: 0.94, top: 0.08, bottom: 0.88 },
  };

  const TARGET_WORLD_BOUNDS = {
    test: { minX: 0.08, maxX: 0.92, minY: 0.14, maxY: 0.84 },
    range: { minX: 0.1, maxX: 0.9, minY: 0.16, maxY: 0.82 },
    defense: { minX: 0.12, maxX: 0.88, minY: 0.22, maxY: 0.82 },
    sniper: { minX: 0.14, maxX: 0.86, minY: 0.38, maxY: 0.7 },
  };

  function applyMod(stats, key, factor) {
    if (typeof stats[key] !== "number") return;
    stats[key] *= factor;
  }

  function findAttachment(slot, id) {
    return (ATTACHMENTS[slot] || []).find((item) => item.id === id) || ATTACHMENTS[slot][0];
  }

  function buildWeaponStats(weaponId, customConfig, difficultyId) {
    const base = WEAPONS[weaponId] || WEAPONS.rifle;
    const difficulty = DIFFICULTIES[difficultyId] || DIFFICULTIES.standard;
    const stats = Object.assign({}, base);
    stats.scope = "iron";
    stats.weaponId = weaponId;

    if (customConfig) {
      Object.entries(customConfig.attachments || {}).forEach(([slot, id]) => {
        const attachment = findAttachment(slot, id);
        if (!attachment) return;
        if (attachment.scope) stats.scope = attachment.scope;
        Object.entries(attachment.mods || {}).forEach(([key, factor]) => applyMod(stats, key, factor));
      });

      Object.entries(customConfig.sliders || {}).forEach(([key, value]) => {
        const factor = Number(value) / 100;
        applyMod(stats, key, Number.isFinite(factor) ? factor : 1);
      });
    } else {
      stats.scope = weaponId === "sniper" ? "scope" : weaponId === "rifle" ? "dot" : "iron";
    }

    stats.magSize = Math.round(clamp(stats.magSize, 1, 240));
    stats.reserve = Math.round(clamp(stats.reserve * difficulty.ammo, 0, 720));
    stats.damage = clamp(stats.damage, 0.2, 12);
    stats.fireRate = clamp(stats.fireRate, 0.25, 22);
    stats.reloadMs = clamp(stats.reloadMs, 160, 5200);
    stats.adsMs = clamp(stats.adsMs, 60, 1800);
    stats.recoil = clamp(stats.recoil, 0.5, 95);
    stats.spread = clamp(stats.spread, 0, 75);
    stats.sway = clamp(stats.sway, 0, 48);
    stats.recovery = clamp(stats.recovery, 1, 24);
    stats.zoom = clamp(stats.zoom, 0.8, 6);
    return stats;
  }

  function labelOf(value, lang) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[lang] || value.zh || value.en || "";
  }

  class GameRun {
    constructor(options) {
      this.options = options;
      this.canvas = options.canvas;
      this.ctx = this.canvas.getContext("2d");
      this.sound = options.sound;
      this.settings = options.settings;
      this.lang = options.lang || "zh";
      this.level = LEVELS[options.levelId] || LEVELS.range;
      this.difficulty = DIFFICULTIES[options.difficultyId] || DIFFICULTIES.standard;
      this.weaponId = options.weaponId || "rifle";
      this.customConfig = options.customConfig || null;
      this.customSlot = options.customSlot || 0;
      this.isCustom = Boolean(options.isCustom);
      this.mode = options.mode || "level";
      this.stats = buildWeaponStats(this.weaponId, this.customConfig, this.difficulty.id);
      this.totalTargets = this.mode === "test" ? Infinity : this.level.objective;
      this.ammoInMag = this.stats.magSize;
      this.reserveAmmo = this.mode === "test" ? 9999 : this.stats.reserve;
      this.initialAmmo = this.ammoInMag + this.reserveAmmo;
      this.nextFireAt = 0;
      this.reloadEndAt = 0;
      this.reloading = false;
      this.paused = false;
      this.finished = false;
      this.startedAt = performance.now();
      this.lastAt = this.startedAt;
      this.spawnTimer = 0;
      this.message = "";
      this.messageUntil = 0;
      this.aim = { x: 0, y: 0 };
      this.recoil = { x: 0, y: 0 };
      this.shake = 0;
      this.fireHeld = false;
      this.adsHeld = false;
      this.pointerLocked = false;
      this.touchMode = false;
      this.adsAmount = 0;
      this.targets = [];
      this.effects = [];
      this.decals = [];
      this.gyro = {
        enabled: false,
        supported: "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window,
        permissionAsked: false,
        calibration: null,
        filteredX: 0,
        filteredY: 0,
        rateX: 0,
        rateY: 0,
        indicatorX: 0,
        indicatorY: 0,
        lastOrientation: null,
        lastMotionAt: 0,
        motionRateActive: false,
        lastAt: 0,
        eventCount: 0,
        noDataTimer: 0,
      };
      this.metrics = {
        shots: 0,
        hits: 0,
        weakHits: 0,
        cleared: 0,
        missedOpportunities: 0,
        reactionTimes: [],
        score: 0,
      };
      this.raf = 0;
      this.cleanup = [];
      this.resize();
      this.bindEvents();
      this.sound.startMusic();
      if (this.mode === "test") {
        this.spawnTestTargets();
      }
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.width = Math.max(320, rect.width || window.innerWidth);
      this.height = Math.max(180, rect.height || window.innerHeight);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    bindEvents() {
      const onResize = () => this.resize();
      window.addEventListener("resize", onResize);
      this.cleanup.push(() => window.removeEventListener("resize", onResize));

      const onContext = (event) => event.preventDefault();
      this.canvas.addEventListener("contextmenu", onContext);
      this.cleanup.push(() => this.canvas.removeEventListener("contextmenu", onContext));

      const lockOverlay = document.getElementById("mouseLockOverlay");
      if (lockOverlay) {
        const onLockOverlayDown = (event) => {
          event.preventDefault();
          if (event.pointerType === "touch") {
            this.touchMode = true;
            this.updateMouseLockOverlay();
            return;
          }
          this.tryPointerLock();
        };
        lockOverlay.addEventListener("pointerdown", onLockOverlayDown);
        this.cleanup.push(() => lockOverlay.removeEventListener("pointerdown", onLockOverlayDown));
      }

      const onMouseMove = (event) => {
        if (event.pointerType && event.pointerType !== "mouse") return;
        if (this.requiresPointerLock() && !this.hasPointerLock()) return;
        this.moveAim(event.movementX || 0, event.movementY || 0, "mouse");
      };
      this.canvas.addEventListener("mousemove", onMouseMove);
      this.cleanup.push(() => this.canvas.removeEventListener("mousemove", onMouseMove));

      const onMouseDown = (event) => {
        if (event.button === 0 || event.button === 2) event.preventDefault();
        if (this.requiresPointerLock() && !this.hasPointerLock()) {
          this.tryPointerLock();
          return;
        }
        if (event.button === 0) {
          this.fireHeld = true;
          this.fire();
        } else if (event.button === 2) {
          this.adsHeld = true;
        }
      };
      const onMouseUp = (event) => {
        if (event.button === 0) this.fireHeld = false;
        if (event.button === 2) this.adsHeld = false;
      };
      this.canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mouseup", onMouseUp);
      this.cleanup.push(() => this.canvas.removeEventListener("mousedown", onMouseDown));
      this.cleanup.push(() => window.removeEventListener("mouseup", onMouseUp));

      const onPointerLockChange = () => {
        this.pointerLocked = this.hasPointerLock();
        if (!this.pointerLocked) {
          this.fireHeld = false;
          this.adsHeld = false;
        }
        this.updateMouseLockOverlay();
      };
      const onPointerLockError = () => {
        this.pointerLocked = false;
        this.fireHeld = false;
        this.adsHeld = false;
        this.updateMouseLockOverlay();
      };
      document.addEventListener("pointerlockchange", onPointerLockChange);
      document.addEventListener("pointerlockerror", onPointerLockError);
      this.cleanup.push(() => document.removeEventListener("pointerlockchange", onPointerLockChange));
      this.cleanup.push(() => document.removeEventListener("pointerlockerror", onPointerLockError));
      this.updateMouseLockOverlay();

      const touchState = { active: false, x: 0, y: 0 };
      const onPointerDown = (event) => {
        if (event.pointerType !== "touch") return;
        this.touchMode = true;
        this.updateMouseLockOverlay();
        touchState.active = true;
        touchState.x = event.clientX;
        touchState.y = event.clientY;
      };
      const onPointerMove = (event) => {
        if (!touchState.active || event.pointerType !== "touch") return;
        const dx = event.clientX - touchState.x;
        const dy = event.clientY - touchState.y;
        touchState.x = event.clientX;
        touchState.y = event.clientY;
        this.moveAim(dx, dy, "touch");
      };
      const onPointerUp = (event) => {
        if (event.pointerType === "touch") touchState.active = false;
      };
      this.canvas.addEventListener("pointerdown", onPointerDown);
      this.canvas.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      this.cleanup.push(() => this.canvas.removeEventListener("pointerdown", onPointerDown));
      this.cleanup.push(() => this.canvas.removeEventListener("pointermove", onPointerMove));
      this.cleanup.push(() => window.removeEventListener("pointerup", onPointerUp));

      const onKeyDown = (event) => {
        if (event.repeat) return;
        if (event.code === this.settings.bindings.reload || event.code === "KeyR") {
          this.reload();
        }
        if (event.code === this.settings.bindings.pause || event.code === "Escape") {
          this.options.onPauseRequest();
        }
      };
      window.addEventListener("keydown", onKeyDown);
      this.cleanup.push(() => window.removeEventListener("keydown", onKeyDown));

      document.querySelectorAll("[data-touch-action]").forEach((button) => {
        const action = button.dataset.touchAction;
        if (action === "gyro") {
          let lastToggleAt = 0;
          const toggleFromClick = (event) => {
            event.preventDefault();
            this.touchMode = true;
            this.updateMouseLockOverlay();
            const now = performance.now();
            if (now - lastToggleAt < 350) return;
            lastToggleAt = now;
            this.toggleGyro();
          };
          button.addEventListener("click", toggleFromClick);
          this.cleanup.push(() => button.removeEventListener("click", toggleFromClick));
          return;
        }
        const down = (event) => {
          event.preventDefault();
          if (action === "shoot") {
            this.fireHeld = true;
            this.fire();
          }
          if (action === "ads") this.adsHeld = true;
          if (action === "reload") this.reload();
          if (action === "pause") this.options.onPauseRequest();
        };
        const up = (event) => {
          event.preventDefault();
          if (action === "shoot") this.fireHeld = false;
          if (action === "ads") this.adsHeld = false;
        };
        button.addEventListener("pointerdown", down);
        button.addEventListener("pointerup", up);
        button.addEventListener("pointercancel", up);
        this.cleanup.push(() => button.removeEventListener("pointerdown", down));
        this.cleanup.push(() => button.removeEventListener("pointerup", up));
        this.cleanup.push(() => button.removeEventListener("pointercancel", up));
      });

      const onOrientation = (event) => this.handleOrientation(event);
      const onMotion = (event) => this.handleMotion(event);
      window.addEventListener("deviceorientation", onOrientation);
      window.addEventListener("devicemotion", onMotion);
      this.cleanup.push(() => window.removeEventListener("deviceorientation", onOrientation));
      this.cleanup.push(() => window.removeEventListener("devicemotion", onMotion));
    }

    tryPointerLock() {
      if (!this.requiresPointerLock()) return;
      if (this.hasPointerLock()) return;
      if (this.canvas.requestPointerLock) {
        try {
          const result = this.canvas.requestPointerLock();
          if (result && typeof result.catch === "function") {
            result.catch(() => this.updateMouseLockOverlay());
          }
        } catch (error) {
          // Pointer lock is optional.
        }
      }
    }

    requiresPointerLock() {
      return !this.touchMode;
    }

    hasPointerLock() {
      return document.pointerLockElement === this.canvas;
    }

    updateMouseLockOverlay() {
      const overlay = document.getElementById("mouseLockOverlay");
      if (!overlay) return;
      overlay.classList.toggle("active", this.requiresPointerLock() && !this.hasPointerLock() && !this.paused && !this.finished);
    }

    moveAim(dx, dy, source) {
      if (this.paused || this.finished) return;
      let sensitivity = this.settings.mouseSensitivity;
      if (source === "touch") sensitivity = this.settings.touchSensitivity;
      if (source === "gyro") sensitivity = this.settings.gyroSensitivity;
      const adsScale = lerp(1, 0.52 / Math.max(1, this.stats.zoom), this.adsAmount);
      const invert = this.settings.invertY ? -1 : 1;
      this.aim.x = clamp(this.aim.x + (dx * sensitivity * adsScale) / this.width, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
      this.aim.y = clamp(this.aim.y + (dy * sensitivity * adsScale * invert) / this.height, AIM_BOUNDS.minY, AIM_BOUNDS.maxY);
    }

    resetGyroTracking() {
      this.gyro.calibration = null;
      this.gyro.filteredX = 0;
      this.gyro.filteredY = 0;
      this.gyro.rateX = 0;
      this.gyro.rateY = 0;
      this.gyro.indicatorX = 0;
      this.gyro.indicatorY = 0;
      this.gyro.lastOrientation = null;
      this.gyro.lastMotionAt = 0;
      this.gyro.motionRateActive = false;
      this.gyro.lastAt = 0;
      this.gyro.eventCount = 0;
    }

    async toggleGyro() {
      if (!this.gyro.supported) {
        this.showMessage(this.t("gyroUnsupported"));
        return;
      }
      if (window.isSecureContext === false) {
        this.showMessage(this.t("gyroNeedHttps"), 2400);
        return;
      }
      try {
        if (!this.gyro.permissionAsked) {
          const granted = await this.requestGyroPermission();
          this.gyro.permissionAsked = true;
          if (!granted) return;
        }
        this.gyro.enabled = !this.gyro.enabled;
        this.resetGyroTracking();
        this.clearGyroNoDataTimer();
        this.showMessage(this.gyro.enabled ? this.t("gyroCalibrating") : this.t("gyroOff"), 1400);
        if (this.gyro.enabled) this.startGyroNoDataTimer();
        this.updateGyroUi();
      } catch (error) {
        this.showMessage(this.t(error && error.name === "NotAllowedError" ? "gyroPermissionDenied" : "gyroUnsupported"), 2600);
      }
    }

    async requestGyroPermission() {
      const requests = [];
      const DeviceOrientationEventRef = window.DeviceOrientationEvent;
      const DeviceMotionEventRef = window.DeviceMotionEvent;
      if (DeviceOrientationEventRef && typeof DeviceOrientationEventRef.requestPermission === "function") {
        requests.push(DeviceOrientationEventRef.requestPermission());
      }
      if (DeviceMotionEventRef && typeof DeviceMotionEventRef.requestPermission === "function") {
        requests.push(DeviceMotionEventRef.requestPermission());
      }
      if (requests.length === 0) return true;
      const results = await Promise.all(requests);
      const granted = results.every((result) => result === "granted");
      if (!granted) this.showMessage(this.t("gyroPermissionDenied"), 2800);
      return granted;
    }

    startGyroNoDataTimer() {
      this.clearGyroNoDataTimer();
      this.gyro.noDataTimer = window.setTimeout(() => {
        if (this.gyro.enabled && this.gyro.eventCount === 0) {
          this.showMessage(this.t("gyroNoData"), 3200);
        }
      }, 1800);
    }

    clearGyroNoDataTimer() {
      if (!this.gyro.noDataTimer) return;
      window.clearTimeout(this.gyro.noDataTimer);
      this.gyro.noDataTimer = 0;
    }

    handleOrientation(event) {
      if (!this.gyro.enabled || this.paused || this.finished) return;
      if (typeof event.beta !== "number" || typeof event.gamma !== "number") return;
      const angle = this.getScreenAngle();
      const now = typeof event.timeStamp === "number" && event.timeStamp > 0 ? event.timeStamp : performance.now();

      this.gyro.eventCount += 1;
      this.clearGyroNoDataTimer();

      const previous = this.gyro.lastOrientation;
      if (!previous || previous.angle !== angle) {
        this.gyro.calibration = {
          beta: event.beta,
          gamma: event.gamma,
          angle,
        };
        this.gyro.lastOrientation = {
          beta: event.beta,
          gamma: event.gamma,
          angle,
        };
        this.gyro.filteredX = 0;
        this.gyro.filteredY = 0;
        this.gyro.rateX = 0;
        this.gyro.rateY = 0;
        this.gyro.indicatorX = 0;
        this.gyro.indicatorY = 0;
        this.gyro.lastAt = now;
        this.showMessage(this.t("gyroReady"), 800);
        this.updateGyroUi();
        return;
      }

      const dt = clamp((now - (this.gyro.lastAt || now)) / 1000, 0.008, 0.05);
      this.gyro.lastAt = now;
      this.gyro.lastOrientation = {
        beta: event.beta,
        gamma: event.gamma,
        angle,
      };
      const mapped = this.mapGyroRate(deltaAngle(event.beta, previous.beta) / dt, deltaAngle(event.gamma, previous.gamma) / dt, angle);
      this.applyGyroRate(mapped.x, mapped.y, dt);
      this.updateGyroUi();
    }

    handleMotion(event) {
      if (!this.gyro.enabled || this.paused || this.finished) return;
      const now = typeof event.timeStamp === "number" && event.timeStamp > 0 ? event.timeStamp : performance.now();
      const angle = this.getScreenAngle();
      const rotation = event.rotationRate;
      if (rotation && (typeof rotation.beta === "number" || typeof rotation.gamma === "number")) {
        this.gyro.eventCount += 1;
        this.clearGyroNoDataTimer();
        if (this.gyro.calibration || this.gyro.lastOrientation) return;
        const dt = clamp((now - (this.gyro.lastAt || now)) / 1000, 0.008, 0.05);
        this.gyro.lastAt = now;
        this.gyro.lastMotionAt = now;
        this.gyro.motionRateActive = true;
        const mapped = this.mapGyroRate(Number(rotation.beta) || 0, Number(rotation.gamma) || 0, angle);
        this.applyGyroRate(mapped.x, mapped.y, dt);
        this.updateGyroUi();
        return;
      }

      const gravity = event.accelerationIncludingGravity;
      if (!gravity) return;
      if (typeof gravity.x !== "number" || typeof gravity.y !== "number") return;
      if (this.gyro.lastOrientation) return;
      if (this.gyro.motionRateActive && now - this.gyro.lastMotionAt < 500) return;
      this.gyro.eventCount += 1;
      this.clearGyroNoDataTimer();
      const tilt = this.mapMotionTilt(gravity.x, gravity.y, angle);
      const targetX = shapeMotionAxis(tilt.x);
      const targetY = shapeMotionAxis(tilt.y);
      const response = clamp(1 - settingNumber(this.settings, "gyroSmoothing", 0.28), 0.08, 1) * 0.36;
      this.gyro.filteredX = lerp(this.gyro.filteredX, targetX, response);
      this.gyro.filteredY = lerp(this.gyro.filteredY, targetY, response);
      const dt = clamp((now - (this.gyro.lastAt || now)) / 1000, 0.008, 0.05);
      this.gyro.lastAt = now;
      const adsScale = lerp(1, settingNumber(this.settings, "gyroAdsMultiplier", 0.58), this.adsAmount);
      const sensitivity = settingNumber(this.settings, "gyroSensitivity", 0.95);
      const vertical = settingNumber(this.settings, "gyroVerticalSensitivity", 0.78);
      const invert = this.settings.invertY ? -1 : 1;
      this.aim.x = clamp(this.aim.x + this.gyro.filteredX * 0.62 * dt * sensitivity * adsScale, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
      this.aim.y = clamp(this.aim.y + this.gyro.filteredY * 0.62 * dt * sensitivity * vertical * adsScale * invert, AIM_BOUNDS.minY, AIM_BOUNDS.maxY);
      this.gyro.indicatorX = this.gyro.filteredX;
      this.gyro.indicatorY = this.gyro.filteredY;
      this.updateGyroUi();
    }

    applyGyroRate(rawRateX, rawRateY, dt) {
      const safeDt = clamp(dt || 0, 0.008, 0.05);
      const response = clamp(1 - settingNumber(this.settings, "gyroSmoothing", 0.28), 0.08, 1);
      const xRate = curveGyroRate(clamp(rawRateX, -420, 420), this.settings);
      const yRate = curveGyroRate(clamp(rawRateY, -420, 420), this.settings);
      this.gyro.rateX = lerp(this.gyro.rateX || 0, xRate, response);
      this.gyro.rateY = lerp(this.gyro.rateY || 0, yRate, response);

      const adsScale = lerp(1, settingNumber(this.settings, "gyroAdsMultiplier", 0.58), this.adsAmount);
      const sensitivity = settingNumber(this.settings, "gyroSensitivity", 0.95);
      const vertical = settingNumber(this.settings, "gyroVerticalSensitivity", 0.78);
      const invert = this.settings.invertY ? -1 : 1;
      const rateToAim = 0.0108;
      this.aim.x = clamp(this.aim.x + this.gyro.rateX * safeDt * rateToAim * sensitivity * adsScale, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
      this.aim.y = clamp(this.aim.y + this.gyro.rateY * safeDt * rateToAim * sensitivity * vertical * adsScale * invert, AIM_BOUNDS.minY, AIM_BOUNDS.maxY);
      this.gyro.indicatorX = clamp(this.gyro.rateX / 150, -1, 1);
      this.gyro.indicatorY = clamp(this.gyro.rateY / 150, -1, 1);
    }

    getScreenAngle() {
      const screenRef = window.screen || {};
      const orientation = screenRef.orientation || {};
      if (typeof orientation.angle === "number") return normalizeAngle(orientation.angle);
      if (typeof window.orientation === "number") return normalizeAngle(window.orientation);
      return 0;
    }

    mapGyroRate(betaRate, gammaRate, angle = this.getScreenAngle()) {
      if (angle === 90) return { x: betaRate, y: -gammaRate };
      if (angle === 270) return { x: -betaRate, y: gammaRate };
      if (angle === 180) return { x: -gammaRate, y: -betaRate };
      return { x: gammaRate, y: betaRate };
    }

    mapMotionTilt(x, y, angle = this.getScreenAngle()) {
      if (angle === 90) return { x: -y, y: x };
      if (angle === 270) return { x: y, y: -x };
      if (angle === 180) return { x: -x, y: -y };
      return { x, y };
    }

    updateGyroUi() {
      const button = document.querySelector("[data-touch-action='gyro']");
      if (button) {
        button.classList.toggle("active", this.gyro.enabled);
        button.textContent = this.gyro.enabled ? "GYR+" : "GYR";
      }
      const indicator = document.getElementById("gyroIndicator");
      if (!indicator) return;
      indicator.classList.toggle("active", this.gyro.enabled);
      const dot = indicator.querySelector("span");
      if (dot) {
        dot.style.transform = `translate(${(this.gyro.indicatorX || 0) * 18}px, ${(this.gyro.indicatorY || 0) * 18}px)`;
      }
    }

    t(key) {
      return window.GameData.I18N[this.lang][key] || key;
    }

    showMessage(text, ms = 1100) {
      this.message = text;
      this.messageUntil = performance.now() + ms;
      if (this.options.onMessage) this.options.onMessage(text);
    }

    loop(now) {
      const dt = Math.min(0.04, (now - this.lastAt) / 1000 || 0);
      this.lastAt = now;
      if (!this.paused && !this.finished) {
        this.update(dt, now);
      }
      this.draw(now);
      this.updateHud(now);
      if (!this.finished) {
        this.raf = requestAnimationFrame(this.loop);
      }
    }

    update(dt, now) {
      const adsRate = 1000 / Math.max(80, this.stats.adsMs);
      this.adsAmount = clamp(this.adsAmount + (this.adsHeld ? adsRate : -adsRate * 1.4) * dt, 0, 1);
      if (this.fireHeld) this.fire();
      const recovery = this.stats.recovery * dt;
      this.recoil.x = lerp(this.recoil.x, 0, clamp(recovery, 0, 1));
      this.recoil.y = lerp(this.recoil.y, 0, clamp(recovery, 0, 1));
      this.shake = lerp(this.shake, 0, clamp(8 * dt, 0, 1));

      if (this.reloading && now >= this.reloadEndAt) {
        this.finishReload();
      }

      if (this.mode === "test") {
        this.updateTest(dt);
      } else if (this.level.id === "range") {
        this.updateRange(dt);
      } else if (this.level.id === "defense") {
        this.updateDefense(dt);
      } else if (this.level.id === "sniper") {
        this.updateSniper(dt);
      }

      this.effects = this.effects.filter((effect) => {
        effect.life -= dt;
        return effect.life > 0;
      });
    }

    updateTest(dt) {
      if (this.targets.length < 3) this.spawnTestTargets();
      this.targets.forEach((target) => {
        target.pulse += dt;
        this.clampTargetToFiringArea(target);
      });
    }

    updateRange(dt) {
      if (this.metrics.cleared + this.targets.length < this.totalTargets) {
        this.spawnTimer -= dt;
        if (this.targets.length < 2 && this.spawnTimer <= 0) {
          this.spawnRangeTarget();
          this.spawnTimer = random(0.25, 0.55) / this.difficulty.spawnPace;
        }
      }
    }

    updateDefense(dt) {
      if (this.metrics.cleared + this.targets.length < this.totalTargets) {
        this.spawnTimer -= dt;
        if (this.targets.length < 4 && this.spawnTimer <= 0) {
          this.spawnDefenseTarget();
          this.spawnTimer = random(0.45, 0.8) / this.difficulty.spawnPace;
        }
      }
      this.targets.forEach((target) => {
        const bounds = this.getTargetWorldBounds();
        target.x += target.vx * dt;
        if (target.x < bounds.minX || target.x > bounds.maxX) {
          target.vx *= -1;
          target.x = clamp(target.x, bounds.minX, bounds.maxX);
        }
        target.depth -= target.advance * this.difficulty.advance * dt;
        const beforeX = target.x;
        this.clampTargetToFiringArea(target);
        if (Math.abs(beforeX - target.x) > 0.0001) target.vx *= -1;
        if (target.depth <= 0.24) {
          this.fail("failureBreach");
        }
      });
    }

    updateSniper(dt) {
      if (this.targets.length === 0 && this.metrics.cleared < this.totalTargets) {
        this.spawnSniperTarget();
      }
      this.targets.forEach((target) => {
        if (target.behavior === "move") {
          const bounds = this.getTargetWorldBounds();
          target.x += target.vx * this.difficulty.targetSpeed * dt;
          if (target.x < bounds.minX || target.x > bounds.maxX) {
            target.vx *= -1;
            target.x = clamp(target.x, bounds.minX, bounds.maxX);
          }
          const beforeX = target.x;
          this.clampTargetToFiringArea(target);
          if (Math.abs(beforeX - target.x) > 0.0001) target.vx *= -1;
        }
        if (target.behavior === "brief") {
          target.exposure -= dt;
          if (target.exposure <= 0) {
            this.metrics.missedOpportunities += 1;
            const bounds = this.getTargetWorldBounds();
            target.x = randomVisibleCoord(this.getViewCenter().x, bounds.minX, bounds.maxX, 0.36);
            target.y = randomVisibleCoord(this.getViewCenter().y, bounds.minY, bounds.maxY, 0.28);
            target.exposure = random(1.45, 2.5) / this.difficulty.targetSpeed;
            target.spawnedAt = performance.now();
            this.clampTargetToFiringArea(target);
          }
        }
      });
    }

    spawnTestTargets() {
      this.targets = [
        {
          id: cryptoRandomId(),
          type: "range",
          x: 0.5,
          y: 0.38,
          depth: 0.55,
          size: 52,
          health: 999,
          weakScale: 0.28,
          spawnedAt: performance.now(),
          pulse: 0,
        },
        {
          id: cryptoRandomId(),
          type: "range",
          x: 0.32,
          y: 0.54,
          depth: 0.72,
          size: 42,
          health: 999,
          weakScale: 0.28,
          spawnedAt: performance.now(),
          pulse: 0,
        },
        {
          id: cryptoRandomId(),
          type: "range",
          x: 0.68,
          y: 0.54,
          depth: 0.72,
          size: 42,
          health: 999,
          weakScale: 0.28,
          spawnedAt: performance.now(),
          pulse: 0,
        },
      ];
      this.targets.forEach((target) => this.clampTargetToFiringArea(target));
    }

    spawnRangeTarget() {
      const bounds = this.getTargetWorldBounds();
      const target = {
        id: cryptoRandomId(),
        type: Math.random() > 0.45 ? "range" : "steel",
        x: randomVisibleCoord(this.getViewCenter().x, bounds.minX, bounds.maxX, 0.4),
        y: randomVisibleCoord(this.getViewCenter().y, bounds.minY, bounds.maxY, 0.32),
        depth: random(0.45, 0.88),
        size: random(34, 48),
        health: random(0.9, 1.25),
        weakScale: 0.28,
        spawnedAt: performance.now(),
        pulse: 0,
      };
      this.clampTargetToFiringArea(target);
      this.targets.push(target);
    }

    spawnDefenseTarget() {
      const bounds = this.getTargetWorldBounds();
      const target = {
        id: cryptoRandomId(),
        type: "dummy",
        x: randomVisibleCoord(this.getViewCenter().x, bounds.minX, bounds.maxX, 0.38),
        y: 0.5,
        depth: 1,
        size: random(46, 58),
        vx: random(0.07, 0.13) * (Math.random() > 0.5 ? 1 : -1) * this.difficulty.targetSpeed,
        advance: random(0.095, 0.145),
        health: random(1.1, 1.9),
        weakScale: 0.22,
        spawnedAt: performance.now(),
        pulse: 0,
      };
      this.clampTargetToFiringArea(target);
      this.targets.push(target);
    }

    spawnSniperTarget() {
      const index = this.metrics.cleared % 5;
      const behavior = ["static", "move", "brief", "move", "static"][index] || "static";
      const bounds = this.getTargetWorldBounds();
      const target = {
        id: cryptoRandomId(),
        type: "sniper",
        behavior,
        x: randomVisibleCoord(this.getViewCenter().x, bounds.minX, bounds.maxX, 0.36),
        y: randomVisibleCoord(this.getViewCenter().y, bounds.minY, bounds.maxY, 0.28),
        depth: random(0.92, 1),
        size: behavior === "brief" ? 30 : 34,
        vx: random(0.018, 0.04) * (Math.random() > 0.5 ? 1 : -1),
        health: 1,
        weakScale: 0.24,
        exposure: random(1.8, 2.8) / this.difficulty.targetSpeed,
        spawnedAt: performance.now(),
        pulse: 0,
      };
      this.clampTargetToFiringArea(target);
      this.targets.push(target);
    }

    fire() {
      if (this.paused || this.finished) return;
      const now = performance.now();
      if (this.reloading) {
        this.showMessage(this.t("reloading"), 550);
        return;
      }
      if (now < this.nextFireAt) return;
      if (this.ammoInMag <= 0) {
        this.sound.beep("empty");
        this.showMessage(this.t("emptyClick"), 500);
        if (this.reserveAmmo <= 0 && this.mode !== "test") this.fail("failureAmmo");
        return;
      }

      this.sound.beep(this.weaponId);
      this.ammoInMag -= 1;
      this.metrics.shots += 1;
      this.nextFireAt = now + 1000 / this.stats.fireRate;

      const cross = this.getCrosshairPoint(now);
      const impact = this.getImpactPoint(cross);
      const hit = this.findHit(impact, now);
      const adsReduction = lerp(1, 0.52, this.adsAmount);
      const recoil = this.stats.recoil * adsReduction;
      this.recoil.x += random(-0.42, 0.42) * recoil;
      this.recoil.y -= random(0.62, 1.05) * recoil;
      this.shake += recoil * 0.08 * this.settings.screenShake;

      if (hit) {
        this.registerHit(hit.target, hit.weak, now, impact);
      } else {
        this.effects.push({ type: "miss", x: impact.x, y: impact.y, life: 0.35 });
        if (this.mode === "test") this.addDecal(impact.x, impact.y, false);
      }

      if (this.ammoInMag <= 0 && this.reserveAmmo <= 0 && this.metrics.cleared < this.totalTargets && this.mode !== "test") {
        this.fail("failureAmmo");
      }
    }

    reload() {
      if (this.paused || this.finished || this.reloading) return;
      if (this.ammoInMag >= this.stats.magSize || this.reserveAmmo <= 0) return;
      this.sound.beep("reload");
      this.reloading = true;
      this.reloadEndAt = performance.now() + this.stats.reloadMs;
      this.showMessage(this.t("reloading"), Math.min(900, this.stats.reloadMs));
    }

    finishReload() {
      const need = this.stats.magSize - this.ammoInMag;
      const take = Math.min(need, this.reserveAmmo);
      this.ammoInMag += take;
      this.reserveAmmo -= take;
      this.reloading = false;
    }

    findHit(point, now = performance.now()) {
      const ordered = this.targets
        .map((target) => ({ target, screen: this.screenTarget(target, now) }))
        .sort((a, b) => b.screen.size - a.screen.size);
      for (const item of ordered) {
        const dx = point.x - item.screen.x;
        const dy = point.y - item.screen.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= item.screen.size) {
          return { target: item.target, weak: dist <= item.screen.size * item.target.weakScale };
        }
      }
      return null;
    }

    registerHit(target, weak, now, point) {
      this.metrics.hits += 1;
      if (weak) this.metrics.weakHits += 1;
      this.metrics.reactionTimes.push(now - target.spawnedAt);
      const damage = this.stats.damage * (weak ? 2.3 : 1);
      target.health -= damage;
      this.sound.beep(weak ? "weak" : "hit");
      this.effects.push({ type: weak ? "weak" : "hit", x: point.x, y: point.y, life: 0.45 });
      if (this.mode === "test") {
        this.addDecal(point.x, point.y, weak);
        target.health = 999;
        return;
      }
      if (target.health <= 0) {
        this.metrics.cleared += 1;
        this.metrics.score += weak ? 150 : 100;
        this.targets = this.targets.filter((item) => item.id !== target.id);
        if (this.metrics.cleared >= this.totalTargets) {
          this.complete();
        }
      }
    }

    addDecal(x, y, weak) {
      this.decals.push({ x, y, weak, time: performance.now() });
      if (this.decals.length > 80) this.decals.shift();
    }

    getCrosshairPoint(now) {
      void now;
      return {
        x: this.width / 2,
        y: this.height / 2,
      };
    }

    getHandlingShift(now) {
      const swayAmp = this.stats.sway * lerp(1, 0.36, this.adsAmount);
      const spreadAmp = this.stats.spread * lerp(1, 0.42, this.adsAmount);
      const phase = now / 1000;
      const swayX = Math.sin(phase * 1.35) * swayAmp + Math.sin(phase * 2.3) * spreadAmp * 0.08;
      const swayY = Math.cos(phase * 1.1) * swayAmp * 0.65;
      return {
        x: this.recoil.x + swayX,
        y: this.recoil.y + swayY,
      };
    }

    getImpactPoint(cross) {
      const expertSniper = this.level.id === "sniper" && this.difficulty.id === "expert" && this.mode !== "test";
      if (!expertSniper) return cross;
      const wind = 18 + this.stats.zoom * 4;
      const drop = 16 + Math.max(0, 2.8 - this.stats.damage) * 8;
      return {
        x: cross.x + wind,
        y: cross.y + drop,
      };
    }

    getViewCenter() {
      const aim = this.aim || { x: 0, y: 0 };
      return {
        x: 0.5 + aim.x,
        y: 0.5 + aim.y,
      };
    }

    getTargetWorldBounds() {
      const key = this.mode === "test" ? "test" : this.level.id;
      return TARGET_WORLD_BOUNDS[key] || TARGET_WORLD_BOUNDS.range;
    }

    getReachableWorldBounds(now = performance.now()) {
      const bounds = this.getTargetWorldBounds();
      const zoom = lerp(1, this.stats.zoom, this.adsAmount);
      const cross = this.getCrosshairPoint(now);
      const impact = this.getImpactPoint(cross);
      const impactOffsetX = (impact.x - cross.x) / (this.width * zoom);
      const impactOffsetY = (impact.y - cross.y) / (this.height * zoom);
      const reachable = {
        minX: Math.max(bounds.minX, 0.5 + impactOffsetX + AIM_BOUNDS.minX),
        maxX: Math.min(bounds.maxX, 0.5 + impactOffsetX + AIM_BOUNDS.maxX),
        minY: Math.max(bounds.minY, 0.5 + impactOffsetY + AIM_BOUNDS.minY),
        maxY: Math.min(bounds.maxY, 0.5 + impactOffsetY + AIM_BOUNDS.maxY),
      };
      if (reachable.minX > reachable.maxX) {
        reachable.minX = bounds.minX;
        reachable.maxX = bounds.maxX;
      }
      if (reachable.minY > reachable.maxY) {
        reachable.minY = bounds.minY;
        reachable.maxY = bounds.maxY;
      }
      return reachable;
    }

    getFiringAreaRect() {
      const key = this.mode === "test" ? "test" : this.level.id;
      const area = FIRING_AREAS[key] || FIRING_AREAS.range;
      return {
        left: area.left * this.width,
        right: area.right * this.width,
        top: area.top * this.height,
        bottom: area.bottom * this.height,
      };
    }

    getTargetFrame(target) {
      let x = target.x;
      let y = target.y;
      let depthScale = 1;

      if (target.type === "dummy") {
        const near = 1 - target.depth;
        y = lerp(0.44, 0.72, near);
        depthScale = lerp(0.55, 1.75, near);
      } else if (target.type === "sniper") {
        depthScale = 0.56;
      } else {
        depthScale = lerp(1.16, 0.78, target.depth);
      }

      return { x, y, depthScale };
    }

    clampTargetToReachableArea(target, now = performance.now()) {
      const bounds = this.getReachableWorldBounds(now);
      target.x = clamp(target.x, bounds.minX, bounds.maxX);
      if (target.type !== "dummy") {
        target.y = clamp(target.y, bounds.minY, bounds.maxY);
      }
    }

    clampTargetToFiringArea(target, now = performance.now()) {
      this.clampTargetToReachableArea(target, now);
      const bounds = this.getReachableWorldBounds(now);
      const zoom = lerp(1, this.stats.zoom, this.adsAmount);
      const cx = this.width / 2;
      const cy = this.height / 2;
      const view = this.getViewCenter();
      const handling = this.getHandlingShift(now);
      const frame = this.getTargetFrame(target);
      const rect = this.getFiringAreaRect();
      const size = target.size * frame.depthScale * zoom;
      const safeSize = size + 8;

      const minWorldX = view.x + (rect.left + safeSize - cx + handling.x) / (this.width * zoom);
      const maxWorldX = view.x + (rect.right - safeSize - cx + handling.x) / (this.width * zoom);
      target.x = minWorldX <= maxWorldX ? clamp(target.x, minWorldX, maxWorldX) : clamp(view.x, bounds.minX, bounds.maxX);

      if (target.type !== "dummy") {
        const minWorldY = view.y + (rect.top + safeSize - cy + handling.y) / (this.height * zoom);
        const maxWorldY = view.y + (rect.bottom - safeSize - cy + handling.y) / (this.height * zoom);
        target.y = minWorldY <= maxWorldY ? clamp(target.y, minWorldY, maxWorldY) : clamp(view.y, bounds.minY, bounds.maxY);
      }
      this.clampTargetToReachableArea(target, now);
    }

    targetInFiringArea(target, now = performance.now()) {
      const rect = this.getFiringAreaRect();
      const screen = this.screenTarget(target, now);
      return (
        screen.x - screen.size >= rect.left &&
        screen.x + screen.size <= rect.right &&
        screen.y - screen.size >= rect.top &&
        screen.y + screen.size <= rect.bottom
      );
    }

    targetReachable(target, now = performance.now()) {
      const frame = this.getTargetFrame(target);
      const zoom = lerp(1, this.stats.zoom, this.adsAmount);
      const cross = this.getCrosshairPoint(now);
      const impact = this.getImpactPoint(cross);
      const impactOffsetX = (impact.x - cross.x) / (this.width * zoom);
      const impactOffsetY = (impact.y - cross.y) / (this.height * zoom);
      const requiredAimX = frame.x - 0.5 - impactOffsetX;
      const requiredAimY = frame.y - 0.5 - impactOffsetY;
      return (
        requiredAimX >= AIM_BOUNDS.minX &&
        requiredAimX <= AIM_BOUNDS.maxX &&
        requiredAimY >= AIM_BOUNDS.minY &&
        requiredAimY <= AIM_BOUNDS.maxY
      );
    }

    screenTarget(target, now = performance.now()) {
      const zoom = lerp(1, this.stats.zoom, this.adsAmount);
      const cx = this.width / 2;
      const cy = this.height / 2;
      const frame = this.getTargetFrame(target);
      const handling = this.getHandlingShift(now);
      const view = this.getViewCenter();
      const baseX = cx + (frame.x - view.x) * this.width;
      const baseY = cy + (frame.y - view.y) * this.height;
      return {
        x: cx + (baseX - cx) * zoom - handling.x,
        y: cy + (baseY - cy) * zoom - handling.y,
        size: target.size * frame.depthScale * zoom,
        alpha: clamp(1.1 - target.depth * 0.36, 0.58, 1),
      };
    }

    complete() {
      if (this.finished) return;
      this.sound.beep("clear");
      this.finished = true;
      this.options.onFinish(this.makeResult(true));
    }

    fail(reasonKey) {
      if (this.finished || this.mode === "test") return;
      this.sound.beep("fail");
      this.finished = true;
      this.options.onFinish(this.makeResult(false, reasonKey));
    }

    makeResult(passed, reasonKey) {
      const now = performance.now();
      const timeMs = now - this.startedAt;
      const accuracy = this.metrics.shots ? this.metrics.hits / this.metrics.shots : 0;
      const weakRate = this.metrics.hits ? this.metrics.weakHits / this.metrics.hits : 0;
      const ammoUsed = Math.max(1, this.initialAmmo - (this.ammoInMag + this.reserveAmmo));
      const ammoEfficiency = this.metrics.hits / ammoUsed;
      const avgReaction =
        this.metrics.reactionTimes.length > 0
          ? this.metrics.reactionTimes.reduce((sum, item) => sum + item, 0) / this.metrics.reactionTimes.length
          : 0;
      const targetTime = this.level.id === "defense" ? 90000 : this.level.id === "sniper" ? 85000 : 70000;
      const timeScore = clamp(1 - timeMs / targetTime, 0, 1);
      let score =
        accuracy * 38 +
        weakRate * 18 +
        clamp(ammoEfficiency, 0, 1) * 22 +
        timeScore * 22 -
        this.metrics.missedOpportunities * 4;
      score = clamp(score / this.difficulty.ratingBias, 0, 100);

      let rating = "D";
      if (!passed) rating = "F";
      else if (score >= 90) rating = "S";
      else if (score >= 78) rating = "A";
      else if (score >= 64) rating = "B";
      else if (score >= 48) rating = "C";

      return {
        passed,
        reasonKey,
        levelId: this.level.id,
        difficultyId: this.difficulty.id,
        weaponId: this.weaponId,
        customSlot: this.customSlot,
        isCustom: this.isCustom,
        rating,
        score,
        timeMs,
        shots: this.metrics.shots,
        hits: this.metrics.hits,
        weakHits: this.metrics.weakHits,
        cleared: this.metrics.cleared,
        totalTargets: this.totalTargets,
        accuracy,
        weakRate,
        ammoEfficiency,
        avgReaction,
        missedOpportunities: this.metrics.missedOpportunities,
      };
    }

    updateHud(now) {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      set("hudLevel", labelOf(this.level.short, this.lang));
      set("hudWeapon", labelOf(WEAPONS[this.weaponId].name, this.lang));
      set("hudAmmo", `${this.ammoInMag}/${this.stats.magSize}`);
      set("hudReserve", this.mode === "test" ? "∞" : String(this.reserveAmmo));
      set("hudObjective", this.mode === "test" ? "TEST" : `${this.metrics.cleared}/${this.totalTargets}`);
      set("hudTime", formatTime(now - this.startedAt));
      const accuracy = this.metrics.shots ? Math.round((this.metrics.hits / this.metrics.shots) * 100) : 100;
      set("hudAccuracy", `${accuracy}%`);
      set("hudMessage", now < this.messageUntil ? this.message : "");
      const note = document.getElementById("scopeNote");
      if (note) {
        const active = this.level.id === "sniper" && this.difficulty.id === "expert" && this.mode !== "test";
        note.classList.toggle("active", active);
      }
      this.updateGyroUi();
    }

    draw(now) {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const shakeX = random(-this.shake, this.shake);
      const shakeY = random(-this.shake, this.shake);
      ctx.translate(shakeX, shakeY);
      this.drawBackground(ctx);
      this.drawDecals(ctx);
      this.targets
        .map((target) => ({ target, screen: this.screenTarget(target, now) }))
        .sort((a, b) => a.screen.size - b.screen.size)
        .forEach((item) => this.drawTarget(ctx, item.target, item.screen));
      this.drawEffects(ctx);
      this.drawWeapon(ctx);
      this.drawScopeOverlay(ctx);
      this.drawCrosshair(ctx, now);
      ctx.restore();
    }

    drawBackground(ctx) {
      const w = this.width;
      const h = this.height;
      const horizon = h * 0.47;
      const zoom = lerp(1, this.stats.zoom, this.adsAmount);

      ctx.fillStyle = "#111519";
      ctx.fillRect(0, 0, w, h);

      if (this.mode === "test") {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#34383b");
        grad.addColorStop(0.54, "#24292d");
        grad.addColorStop(1, "#17191b");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        drawPerspectiveGrid(ctx, w, h, horizon, "#4d565c", "#262b2f");
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(w * 0.18, h * 0.18, w * 0.64, h * 0.56);
        ctx.strokeStyle = "rgba(255,159,28,0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.18, h * 0.18, w * 0.64, h * 0.56);
        return;
      }

      if (this.level.id === "range") {
        const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
        ceiling.addColorStop(0, "#3d4346");
        ceiling.addColorStop(1, "#262b2e");
        ctx.fillStyle = ceiling;
        ctx.fillRect(0, 0, w, horizon);
        ctx.fillStyle = "#1d2124";
        ctx.fillRect(0, horizon, w, h - horizon);
        drawPerspectiveGrid(ctx, w, h, horizon, "#5d6468", "#252a2d");
        ctx.strokeStyle = "rgba(255,159,28,0.5)";
        ctx.lineWidth = 3 / zoom;
        for (let lane = 1; lane < 5; lane += 1) {
          const x = (w / 5) * lane;
          ctx.beginPath();
          ctx.moveTo(w / 2, horizon);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      } else if (this.level.id === "defense") {
        const asset = getGameAsset("levelDefense");
        if (asset) {
          drawCoverImage(ctx, asset, 0, 0, w, h);
          ctx.fillStyle = "rgba(0,0,0,0.08)";
          ctx.fillRect(0, 0, w, h);
          return;
        }
        const wall = ctx.createLinearGradient(0, 0, 0, h);
        wall.addColorStop(0, "#363c40");
        wall.addColorStop(0.48, "#22282c");
        wall.addColorStop(1, "#15181a");
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#191d20";
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w * 0.36, horizon);
        ctx.lineTo(w * 0.64, horizon);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        drawPerspectiveGrid(ctx, w, h, horizon, "#465057", "#202529");
        ctx.strokeStyle = "rgba(239,71,111,0.8)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.82);
        ctx.lineTo(w, h * 0.82);
        ctx.stroke();
      } else {
        const asset = getGameAsset("levelSniper");
        if (asset) {
          drawCoverImage(ctx, asset, 0, 0, w, h);
          ctx.fillStyle = "rgba(0,0,0,0.06)";
          ctx.fillRect(0, 0, w, h);
          return;
        }
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#6d858f");
        sky.addColorStop(0.42, "#c2bcae");
        sky.addColorStop(0.43, "#5f665f");
        sky.addColorStop(1, "#25271f");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(60,70,60,0.65)";
        for (let i = 0; i < 5; i += 1) {
          const x = (i / 4) * w;
          const leftOffset = Math.sin(i * 1.7) * 4;
          const rightOffset = Math.cos(i * 1.3) * 4;
          ctx.beginPath();
          ctx.moveTo(x - w * 0.28, horizon + leftOffset);
          ctx.lineTo(x, h * 0.26 + (i % 2) * 35);
          ctx.lineTo(x + w * 0.32, horizon + rightOffset);
          ctx.closePath();
          ctx.fill();
        }
        drawPerspectiveGrid(ctx, w, h, horizon + 40, "rgba(240,235,210,0.28)", "rgba(35,40,32,0.55)");
      }
    }

    drawDecals(ctx) {
      if (!this.decals.length) return;
      this.decals.forEach((decal) => {
        ctx.save();
        ctx.globalAlpha = decal.weak ? 0.9 : 0.58;
        ctx.strokeStyle = decal.weak ? "#ff9f1c" : "#d8d0c0";
        ctx.lineWidth = decal.weak ? 2 : 1;
        ctx.beginPath();
        ctx.arc(decal.x, decal.y, decal.weak ? 6 : 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }

    drawTarget(ctx, target, screen) {
      ctx.save();
      ctx.globalAlpha = screen.alpha;
      if (target.type === "dummy") {
        this.drawDummy(ctx, screen);
      } else if (target.type === "sniper") {
        this.drawSniperTarget(ctx, screen, target);
      } else {
        this.drawRangeTarget(ctx, screen, target.type === "steel");
      }
      ctx.restore();
    }

    drawRangeTarget(ctx, screen, steel) {
      ctx.translate(screen.x, screen.y);
      const r = screen.size;
      const asset = getGameAsset(steel ? "targetSteel" : "targetPaper");
      if (asset) {
        const width = steel ? r * 2.15 : r * 2.35;
        drawCenteredImageByWidth(ctx, asset, 0, 0, width);
        return;
      }
      ctx.fillStyle = steel ? "#aeb6ba" : "#e8dfce";
      ctx.strokeStyle = "#222";
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const colors = ["#d34332", "#f4f1ea", "#ff9f1c", "#202428"];
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.72 - i * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }

    drawDummy(ctx, screen) {
      ctx.translate(screen.x, screen.y);
      const s = screen.size;
      const human = getGameAsset("targetDefenseHuman");
      if (human) {
        const height = s * 2.8;
        const aspect = human.naturalWidth && human.naturalHeight ? human.naturalWidth / human.naturalHeight : 0.67;
        drawCenteredImage(ctx, human, 0, -s * 0.08, height * aspect, height);
        return;
      }
      const asset = getGameAsset("targetDummy");
      if (asset) {
        drawCenteredImage(ctx, asset, 0, s * 0.08, s * 1.65, s * 2.25);
        return;
      }
      ctx.fillStyle = "#d8c7aa";
      ctx.strokeStyle = "#1d1b18";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c7965a";
      roundRect(ctx, -s * 0.45, -s * 0.18, s * 0.9, s * 1.0, s * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ef476f";
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff9f1c";
      ctx.fillRect(-s * 0.18, s * 0.1, s * 0.36, s * 0.08);
    }

    drawSniperTarget(ctx, screen, target) {
      ctx.translate(screen.x, screen.y);
      const s = screen.size;
      if (target.behavior === "brief") {
        ctx.globalAlpha *= clamp(target.exposure / 0.8, 0.35, 1);
      }
      const human = getGameAsset("targetSniperHuman");
      if (human) {
        const height = s * 3.05;
        const aspect = human.naturalWidth && human.naturalHeight ? human.naturalWidth / human.naturalHeight : 0.67;
        drawCenteredImage(ctx, human, 0, -s * 0.08, height * aspect, height);
        return;
      }
      const asset = getGameAsset("targetSniper");
      if (asset) {
        drawCenteredImageByWidth(ctx, asset, 0, 0, s * 2.35);
        return;
      }
      ctx.fillStyle = "#202428";
      ctx.strokeStyle = "#f4f1ea";
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.82, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.82, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff9f1c";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    drawEffects(ctx) {
      this.effects.forEach((effect) => {
        const t = clamp(effect.life / 0.45, 0, 1);
        ctx.save();
        ctx.globalAlpha = t;
        ctx.strokeStyle = effect.type === "weak" ? "#ff9f1c" : effect.type === "hit" ? "#7bd88f" : "#f4f1ea";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, lerp(18, 4, t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    }

    drawWeapon(ctx) {
      const w = this.width;
      const h = this.height;
      const ads = this.adsAmount;
      ctx.save();
      ctx.translate(w * lerp(0.68, 0.52, ads), h * lerp(0.84, 0.8, ads));
      ctx.rotate(lerp(-0.08, -0.02, ads));
      const assetName = this.weaponId === "sniper" ? "weaponSniper" : this.weaponId === "rifle" ? "weaponRifle" : "weaponPistol";
      const weaponAsset = getGameAsset(assetName);
      if (weaponAsset) {
        const width = this.weaponId === "sniper" ? 320 : this.weaponId === "rifle" ? 276 : 178;
        ctx.globalAlpha = lerp(1, 0.62, ads);
        drawCenteredImageByWidth(ctx, weaponAsset, width * 0.22, 0, width);
        ctx.restore();
        return;
      }
      ctx.fillStyle = "#17191b";
      ctx.strokeStyle = "#595f64";
      ctx.lineWidth = 2;
      const length = this.weaponId === "sniper" ? 230 : this.weaponId === "rifle" ? 190 : 122;
      const height = this.weaponId === "pistol" ? 30 : 38;
      roundRect(ctx, -length * 0.2, -height * 0.5, length, height, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2f3539";
      ctx.fillRect(length * 0.26, -height * 0.2, length * 0.48, height * 0.24);
      if (this.weaponId !== "pistol") {
        ctx.fillStyle = "#1f2326";
        ctx.fillRect(-length * 0.1, height * 0.18, length * 0.18, height * 0.8);
      }
      ctx.restore();
    }

    drawScopeOverlay(ctx) {
      if (this.adsAmount <= 0.05) return;
      const w = this.width;
      const h = this.height;
      const alpha = this.adsAmount;
      ctx.save();
      if (this.stats.scope === "scope") {
        const r = Math.min(w, h) * lerp(0.42, 0.47, this.adsAmount);
        ctx.fillStyle = `rgba(0,0,0,${0.72 * alpha})`;
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
        ctx.strokeStyle = `rgba(244,241,234,${0.7 * alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.68);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(0,0,0,${0.42 * alpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    drawCrosshair(ctx, now) {
      const cross = this.getCrosshairPoint(now);
      const impact = this.getImpactPoint(cross);
      const style = this.settings.crosshair || "cross";
      ctx.save();
      ctx.strokeStyle = "#f4f1ea";
      ctx.fillStyle = "#f4f1ea";
      ctx.lineWidth = lerp(2.4, 1.35, this.adsAmount);
      ctx.globalAlpha = 0.92;
      if (style === "dot") {
        ctx.beginPath();
        ctx.arc(cross.x, cross.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (style === "ring") {
        ctx.beginPath();
        ctx.arc(cross.x, cross.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cross.x, cross.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(cross.x - 18, cross.y);
        ctx.lineTo(cross.x - 6, cross.y);
        ctx.moveTo(cross.x + 6, cross.y);
        ctx.lineTo(cross.x + 18, cross.y);
        ctx.moveTo(cross.x, cross.y - 18);
        ctx.lineTo(cross.x, cross.y - 6);
        ctx.moveTo(cross.x, cross.y + 6);
        ctx.lineTo(cross.x, cross.y + 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cross.x, cross.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (impact.x !== cross.x || impact.y !== cross.y) {
        ctx.strokeStyle = "#ff9f1c";
        ctx.fillStyle = "#ff9f1c";
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(impact.x, impact.y - 7);
        ctx.lineTo(impact.x + 7, impact.y);
        ctx.lineTo(impact.x, impact.y + 7);
        ctx.lineTo(impact.x - 7, impact.y);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.reloading) {
        const progress = clamp(1 - (this.reloadEndAt - now) / this.stats.reloadMs, 0, 1);
        ctx.strokeStyle = "#ff9f1c";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cross.x, cross.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
      ctx.restore();
    }

    setPaused(paused) {
      this.paused = paused;
      if (!paused) this.lastAt = performance.now();
      if (paused && document.pointerLockElement === this.canvas && document.exitPointerLock) {
        document.exitPointerLock();
      }
      this.updateMouseLockOverlay();
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      this.clearGyroNoDataTimer();
      this.cleanup.forEach((fn) => fn());
      this.cleanup = [];
      if (document.pointerLockElement === this.canvas && document.exitPointerLock) {
        document.exitPointerLock();
      }
    }
  }

  function getGameAsset(id) {
    return window.GameAssets && window.GameAssets.get ? window.GameAssets.get(id) : null;
  }

  function drawCenteredImage(ctx, image, x, y, width, height) {
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  }

  function drawCenteredImageByWidth(ctx, image, x, y, width) {
    const aspect = image.naturalHeight && image.naturalWidth ? image.naturalHeight / image.naturalWidth : 1;
    drawCenteredImage(ctx, image, x, y, width, width * aspect);
  }

  function drawCoverImage(ctx, image, x, y, width, height) {
    const sourceWidth = image.naturalWidth || image.width || width;
    const sourceHeight = image.naturalHeight || image.height || height;
    const sourceAspect = sourceWidth / sourceHeight;
    const destAspect = width / height;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (sourceAspect > destAspect) {
      sw = sourceHeight * destAspect;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / destAspect;
      sy = (sourceHeight - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  }

  function drawPerspectiveGrid(ctx, w, h, horizon, lineColor, floorColor) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.75;
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const y = lerp(horizon, h, t * t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = floorColor;
    for (let i = -6; i <= 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w / 2, horizon);
      ctx.lineTo(w / 2 + i * (w / 9), h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(total / 60);
    const sec = String(total % 60).padStart(2, "0");
    return `${min}:${sec}`;
  }

  function cryptoRandomId() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      return `${values[0].toString(16)}${values[1].toString(16)}`;
    }
    return Math.random().toString(16).slice(2);
  }

  window.GameRules = {
    buildWeaponStats,
    labelOf,
    formatTime,
  };
  window.GameRun = GameRun;
})();
