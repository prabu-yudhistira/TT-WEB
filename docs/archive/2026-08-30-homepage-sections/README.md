# Homepage sections retired by the 3-section redesign

**Archived:** 2026-08-30 · **Git tag:** `pre-section-redesign-2026-08-30` · **Branch the change lands on:** `feat/samsara-transition`

The homepage went from **hero + 5 sections** to **hero + Section 2 (the SAMSARA room) + Section 3**. This folder records what the five retired sections looked like and did, because code in git history does not let anyone *see* a design without rebuilding it — a lesson this project paid for with the 2026-08-10 orbs attempt.

Design driving the change: `docs/superpowers/specs/2026-08-30-samsara-transition-design.md`

---

## ⚠️ These blocks are still registered, deliberately

The Payload block definitions for all five remain in `src/blocks/index.ts`. They were removed from the **homepage document's layout** only.

**Do NOT delete the definitions.** Payload stores blocks in child tables (`pages_blocks_featured_works` and siblings); removing a definition makes the next schema push **DROP those tables**, destroying the content of any page still carrying that block.

**To restore a section:** add it back to a page's layout in `/admin`. No code change.

`ManifestoStrip.tsx` is additionally still rendered by the `/manifesto` route and **must not be deleted under any circumstances.**

### Child tables that must still exist after the redesign

Captured from `tampa-taruno.db` on 2026-08-30, before any change:

```
pages_blocks_archive_teaser          pages_blocks_archive_teaser_locales
pages_blocks_contact_mailto          pages_blocks_contact_mailto_locales
pages_blocks_featured_works          pages_blocks_featured_works_locales
pages_blocks_hero                    pages_blocks_hero_locales
pages_blocks_hero_floating_words
pages_blocks_manifesto_strip         pages_blocks_manifesto_strip_locales
pages_blocks_media_full              pages_blocks_media_full_locales
pages_blocks_rich_text               pages_blocks_rich_text_locales
pages_blocks_services_rows           pages_blocks_services_rows_locales
```

Re-query and diff after any schema push:

```bash
node -e "const{createClient}=require('@libsql/client');createClient({url:'file:./tampa-taruno.db'}).execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pages_blocks_%' ORDER BY name\").then(r=>r.rows.forEach(x=>console.log(x.name)))"
```

A table missing from that list is **content destroyed**, not a cosmetic change.

---

## The five sections

### 1. `manifestoStrip` — `ManifestoStrip.tsx`

Full-viewport panel of poetic statements that **fill with ink as you scroll through them**, driven by a GSAP ScrollTrigger scrub over SplitText characters. Data: the `manifesto-statements` collection, localized.

**Still in use on `/manifesto`.** Only its homepage instance was retired.

### 2. `featuredWorks` — `FeaturedWorks.tsx`

Synapser-style carousel: full-bleed strip of square cover frames, centred card full-size with neighbours half-scale and dimmed, a numbered metadata row (`// 01 Description · // 02 Services · // 03 Industry · // 04 Location`), a bordered *View Project* button, and the active project's title in giant display type. Native scroll-snap plus drag and a 4.5s autoplay that pauses 6.5s on interaction. No carousel library.

Data: `works` collection where `featured` is true — `title`, `slug`, `category`, `year`, `oneLiner`, `servicesLine`, `industry`, `location`. Covers were `PlaceholderFrame`, never real imagery.

### 3. `servicesRows` — `ServicesRows.tsx`

Synapser-style accordion. Collapsed rows show a stroke icon, the service name and a `003//` count; on hover or focus the row expands (`grid-template-rows: 4rem 0fr → 4rem 1fr`, so no height-animation jank), colours invert to graphite fill, and a panel fades in with tagline, description, `/`-separated capability tags and an *Explore more* link to the archive.

Data: `services` collection — `name`, `tagline`, `description`, `capabilities`, `projectCount` (manual, not derived), `icon` (one of 8 inline SVGs).

⚠️ Tap/keyboard toggling applied **inline styles rather than a class**, deliberately: during verification the browser pane served stale computed styles after `classList` changes. If a future session sees `getComputedStyle` contradicting a just-applied class, that is the artifact.

### 4. `archiveTeaser` — `ArchiveTeaser.tsx`

Small section rendering a localized `countTemplate` with `{{count}}` replaced by the live `works` count, linking to `/[locale]/archive`.

### 5. `contactMailto` — `ContactMailto.tsx`

Email-first contact close: heading, a `mailto:` link (per-block `emailOverride`, else `site-settings.email`), plus location line and timezone from `site-settings`.

---

## Screenshots

`shots/` — 24 PNGs: each section at `en`/`id` × desktop 1440×900 / mobile 390×844, plus a full-page shot per locale and breakpoint.

Captured by `scripts/archive-sections.mjs`. Three things about that script are load-bearing and were each learned the hard way:

1. **Reduced motion is NOT emulated.** It would make shots byte-stable, but `ManifestoStrip` reveals its text through a scroll scrub — under reduced motion it captures as an *empty* section.
2. **`manifestoStrip` is captured by sampling scroll positions and keeping the most-inked frame**, measured with `sharp`. Scrolling to its centre catches it ~15% filled.
3. **That measurement must be scoped to the section's own box.** Measuring mean luminance over the whole viewport selects the frame where the *hero's* dark paper texture fills the screen and reports it as "most ink" — the same background-not-subject error that made the mascot kill-switch check wrong three times.

And one plain API trap: **`page.screenshot({clip})` takes page coordinates, but `getBoundingClientRect()` returns viewport coordinates.** Without adding `window.scrollY` the clip lands at the document origin and silently captures the hero. Nothing errors; the archive is just quietly wrong. This was caught only by opening the PNG and looking at it.

---

## Component sources

`components/` — verbatim copies as of the archive date. Authoritative history is git; these are for reading without a checkout.
