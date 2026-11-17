// Deterministic screenshot scenes behind ?shot=menu|early|late|upgrade. Each one resets the world
// with the run's seeded RNG, builds a real defence by the normal rules, then plays the simulation
// forward at the fixed step — so the frame is an honest moment of a real game and the same seed
// always produces the same frame.

import { STEP } from './config.js';

/** Step the world forward, starting each wave as soon as the build phase opens. */
function run(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.phase === 'build' && world.state.screen === 'playing') world.startWave();
    world.step(STEP);
  }
}

function build(world, gold, list) {
  world.state.gold = gold;
  const placed = {};
  for (const [type, col, row, ups] of list) {
    const t = world.placeTower(type, col, row);
    if (t) {
      for (let i = 0; i < (ups || 0); i += 1) world.upgradeTower(t);
      placed[type + '@' + col + ',' + row] = t;
    }
  }
  return placed;
}

export function stageShot(name, world) {
  const { state } = world;
  world.reset();
  if (name === 'early') {
    state.screen = 'playing';
    build(world, 420, [
      ['pulse', 7, 1, 0],
      ['frost', 7, 3, 0],
      ['pulse', 13, 3, 0],
    ]);
    run(world, 32);
  } else if (name === 'late') {
    state.screen = 'playing';
    build(world, 4200, [
      ['rail', 14, 4, 2],
      ['tesla', 5, 6, 1],
      ['frost', 10, 8, 1],
      ['pulse', 11, 4, 1],
      ['rail', 17, 10, 0],
      ['pulse', 3, 8, 0],
    ]);
    // Fight waves 8 and 9 for real so the frame carries honest wear, and stop the moment the
    // wave-10 boss is properly into the field with its escort around it. One loop throughout:
    // a fixed-length run would overshoot, because the boss wave auto-starts inside it.
    state.wave = 7;
    for (let i = 0; i < Math.round(400 / STEP); i += 1) {
      if (state.phase === 'build' && state.screen === 'playing') world.startWave();
      world.step(STEP);
      if (state.bossNow && state.bossNow.dist > 430) break;
    }
  } else if (name === 'upgrade') {
    state.screen = 'playing';
    const placed = build(world, 950, [
      ['pulse', 5, 1, 0],
      ['tesla', 8, 3, 1],
      ['frost', 12, 3, 0],
    ]);
    run(world, 17);
    state.selected = placed['tesla@8,3'] || null;
  } else {
    // menu: attract mode walks enemies behind the title card.
    run(world, 8);
  }
}
