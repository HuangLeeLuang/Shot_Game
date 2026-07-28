const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const context = {
  window: {},
  document: {
    pointerLockElement: null,
  },
  console,
  Math,
  JSON,
  performance: {
    now() {
      return 1000;
    },
  },
};

context.window = Object.assign(context.window, {
  window: context.window,
  matchMedia() {
    return { matches: true };
  },
  console,
  Math,
  JSON,
  performance: context.performance,
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
      width: 1000,
      height: 500,
      settings: {
        mouseSensitivity: 1,
        touchSensitivity: 1,
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
      level: { id: "range" },
      difficulty: { id: "standard" },
      mode: "level",
      targets: [],
    },
    overrides,
  );
}

function close(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.0001, `${label}: expected ${expected}, got ${actual}`);
}

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

console.log("aim model ok");
