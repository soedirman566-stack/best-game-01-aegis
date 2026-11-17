// playtest.mjs — end-to-end headless proof for Aegis Line.
//   node tools/playtest.mjs
// Drives the real page: clicks through the menu, builds towers with the mouse, upgrades one,
// then uses the exposed __aegis handle to step the fixed-step simulation deterministically and
// prove kills, a leak costing core HP, and a run that reaches the wave-5 boss. Any console error
// or page error in any scenario fails the run.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = join(ROOT, 'game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const data = await readFile(normalize(join(GAME, p)));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await puppeteer.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

const results = [];
let failures = 0;
function check(name, ok, detail) {
  results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures += 1;
}

async function newGamePage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(base + '/?seed=7', { waitUntil: 'load' });
  await page.waitForFunction('window.__aegis !== undefined', { timeout: 15000 });
  return { page, errors };
}

const snap = (page) => page.evaluate(() => {
  const s = window.__aegis.state;
  return {
    screen: s.screen, gold: s.gold, lives: s.lives, wave: s.wave, phase: s.phase,
    kills: s.kills, leaks: s.leaks, towers: s.towers.length,
    levels: s.towers.map((t) => t.level), enemies: s.enemies.length,
  };
});

/** Step the sim in chunks with the rAF loop paused, auto-starting waves; returns the snapshot. */
const stepSim = (page, seconds, autoWave) => page.evaluate((secs, auto) => {
  const { state, world, ui } = window.__aegis;
  ui.paused = true;
  const steps = Math.round(secs * 60);
  for (let i = 0; i < steps; i += 1) {
    if (auto && state.phase === 'build' && state.screen === 'playing') world.startWave();
    world.step(1 / 60);
    if (state.events.length > 4000) state.events.length = 0;
  }
  state.events.length = 0;
  const s = state;
  return { screen: s.screen, gold: s.gold, lives: s.lives, wave: s.wave, kills: s.kills, leaks: s.leaks, towers: s.towers.length };
}, seconds, autoWave);

// --- Scenario A: real mouse play — build two towers, start a wave, get kills, upgrade. ---
{
  const { page, errors } = await newGamePage();
  await page.mouse.click(640, 515); // DEPLOY THE LINE
  let s = await snap(page);
  check('A menu start', s.screen === 'playing', 'screen=' + s.screen);
  await page.mouse.click(1012, 170); // Pulse Blaster card
  await page.mouse.click(354, 144); // tile (7,1)
  s = await snap(page);
  check('A place pulse', s.towers === 1 && s.gold === 170, 'towers=' + s.towers + ' gold=' + s.gold);
  await page.mouse.click(1188, 170); // Frost Spire card
  await page.mouse.click(354, 232); // tile (7,3)
  s = await snap(page);
  check('A place frost', s.towers === 2 && s.gold === 95, 'towers=' + s.towers + ' gold=' + s.gold);
  await page.mouse.click(1100, 509); // START WAVE
  s = await stepSim(page, 45, false);
  check('A kills happen', s.kills > 0, 'kills=' + s.kills + ' wave=' + s.wave + ' lives=' + s.lives);
  await page.evaluate(() => { window.__aegis.state.selected = window.__aegis.state.towers[0]; });
  const before = await snap(page);
  await page.mouse.click(1016, 436); // UPGRADE button
  s = await snap(page);
  check('A upgrade applies', s.levels[0] === 2 && s.gold === before.gold - 45, 'levels=' + s.levels + ' gold ' + before.gold + '->' + s.gold);
  check('A console clean', errors.length === 0, errors.join(' | '));
  await page.close();
}

// --- Scenario B: no defence — a leak must cost core HP. ---
{
  const { page, errors } = await newGamePage();
  await page.mouse.click(640, 515);
  await page.evaluate(() => { window.__aegis.world.startWave(); });
  const s = await stepSim(page, 80, false);
  check('B leak costs a life', s.leaks > 0 && s.lives === 20 - s.leaks, 'leaks=' + s.leaks + ' lives=' + s.lives);
  check('B console clean', errors.length === 0, errors.join(' | '));
  await page.close();
}

// --- Scenario C: a real defence fights through to the wave-5 boss. ---
{
  const { page, errors } = await newGamePage();
  await page.mouse.click(640, 515);
  await page.evaluate(() => {
    const { state, world } = window.__aegis;
    state.gold = 6000;
    const put = (type, c, r, ups) => {
      const t = world.placeTower(type, c, r);
      if (t) for (let i = 0; i < ups; i += 1) world.upgradeTower(t);
    };
    put('rail', 14, 4, 2); put('tesla', 5, 6, 1); put('frost', 10, 8, 1);
    put('pulse', 11, 4, 1); put('rail', 17, 10, 0); put('pulse', 3, 8, 0);
    put('frost', 7, 3, 0); put('pulse', 7, 1, 0);
  });
  let s = await stepSim(page, 30, true);
  for (let i = 0; i < 40 && !(s.wave >= 5 && s.kills > 40); i += 1) s = await stepSim(page, 30, true);
  check('C reaches wave 5', s.wave >= 5, 'wave=' + s.wave + ' kills=' + s.kills + ' lives=' + s.lives + ' screen=' + s.screen);
  check('C defence kills', s.kills > 40, 'kills=' + s.kills);
  check('C console clean', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(failures === 0 ? 'PLAYTEST OK' : 'PLAYTEST FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
