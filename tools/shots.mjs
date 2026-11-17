// shots.mjs — render Aegis Line's four staged screenshots in headless Chromium.
//   node tools/shots.mjs           (reads shots.json, writes screenshots/*.jpg)
// The game stages each scene itself behind ?shot=<name>&seed=N and sets window.__shotReady;
// this script only serves the files, waits for that flag, and captures a 1280x720 JPEG,
// dropping the quality until the file fits the 256 KiB screenshot cap.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = join(ROOT, 'game');
const OUT = join(ROOT, 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const CAP = 262144;

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

const shots = JSON.parse(await readFile(join(ROOT, 'shots.json'), 'utf8'));
const browser = await puppeteer.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

let failed = false;
for (const shot of shots) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(base + '/' + shot.query, { waitUntil: 'load' });
  await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
  let buf = null;
  for (const quality of [88, 78, 66]) {
    buf = await page.screenshot({ type: 'jpeg', quality });
    if (buf.length <= CAP) break;
  }
  await writeFile(join(OUT, shot.name), buf);
  console.log(shot.name, buf.length, 'bytes', errors.length ? 'ERRORS: ' + errors.join(' | ') : 'clean');
  if (errors.length || buf.length > CAP) failed = true;
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
