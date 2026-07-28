const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  window: {},
  document: {
    pointerLockElement: null,
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
  },
  console,
  Math,
  JSON,
  performance: {
    now() {
      return 1000;
    },
  },
  setTimeout() {
    return 1;
  },
  clearTimeout() {},
};

context.window = Object.assign(context.window, {
  window: context.window,
  isSecureContext: true,
  matchMedia() {
    return { matches: true };
  },
  screen: {
    orientation: {
      angle: 90,
    },
  },
  console,
  Math,
  JSON,
  performance: context.performance,
  setTimeout: context.setTimeout,
  clearTimeout: context.clearTimeout,
});

vm.createContext(context);

["src/data.js", "src/gameplay.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
});

const proto = context.window.GameRun.prototype;

function makeRun(overrides = {}) {
  return Object.assign(
    Object.create(proto),
    {
      paused: false,
      finished: false,
      lang: "en",
      width: 1000,
      height: 500,
      settings: {
        mouseSensitivity: 1,
        touchSensitivity: 1,
        gyroSensitivity: 1,
        gyroVerticalSensitivity: 1,
        gyroAdsMultiplier: 0.6,
        gyroSmoothing: 0.28,
        gyroDeadzone: 0.55,
        gyroAcceleration: 1.22,
        invertY: false,
      },
      stats: {
        zoom: 1,
        sway: 0,
        spread: 0,
        damage: 1,
      },
      adsAmount: 0,
      recoil: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      gyro: {
        enabled: false,
        supported: false,
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
      },
      level: { id: "range" },
      difficulty: { id: "standard" },
      mode: "level",
      targets: [],
      showMessage() {},
    },
    overrides,
  );
}

function close(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.0001, `${label}: expected ${expected}, got ${actual}`);
}

let asyncChecks = Promise.resolve();

{
  const run = makeRun();
  const cross = proto.getCrosshairPoint.call(run, 1000);
  close(cross.x, 500, "crosshair x stays centered");
  close(cross.y, 250, "crosshair y stays centered");
}

{
  const run = makeRun();
  const target = { type: "range", x: 0.62, y: 0.5, depth: 0.6, size: 40, weakScale: 0.25 };
  close(proto.screenTarget.call(run, target).x, 620, "target starts right of center");
  proto.moveAim.call(run, 120, 0, "mouse");
  const screen = proto.screenTarget.call(run, target);
  close(screen.x, 500, "moving mouse right pans target to center");
  close(proto.getCrosshairPoint.call(run, 1000).x, 500, "crosshair still centered after mouse move");
}

{
  const run = makeRun();
  const target = { type: "range", x: 0.5, y: 0.65, depth: 0.6, size: 40, weakScale: 0.25 };
  close(proto.screenTarget.call(run, target).y, 325, "target starts below center");
  proto.moveAim.call(run, 0, 75, "mouse");
  close(proto.screenTarget.call(run, target).y, 250, "moving mouse down pans target to center");
  close(proto.getCrosshairPoint.call(run, 1000).y, 250, "crosshair still centered after vertical mouse move");
}

{
  const target = { type: "range", x: 0.62, y: 0.5, depth: 0.6, size: 40, weakScale: 0.25 };
  const run = makeRun({ aim: { x: 0.12, y: 0 }, targets: [target] });
  const hit = proto.findHit.call(run, { x: 500, y: 250 });
  assert(hit && hit.target === target, "center crosshair hits target after view pan");
}

{
  const run = makeRun({ recoil: { x: 0, y: -20 } });
  const target = { type: "range", x: 0.5, y: 0.5, depth: 0.6, size: 40, weakScale: 0.25 };
  close(proto.screenTarget.call(run, target).y, 270, "recoil shifts the view instead of the crosshair");
  close(proto.getCrosshairPoint.call(run, 1000).y, 250, "crosshair remains centered during recoil");
}

