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
 * ⚠️ Then `rm -rf .next/cache` and restart. `unstable_cache` persists to disk
 * and `revalidateTag` is a no-op outside a request context, so a script's write
 * is invisible until the cache is cleared.
 *
 * ⚠️ It OVERWRITES the whole global. That is correct for this one — the bench
 * is the only place these values are ever decided, and types.ts is the record
 * of that decision. It would be wrong for `hero-effects`, where the owner's
 * tuning diverges from code and the seed guard exists to protect it.
 */
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
process.exit(0)
