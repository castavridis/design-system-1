/**
 * Where the baked palette deliberately departs from what `builder()` computes.
 *
 * `material-theme-builder` 5.0.0 takes only the *hue* of a neutral seed: the
 * chroma comes from the scheme, and `vibrant` fixes it at 10 for neutral and 12
 * for neutral-variant — a visibly yellow cream and near-black. It is not
 * configurable, so this redraws those ramps after the fact.
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
 * Shared by `build.mjs` and the demo page (`demo/src/palette.ts`), so the page
 * shows what ships.
 */
import {
  argbFromHex,
  Blend,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
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
 * Two pairs of structural ramps, each pair at the scheme's 10:12 ratio between
 * neutral and neutral-variant:
 *
 * - untinted: the neutral seed's warm-grey hue at chroma 2 / 2.4 — chosen
 *   against 10/6/4/1/0 side by side;
 * - tinted: the primary's hue at a calm 6 / 8, MD3's own recipe (`tonalSpot`
 *   draws its neutrals from the source hue) under `vibrant`'s 10 / 12.
 *
 * What ships mixes them: neutral (surfaces, body text) untinted, and
 * neutral-variant (outlines, secondary text) tinted, so the brand shows in the
 * details while the page stays grey. "Tint neutrals" swaps the two.
 */
export const UNTINTED_NEUTRAL_CHROMA = 2
export const UNTINTED_NEUTRAL_VARIANT_CHROMA = 2.4
export const TINTED_NEUTRAL_CHROMA = 6
export const TINTED_NEUTRAL_VARIANT_CHROMA = 8

const schemes = {
  content: SchemeContent,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
  monochrome: SchemeMonochrome,
  neutral: SchemeNeutral,
  tonalSpot: SchemeTonalSpot,
  vibrant: SchemeVibrant,
}

/** Both pairs for a seed. Untinted takes the neutral seed's hue, tinted the primary's. */
function rampsFor({ source, scheme = 'tonalSpot', contrast = 0, neutral }) {
  const Scheme = schemes[scheme]
  if (!Scheme) throw new Error(`unknown scheme ${scheme}`)
  const neutralHue = neutral ? Hct.fromInt(argbFromHex(neutral)).hue : new Scheme(Hct.fromInt(argbFromHex(source)), false, contrast).neutralPalette.hue
  const primaryHue = Hct.fromInt(argbFromHex(source)).hue
  return {
    untinted: {
      neutral: TonalPalette.fromHueAndChroma(neutralHue, UNTINTED_NEUTRAL_CHROMA),
      neutralVariant: TonalPalette.fromHueAndChroma(neutralHue, UNTINTED_NEUTRAL_VARIANT_CHROMA),
    },
    tinted: {
      neutral: TonalPalette.fromHueAndChroma(primaryHue, TINTED_NEUTRAL_CHROMA),
      neutralVariant: TonalPalette.fromHueAndChroma(primaryHue, TINTED_NEUTRAL_VARIANT_CHROMA),
    },
  }
}

/**
 * The ramps that ship, as `{ paletteName: TonalPalette }` keyed by the CSS
 * palette name: neutral untinted, neutral-variant tinted.
 */
export function overridePalettes(seed) {
  const { untinted, tinted } = rampsFor(seed)
  return { neutral: untinted.neutral, 'neutral-variant': tinted.neutralVariant }
}

/** `--md-ref-palette-neutral-variant-40` → `['neutral-variant', 40]`. Greedy, so `neutral-10` is `neutral` tone 10. */
const refPattern = /^--md-ref-palette-(.+)-(\d+)$/

/** The MD3 roles drawn from each structural neutral ramp. */
const NEUTRAL_ROLES = [
  'background', 'on-background', 'surface', 'surface-dim', 'surface-bright',
  'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest',
  'on-surface', 'inverse-surface', 'inverse-on-surface', 'scrim', 'shadow',
]
const NEUTRAL_VARIANT_ROLES = ['surface-variant', 'on-surface-variant', 'outline', 'outline-variant']

const camel = (kebab) => kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

/**
 * Which redrawn palette a `--md-sys-color-*` role is drawn from, and the MD3
 * dynamic colour that fixes its tone — or null if it is not one of ours. A
 * custom colour's four roles take the tones of the primary's four, which is
 * how material-theme-builder lays them out.
 */
function roleSource(role, palettes) {
  if (palettes.neutral && NEUTRAL_ROLES.includes(role)) return ['neutral', MaterialDynamicColors[camel(role)]]
  if (palettes['neutral-variant'] && NEUTRAL_VARIANT_ROLES.includes(role)) return ['neutral-variant', MaterialDynamicColors[camel(role)]]
  for (const name of Object.keys(palettes)) {
    const m = role.match(new RegExp(`^(on-)?${name}(-container)?$`))
    if (m && name !== 'neutral' && name !== 'neutral-variant') return [name, MaterialDynamicColors[camel(`${m[1] ?? ''}primary${m[2] ?? ''}`)]]
  }
  return null
}

/**
 * Redraws the shades of `palettes` in one parsed CSS block (`{ '--name': value }`),
 * returning a new block. Throws if a palette it was asked to redraw is absent,
 * so a rename upstream fails the build instead of silently shipping the old ramp.
 *
 * At standard contrast every role aliases a shade, so redrawing the shades is
 * the whole job. At medium and high contrast, material-theme-builder writes
 * roles whose tone falls between shades as raw hex — `on-surface-variant` at
 * tone 25.9, say — which a shade redraw never reaches. Those need `context`
 * (`{ source, scheme, contrast, isDark }`): the role's exact tone comes from
 * the MD3 dynamic colour, the colour from the redrawn palette at that tone.
 * Without it, a raw role in a redrawn family throws rather than shipping the
 * old ramp's colour.
 */
export function overrideCssBlock(block, palettes, context) {
  const seen = new Set()
  let dynamicScheme
  const out = Object.fromEntries(
    Object.entries(block).map(([name, value]) => {
      const match = name.match(refPattern)
      const palette = match && palettes[match[1]]
      if (palette) {
        seen.add(match[1])
        return [name, hexFromArgb(palette.tone(Number(match[2])))]
      }
      const role = name.startsWith('--md-sys-color-') && !value.startsWith('var(') && name.slice('--md-sys-color-'.length)
      const source = role && roleSource(role, palettes)
      if (!source) return [name, value]
      if (!context) throw new Error(`${name} is a raw colour (${value}) in a redrawn family; pass the contrast context to redraw it`)
      const [family, dynamicColor] = source
      if (!dynamicColor) throw new Error(`no MD3 dynamic colour for ${name}`)
      const Scheme = schemes[context.scheme ?? 'tonalSpot']
      dynamicScheme ??= new Scheme(Hct.fromInt(argbFromHex(context.source)), context.isDark, context.contrast ?? 0)
      return [name, hexFromArgb(palettes[family].tone(dynamicColor.getTone(dynamicScheme)))]
    })
  )
  const missing = Object.keys(palettes).filter((name) => !seen.has(name))
  if (missing.length) throw new Error(`no --md-ref-palette-* shades for ${missing.join(', ')} to redraw`)
  return out
}

/** `neutral-variant` → `Neutral Variant`, `lime` → `Lime`: the Figma collection's names. */
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
 * "Tint neutrals": the shipped pair swapped — neutral tinted, neutral-variant
 * untinted. The same roles and tones as the shipped light and dark, so contrast
 * does not move; only chroma and hue do.
 */
export function tintedNeutralPalettes(seed) {
  const { untinted, tinted } = rampsFor(seed)
  return { neutral: tinted.neutral, 'neutral-variant': untinted.neutralVariant }
}

/**
 * Custom colours at medium and high contrast. material-theme-builder 5.0.0
 * gives them no contrast at all: at every level a brand colour's four roles sit on
 * shades 40 / 100 / 90 / 30, while the built-in primary's move (`primary` goes
 * from tone 40 to ~18 at high contrast). This gives each custom colour the
 * tones MD3 gives the primary's four roles at that level — at standard
 * contrast those are the same 40 / 100 / 90 / 30, so it changes nothing there.
 *
 * Each colour is drawn from `palettes[name]` when that has one, otherwise from
 * its ramp rebuilt the way the builder builds it: the hex's hue (harmonized
 * toward the source when `blend`) at the primary palette's chroma.
 */
export function contrastCustomColours(block, seed, palettes, { isDark }) {
  const { source, scheme = 'tonalSpot', contrast = 0, customColors = [] } = seed
  if (!contrast) return block
  const Scheme = schemes[scheme]
  const sourceArgb = argbFromHex(source)
  const dynamicScheme = new Scheme(Hct.fromInt(sourceArgb), isDark, contrast)
  const chroma = new Scheme(Hct.fromInt(sourceArgb), false, contrast).primaryPalette.chroma
  const out = { ...block }
  for (const { name, hex, blend } of customColors) {
    const argb = blend ? Blend.harmonize(argbFromHex(hex), sourceArgb) : argbFromHex(hex)
    const palette = palettes[name] ?? TonalPalette.fromHueAndChroma(Hct.fromInt(argb).hue, chroma)
    for (const [role, dynamicColor] of [
      [name, 'primary'],
      [`on-${name}`, 'onPrimary'],
      [`${name}-container`, 'primaryContainer'],
      [`on-${name}-container`, 'onPrimaryContainer'],
    ]) {
      out[`--md-sys-color-${role}`] = hexFromArgb(palette.tone(MaterialDynamicColors[dynamicColor].getTone(dynamicScheme)))
    }
  }
  return out
}
