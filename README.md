# TAMPA TARUNO — Website

A bilingual (EN/ID) marketing site with a single **Atelier** appearance
(pencil-sketch, hand-drawn logo → rotating 3D graphite). Structure follows a
Synapser-style scroll narrative (numbered nav, manifesto word-scrub,
drag-canvas archive).

Full design spec: [`_PLAN/TAMPA-TARUNO-DUAL-APPEARANCE-DESIGN.md`](../_PLAN/TAMPA-TARUNO-DUAL-APPEARANCE-DESIGN.md)
in the parent `WEBSITE` folder. Build plan: [`_PLAN/TAMPA-TARUNO-BUILD-PLAN.md`](../_PLAN/TAMPA-TARUNO-BUILD-PLAN.md).

## Stack

Next.js 15 (App Router, TS) · Payload CMS 3 (SQLite in dev) · Tailwind v4 +
CSS custom-property tokens · GSAP 3.15 (ScrollTrigger, SplitText,
ScrambleTextPlugin, Draggable, InertiaPlugin, Flip — all free in this GSAP
version) · Lenis · three.js (lazy-loaded, logo only).

## Running locally

```bash
npm install
npm run dev       # http://localhost:3000
```

First run creates `tampa-taruno.db` (SQLite) automatically. Admin panel:
`http://localhost:3000/admin` — login `admin@tampa-taruno.local` /
`tampataruno-2026` (or whatever `SEED_ADMIN_PASSWORD` was set to — **change
the password after first login**).

**Schema changes need `npm run db:push`.** `npm run dev` deliberately does not
push schema (`push` in `payload.config.ts`): Payload pushes on every
`payload.init()`, Next dev inits Payload once per worker process and again on
every HMR reload of the config, and two pushes landing together deadlock on the
SQLite write lock — SQLITE_BUSY escapes `init()` unhandled and kills the dev
server. So after adding or changing a collection, a global or a field:

```bash
npm run db:push       # stop the dev server first — both want the write lock
```

