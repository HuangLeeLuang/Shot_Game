const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let now = 1000;
const context = {
  window: {},
  console,
  Math,
  JSON,
  performance: {
    now() {
      return now;
    },
  },
};

context.window = Object.assign(context.window, {
  window: context.window,
  console,
  Math,
  JSON,
  performance: context.performance,
});

vm.createContext(context);

["src/data.js", "src/gameplay.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
});

const { LEVELS, DIFFICULTIES, WEAPONS, DEFAULT_SETTINGS } = context.window.GameData;
const { buildWeaponStats } = context.window.GameRules;
const proto = context.window.GameRun.prototype;

function makeRun(levelId, difficultyId = "standard", weaponId = "rifle") {
  const run = Object.assign(Object.create(proto), {
    options: {},
    sound: { beep() {} },
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    lang: "zh",
    level: LEVELS[levelId],
    difficulty: DIFFICULTIES[difficultyId],
    weaponId,
    customConfig: null,
    customSlot: 0,
    isCustom: false,
    mode: "level",
    stats: buildWeaponStats(weaponId, null, difficultyId),
    totalTargets: LEVELS[levelId].objective,
    ammoInMag: buildWeaponStats(weaponId, null, difficultyId).magSize,
    reserveAmmo: buildWeaponStats(weaponId, null, difficultyId).reserve,
    initialAmmo:
      buildWeaponStats(weaponId, null, difficultyId).magSize + buildWeaponStats(weaponId, null, difficultyId).reserve,
    nextFireAt: 0,
    reloadEndAt: 0,
    reloading: false,
    paused: false,
    finished: false,
    startedAt: now,
    lastAt: now,
    spawnTimer: 0,
    message: "",
    messageUntil: 0,
    aim: { x: 0, y: 0 },
    recoil: { x: 0, y: 0 },
    shake: 0,
    fireHeld: false,
    adsHeld: false,
    adsAmount: 0,
    targets: [],
    effects: [],
    decals: [],
    gyro: { enabled: false, supported: false },
    metrics: {
      shots: 0,
      hits: 0,
      weakHits: 0,
      cleared: 0,
      missedOpportunities: 0,
      reactionTimes: [],
      score: 0,
    },
    width: 1280,
    height: 720,
    showMessage() {},
    complete() {
      this.finished = true;
      this.completed = true;
    },
    fail(reasonKey) {
      this.finished = true;
      this.failed = reasonKey;
    },
  });
  return run;
}

function aimAtTarget(run, target) {
  const frame = proto.getTargetFrame.call(run, target);
  run.aim.x = frame.x - 0.5;
  run.aim.y = frame.y - 0.5;
  run.recoil.x = 0;
  run.recoil.y = 0;
}

function assertTargetsInside(run, label, options = {}) {
  for (const target of run.targets) {
    assert(proto.targetReachable.call(run, target, now), `${label}: target is not reachable by the centered crosshair`);
    if (options.reachableOnly) continue;
    if (!proto.targetInFiringArea.call(run, target, now)) {
      const screen = proto.screenTarget.call(run, target, now);
      assert.fail(
        `${label}: target outside firing area at x=${screen.x.toFixed(1)}, y=${screen.y.toFixed(1)}, size=${screen.size.toFixed(1)}`,
      );
    }
  }
}

function step(run, dt = 0.12) {
  now += dt * 1000;
  proto.update.call(run, dt, now);
  assertTargetsInside(run, `${run.level.id} update`);
}

function shootFocused(run, target) {
  aimAtTarget(run, target);
  assertTargetsInside(run, `${run.level.id} before shot`);
  if (run.reloading) {
    now = run.reloadEndAt + 1;
    proto.update.call(run, 0.02, now);
  }
  if (run.ammoInMag <= 0 && run.reserveAmmo > 0) {
    proto.reload.call(run);
    now = run.reloadEndAt + 1;
    proto.update.call(run, 0.02, now);
  }
  now = Math.max(now + 170, run.nextFireAt + 1);
  proto.fire.call(run);
}

