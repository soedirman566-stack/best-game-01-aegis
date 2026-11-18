// Aegis Line — boot, the fixed-step loop, and all input. The simulation lives in world.js and the
// drawing in render.js; this file wires them to the canvas, the mouse and the keyboard, and turns
// the world's queued event names into synth sounds.
//
// ?seed=N fixes the random stream; without one the stream still starts from a fixed default
// seed below — no wall clock ever touches it, so any load of this page is reproducible.
// ?shot=menu|early|late|upgrade stages that deterministic scene instead of running the loop,
// paints it, and sets window.__shotReady for the screenshot tooling.

import { VIEW_W, VIEW_H, STEP, TILE, OX, OY, COLS, ROWS, TOWERS, TOWER_ORDER } from './config.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { draw, RECTS, SCREEN_MENU, SCREEN_PLAY, SCREEN_OVER, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed'));
const DEFAULT_SEED = 987654321;
const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
// The synth gets its own stream off the same seed, so even the noise bursts are reproducible
// and nothing in the page consumes unseeded randomness.
const audio = createAudio(makeRng(seed ^ 0x9e3779b9));
const world = createWorld(makeRng(seed));
const { state } = world;

const ui = {
  mouse: { x: 0, y: 0 },
  hover: null,
  hoverOk: false,
  placing: null,
  speed: 1,
  paused: false,
  muted: false,
};

function fit() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
}
window.addEventListener('resize', fit);
fit();

function toView(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (VIEW_W / rect.width),
    y: (evt.clientY - rect.top) * (VIEW_H / rect.height),
  };
}

function tileAt(x, y) {
  const col = Math.floor((x - OX) / TILE);
  const row = Math.floor((y - OY) / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row, x: OX + (col + 0.5) * TILE, y: OY + (row + 0.5) * TILE };
}

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function startGame() {
  world.reset();
  state.screen = SCREEN_PLAY;
  ui.placing = null;
  ui.paused = false;
}

function drainEvents() {
  let shots = 0;
  let hits = 0;
  for (const ev of state.events) {
    if (ev.startsWith('shot:')) {
      shots += 1;
      if (shots <= 3) audio.shot(ev.slice(5));
    } else if (ev === 'hit') {
      hits += 1;
      if (hits <= 2) audio.hit();
    } else if (ev === 'kill') audio.kill();
    else if (ev === 'leak') audio.leak();
    else if (ev === 'place') audio.place();
    else if (ev === 'upgrade') audio.upgrade();
    else if (ev === 'sell') audio.sell();
    else if (ev === 'wave') audio.waveStart();
    else if (ev === 'boss') audio.boss();
    else if (ev === 'clear') audio.coin();
    else if (ev === 'victory') audio.victory();
    else if (ev === 'defeat') audio.defeat();
  }
  state.events.length = 0;
}

canvas.addEventListener('mousemove', (evt) => {
  ui.mouse = toView(evt);
  ui.hover = tileAt(ui.mouse.x, ui.mouse.y);
  ui.hoverOk = !!(ui.hover && world.tileFree(ui.hover.col, ui.hover.row));
});

canvas.addEventListener('mousedown', (evt) => {
  audio.unlock();
  const { x, y } = toView(evt);
  if (evt.button === 2) {
    ui.placing = null;
    state.selected = null;
    return;
  }
  if (state.screen === SCREEN_MENU) {
    if (inRect(x, y, RECTS.menuStart)) startGame();
    return;
  }
  if (state.screen === SCREEN_OVER) {
    if (inRect(x, y, RECTS.overRestart)) startGame();
    return;
  }
  if (state.screen === SCREEN_VICTORY) {
    if (inRect(x, y, RECTS.victoryEndless)) {
      state.endless = true;
      state.screen = SCREEN_PLAY;
      state.phase = 'build';
    } else if (inRect(x, y, RECTS.victoryAgain)) startGame();
    return;
  }
  if (state.screen !== SCREEN_PLAY) return;

  for (const card of RECTS.cards) {
    if (inRect(x, y, card)) {
      if (state.gold >= TOWERS[card.type].cost) {
        ui.placing = ui.placing === card.type ? null : card.type;
        state.selected = null;
      } else audio.denied();
      return;
    }
  }
  if (inRect(x, y, RECTS.wave)) { world.startWave(); return; }
  if (inRect(x, y, RECTS.speed)) { ui.speed = ui.speed === 1 ? 2 : 1; return; }
  if (inRect(x, y, RECTS.pause)) { ui.paused = !ui.paused; return; }
  if (state.selected && inRect(x, y, RECTS.upgrade)) {
    if (!world.upgradeTower(state.selected)) audio.denied();
    return;
  }
  if (state.selected && inRect(x, y, RECTS.sell)) { world.sellTower(state.selected); return; }

  const tile = tileAt(x, y);
  if (!tile) return;
  if (ui.placing) {
    const placed = world.placeTower(ui.placing, tile.col, tile.row);
    if (placed) {
      state.selected = placed;
      ui.placing = null;
    } else audio.denied();
    return;
  }
  state.selected = state.towers.find((t) => t.col === tile.col && t.row === tile.row) || null;
});
canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());

window.addEventListener('keydown', (evt) => {
  audio.unlock();
  const key = evt.key.toLowerCase();
  if (key === ' ') {
    evt.preventDefault();
    if (state.screen === SCREEN_PLAY) world.startWave();
    else if (state.screen === SCREEN_MENU) startGame();
    return;
  }
  if (state.screen !== SCREEN_PLAY) return;
  if (key >= '1' && key <= '4') {
    const type = TOWER_ORDER[Number(key) - 1];
    if (state.gold >= TOWERS[type].cost) { ui.placing = type; state.selected = null; }
    else audio.denied();
  } else if (key === 'u') {
    if (state.selected && !world.upgradeTower(state.selected)) audio.denied();
  } else if (key === 'x') {
    if (state.selected) world.sellTower(state.selected);
  } else if (key === 'f') ui.speed = ui.speed === 1 ? 2 : 1;
  else if (key === 'p') ui.paused = !ui.paused;
  else if (key === 'm') ui.muted = audio.toggleMute();
  else if (key === 'escape') { ui.placing = null; state.selected = null; }
});

// A handle for tests and tooling: the live state, the world verbs, and the ui state.
window.__aegis = { state, world, ui, startGame };

if (shotName) {
  stageShot(shotName, world);
  drainEvents();
  draw(ctx, state, ui);
  draw(ctx, state, ui);
  window.__shotReady = true;
} else {
  let last = performance.now();
  let acc = 0;
  let lastScreen = '';
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!ui.paused) {
      acc += dt * ui.speed;
      while (acc >= STEP) {
        world.step(STEP);
        acc -= STEP;
      }
      drainEvents();
    }
    draw(ctx, state, ui);
    if (state.screen !== lastScreen) {
      lastScreen = state.screen;
      status.textContent = 'Aegis Line: ' + state.screen + ', wave ' + state.wave + ', core ' + state.lives;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
