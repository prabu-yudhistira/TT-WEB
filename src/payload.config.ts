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
import { SiteSettings } from './globals/SiteSettings'
import { HeroEffects } from './globals/HeroEffects'
import { SamsaraSequence } from './globals/SamsaraSequence'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// DB adapter is isolated HERE only (Global Constraint): dev = sqlite,
// production swap = @payloadcms/db-postgres + Neon DATABASE_URI.
export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
    // Renders the hero-only preview route in an iframe beside the edit form and
    // pushes UNSAVED form state into it. The `source` marker tells that route
    // which document is live, because the posted payload does not say — see
    // src/lib/livePreview/source.ts.
    livePreview: {
      globals: ['hero-effects', 'samsara-sequence'],
      collections: ['pages'],
      url: ({ locale, globalConfig }) => {
        const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const code = locale?.code || 'en'
        // ⚠️ Read the SLUG rather than testing `globalConfig` for truthiness.
        // That test was fine with one global; with two it silently labels the
        // SAMSARA transition's data as hero-effects, and the preview would then
        // feed a sequence config into the effects resolvers — every field
        // missing, so it renders the saved hero and looks merely 'not live'.
        const source = globalConfig ? globalConfig.slug : 'page'
        // The SAMSARA fields are about the ROOM, so that preview lands there
        // rather than sitting on the hero the whole time.
        return `${base}/${code}/admin-preview/hero?source=${source}`
      },
    },
  },
  editor: lexicalEditor(),
  collections: [Users, Media, Works, Services, ManifestoStatements, Pages],
  globals: [SiteSettings, HeroEffects, SamsaraSequence],
  localization: {
    locales: ['en', 'id'],
    defaultLocale: 'en',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./tampa-taruno.db' },
  }),
  sharp,
})
