import { unstable_cache } from 'next/cache'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

import type {
  Page,
  Work,
  Service,
  ManifestoStatement,
  SiteSetting,
  HeroEffect,
  Business,
  City,
} from '../payload-types'
import type { Planet } from './orbit/types'
import { defaultLocale, type Locale } from './i18n'

export type { Locale }
export { locales, defaultLocale } from './i18n'

// Pinned to globalThis, not just to this module: Next dev re-evaluates this
// module on every HMR pass, and a plain module-level promise would leave a new
// Payload instance (and its connection) behind each time. globalThis outlives
// module re-evaluation, so a dev process keeps exactly one.
//
// This is housekeeping, not the fix for the SQLITE_BUSY crashes on navigation —
// those came from schema push racing across worker processes, which globalThis
// cannot reach. See the `push` comment in payload.config.ts.
const globalForPayload = globalThis as typeof globalThis & {
  __ttPayload?: Promise<Payload>
}

const payloadPromise = (globalForPayload.__ttPayload ??= getPayload({ config }))

export const getSettings = (locale: Locale): Promise<SiteSetting> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      return payload.findGlobal({ slug: 'site-settings', locale, fallbackLocale: defaultLocale })
    },
    ['settings', locale],
    { tags: ['settings'] },
  )()

// Not localized — the values are numbers, so no locale in the cache key.
export const getHeroEffects = (): Promise<HeroEffect> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      return payload.findGlobal({ slug: 'hero-effects' })
    },
    ['hero-effects'],
    { tags: ['hero-effects'] },
  )()

export const getPage = (slug: string, locale: Locale): Promise<Page | null> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'pages',
        where: { slug: { equals: slug } },
        locale,
        fallbackLocale: defaultLocale,
        depth: 2,
        limit: 1,
      })
      return res.docs[0] ?? null
    },
    ['page', slug, locale],
    { tags: ['pages'] },
  )()

export const getWorks = (locale: Locale, opts?: { featured?: boolean }): Promise<Work[]> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'works',
        where: opts?.featured ? { featured: { equals: true } } : {},
        locale,
        fallbackLocale: defaultLocale,
        sort: 'order',
        depth: 1,
        limit: 100,
      })
      return res.docs
    },
    ['works', locale, String(opts?.featured ?? 'all')],
    { tags: ['works'] },
  )()

export const getWork = (slug: string, locale: Locale): Promise<Work | null> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'works',
        where: { slug: { equals: slug } },
        locale,
        fallbackLocale: defaultLocale,
        depth: 2,
        limit: 1,
      })
      return res.docs[0] ?? null
    },
    ['work', slug, locale],
    { tags: ['works'] },
  )()

export const getServices = (locale: Locale): Promise<Service[]> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'services',
        locale,
        fallbackLocale: defaultLocale,
        sort: 'order',
        limit: 20,
      })
      return res.docs
    },
    ['services', locale],
    { tags: ['services'] },
  )()

/**
 * Approved businesses, flattened into what the orbit engine needs
 * (docs/CONCEPT-SEMESTA.md §3–4).
 *
 * Not localized: a business name and a city name are proper nouns, and `kind`
 * is an enum the client maps to a shape — so there is no locale in the cache
 * key and one query serves both languages.
 */
const toPlanet = (doc: Business): Planet => {
  const city = typeof doc.city === 'object' && doc.city !== null ? (doc.city as City) : null
  return {
    id: String(doc.id),
    name: doc.name,
    city: city ? [city.name, city.region].filter(Boolean).join(', ') : '',
    lat: city?.lat ?? null,
    lng: city?.lng ?? null,
    kind: (doc.kind ?? 'other') as Planet['kind'],
    website: doc.website ?? null,
    foundedYear: doc.foundedYear ?? null,
    size: (doc.planet?.size ?? 'medium') as Planet['size'],
    pattern: (doc.planet?.pattern ?? 'plain') as Planet['pattern'],
    ink: (doc.planet?.ink ?? 'graphite') as Planet['ink'],
    trailStyle: (doc.trail?.style ?? 'line') as Planet['trailStyle'],
    trailLength: (doc.trail?.length ?? 'medium') as Planet['trailLength'],
    orbit: (doc.orbit ?? null) as Planet['orbit'],
  }
}

export const getPlanets = (): Promise<Planet[]> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'businesses',
        where: { status: { equals: 'approved' } },
        // Sorted by name so `dailySubset` gets a stable input order; the hero
        // shows a rotating slice, not the first N.
        sort: 'name',
        depth: 1,
        limit: 200,
      })
      return res.docs.map(toPlanet)
    },
    ['businesses'],
    { tags: ['businesses'] },
  )()

export const getManifesto = (locale: Locale): Promise<ManifestoStatement[]> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      const res = await payload.find({
        collection: 'manifesto-statements',
        locale,
        fallbackLocale: defaultLocale,
        sort: 'order',
        limit: 20,
      })
      return res.docs
    },
    ['manifesto', locale],
    { tags: ['manifesto'] },
  )()
