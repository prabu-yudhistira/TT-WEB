'use client'

import { useField } from '@payloadcms/ui'

/**
 * A native colour picker rendered directly under a hex text field in /admin.
 *
 * Placement note: Payload renders `afterInput` as a block-level sibling inside
 * `.field-type__wrap`, so the swatch sits BELOW its input rather than inline
 * with it. Pulling it onto the input's own row would take negative offsets
 * tuned to Payload's own input height and padding — different again inside an
 * array row — which would silently drift on any admin-theme change. Stacked is
 * the robust choice and stays legible in both contexts.
 *
 * Payload 3 has no colour field type, so every colour on the `hero-effects`
 * global is a `text` field validated against /^#[0-9a-fA-F]{6}$/. That is
 * precise but unreadable — "#8E1114" and "#C8341A" are not distinguishable at
 * a glance, and the ignition ramp is four of them in a row.
 *
 * Registered as `admin.components.afterInput`, NOT as a replacement `Field`.
 * That matters: afterInput renders inside Payload's own text field, so the
 * label, description, required marker, validation and error rendering all stay
 * stock. FloatingWordsField had to replace the whole Field because it changes
 * the editing model (18 rows -> one textarea); this only adds a swatch beside
 * an input that is otherwise untouched, so replacing the Field would mean
 * re-implementing all of the above for no benefit.
 *
 * No `path` prop is needed or available — afterInput components are rendered
 * as a bare node with no props (see @payloadcms/ui's Text/Input.js, which
 * renders `AfterInput` directly). `useField()` with no options resolves the
 * path from Payload's own field context instead: its source reads
 * `pathFromOptions || pathFromContext || potentiallyStalePath`, where
 * pathFromContext comes from `useFieldPath()`. Confirmed by reading
 * useField/index.js, not assumed from the docs.
 */

const HEX = /^#[0-9a-fA-F]{6}$/

/** `<input type="color">` only accepts lowercase #rrggbb; anything else makes it fall back to black. */
const toPickerValue = (v: unknown): string =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : '#000000'

export const ColourSwatch = () => {
  const { value, setValue, readOnly } = useField<string>()

  const current = typeof value === 'string' ? value : ''
  const valid = HEX.test(current)

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}
      // The swatch is a convenience view of the adjacent text input, which is
      // the real labelled control — announcing it again would just duplicate
      // the field for a screen reader.
      aria-hidden
    >
      <input
        type="color"
        tabIndex={-1}
        disabled={Boolean(readOnly)}
        value={toPickerValue(current)}
        onChange={(e) => {
          const next = e.target.value
          // Write back UPPERCASE to match every stored value in this project
          // (#8E1114, #2B2A27, the seed, DEFAULT_SATELLITES). Without this the
          // picker's own lowercase output would rewrite the whole palette to a
          // different case on first touch, producing a diff that looks like a
          // real change but is not.
          const upper = `#${next.replace('#', '').toUpperCase()}`
          // Case-insensitive comparison: the picker normalises to lowercase, so
          // an unchanged #8E1114 arrives back as #8e1114 and would otherwise
          // read as an edit — marking the form dirty just for opening the page.
          if (upper.toLowerCase() !== current.toLowerCase()) setValue(upper)
        }}
        style={{
          width: 34,
          height: 34,
          padding: 2,
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          background: 'var(--theme-elevation-50)',
          cursor: readOnly ? 'not-allowed' : 'pointer',
          // A colour that is not yet valid hex would render as black and read
          // as a real choice; dim it so it is obviously "nothing yet".
          opacity: valid ? 1 : 0.35,
        }}
      />
    </div>
  )
}

export default ColourSwatch
