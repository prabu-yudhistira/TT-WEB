import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'

import type {
  Page,
  Work,
  Service,
  ManifestoStatement,
  SiteSetting,
  HeroEffect,
  SamsaraSequence,
} from '../payload-types'
import { defaultLocale, type Locale } from './i18n'

export type { Locale }
export { locales, defaultLocale } from './i18n'

const payloadPromise = getPayload({ config })

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

/**
 * The SAMSARA transition's behaviour. Separate from `hero-effects` on purpose
 * — see the note on the global itself.
 */
export const getSamsaraSequence = (): Promise<SamsaraSequence> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      return payload.findGlobal({ slug: 'samsara-sequence' })
    },
    ['samsara-sequence'],
    { tags: ['samsara-sequence'] },
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
