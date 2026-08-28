/**
 * Hero mascot — animated LED face display.
 *
 * ⚠️ PROTOTYPE. Throwaway, built to be tuned on screen at /dev/mascot and then
 * rewritten against an approved spec, the same inversion this project used for
 * the satellites and the mascot itself.
 *
 * ── Why this draws in the mascot's OWN material, not on a quad ────────
 * Measured on both the source and shipped models: the mascot's front cap is a
 * SMOOTH SPHERICAL DISC of radius ~0.50 in model units (per-bin z-spread <=
 * 0.014), curving from z 0.850 at centre to 0.759 at its rim; past r = 0.50 the
 * spread jumps to 0.048–0.077 and the ornamental bezel relief begins. There is
 * NO cavity — the "recessed socket with amber eyes" is entirely painted into the
 * baseColor plus the normal map.
 *
 * A flat quad in front of that dome would float ~0.09 units proud at its rim —
 * about 3.5px of visible detachment at closest approach, and it would poke
 * through the bezel at grazing angles. So the display is drawn ON the surface,
 * in object space, masked to that disc. Consequences, all free:
 *   - it follows the curvature exactly
 *   - it is hidden when the face turns away (it is simply a backface)
 *   - it scales with the mascot at no cost, and adds no draw call
 *
 * ── The expression model ─────────────────────────────────────────────
 * The reference video (Robot Eye Emotion Expressions.mp4, analysed frame by
 * frame) is a 2D LED face: two rounded blobs that MORPH — they never cut
 * between fixed sprites. So an expression here is a small parameter vector and
 * every expression is reachable by lerping between vectors, the way Cozmo and
 * Vector do it. No sprite sheet, no assets.
 */

/**
 * One eye's shape. Mirrored for the other eye unless a field says otherwise.
 *
 * The primitive is an ELLIPSE, not a rounded box: the owner asked for ovals to
 * match the mascot's own painted eyes, and a rounded box can only reach a
 * stadium/capsule, never a true oval. Dropping the four corner radii also
 * dropped the `brow` cut, which existed only to build the `angry` expression —
 * removed at the owner's request.
 */
export type EyeShape = {
  /**
   * SEPARATION, not position. Mirrored by the shader (multiplied by the eye's
   * side sign), so positive dx pushes the two eyes apart on top of GAP.
   * For a shared sideways movement use `gaze`.
   */
  dx: number
  /** Shared vertical offset. NOT mirrored — both eyes move the same way. */
  dy: number
  /**
   * Shared HORIZONTAL offset — both eyes slide the same way, which is what a
   * sideways glance actually is.
   *
   * This exists because `dx` cannot express one: it is mirrored, so the
   * original lookLeft (`dx: -0.15`) pulled the eyes 0.15 closer together
   * instead of moving them left, and every look* direction was wrong for that
   * structural reason rather than a tuning one.
   */
  gaze: number
  /** Half-extents of the ellipse, in display units. */
  w: number
  h: number
  /** Lean, degrees. Mirrored: positive leans each eye's top toward the outside. */
  lean: number
  /**
   * Carves the eye into a crescent by subtracting a copy of itself offset
   * DOWNWARD, leaving a thin arc along the top — the smiling LED eye.
   *
   * 0 leaves a solid ellipse. Small values leave a thin sliver, large values a
   * thicker arc, and past ~2 the cut misses entirely and the ellipse returns.
   *
   * This replaces the earlier `smile`, which bowed the lower edge of a SOLID
   * ellipse. That can only ever produce a fat blob; the reference's happy eye
   * is hollow, tapering to a point at each end, which is a subtraction and
   * cannot be reached by deforming one shape.
   */
  crescent: number
}

export type Expression = {
  name: string
  left: EyeShape
  /** Omit to mirror `left`. */
  right?: EyeShape
}

const eye = (o: Partial<EyeShape> = {}): EyeShape => ({
  dx: 0,
  dy: 0,
  gaze: 0,
  // Sized to the mascot's OWN painted ovals rather than to the reference video,
  // at the owner's request — the display should read as the same eyes lit up,
  // not as a smaller screen inside the socket.
  w: 0.34,
  h: 0.50,
  lean: 0,
  crescent: 0,
  ...o,
})