for (const levelId of ["range", "defense", "sniper"]) {
  now = 1000;
  const run = makeRun(levelId);

  for (let safety = 0; safety < 600 && !run.finished; safety += 1) {
    step(run, levelId === "defense" ? 0.08 : 0.12);
    if (run.targets.length > 0) {
      const target = run.targets.slice().sort((a, b) => {
        const as = proto.screenTarget.call(run, a, now).size;
        const bs = proto.screenTarget.call(run, b, now).size;
        return bs - as;
      })[0];
      shootFocused(run, target);
    }
  }

  assert(!run.failed, `${levelId} failed with ${run.failed}`);
  assert(run.completed, `${levelId} did not complete`);
  assert(run.metrics.cleared >= run.totalTargets, `${levelId} did not clear all targets`);
  assert(run.metrics.hits === run.metrics.shots, `${levelId} missed during simulated focused shots`);
}

for (const levelId of Object.keys(LEVELS)) {
  for (const difficultyId of Object.keys(DIFFICULTIES)) {
    for (const weaponId of Object.keys(WEAPONS)) {
      for (const aim of [
        { x: 0, y: 0, center: true, scoped: false },
        { x: 0, y: 0, center: true, scoped: true },
        { x: -0.44, y: -0.38, center: false, scoped: false },
        { x: 0.44, y: 0.36, center: false, scoped: false },
      ]) {
        now = 1000;
        const run = makeRun(levelId, difficultyId, weaponId);
        run.aim = { x: aim.x, y: aim.y };
        if (aim.scoped) run.adsAmount = 1;
        for (let i = 0; i < 25; i += 1) {
          if (levelId === "range") proto.spawnRangeTarget.call(run);
          if (levelId === "defense") proto.spawnDefenseTarget.call(run);
          if (levelId === "sniper") proto.spawnSniperTarget.call(run);
          assertTargetsInside(run, `${levelId}/${difficultyId}/${weaponId} spawn`, {
            reachableOnly: !aim.center || aim.scoped,
          });
          run.targets = [];
        }
      }
    }
  }
}

for (const difficultyId of Object.keys(DIFFICULTIES)) {
  for (const weaponId of Object.keys(WEAPONS)) {
    now = 1000;
    const run = makeRun("sniper", difficultyId, weaponId);
    for (let i = 0; i < 80; i += 1) {
      proto.spawnSniperTarget.call(run);
      const target = run.targets[0];
      target.behavior = i % 3 === 0 ? "brief" : i % 3 === 1 ? "move" : "static";
      target.vx = i % 2 === 0 ? 0.08 : -0.08;
      if (weaponId === "sniper") run.adsAmount = 1;
      for (let stepIndex = 0; stepIndex < 20; stepIndex += 1) {
        now += 120;
        proto.updateSniper.call(run, 0.12);
        assertTargetsInside(run, `sniper/${difficultyId}/${weaponId} moving`, {
          reachableOnly: weaponId === "sniper" || difficultyId === "expert",
        });
      }
      const frame = proto.getTargetFrame.call(run, target);
      const cross = proto.getCrosshairPoint.call(run, now);
      const impact = proto.getImpactPoint.call(run, cross);
      const zoom = 1 + (run.stats.zoom - 1) * run.adsAmount;
      run.aim.x = frame.x - 0.5 - (impact.x - cross.x) / (run.width * zoom);
      run.aim.y = frame.y - 0.5 - (impact.y - cross.y) / (run.height * zoom);
      run.recoil.x = 0;
      run.recoil.y = 0;
      assert(proto.targetReachable.call(run, target, now), `sniper/${difficultyId}/${weaponId} compensated aim unreachable`);
      run.targets = [];
    }
  }
}

console.log("simulated playtest ok");
