/**
 * What the page needs on top of `<Mtb>`: the shipped palette's overrides, and
 * the tonal ramps the brand swatches compare against.
 *
 * `<Mtb>` computes the palette `builder()` gives, but the palette that ships
 * departs from it — greyer neutrals, and custom colours that follow contrast
 * (see `scripts/palette-overrides.mjs`). So the page applies the same
 * overrides `scripts/build.mjs` bakes, as a stylesheet after `<Mtb>`'s, and
 * the poster paints what ships.
 */
import { builder, type MtbConfig } from 'material-theme-builder'
import { contrastCustomColours, overrideCssBlock, overridePalettes, tintedNeutralPalettes } from '../../scripts/palette-overrides.mjs'

type Block = Record<string, string>

/** `toCss()` emits exactly one `:root` and one `.dark` block, as flat `{ '--name': value }` maps. */
function parseBlocks(css: string): Record<':root' | '.dark', Block> {
  const blocks = Object.fromEntries(
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => [
      selector.trim(),
      Object.fromEntries(
        body
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration) => {
            const colon = declaration.indexOf(':')
            return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()]
          })
      ),
    ])
  )
  if (!blocks[':root'] || !blocks['.dark']) throw new Error('toCss() no longer emits `:root` and `.dark`')
  return blocks as Record<':root' | '.dark', Block>
}

/** Only the declarations `next` changes in `block`. */
const changed = (block: Block, next: Block) => Object.fromEntries(Object.entries(next).filter(([name, value]) => block[name] !== value))

const rule = (selector: string, block: Block) =>
  `${selector} { ${Object.entries(block)
    .map(([name, value]) => `${name}:${value};`)
    .join(' ')} }`

export type Ramp = { tone: number; hex: string }[]

/**
 * For one `<Mtb>` config: the stylesheet that turns its output into the
 * shipped palette, and every tonal ramp of the result.
 *
 * `tint` is "Tint neutrals": the shipped pair of neutral ramps swapped, neutral
 * taking the primary's hue and neutral-variant going grey.
 *
 * The stylesheet repeats `<Mtb>`'s own selectors, `:root` and `.dark`, so it
 * applies wherever `<Mtb>`'s does — including a poster `Scheme theme="dark"`,
 * whose `.dark` re-declares every shade.
 */
export function shippedPalette(config: MtbConfig, { tint }: { tint: boolean }) {
  const { source, ...options } = config
  const blocks = parseBlocks(builder(source, options).toCss())
  const palettes = tint ? tintedNeutralPalettes(config) : overridePalettes(config)

  // Above standard contrast some roles are raw colours between shades; the
  // overrides need the contrast and the mode to redraw those at their tone.
  const light = { source, scheme: config.scheme, contrast: config.contrast, isDark: false }
  const dark = { ...light, isDark: true }
  // The builder gives custom colours no contrast; this gives them the primary's.
  const root: Block = contrastCustomColours(overrideCssBlock(blocks[':root'], palettes, light), config, palettes, light)
  const darkBlock: Block = contrastCustomColours(overrideCssBlock(blocks['.dark'], palettes, dark), config, palettes, dark)

  const ramps: Record<string, Ramp> = {}
  for (const [name, hex] of Object.entries(root)) {
    const match = name.match(/^--md-ref-palette-(.+)-(\d+)$/)
    if (match) (ramps[match[1]] ??= []).push({ tone: Number(match[2]), hex })
  }
  for (const ramp of Object.values(ramps)) ramp.sort((a, b) => a.tone - b.tone)

  // Only what differs from `<Mtb>`'s output — but on `<html class="dark">`,
  // which matches both selectors, this sheet's `:root` comes after `<Mtb>`'s
  // `.dark` and would win. So `.dark` restates every name `:root` sets.
  const lightChanges = changed(blocks[':root'], root)
  const darkNames = [...new Set([...Object.keys(lightChanges), ...Object.keys(changed(blocks['.dark'], darkBlock))])]
  const darkChanges = Object.fromEntries(darkNames.map((name) => [name, darkBlock[name]]))

  return {
    css: [rule(':root', lightChanges), rule('.dark', darkChanges)].join('\n'),
    ramps,
  }
}

// Perceptual colour distance, to find the ramp step closest to a brand hex.
// sRGB → linear → XYZ (D65) → CIELAB, then CIE76 ΔE (Euclidean in Lab).
function hexToLab(hex: string) {
  const h = hex.replace('#', '')
  const lin = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin(0), lin(2), lin(4)]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function deltaE(a: string, b: string) {
  const [la, lb] = [hexToLab(a), hexToLab(b)]
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2])
}

/** For a brand colour, the step in a ramp closest to its authored hex, ΔE rounded. */
export function nearestIn(authored: string, ramp: Ramp) {
  let best = { tone: 0, hex: '', de: Infinity }
  for (const step of ramp) {
    const de = deltaE(authored, step.hex)
    if (de < best.de) best = { ...step, de }
  }
  return { ...best, de: Math.round(best.de) }
}

/** Dark or light ink for text on `hex`. */
export function ink(hex: string) {
  const h = hex.replace('#', '')
  if (h.length < 6) return '#000'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#111' : '#fff'
}
