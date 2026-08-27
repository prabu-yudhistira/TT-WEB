# Constellation / satellite words — backup

**Taken:** 2026-08-27, immediately before deleting `ConstellationField.tsx` (sub-project 3,
satellites implementation, Task 10).

## Why this file exists

The owner asked for the words to be recoverable before `ConstellationField` was removed.
**Technically nothing about the words themselves changes in that removal** — `floatingWords`
is a CMS field on the hero block, independent of which component renders it, and the
orbiting satellites already consume the exact same field the constellation used. Deleting
the component deletes a rendering effect, not this data. This file is a belt-and-suspenders
snapshot anyway, taken at the owner's explicit request, so the exact wording at this moment
is recoverable even if the CMS field itself is ever edited or cleared later.

**The database is the live, authoritative source.** This file is a point-in-time copy, not a
replacement for it. Restoring these words means visiting `/admin` → Pages → Home → the Hero
block → the word editor (`FloatingWordsField`, one word per line — see `src/blocks/index.ts`
and `src/components/admin/FloatingWordsField.tsx`), pasting the relevant list back in, and
saving. Or, for a scripted restore, `POST /api/pages/{id}?locale={locale}` with
`{ layout: [...with the hero block's floatingWords set...] }` — see `resolveSatellites.ts`
and the hero block schema in `src/blocks/index.ts` for the exact array shape
(`floatingWords: { word: string }[]`).

## EN (13 words, page id 1)

```
samsara
sketch
craft
design
identity
motion
detail
story
precision
digital
atelier
jakarta
brand
```

## ID (12 words, page id 1)

```
sketsa
kriya
desain
identitas
gerak
detail
cerita
presisi
digital
atelier
jakarta
merek
```

## Note on the asymmetry

EN carries 13 words, ID carries 12 — there is no Indonesian equivalent of "samsara" yet.
This was already true at the moment of this snapshot; it is not something this session
introduced or corrected. Flagging it here so a future session doesn't assume it's a bug
in this backup rather than the live CMS state at the time it was taken.

## Satellite colour-slot note

The orbiting satellites map colour to *slot index*, not to the word itself (see
`docs/superpowers/specs/2026-08-26-hero-satellites-design.md` §7.2). With EN carrying one
more word than ID, satellite 13 gets a colour on EN that has no ID counterpart at all —
worth knowing if the colour list is ever tuned per-locale by mistake; it isn't localized,
by design, so this only matters as a mental model, not as something to fix.
