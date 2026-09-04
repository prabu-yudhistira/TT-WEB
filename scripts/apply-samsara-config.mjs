/**
 * Push `DEFAULT_SEQUENCE` into the `samsara-sequence` global.
 *
 * ⚠️ WHY THIS SCRIPT HAS TO EXIST.
 *
 * `resolveSamsara` PREFERS SAVED GLOBAL DATA. Once the global has been seeded,
 * editing a default in `lib/samsara/types.ts` changes nothing that a visitor
 * sees — the resolver finds a saved value and uses it. So the bench's
 * `copy json` -> types.ts workflow gets the value into the code and stops
 * there, and the page keeps rendering the previous look with no error and no
 * clue as to why.
 *
 * This is the same shape as the trap recorded for Task 16: a seed edit alone
 * never reaches an existing install.
 *
 * Run it after every owner tuning pass that lands in types.ts:
 *
 *   node --env-file=.env --import tsx scripts/apply-samsara-config.mjs
 *
 * ⚠️ It drops .next/cache for you, but YOU MUST RESTART THE DEV SERVER.
 * `unstable_cache` persists to disk AND the running process keeps its own copy,
 * and `revalidateTag` is a no-op outside a request context, so without both the
 * write lands in the DB and the page goes on rendering the old numbers.
 *
 * ⚠️ It OVERWRITES the whole global. That is correct for this one — the bench
 * is the only place these values are ever decided, and types.ts is the record
 * of that decision. It would be wrong for `hero-effects`, where the owner's
 * tuning diverges from code and the seed guard exists to protect it.
 */
import { rmSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { DEFAULT_SEQUENCE } from '../src/lib/samsara/types.ts'
import { toSamsaraPayload, resolveSamsara } from '../src/lib/samsara/resolveSamsara.ts'

const payload = await getPayload({ config })

const before = resolveSamsara(await payload.findGlobal({ slug: 'samsara-sequence' }))

await payload.updateGlobal({
  slug: 'samsara-sequence',
  data: toSamsaraPayload(DEFAULT_SEQUENCE),
})

const after = resolveSamsara(await payload.findGlobal({ slug: 'samsara-sequence' }))

const flat = (o, p = '') =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
    : [[p, o]]

const b = new Map(flat(before))
let moved = 0
for (const [k, v] of flat(after)) {
  const was = b.get(k)
  if (JSON.stringify(was) !== JSON.stringify(v)) {
    console.log(`  ${k.padEnd(32)} ${JSON.stringify(was)} -> ${JSON.stringify(v)}`)
    moved++
  }
}
console.log(moved ? `\n${moved} value(s) written.` : '\nAlready in sync — nothing written.')

// Proves the round trip rather than assuming it: a field missing from
// toSamsaraPayload writes nothing and silently keeps the old value.
console.log(
  'global now matches the frozen config:',
  JSON.stringify(after) === JSON.stringify(DEFAULT_SEQUENCE),
)

/**
 * ⚠️ AND DROP NEXT'S CACHE, or the write is invisible to the running app.
 *
 * `getSamsaraSequence` is an `unstable_cache` entry tagged 'samsara-sequence',
 * and the global's afterChange hook does call `revalidateTag`. But this script
 * is not a Next request, so that call throws and `safeRevalidate` swallows it
 * — by design, for seed scripts. The entry therefore survives, and in dev it
 * lives on DISK under .next/cache, so it survives a server restart too.
 *
 * The result is a config that has changed everywhere except where it is read:
 * the DB shows the new value, `types.ts` shows the new value, and the page
 * renders the old one. That cost an hour of tuning numbers that were never
 * reaching the shader — every level looked inert while shader edits, which
 * recompile, took effect normally.
 */
const cacheDir = path.join(process.cwd(), '.next', 'cache')
try {
  rmSync(cacheDir, { recursive: true, force: true })
  console.log('dropped .next/cache')
} catch (e) {
  console.warn('could not drop .next/cache:', e.message)
}
// ⚠️ AND THE SERVER HAS TO GO. Deleting the on-disk entry is necessary and not
// sufficient: a running dev server also holds the resolved global in memory for
// the life of the process, so it keeps serving the old numbers from a cache
// directory that no longer exists. Measured, after an hour of tuning values
// that never reached the shader.
console.log('⚠️  RESTART THE DEV SERVER — it holds the old global in memory too.')
process.exit(0)