Skip it and the app queries a table that isn't there yet (`no such table:
hero_effects`). `npm run seed` pushes on its own, so a fresh install needs no
extra step.

**Re-seed from scratch:** stop the dev server, delete `tampa-taruno.db`, then
run the commands below — and delete `.next` before starting the server again.
Seeding writes to SQLite behind Next's back, so the revalidate hooks never fire
and pages keep rendering the previous data until the cache is cleared.

```bash
npm run seed          # admin user, settings, statements, services, works, home page (en+id)
npm run seed:verify   # sanity-check counts + a couple of localized values
```

`npm run seed` exits early once a user exists, so an existing database never
receives anything added later. The universe rework (`docs/CONCEPT-SEMESTA.md`)
ships its own additive backfill — safe to re-run, it only creates what is
missing and never overwrites an edit made in `/admin`:

```bash
npm run seed:semesta            # cities, the margin-note words, the rewritten section headings
npm run seed:planets-demo       # 12 FICTIONAL planets, so the hero can be judged before real ones exist
npm run seed:planets-demo -- --clear   # remove them again
```

`unstable_cache` writes to disk at `.next/cache/`, and `revalidateTag` cannot
fire from a seed script — so after seeding run `rm -rf .next/cache` or the site
will keep serving the previous values. Publishing from `/admin` revalidates
correctly and needs no manual step.

`payload run` doesn't work in non-TTY shells on this machine, so seed/verify
run via `node --env-file=.env --import tsx src/seed/*.ts` instead (see
`package.json`).

## Environment variables

See `.env.example`. Key ones:
- `PAYLOAD_SECRET` — random string, rotate for production.
- `DATABASE_URI` — `file:./tampa-taruno.db` in dev; a Postgres connection
  string in production (see deploy swap below).
- `SEED_ADMIN_PASSWORD` — password for the seeded admin user.
- `NEXT_PUBLIC_SITE_URL` — used for `metadataBase`, OG/canonical URLs,
  sitemap.xml, robots.txt. Defaults to `http://localhost:3000`; **set this to
  the real domain once the owner picks one** (checklist item 6.1).

## Deploy: swapping SQLite → Postgres (Neon)

The DB adapter is isolated to one file, `src/payload.config.ts`. To move to
Postgres/Neon:

```bash
npm i @payloadcms/db-postgres
npm uninstall @payloadcms/db-sqlite
```

```ts
// src/payload.config.ts
import { postgresAdapter } from '@payloadcms/db-postgres'
// ...
db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
```

Set `DATABASE_URI` to the Neon connection string, then run the app once to
let Payload push the schema (or use `payload migrate` for a controlled
migration in production). No other file references the DB adapter.

## Content model

- **Collections:** `works`, `services`, `manifesto-statements`, `pages`
  (block-based: Hero, ManifestoStrip, FeaturedWorks, ServicesRows,
  ArchiveTeaser, ContactMailto, RichText, MediaFull), `media`, `users`.
  - **Hero block** also carries the "margin notes" constellation tethered to
    the 3D logo by pencil strings — `constellationEnabled` (checkbox),
    `floatingWords` (localized array, 4–18 short words) and `mobileWordLimit`
    (4–18, default 8). Editable per locale in `/admin`; the hero looks complete
    without it if disabled or empty.

    Order in `floatingWords` is the setting, not decoration: a phone renders
    only the first `mobileWordLimit` of them, because the hero is one screen
    tall there and the full list crowds the logo. The array's rows are labelled
    with the word itself and mark everything past the cutoff as *desktop only*
    ([`src/admin/FloatingWordRowLabel.tsx`](src/admin/FloatingWordRowLabel.tsx)),
    so reordering doesn't mean opening eighteen numbered rows to see what is
    inside them.
- **Global:** `site-settings` (nav labels, contact info). The site ships a
  single Atelier appearance — no appearance-switch labels or transition
  kill-switch.
- **Global:** `hero-effects` — physics and material settings for the hero logo
  separation (hold the logo to pull it apart). Not localized. All 26 editable
  values (24 numeric + 2 hex colours) are range-clamped to match the dev
  tuning bench at `/[locale]/dev/shatter`, which can write back to this global
  with its "save to CMS" button. `separationEnabled` disables the interaction
  only — the glass skin, pencil hatching, light wash and wireframe ghost all
  remain.
- All text-bearing fields are `localized: true` (`en` default, `id`
  secondary). A page's block **layout** (which blocks, in what order) is
  shared across locales; the text *inside* each block is per-locale.

Seeded content is **real business copy** (bilingual EN/ID), written from the
company documents in the parent workspace — `Tampotaruno/laporan-strategi.md`
(mission, values, brand story, tagline, the three publicly-marketed services)
and the actual project repos (`WorldWideSaaS`, `AgencyOS`, `Samsara Atelier`).
The copy lives in [`src/seed/content.ts`](src/seed/content.ts);
`src/seed/index.ts` only maps it onto the Payload schema.

Two standing constraints on that copy, because the company has no paying
clients yet: no invented metrics, client names or outcome claims, and
`projectCount` counts only verified deliveries (Klinik OS and AI Automation
are legitimately `0`). Durations quoted on the site (30–45 days, two weeks)
come from §4 of the strategy report.

Day-to-day edits go through `/admin`, not the seed script (which is for fresh
installs only). Still placeholder: work cover images (see Assets below) and
the social links in `site-settings` (empty until real accounts exist).

## Assets

The hero intro is the **stitched draw-in + Kling extrusion clip**
(`public/media/sketch-draw-16x9.mp4` / `.webm`), whose frames are a photograph
of a real graphite sketch — that is what keeps the construction circle, the
doubled strokes where the hand went back over an edge, and the eraser smudge.
`paper-bg-hero.webp` fills the hero with the clip's own paper on mobile, where
the video only occupies a mid-screen band. `sketch-poster.webp` is the clip's
final frame and doubles as the OG/Twitter share image.

The mesh takes over from the video at the same on-screen size and position, so
retuning logo placement means editing `lib/three/calibration.ts` and nothing
else — `videoCoverScale()` there accounts for the video being `object-fit:
cover` on anything wider than 16:9.

Colours on both sides of the handoff are **measured, not chosen**:
`lib/three/materials.ts` is tuned so the mesh renders at the clip's own
third-act mean (red `#83484B`, graphite `#5E534E`), which is what stops the
handoff reading as a colour jump. Re-measure before changing them.

Work cover marks are generated per project by
[`src/components/work/WorkMark.tsx`](src/components/work/WorkMark.tsx), seeded
from the slug — `PlaceholderFrame` falls back to the studio watermark when no
slug is passed, which is what the decorative frames want.

Other generated/produced assets (logo GLB, textures, Higgsfield
outputs) live in `../_ASSETS/` (parent `WEBSITE` folder) with full
provenance — prompts, models, job IDs, verification notes — logged in
[`_ASSETS/asset-manifest.md`](../_ASSETS/asset-manifest.md). Copy shipping
variants into `public/` (already done for the current asset set); don't
regenerate from scratch without checking that manifest first.

Work/archive item cover images are still **placeholder frames** (CSS, no
imagery) pending real project photography (see `H4` in the asset manifest —
blocked on the owner's business info, same as the copy).

## Known scope boundaries (not bugs)

- Hosting/domain undecided — `NEXT_PUBLIC_SITE_URL` is a placeholder.
- `RichText`/`MediaFull` blocks exist in the schema for future admin use but
  aren't exercised by the seeded homepage.
- No booking/pricing/mascot features — those belong to other reference
  plans in `_PLAN/`, not this dual-appearance concept.

## Performance budgets (verified via `npm run build`)

Re-measured 2026-08-02 on a clean `npm run build`. Run the build with the dev
server **stopped** — both write `.next`, and racing them fails the prerender
with a bogus `webpack-runtime` "Cannot read properties of undefined".

- Base shared JS: 102 KB gz (budget: < 250 KB).
- three.js lazy chunk (logo only, code-split via `next/dynamic(ssr:false)`):
  142.6 KB gz combined (budget: ≤ 180 KB gz). Never included in the base
  bundle — confirmed by grepping the shared chunks for three.js signatures.
  Re-measure after the ignition/shatter work — it lands in this chunk.
- Hero video: ~0.9 MB mp4 / ~0.3 MB webm (budget: ≤ 3.5 MB).
- Logo GLB (Draco-compressed): 53.7 KB (budget: ≤ 300 KB).
