/**
 * Shared puppeteer-core resolver for this harness.
 *
 * puppeteer-core is deliberately NOT a dependency of this app and must never
 * become one — see _HANDOFF/HANDOFF.md. It is installed in the session
 * scratchpad instead.
 *
 * ⚠️ A bare `import puppeteer from 'puppeteer-core'` in a file that lives HERE
 * cannot find it, no matter which directory you run node from: ESM resolves
 * from the importing FILE's location upward, not from the working directory.
 * Every script in this folder used to do exactly that, which quietly made the
 * whole committed harness unrunnable without an undocumented manual step.
 *
 * So reach across package roots explicitly — the same technique mascot-capture
 * already used to pull `sharp` out of the app.
 *
 * Point TT_SCRATCH at a directory with puppeteer-core installed:
 *   cd "<scratchpad>" && npm init -y && npm install puppeteer-core
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const SCRATCH =
  process.env.TT_SCRATCH ??
  'C:/Users/YUDHISTIRA/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/d0ca22db-692e-419a-99b2-f64c186473d0/scratchpad'

// pathToFileURL, not a hand-built file:// string: this repo sits under
// "TAMPA TARUNO" and the scratchpad path is a Windows path, so both the space
// and the separators need encoding that is easy to get wrong by hand.
let puppeteer
try {
  const require = createRequire(pathToFileURL(`${SCRATCH}/package.json`))
  puppeteer = require('puppeteer-core')
} catch (err) {
  console.error('Could not load puppeteer-core from:', SCRATCH)
  console.error('Install it there first:')
  console.error('  cd "<scratchpad>" && npm init -y && npm install puppeteer-core')
  console.error('Or set TT_SCRATCH to a directory that has it.')
  throw err
}

export default puppeteer
export { puppeteer }
