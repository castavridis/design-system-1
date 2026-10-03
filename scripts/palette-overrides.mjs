/**
 * Where the baked palette deliberately departs from what `builder()` computes.
 *
 * `material-theme-builder` 5.0.0 takes only the *hue* of a neutral seed: the
 * chroma comes from the scheme, and `vibrant` fixes it at 10 for neutral and 12
 * for neutral-variant — a visibly yellow cream and near-black. Custom colours
 * fare worse: every one is given the primary's chroma, so an off-white comes
 * out as a saturated yellow ramp. Neither is configurable, so this redraws
 * those ramps after the fact.
 *
 * Only `--md-ref-palette-*` shades are redrawn. Every role aliases onto a
 * shade (`--md-sys-color-surface: var(--md-ref-palette-neutral-98)`, and the
 * Figma roles likewise), and the tone each role picks is unchanged, so the
 * roles follow without being touched.
 *
 * The cost: a site that recomputes the palette from the seed — `builder()` or
 * `<Mtb>` with `pmndrsMtb` — gets the scheme's chroma back, not these ramps.
 * The fix for that belongs upstream, as a chroma option on the neutral seed;
 * once it exists, this file goes and the seed carries the numbers.
 *
 * Shared by `build.mjs` and `preview.mjs`, so the page shows what ships.
 */
import {
  argbFromHex,
  Hct,
  hexFromArgb,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  TonalPalette,
} from '@material/material-color-utilities'

/**
 * Neutral at chroma 2 — a warm grey, chosen against 10/6/4/1/0 side by side.
 * Neutral-variant (outlines, secondary text) is scaled by the same factor, so
 * the scheme's 10:12 ratio between the two holds.
 */
export const NEUTRAL_CHROMA = 2
export const NEUTRAL_VARIANT_CHROMA = 2.4

/**
 * Custom colours that are shades *of* the neutral ramp: their ramp is the
 * neutral ramp, and their hex must be one of its shades. The brand off-white
 * and near-black were snapped to the nearest one (`#EAE5DA` → neutral-90,
 * `#36342F` → neutral-22, by CIELAB ΔE), so they belong to the palette rather
 * than sitting beside it.
 */
export const ON_RAMP_COLOURS = ['neutral-1', 'neutral-2']

const schemes = {
  content: SchemeContent,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
  monochrome: SchemeMonochrome,
  neutral: SchemeNeutral,
  tonalSpot: SchemeTonalSpot,
  vibrant: SchemeVibrant,
}

/**
 * The redrawn ramps for a seed, as `{ paletteName: TonalPalette }`, keyed by
 * the CSS palette name (`neutral`, `neutral-variant`, `neutral-1`).
 *
 * Hues come from the same places `builder()` takes them: the neutral seed for
 * `neutral` and the scheme's own neutral-variant palette (derived from
 * `source`) for `neutral-variant`. `ON_RAMP_COLOURS` reuse the neutral ramp.
 */
export function overridePalettes({ source, scheme = 'tonalSpot', contrast = 0, neutral, customColors = [] }) {
  const Scheme = schemes[scheme]
  if (!Scheme) throw new Error(`unknown scheme ${scheme}`)
  const base = new Scheme(Hct.fromInt(argbFromHex(source)), false, contrast)
  const neutralHue = neutral ? Hct.fromInt(argbFromHex(neutral)).hue : base.neutralPalette.hue

  const palettes = {
    neutral: TonalPalette.fromHueAndChroma(neutralHue, NEUTRAL_CHROMA),
    'neutral-variant': TonalPalette.fromHueAndChroma(base.neutralVariantPalette.hue, NEUTRAL_VARIANT_CHROMA),
  }
  for (const name of ON_RAMP_COLOURS) {
    const colour = customColors.find((c) => c.name === name)
    if (!colour) throw new Error(`${name} is listed in ON_RAMP_COLOURS but the seed has no such custom colour`)
    // Its hex has to *be* a neutral shade, or `bg-neutral-1` and the ramp it
    // claims to belong to would disagree. Moving the neutral seed or chroma
    // moves every shade, so this fails until the hex is re-snapped.
    const tone = Math.round(Hct.fromInt(argbFromHex(colour.hex)).tone)
    const shade = hexFromArgb(palettes.neutral.tone(tone))
    if (shade.toLowerCase() !== colour.hex.toLowerCase()) {
      throw new Error(`${name} (${colour.hex}) is not a shade of the neutral ramp — neutral-${tone} is ${shade.toUpperCase()}`)
    }
    palettes[name] = palettes.neutral
  }
  return palettes
}

