/**
 * Where the baked palette deliberately departs from what `builder()` computes.
 *
 * `material-theme-builder` 5.0.0 takes only the *hue* of a neutral seed: the
 * chroma comes from the scheme, and `vibrant` fixes it at 10 for neutral and 12
 * for neutral-variant — a visibly yellow cream and near-black. Custom colours
 * fare worse: every one is given the primary's chroma, so `#EAE5DA` comes out
 * as a saturated yellow ramp. Neither is configurable, so this redraws those
 * ramps after the fact.
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

/** Custom colours whose ramps keep the hex's own hue *and* chroma. */
export const TRUE_CHROMA_COLOURS = ['neutral-1', 'neutral-2']

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
 * `neutral`, the scheme's own neutral-variant palette (derived from `source`)
 * for `neutral-variant`, and each custom colour's hex.
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
  for (const name of TRUE_CHROMA_COLOURS) {
    const colour = customColors.find((c) => c.name === name)
    if (!colour) throw new Error(`${name} is listed in TRUE_CHROMA_COLOURS but the seed has no such custom colour`)
    if (colour.blend) throw new Error(`${name} has blend: true, which would move its hue off the hex this ramp is drawn from`)
    palettes[name] = TonalPalette.fromInt(argbFromHex(colour.hex))
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