{
  const run = makeRun({
    level: { id: "sniper" },
    difficulty: { id: "expert" },
    stats: { zoom: 2, sway: 0, spread: 0, damage: 1 },
  });
  const cross = proto.getCrosshairPoint.call(run, 1000);
  const impact = proto.getImpactPoint.call(run, cross);
  assert(impact.x > cross.x, "expert wind moves impact right");
  assert(impact.y > cross.y, "expert drop moves impact down");
}

{
  const canvas = {};
  const run = makeRun({ canvas });
  context.document.pointerLockElement = null;
  assert(proto.requiresPointerLock.call(run), "desktop play requires pointer lock");
  assert(!proto.hasPointerLock.call(run), "mouse focus is unlocked before pointer lock");
  context.document.pointerLockElement = canvas;
  assert(proto.hasPointerLock.call(run), "mouse focus matches the game after pointer lock");
}

{
  const run = makeRun({
    gyro: {
      enabled: true,
      supported: true,
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
    },
  });
  proto.handleOrientation.call(run, { beta: 10, gamma: 4, timeStamp: 1000 });
  close(run.aim.x, 0, "first gyro event calibrates without moving aim");
  proto.handleOrientation.call(run, { beta: 20, gamma: 4, timeStamp: 1033 });
  assert(run.aim.x > 0, "landscape gyro tilt pans aim horizontally");
  const heldTiltAimX = run.aim.x;
  proto.handleOrientation.call(run, { beta: 20, gamma: 4, timeStamp: 1066 });
  assert(run.aim.x > heldTiltAimX, "held horizon tilt keeps moving aim without returning to center");
  close(run.aim.y, 0, "unchanged gamma does not pan aim vertically in landscape");
}

{
  const run = makeRun({
    gyro: {
      enabled: true,
      supported: true,
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
    },
  });
  proto.handleOrientation.call(run, { beta: 10, gamma: 4, timeStamp: 1000 });
  proto.handleMotion.call(run, { rotationRate: { beta: 100, gamma: 0 }, timeStamp: 1016 });
  proto.handleOrientation.call(run, { beta: 20, gamma: 4, timeStamp: 1033 });
  assert(run.aim.x > 0, "motion rate data does not force horizon gyro to recenter before moving");
}

{
  let orientationAsked = false;
  let motionAsked = false;
  context.window.DeviceOrientationEvent = {
    requestPermission() {
      orientationAsked = true;
      return Promise.resolve("granted");
    },
  };
  context.window.DeviceMotionEvent = {
    requestPermission() {
      motionAsked = true;
      return Promise.resolve("granted");
    },
  };
  const run = makeRun({
    gyro: {
      enabled: false,
      supported: true,
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
    },
  });
  asyncChecks = Promise.resolve(proto.toggleGyro.call(run)).then(() => {
    assert(orientationAsked, "iPhone orientation permission is requested");
    assert(motionAsked, "iPhone motion permission is requested");
    assert(run.gyro.enabled, "gyro enables after permissions are granted");
  });
}

{
  context.window.DeviceOrientationEvent = undefined;
  context.window.DeviceMotionEvent = undefined;
  const run = makeRun({
    gyro: {
      enabled: true,
      supported: true,
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
      lastAt: 1000,
      eventCount: 0,
      noDataTimer: 0,
    },
  });
  proto.handleMotion.call(run, { accelerationIncludingGravity: { x: 4, y: 0 }, timeStamp: 1033 });
  assert(run.aim.y > 0, "motion fallback can pan aim when orientation events do not arrive");
}

{
  const run = makeRun({
    gyro: {
      enabled: true,
      supported: true,
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
      lastAt: 1000,
      eventCount: 0,
      noDataTimer: 0,
    },
  });
  proto.handleMotion.call(run, { rotationRate: { beta: 120, gamma: 0 }, timeStamp: 1033 });
  assert(run.aim.x > 0, "rotation rate gyro pans aim horizontally in landscape");
  close(run.aim.y, 0, "zero gamma rotation keeps vertical aim steady in landscape");
  assert(run.gyro.motionRateActive, "rotation rate source is preferred after motion data arrives");
}

asyncChecks
  .then(() => {
    console.log("aim model ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