/** `--md-ref-palette-neutral-1-40` → `['neutral-1', 40]`. Greedy, so `neutral-10` is `neutral` tone 10. */
const refPattern = /^--md-ref-palette-(.+)-(\d+)$/

/**
 * Redraws the shades of `palettes` in one parsed CSS block (`{ '--name': value }`),
 * returning a new block. Throws if a palette it was asked to redraw is absent,
 * so a rename upstream fails the build instead of silently shipping the old ramp.
 */
export function overrideCssBlock(block, palettes) {
  const seen = new Set()
  const out = Object.fromEntries(
    Object.entries(block).map(([name, value]) => {
      const match = name.match(refPattern)
      const palette = match && palettes[match[1]]
      if (!palette) return [name, value]
      seen.add(match[1])
      return [name, hexFromArgb(palette.tone(Number(match[2])))]
    })
  )
  const missing = Object.keys(palettes).filter((name) => !seen.has(name))
  if (missing.length) throw new Error(`no --md-ref-palette-* shades for ${missing.join(', ')} to redraw`)
  return out
}

/** `neutral-variant` → `Neutral Variant`, `neutral-1` → `Neutral 1`: the Figma collection's names. */
const figmaName = (name) => name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')

/**
 * Redraws the same shades in a `toFigmaTokens()` file (`ref.palette.<Name>.<tone>`),
 * in place of the CSS. The roles there are aliases (`{ref.palette.Neutral.98}`),
 * so they follow too.
 */
export function overrideFigmaTokens(tokens, palettes) {
  for (const [name, palette] of Object.entries(palettes)) {
    const shades = tokens.ref?.palette?.[figmaName(name)]
    if (!shades) throw new Error(`no ref.palette["${figmaName(name)}"] in the Figma tokens to redraw`)
    for (const [tone, token] of Object.entries(shades)) {
      if (!/^\d+$/.test(tone)) continue
      const argb = palette.tone(Number(tone))
      token.$value = {
        ...token.$value,
        components: [(argb >> 16) & 255, (argb >> 8) & 255, argb & 255].map((c) => c / 255),
        hex: hexFromArgb(argb).toUpperCase(),
      }
    }
  }
  return tokens
}

/**
 * Light (Primary) and Dark (Primary): the same roles and tones as the shipped
 * light and dark, with the two structural neutral ramps tinted by the primary.
 * This is MD3's own default recipe — `tonalSpot` draws its neutrals from the
 * source hue — at a calm 6 / 8, under `vibrant`'s 10 / 12. Contrast does not
 * move: only chroma changes, and every role keeps its tone.
 *
 * Neutral-1/2 are not part of this. They are the brand off-white and near-black
 * and keep the shipped neutral ramp in every mode.
 */
export const PRIMARY_MODE_NEUTRAL_CHROMA = 6
export const PRIMARY_MODE_NEUTRAL_VARIANT_CHROMA = 8

export function primaryModePalettes({ source }) {
  const hue = Hct.fromInt(argbFromHex(source)).hue
  return {
    neutral: TonalPalette.fromHueAndChroma(hue, PRIMARY_MODE_NEUTRAL_CHROMA),
    'neutral-variant': TonalPalette.fromHueAndChroma(hue, PRIMARY_MODE_NEUTRAL_VARIANT_CHROMA),
  }
}
