/**
 * How often does the mascot sort WRONGLY against a satellite bead?
 *
 * The mascot lives on its own canvas, so it cannot depth-sort per-pixel against
 * the beads — only per-layer. Layering is correct whenever the two are on
 * DIFFERENT layers. The only wrong case is: they overlap on screen, are on the
 * SAME layer, and the bead is genuinely nearer (bead.z < mascot.z) — because
 * the mascot's canvas always paints over the satellites' canvas on both layers
 * (it is later in the DOM).
 *
 * Samples a full orbit and reports the fraction of frames in that state.
 */
import puppeteer from 'puppeteer-core';

const OWNER = {
  ENABLED: 1, RADIUS: 0.71, MOBILE_RADIUS: 0.55, HEIGHT: 136, TILT_OFFSET: 0,
  PHASE: 88, SPEED_SCALE: 0.52, SIZE: 24, MOBILE_SIZE: 18, DEPTH_SCALE: 0.3,
  OPACITY: 1, ENV_INTENSITY: 1, LIGHT_INTENSITY: 1.5, SPIN_SPEED: 113,
  SPIN_TILT: 12, BOB_PX: 0, BOB_SECONDS: 8.8, TRAIL_ENABLED: 1,
  TRAIL_SECONDS: 1.1, TRAIL_WIDTH: 0.67, TRAIL_OPACITY: 0.12,
  HOLD_FREEZE: 1, HOLD_SHAKE_PX: 1.5, HOLD_SHAKE_SPEED: 1,
  ENTRANCE_MS: 0, SCROLL_FADE_VH: 0,
};
const qs = Object.entries(OWNER).map(([k, v]) => `${k}=${v}`).join('&') + '&TRAIL_COLOR=%23c37d04';

const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'laptop  1280x800', width: 1280, height: 800 },
  { name: 'phone    390x844', width: 390, height: 844 },
];

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
});

let worst = 0;
for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(`http://localhost:3000/en/dev/mascot?${qs}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000));

  const SAMPLES = 140;
  let overlapFrames = 0, wrongFrames = 0, wrongPairs = 0, maxOverlapPx = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const s = await page.evaluate(() => {
      const m = window.__ttMascot();
      const sat = window.__ttSatellites();
      return { m, sat };
    });
    const m = s.m;
    if (!m.pos || m.pos.x == null) { await new Promise((r) => setTimeout(r, 60)); continue; }
    // On-screen radius of the mascot right now, same formula the engine uses.
    const depthScale = 1 + (m.pos.scale - 1) * (1 + OWNER.DEPTH_SCALE * 4);
    const mr = (OWNER.SIZE * Math.max(0.15, depthScale)) / 2;
    let frameOverlap = false, frameWrong = false;
    for (const b of s.sat.sats) {
      if (b.x !== b.x) continue;
      const d = Math.hypot(b.x - m.pos.x, b.y - m.pos.y);
      const sep = mr + b.r;
      if (d >= sep) continue;
      frameOverlap = true;
      maxOverlapPx = Math.max(maxOverlapPx, sep - d);
      const sameLayer = b.z >= 0 === m.pos.z >= 0;
      if (sameLayer && b.z < m.pos.z) { frameWrong = true; wrongPairs++; }
    }
    if (frameOverlap) overlapFrames++;
    if (frameWrong) wrongFrames++;
    await new Promise((r) => setTimeout(r, 60));
  }
  const pctOverlap = (overlapFrames / SAMPLES) * 100;
  const pctWrong = (wrongFrames / SAMPLES) * 100;
  worst = Math.max(worst, pctWrong);
  console.log(
    `${vp.name}: overlaps a bead in ${pctOverlap.toFixed(1)}% of frames; ` +
      `WRONGLY sorted in ${pctWrong.toFixed(1)}% (${wrongPairs} pair-events, ` +
      `deepest overlap ${maxOverlapPx.toFixed(1)}px)`,
  );
  await page.close();
}

await browser.close();
console.log(`\nworst-case wrong-sorting: ${worst.toFixed(1)}% of frames`);
console.log(worst < 2 ? 'VERDICT: negligible — the height offset clears the belt.' : 'VERDICT: visible enough to address.');

process.exit(worst < 2 ? 0 : 1);
