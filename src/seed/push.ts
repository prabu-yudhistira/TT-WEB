/* Applies the current collection/global/field schema to the database.

   `npm run dev` deliberately does not push schema — see the `push` comment in
   payload.config.ts — so run this once after adding or changing a collection,
   a global or a field, otherwise the app queries a table or column that isn't
   there yet ("no such table: hero_effects" and friends).

   Run: npm run db:push — safe to repeat; Payload skips the push when the
   schema already matches. Stop the dev server first: both want the sqlite
   write lock. */
import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  if (process.env.PAYLOAD_DEV_PUSH !== 'true') {
    console.error('PAYLOAD_DEV_PUSH must be "true" — run this via `npm run db:push`.')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  payload.logger.info('Schema push complete.')
  process.exit(0)
}

run()
