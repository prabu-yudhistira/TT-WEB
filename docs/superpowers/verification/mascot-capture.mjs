// Capture the mascot bench in real (unthrottled) Chrome and tile the frames.
// The in-app browser pane reports the tab hidden and throttles rAF to ~1Hz,
// which stalls the engine clock itself — see _HANDOFF/HANDOFF.md.
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module';
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp');

import { mkdirSync } from 'node:fs';
const OUT = (process.env.TT_SHOTS ?? 'shots') + '/';
mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] || 'http://localhost:3000/en/dev/mascot';
const FRAMES = Number(process.argv[3] || 9);
const GAP_MS = Number(process.argv[4] || 900);
const TAG = process.argv[5] || 'mascot';
const W = 1280, H = 800;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
  ],
  defaultViewport: { width: W, height: H },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// Wait for the model, then for the bench to activate + finish its entrance.
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 });
console.log('model loaded');
await new Promise((r) => setTimeout(r, 6000));

const state = await page.evaluate(() => window.__ttMascot());
console.log('state after settle:', JSON.stringify(state));

const files = [];
const track = [];
for (let i = 0; i < FRAMES; i++) {
  const f = `${OUT}${TAG}-f${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: f });
  files.push(f);
  track.push(await page.evaluate(() => {
    const s = window.__ttMascot();
    return { x: s.pos.x, y: s.pos.y, z: s.pos.z, behind: s.behind, angle: s.angle };
  }));
  await new Promise((r) => setTimeout(r, GAP_MS));
}

console.log('\ntrack (screen px, z sign = layer):');
track.forEach((t, i) =>
  console.log(
    `  f${String(i).padStart(2, '0')}  x=${t.x?.toFixed(0).padStart(5)}  y=${t.y?.toFixed(0).padStart(5)}` +
      `  z=${t.z?.toFixed(0).padStart(6)}  ${t.behind ? 'BEHIND' : 'front '}  angle=${t.angle?.toFixed(2)}`,
  ),
);

// Orbit direction via the sign of the 2D cross product of consecutive position
// vectors about the centre — rotation direction through a tilted perspective
// projection is genuinely easy to get backwards by eye.
const c = await page.evaluate(() => ({ cx: window.__ttMascot().cx, cy: window.__ttMascot().cy }));
let cross = 0;
for (let i = 1; i < track.length; i++) {
  const ax = track[i - 1].x - c.cx, ay = track[i - 1].y - c.cy;
  const bx = track[i].x - c.cx, by = track[i].y - c.cy;
  cross += ax * by - ay * bx;
}
console.log(`\ncross-product sum = ${cross.toFixed(0)} -> ${cross < 0 ? 'COUNTER-CLOCKWISE on screen' : 'CLOCKWISE on screen'}`);
console.log(`layer flips observed: ${track.filter((t, i) => i && t.behind !== track[i - 1].behind).length}`);
console.log(`console errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ' + e));

// Contact sheet — single screenshots have hidden real defects on this project twice.
const cols = 3, rows = Math.ceil(FRAMES / cols), TH = 300, TWd = Math.round((TH * W) / H);
const tiles = [];
for (let i = 0; i < files.length; i++) {
  const b = await sharp(files[i]).resize(TWd, TH).toBuffer();
  tiles.push({ input: b, left: (i % cols) * TWd, top: Math.floor(i / cols) * TH });
}
await sharp({ create: { width: cols * TWd, height: rows * TH, channels: 3, background: '#333' } })
  .composite(tiles).png().toFile(`${OUT}${TAG}-sheet.png`);
console.log(`\nsheet: ${TAG}-sheet.png`);

await browser.close();

// Assertions: CCW (matches the belt), the orbit crosses layers, no console errors.
const flips = track.filter((t, i) => i && t.behind !== track[i - 1].behind).length;
let failures = 0;
if (cross >= 0) { console.error('FAIL  orbit is not counter-clockwise'); failures++; }
if (flips < 1) { console.error('FAIL  no layer flip observed over the sampled arc'); failures++; }
if (errors.length) { console.error(`FAIL  ${errors.length} console error(s)`); failures++; }
console.log(failures ? `\n${failures} check(s) failed.` : '\nCapture checks passed.');
process.exit(failures ? 1 : 0);
