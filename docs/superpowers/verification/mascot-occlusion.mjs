/**
 * Does the z-index flip actually occlude?
 *
 * Parks the mascot ON the logo at a tiny orbit radius, once BEHIND (phase 90°,
 * z>0) and once IN FRONT (phase 270°, z<0), and measures how many pixels each
 * contributes over a mascot-disabled baseline.
 *
 * Everything is frozen with prefers-reduced-motion first. Without that the
 * satellites keep orbiting between shots and their motion swamps the signal —
 * the same trap documented for the live-preview guard checks in
 * docs/superpowers/verification/README.md.
 */
import puppeteer from 'puppeteer-core';
import { createRequire } from 'node:module';
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp');

import { mkdirSync } from 'node:fs';
const OUT = (process.env.TT_SHOTS ?? 'shots') + '/';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000/en/dev/mascot';
const W = 1280, H = 800;

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

// Tiny radius so the orbit crosses the mark; big enough to be unmissable;
// spin/trail off so only the body itself contributes pixels.
const common =
  'RADIUS=0.1&SIZE=150&SPEED_SCALE=0&SPIN_SPEED=0&TRAIL_ENABLED=0&LABEL_ENABLED=0&DEPTH_SCALE=0&ENTRANCE_MS=0&SCROLL_FADE_VH=0';

async function shot(name, qs, expectMascot = true) {
  await page.goto(`${BASE}?${qs}`, { waitUntil: 'networkidle2', timeout: 60000 });
  // The baseline probe runs with ENABLED=0 — no engine, no dev handle.
  if (expectMascot) await page.waitForFunction(() => window.__ttMascot, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3500));
  const st = await page.evaluate(() => (window.__ttMascot ? window.__ttMascot() : { pos: null, behind: null }));
  const f = `${OUT}occ-${name}.png`;
  await page.screenshot({ path: f });
  return { f, st };
}

const off = await shot('baseline', `${common}&ENABLED=0`, false);
const behind = await shot('behind', `${common}&ENABLED=1&PHASE=90`);
const front = await shot('front', `${common}&ENABLED=1&PHASE=270`);

console.log('baseline pos:', JSON.stringify(off.st.pos), 'behind:', off.st.behind);
console.log('behind   pos:', JSON.stringify(behind.st.pos), 'behind flag:', behind.st.behind);
console.log('front    pos:', JSON.stringify(front.st.pos), 'behind flag:', front.st.behind);

// Crop to the logo's own neighbourhood; the side panel and frame edges are
// identical in all three and would only dilute the ratio.
const CROP = { left: 380, top: 120, width: 560, height: 560 };
async function raw(f) {
  return sharp(f).extract(CROP).raw().toBuffer();
}
const a = await raw(off.f), b = await raw(behind.f), c = await raw(front.f);

function diffCount(x, y) {
  let n = 0;
  for (let i = 0; i < x.length; i += 3) {
    const d = Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    if (d > 24) n++;
  }
  return n;
}
const nBehind = diffCount(a, b);
const nFront = diffCount(a, c);
const total = CROP.width * CROP.height;

console.log(`\npixels the mascot contributes over the logo-only baseline, in a ${CROP.width}x${CROP.height} crop:`);
console.log(`  BEHIND : ${nBehind.toString().padStart(6)}  (${((nBehind / total) * 100).toFixed(2)}%)`);
console.log(`  FRONT  : ${nFront.toString().padStart(6)}  (${((nFront / total) * 100).toFixed(2)}%)`);
console.log(`  ratio front/behind = ${(nFront / Math.max(1, nBehind)).toFixed(2)}x`);

const pass = nFront > nBehind * 1.4 && nFront > 4000;
console.log(`\n${pass ? 'PASS' : 'FAIL'}: the flip ${pass ? 'does' : 'does NOT'} occlude.`);

await sharp({ create: { width: 560 * 3, height: 560, channels: 3, background: '#333' } })
  .composite([
    { input: await sharp(off.f).extract(CROP).toBuffer(), left: 0, top: 0 },
    { input: await sharp(behind.f).extract(CROP).toBuffer(), left: 560, top: 0 },
    { input: await sharp(front.f).extract(CROP).toBuffer(), left: 1120, top: 0 },
  ])
  .png().toFile(`${OUT}occlusion-sheet.png`);
console.log('sheet: occlusion-sheet.png  (baseline | behind | front)');

await browser.close();
process.exit(pass ? 0 : 1);