/**
 * ⚠️ `dx` is MIRRORED, which matters when reading the numbers below.
 *
 * The shader multiplies it by the eye's side sign, so a positive dx pushes the
 * left eye further left AND the right eye further right. It is extra
 * SEPARATION on top of GAP, not a shared sideways slide. An eye's centre sits
 * at ±(GAP + dx), and its outer edge at GAP + dx + w — which is why a large dx
 * with a large w can reach past the smooth front cap (r = 1.0) onto the
 * ornamental bezel, and why a large w with a small dx can cross the centreline
 * and merge the two eyes into a single bar.
 */

/**
 * The expression vocabulary, read off the reference video's own frames.
 *
 * ⚠️ PROTOTYPE VALUES — not owner-approved. These exist to be tuned live.
 * Deliberately COARSE: the owner chose to keep SPIN_SPEED 113 (a full
 * revolution every 3.2s), so the face sweeps past the viewer for well under a
 * second at a time, at which point one eye is ~14x18px. Only large silhouette
 * changes read at all; subtlety here would be invisible by construction.
 *
 * `angry` was removed at the owner's request 2026-08-28. There was never a
 * `sad`; `squint` is the nearest thing to one and is kept.
 */
export const EXPRESSIONS: Record<string, Expression> = {
  // ── ALL OWNER-TUNED on screen, 2026-08-28 ─────────────────────────
  // Every value below was set live at /dev/mascot and pasted back. Treat them
  // as decisions, not defaults: several are deliberately ASYMMETRIC between
  // the left and right variants of the same gesture, and several sit close to
  // the socket edge on purpose. Both are noted where they matter.
  neutral: { name: 'neutral', left: eye({ dx: 0.25, dy: 0.09, w: 0.42, h: 0.68 }) },
  // A flattened ellipse is a lens, which is what the reference's blink actually
  // looks like — a rounded bar would have been the rounded-box artefact.
  blink: { name: 'blink', left: eye({ dx: 0.26, dy: 0.05, w: 0.40, h: 0.05 }) },
  squint: { name: 'squint', left: eye({ dx: 0.21, dy: 0.20, w: 0.60, h: 0.09 }) },
  wide: { name: 'wide', left: eye({ dx: 0.21, dy: 0.17, w: 0.60, h: 0.78 }) },

  // A crescent tapering to a point at each end, per the owner's reference
  // frame. Arc thickness is crescent x h; too thin and the band's own inner
  // glow fills the hollow it just carved, and the eye reads as a bright
  // OUTLINE rather than an arc — measured on screen, not predicted.
  happy: { name: 'happy', left: eye({ dx: 0.25, dy: 0.10, w: 0.45, h: 0.47, lean: 6, crescent: 0.36 }) },

  // Direction is `gaze` (shared). Using `dx` here was the original bug: it is
  // mirrored, so it only ever moved the eyes toward or away from each other.
  lookLeft: { name: 'lookLeft', left: eye({ dx: 0.18, dy: 0.09, gaze: -0.35, w: 0.38, h: 0.60 }) },
  lookRight: { name: 'lookRight', left: eye({ dx: 0.18, dy: 0.09, gaze: 0.36, w: 0.38, h: 0.60 }) },
  // Straight up and down need no gaze — dy was already the shared axis.
  lookUp: { name: 'lookUp', left: eye({ dx: 0.11, dy: 0.50, w: 0.38, h: 0.56, lean: -19 }) },
  lookDown: { name: 'lookDown', left: eye({ dx: 0.18, dy: -0.50, gaze: -0.01, w: 0.38, h: 0.52, lean: 20 }) },
  lookUpLeft: { name: 'lookUpLeft', left: eye({ dx: 0.08, dy: 0.46, gaze: -0.30, w: 0.38, h: 0.57 }) },
  lookUpRight: { name: 'lookUpRight', left: eye({ dx: 0.18, dy: 0.38, gaze: 0.26, w: 0.38, h: 0.57 }) },
  lookDownLeft: { name: 'lookDownLeft', left: eye({ dx: 0.09, dy: -0.37, gaze: -0.34, w: 0.38, h: 0.52, lean: 17 }) },
  lookDownRight: { name: 'lookDownRight', left: eye({ dx: 0.08, dy: -0.45, gaze: 0.29, w: 0.38, h: 0.52, lean: 12 }) },

  // One eye closed, one smiling. The open eye is NOT `happy` — the owner tuned
  // it separately (sits higher, shorter, no lean, deeper carve). Do not
  // "simplify" this by pointing it at happy's shape.
  wink: {
    name: 'wink',
    left: eye({ dx: 0.26, dy: 0.05, gaze: 0.03, w: 0.40, h: 0.05 }),
    right: eye({ dx: 0.25, dy: 0.22, gaze: -0.05, w: 0.45, h: 0.44, crescent: 0.40 }),
  },
}

