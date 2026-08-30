// The satellites kill switch must remove the field, not merely neutralise it.
//
// Two prior sub-projects shipped a switch that gated only a parameter while the
// effect kept running — once leaving a solid logo popping over a still-playing
// video, which is worse than the plain crossfade the field promised to restore.
// So this asserts the CANVASES ARE ABSENT, not that they are blank.
//
// Run with the dev server up:
//   node docs/superpowers/verification/satellites-kill-switch.mjs

import puppeteer from './_puppeteer.mjs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

// Per this directory's README these scripts are COPIED into a scratchpad that
// has puppeteer-core, and run from there — so nothing may be resolved relative
// to this file's own location.
const APP = process.env.TT_APP ?? 'D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT'
const SHOTS = process.env.TT_SHOTS ?? '.'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API = 'http://localhost:3000/api/globals/hero-effects'
const LOGIN = 'http://localhost:3000/api/users/login'
const PAGE = 'http://localhost:3000/en'

// Reads on this global are open; writes are not. An unauthenticated POST
// returns 403, and without this the OFF probe would "pass" simply because
// nothing ever changed.
const EMAIL = process.env.TT_ADMIN_EMAIL ?? 'admin@tampa-taruno.local'
const PASSWORD = process.env.TT_ADMIN_PASSWORD ?? 'tampataruno-2026'

const login = async () => {
  const r = await fetch(LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`login failed: ${r.status} — is the dev server seeded?`)
  const { token } = await r.json()
  if (!token) throw new Error('login returned no token')
  return token
}

const token = await login()

const setEnabled = async (v) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ satellitesEnabled: v }),
  })
  if (!r.ok) throw new Error(`POST failed: ${r.status}`)
  // Reads go through unstable_cache, which persists to disk and survives a
  // dev-server restart. Without clearing it the next probe sees the OLD value
  // and the two polarities look identical.
  await rm(join(APP, '.next', 'cache'), { recursive: true, force: true })
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const probe = async (label) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.setViewport({ width: 1600, height: 900 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(PAGE, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 15000))
  const state = await page.evaluate(() => ({
    canvases: document.querySelectorAll('[data-satellites]').length,
    labels: document.querySelectorAll('[data-satellites="labels"] > div').length,
    logo: !!document.querySelector('canvas[role="img"]'),
  }))
  await page.screenshot({ path: join(SHOTS, `killswitch-${label}.png`) })
  await page.close()
  return { label, ...state, errors }
}

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

await setEnabled(false)
const off = await probe('off')
check('OFF: no satellite canvases in the DOM at all', off.canvases === 0)
check('OFF: no label nodes', off.labels === 0)
check('OFF: the 3D logo still renders', off.logo === true)
check('OFF: no console errors', off.errors.length === 0)

await setEnabled(true)
const on = await probe('on')
check('ON: both canvases plus the label host are present', on.canvases === 3)
check('ON: labels exist', on.labels > 0)
check('ON: the 3D logo still renders', on.logo === true)
check('ON: no console errors', on.errors.length === 0)

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nKill switch verified in both polarities.',
)
process.exit(failures ? 1 : 0)
