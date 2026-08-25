/**
 * Assertions for live-preview source attribution.
 * Run: npm run verify:config
 *
 * Live Preview posts the edited document with no indication of which document
 * it is. Misattributing it would feed page data into the effects config, so
 * anything unrecognised must fall back to "no live data" rather than guess.
 */
import { parseSource, SOURCE_PARAM } from './source'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

check('recognises hero-effects', parseSource('hero-effects') === 'hero-effects')
check('recognises page', parseSource('page') === 'page')
check('rejects an unknown source', parseSource('something-else') === null)
check('rejects null', parseSource(null) === null)
check('rejects undefined', parseSource(undefined) === null)
check('rejects empty string', parseSource('') === null)
check('is case sensitive — no silent coercion', parseSource('Hero-Effects') === null)
check('does not trim — a padded value is not a valid source', parseSource(' page ') === null)
check('param name is stable', SOURCE_PARAM === 'source')

console.log(failures === 0 ? '\nAll source checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