/**
 * Packs an EyeShape into the 12 floats the shader reads. Slots past the ellipse
 * parameters stay zero — the array width is kept at 12 so the uniform layout
 * does not change if a future expression needs more.
 */
export function packEye(e: EyeShape, out: Float32Array, at: number): void {
  out.fill(0, at, at + 12)
  out[at] = e.dx
  out[at + 1] = e.dy
  out[at + 2] = e.w
  out[at + 3] = e.h
  out[at + 4] = (e.lean * Math.PI) / 180
  out[at + 5] = e.crescent
  out[at + 6] = e.gaze
}

export const lerpEye = (a: EyeShape, b: EyeShape, t: number): EyeShape => ({
  dx: a.dx + (b.dx - a.dx) * t,
  dy: a.dy + (b.dy - a.dy) * t,
  gaze: a.gaze + (b.gaze - a.gaze) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
  lean: a.lean + (b.lean - a.lean) * t,
  crescent: a.crescent + (b.crescent - a.crescent) * t,
})

/** `right` defaults to a mirror of `left`. */
export const rightOf = (x: Expression): EyeShape => x.right ?? x.left

/**
 * Fragment-stage GLSL. Injected into the mascot's MeshStandardMaterial via
 * onBeforeCompile, the same way shatterMaterial.ts injects tt_hatchify/tt_shine
 * into the logo.
 *
 * Object space, not UV: the mascot's UV atlas is chunked AND tiles 16x
 * (KHR_texture_transform scale ~16), so UVs cannot locate the face. Object-space
 * xy on the front cap can, and is stable under any spin.
 */
