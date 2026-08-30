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
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * ⚠️ The scratchpad directory is SESSION-SPECIFIC — its path contains a UUID
 * that changes every session. Hardcoding one made this file work for exactly
 * one day, then fail the next session with a confusing module-not-found.
 *
 * So: search for any scratchpad under this project's temp folder that actually
 * has puppeteer-core installed. TT_SCRATCH still wins if set.
 */
function candidateRoots() {
  const roots = []
  if (process.env.TT_SCRATCH) roots.push(process.env.TT_SCRATCH)

  const base = `${tmpdir()}/claude/D--TAMPA-TARUNO-WEBSITE`.replace(/\\/g, '/')
  try {
    for (const dir of readdirSync(base)) {
      roots.push(`${base}/${dir}/scratchpad`)
    }
  } catch {
    // No sessions directory at all — fall through to the error below.
  }
  return roots
}

let puppeteer
let loadedFrom = null
for (const root of candidateRoots()) {
  if (!existsSync(`${root}/node_modules/puppeteer-core`)) continue
  try {
    // pathToFileURL, not a hand-built file:// string: these are Windows paths
    // and this repo sits under "TAMPA TARUNO", so both the separators and the
    // space need encoding that is easy to get wrong by hand.
    puppeteer = createRequire(pathToFileURL(`${root}/package.json`))('puppeteer-core')
    loadedFrom = root
    break
  } catch {
    // Try the next candidate.
  }
}

if (!puppeteer) {
  console.error('Could not find puppeteer-core in any session scratchpad.')
  console.error('It is deliberately NOT an app dependency. Install it in THIS session\'s scratchpad:')
  console.error('  cd "<scratchpad>" && npm init -y && npm install puppeteer-core')
  console.error('Then re-run. Or set TT_SCRATCH to a directory that already has it.')
  console.error('Searched:', candidateRoots().join('\n          '))
  throw new Error('puppeteer-core not found')
}

if (process.env.TT_VERBOSE) console.error(`[_puppeteer] loaded from ${loadedFrom}`)

export default puppeteer
export { puppeteer }
