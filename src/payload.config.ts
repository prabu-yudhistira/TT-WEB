import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Works } from './collections/Works'
import { Services } from './collections/Services'
import { ManifestoStatements } from './collections/ManifestoStatements'
import { Pages } from './collections/Pages'
import { Cities } from './collections/Cities'
import { Businesses } from './collections/Businesses'
import { SiteSettings } from './globals/SiteSettings'
import { HeroEffects } from './globals/HeroEffects'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// DB adapter is isolated HERE only (Global Constraint): dev = sqlite,
// production swap = @payloadcms/db-postgres + Neon DATABASE_URI.
export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
  },
  editor: lexicalEditor(),
  collections: [Users, Media, Works, Services, ManifestoStatements, Pages, Cities, Businesses],
  globals: [SiteSettings, HeroEffects],
  localization: {
    locales: ['en', 'id'],
    defaultLocale: 'en',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./tampa-taruno.db' },
    // Payload runs pushDevSchema on EVERY payload.init() outside production,
    // and that push finishes by writing to payload_migrations. Next dev inits
    // Payload once per worker process and again whenever HMR reloads this
    // config, so two pushes regularly land together, collide on the sqlite
    // write lock, and throw SQLITE_BUSY out of init() — unhandled, killing the
    // dev server. It fired on nearly every navigation to a route that had not
    // been compiled yet. libsql exposes no busy timeout to wait it out, so the
    // push is opt-in instead: run `npm run db:push` after changing a
    // collection, global or field, and plain `npm run dev` never writes schema.
    push: process.env.PAYLOAD_DEV_PUSH === 'true',
  }),
  sharp,
})
