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
  /** Centre offset from the eye's home position, in display units (-1..1 space). */
  dx: number
  dy: number
  /** Half-extents of the ellipse, in display units. */
  w: number
  h: number
  /** Lean, degrees. Positive leans the top toward the outside. */
  lean: number
  /** Upward bow of the lower edge, 0..1 — this is what makes a smiling arc. */
  smile: number
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
  // Sized to the mascot's OWN painted ovals rather than to the reference video,
  // at the owner's request — the display should read as the same eyes lit up,
  // not as a smaller screen inside the socket.
  w: 0.34,
  h: 0.50,
  lean: 0,
  smile: 0,
  ...o,
})

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
  neutral: { name: 'neutral', left: eye() },
  // A flattened ellipse is a lens, which is what the reference's blink actually
  // looks like — a rounded bar would have been the rounded-box artefact.
  blink: { name: 'blink', left: eye({ h: 0.05 }) },
  squint: { name: 'squint', left: eye({ h: 0.22, w: 0.35 }) },
  happy: { name: 'happy', left: eye({ h: 0.19, w: 0.37, smile: 1, dy: -0.04 }) },
  wide: { name: 'wide', left: eye({ w: 0.38, h: 0.60 }) },
  lookLeft: { name: 'lookLeft', left: eye({ dx: -0.15, lean: -16, w: 0.31 }) },
  lookRight: { name: 'lookRight', left: eye({ dx: 0.15, lean: 16, w: 0.31 }) },
  lookUpLeft: { name: 'lookUpLeft', left: eye({ dx: -0.13, dy: 0.14, lean: -20, w: 0.31, h: 0.46 }) },
  lookUpRight: { name: 'lookUpRight', left: eye({ dx: 0.13, dy: 0.14, lean: 20, w: 0.31, h: 0.46 }) },
  // Downward glances mirror the upward ones with the LEAN SIGN FLIPPED: the
  // top of the eye tips the other way when the gaze drops, so reusing the up
  // lean would read as looking up while sitting low.  A little shorter, too —
  // a downward look carries a hint of lid.
  lookDownLeft: { name: 'lookDownLeft', left: eye({ dx: -0.13, dy: -0.13, lean: 18, w: 0.32, h: 0.41 }) },
  lookDownRight: { name: 'lookDownRight', left: eye({ dx: 0.13, dy: -0.13, lean: -18, w: 0.32, h: 0.41 }) },
  wink: {
    name: 'wink',
    left: eye({ h: 0.05 }),
    right: eye({ h: 0.19, w: 0.37, smile: 1, dy: -0.04 }),
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
  out[at + 5] = e.smile
}

export const lerpEye = (a: EyeShape, b: EyeShape, t: number): EyeShape => ({
  dx: a.dx + (b.dx - a.dx) * t,
  dy: a.dy + (b.dy - a.dy) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
  lean: a.lean + (b.lean - a.lean) * t,
  smile: a.smile + (b.smile - a.smile) * t,
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
  vec2 q = p - vec2(pa[0] * sideSign, pa[1]);
  float a = pa[4] * sideSign;
  float c = cos(a), s = sin(a);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec2 hs = max(vec2(pa[2], pa[3]), vec2(1e-4));

  // smile: bow the lower edge upward, so the shape reads as an arc
  q.y += pa[5] * 0.55 * hs.y * (1.0 - clamp((q.x * q.x) / (hs.x * hs.x), 0.0, 1.0));

  return (length(q / hs) - 1.0) * min(hs.x, hs.y);
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

  // hot core inside the blob, saturated body toward its edge
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
