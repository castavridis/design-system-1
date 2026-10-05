/**
 * What the brand swatches need on top of `<Mtb>`: the tonal ramps of the
 * palette it computes, to find the step nearest each brand hex.
 */
import { builder, type MtbConfig } from 'material-theme-builder'

export type Ramp = { tone: number; hex: string }[]

/**
 * Every `--md-ref-palette-*` ramp `builder()` gives `config`, in tone order.
 * The shades are scheme-independent, so `.dark` repeats them; the first of each
 * name is the one.
 */
export function rampsOf(config: MtbConfig) {
  const { source, ...options } = config
  const ramps: Record<string, Ramp> = {}
  const seen = new Set<string>()
  for (const [name, palette, tone, hex] of builder(source, options)
    .toCss()
    .matchAll(/--md-ref-palette-(.+?)-(\d+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (seen.has(name)) continue
    seen.add(name)
    ;(ramps[palette] ??= []).push({ tone: Number(tone), hex })
  }
  for (const ramp of Object.values(ramps)) ramp.sort((a, b) => a.tone - b.tone)
  return ramps
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
