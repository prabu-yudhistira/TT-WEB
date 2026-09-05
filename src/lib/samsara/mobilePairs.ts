/**
 * Which config paths are the SAME control at two viewports.
 *
 * Several values in `SequenceConfig` exist twice — once for landscape and once
 * for portrait, chosen at runtime by `ctx.mobile`. `LANDING.X_FRAC` and
 * `LANDING.MOBILE_X_FRAC` are not two controls; they are one control asked
 * twice. This map says so, in one place, so the bench can swap a slider between
 * them instead of listing both and inviting the owner to drag the wrong one.
 *
 * ⚠️ A PLAIN module, deliberately — no React, no THREE. `mobilePairs.check.ts`
 * runs under bare node and imports this; the moment it lives inside the bench
 * component the check cannot see it, and the gap below comes straight back.
 *
 * ⚠️ THE GAP THIS EXISTS TO CLOSE. Before this map, the bench listed the three
 * LANDING mobile values as their own sliders and had NOTHING for the other ten:
 * `EMITTERS.MOBILE_SIZE_FRAC`, both mobile orb slots, and all three
 * `HOLOGRAM.MOBILE_*`. They were real config, read on every phone, reachable
 * only by hand-editing `types.ts` — untunable without anything on screen saying
 * so. `mobilePairs.check.ts` now fails if a `MOBILE_` value exists in
 * `DEFAULT_SEQUENCE` with no entry here, so the next one cannot go quiet.
 *
 * Keys are the LANDSCAPE path (what the bench row already declares); values are
 * the portrait path the same row edits in mobile mode.
 */
export const MOBILE_PATHS: Readonly<Record<string, string>> = {
  // Where SAMSARA parks. Portrait puts it in the upper area rather than right.
  'LANDING.SIZE_FRAC': 'LANDING.MOBILE_SIZE_FRAC',
  'LANDING.X_FRAC': 'LANDING.MOBILE_X_FRAC',
  'LANDING.Y_FRAC': 'LANDING.MOBILE_Y_FRAC',

  // ⚠️ ONE size for both orbs at each viewport — see EmittersConfig.SIZE_FRAC.
  // The two orbs are the same object at different depths, so there is no
  // per-slot size to pair here and adding one would break the mockup's
  // proportions the first time either was tuned.
  'EMITTERS.SIZE_FRAC': 'EMITTERS.MOBILE_SIZE_FRAC',
  'EMITTERS.NEAR.X_FRAC': 'EMITTERS.MOBILE_NEAR.X_FRAC',
  'EMITTERS.NEAR.Y_FRAC': 'EMITTERS.MOBILE_NEAR.Y_FRAC',
  'EMITTERS.NEAR.DEPTH_FRAC': 'EMITTERS.MOBILE_NEAR.DEPTH_FRAC',
  'EMITTERS.FAR.X_FRAC': 'EMITTERS.MOBILE_FAR.X_FRAC',
  'EMITTERS.FAR.Y_FRAC': 'EMITTERS.MOBILE_FAR.Y_FRAC',
  'EMITTERS.FAR.DEPTH_FRAC': 'EMITTERS.MOBILE_FAR.DEPTH_FRAC',

  // ⚠️ No MOBILE_H_FRAC, and that is not an omission: height follows width and
  // PANEL_ASPECT, so the artwork cannot be distorted by a viewport change. The
  // pair check below would flag one the moment it appeared.
  'HOLOGRAM.W_FRAC': 'HOLOGRAM.MOBILE_W_FRAC',
  'HOLOGRAM.X_FRAC': 'HOLOGRAM.MOBILE_X_FRAC',
  'HOLOGRAM.Y_FRAC': 'HOLOGRAM.MOBILE_Y_FRAC',
}