export const EYES_FRAGMENT_CHUNK = /* glsl */ `
uniform float uEyesOn;        // 0..1 master fade
uniform float uFaceRadius;    // model units; the smooth cap ends at ~0.50
uniform vec3  uEyeColor;
uniform vec3  uEyeCore;       // hot centre
uniform vec3  uSocketColor;
uniform float uEyeGlow;
uniform float uEyeGap;        // half-distance between the two eyes, display units
uniform float uScanline;      // 0 = off; gated by on-screen size on the CPU side
uniform float uSocketSpan;    // how far past the display radius the darkening reaches
uniform float uEyeL[12];
uniform float uEyeR[12];
varying vec3 vTtObjPos;


// Ellipse SDF with a lean and a bowed lower edge. An ellipse, not a rounded
// box: the owner asked for ovals matching the mascot's painted eyes, and a
// rounded box tops out at a stadium. Flattening h turns it into a lens, which
// is exactly what the reference's blink looks like.
//
// length(q/hs) - 1.0 is in normalised units, so it is scaled back by the
// smaller half-extent to stay an approximate distance — that keeps fwidth()
// antialiasing stable as the eye squashes.
float tt_eyeShape(vec2 p, float pa[12], float sideSign) {
  // pa[0] (dx) is MIRRORED — it separates the eyes. pa[6] (gaze) is NOT, so it
  // slides both the same way, which is what a sideways glance is. Mixing the
  // two up is why every look* direction was wrong: dx alone can only move the
  // eyes toward or away from each other.
  vec2 q = p - vec2(pa[0] * sideSign + pa[6], pa[1]);
  float a = pa[4] * sideSign;
  float c = cos(a), s = sin(a);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec2 hs = max(vec2(pa[2], pa[3]), vec2(1e-4));

  float d = (length(q / hs) - 1.0) * min(hs.x, hs.y);

  // crescent: subtract the same ellipse offset DOWNWARD, leaving a thin arc
  // along the top that tapers to a point at each end — the reference's happy
  // eye. Deforming a single solid ellipse cannot produce this; the shape is
  // hollow, so it has to be a subtraction (max(d, -dCut)).
  if (pa[5] > 0.001) {
    vec2 qc = vec2(q.x, q.y + pa[5] * hs.y);
    float dCut = (length(qc / hs) - 1.0) * min(hs.x, hs.y);
    d = max(d, -dCut);
  }
  return d;
}

vec3 tt_eyes(vec3 base, out float coverage) {
  coverage = 0.0;
  if (uEyesOn < 0.001) return base;
  // Front cap only. The mask is the measured smooth-disc radius; past it the
  // ornamental bezel relief begins and must be left alone.
  if (vTtObjPos.z <= 0.0) return base;
  float r = length(vTtObjPos.xy) / uFaceRadius;
  // The socket darkening reaches FURTHER than the display itself: the painted
  // amber ovals spill past the display radius, and leaving them showing rings
  // the new eyes with the old ones. Display coords stay normalised to
  // uFaceRadius so tuning the cover does not move the eyes.
  if (r > uSocketSpan) return base;

  // display space: -1..1 across the cap, y up
  vec2 p = vTtObjPos.xy / uFaceRadius;

  float dL = tt_eyeShape(p - vec2(-uEyeGap, 0.0), uEyeL, -1.0);
  float dR = tt_eyeShape(p - vec2( uEyeGap, 0.0), uEyeR,  1.0);
  float d = min(dL, dR);

  // px-ish antialias in display space
  float aa = fwidth(d) + 1e-4;
  float fill = 1.0 - smoothstep(-aa, aa, d);
  float glow = exp(-max(d, 0.0) * 26.0) * uEyeGlow;

  // socket: darken the whole cap so the PAINTED amber ovals are covered
  float cap = 1.0 - smoothstep(uSocketSpan - 0.22, uSocketSpan, r);
  vec3 col = mix(base, uSocketColor, cap * uEyesOn);

  // hot core inside the blob, saturated body toward its edge.
  //
  // The fixed 0.20 ramp looks like it should starve a thin crescent of its
  // core — the band is only ~0.17 deep. Rendered side by side at 715px it made
  // no visible difference, so the scale-aware version was removed rather than
  // kept on the strength of the argument. Do not re-derive it as a fix.
  float core = 1.0 - smoothstep(-0.20, 0.02, d);
  vec3 lit = mix(uEyeColor, uEyeCore, core * 0.85);

  if (uScanline > 0.001) {
    // Horizontal LED scanlines, as in the reference. Gated on the CPU by
    // on-screen size: 7 lines across 18px is moire, not texture.
    float lines = 0.5 + 0.5 * cos(p.y * uScanline * 3.14159);
    lit *= mix(1.0, 0.72 + 0.28 * lines, 0.9);
  }

  coverage = clamp(fill + glow * 0.6, 0.0, 1.0) * uEyesOn;
  col = mix(col, lit, clamp(fill, 0.0, 1.0) * uEyesOn);
  col += uEyeColor * glow * 0.5 * uEyesOn;
  return col;
}
`

/**
 * Vertex-stage: publish a NORMALISED object-space position for the fragment
 * stage.
 *
 * ⚠️ `position` cannot be used raw. The shipped GLB carries
 * KHR_mesh_quantization, so the attribute the vertex shader sees is in quantized
 * integer space, NOT the +/-1 model units the faceplate was measured in — the
 * dequantisation lives in the node matrix, which this stage is upstream of.
 * Feeding raw position to the disc mask makes every fragment fail `r > 1.0` and
 * the display silently never draws: it compiles clean, throws nothing, and shows
 * the painted eyes as if the feature were simply absent.
 *
 * uObjCenter / uObjScale come from the geometry's own bounding box at load, so
 * this maps to a stable -1..1 box whatever the encoding.
 */
export const EYES_VERTEX_CHUNK = /* glsl */ `
uniform vec3 uObjCenter;
uniform float uObjScale;
varying vec3 vTtObjPos;
`
