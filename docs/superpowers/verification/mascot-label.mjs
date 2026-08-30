/**
 * The mascot's label is placed by MascotEngine; the satellites' labels are
 * placed by SatelliteEngine's own collision pass. Neither knows about the
 * other, so measure how often the mascot's word actually collides with a
 * satellite word — from real DOM rects, not from the geometry model.
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module';
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp');
import { mkdirSync } from 'node:fs';
const OUT = (process.env.TT_SHOTS ?? 'shots') + '/';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
});

let worstCollide = 0, worstClip = 0;
for (const vp of [
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'phone    390x844', width: 390, height: 844 },
]) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto('http://localhost:3000/en/dev/mascot', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  const SAMPLES = 120;
  let collide = 0, visible = 0, clipped = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const r = await page.evaluate(() => {
      const m = document.querySelector('[data-mascot-label]');
      if (!m) return null;
      const mo = parseFloat(getComputedStyle(m).opacity);
      const mr = m.getBoundingClientRect();
      const sats = [...document.querySelectorAll('[data-satellites="labels"] > div')]
        .filter((e) => parseFloat(getComputedStyle(e).opacity) > 0.05)
        .map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; });
      return { mo, m: { l: mr.left, r: mr.right, t: mr.top, b: mr.bottom }, sats,
               W: innerWidth, H: innerHeight, text: m.textContent };
    });
    if (r && r.mo > 0.05) {
      visible++;
      if (r.sats.some((s) => r.m.l < s.r && s.l < r.m.r && r.m.t < s.b && s.t < r.m.b)) collide++;
      if (r.m.l < 0 || r.m.r > r.W || r.m.t < 0 || r.m.b > r.H) clipped++;
    }
    await new Promise((res) => setTimeout(res, 70));
  }
  console.log(
    `${vp.name}: label visible in ${visible}/${SAMPLES} samples; ` +
      `collides with a satellite word in ${collide} (${((collide / Math.max(1, visible)) * 100).toFixed(1)}%); ` +
      `clipped by frame edge in ${clipped}`,
  );
  worstCollide = Math.max(worstCollide, (collide / Math.max(1, visible)) * 100);
  worstClip = Math.max(worstClip, clipped);

  if (vp.width > 1000) {
    const pos = await page.evaluate(() => window.__ttMascot().pos);
    const shot = await page.screenshot();
    const C = 460;
    const left = Math.max(330, Math.min(vp.width - C, Math.round(pos.x - C / 2)));
    const top = Math.max(0, Math.min(vp.height - C, Math.round(pos.y - C / 2)));
    await sharp(shot).extract({ left, top, width: C, height: C }).resize(C * 2, C * 2, { kernel: 'nearest' })
      .png().toFile(`${OUT}label-zoom.png`);
    await sharp(shot).png().toFile(`${OUT}label-full.png`);
  }
  await page.close();
}
await browser.close();

console.log(worstCollide < 3 ? '\nLabel checks passed.' : `\n${worstCollide.toFixed(1)}% collision — too high.`);
process.exit(worstCollide < 3 && worstClip === 0 ? 0 : 1);
