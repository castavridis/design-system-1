import type { MtbConfig } from 'material-theme-builder'

/**
 * The pmndrs Material Design 3 seed.
 *
 * The colours every pmndrs site derives from. The shadcn preset carries radius
 * and typography, not colour — moving `source` here is what actually moves the
 * rendered palette.
 *
 * Every value is overridable per deployment through a `THEME_*` env var, so a
 * site can reseed without forking the file.
 *
 * Read from a React Server Component (a Next.js root layout, typically): the
 * non-`NEXT_PUBLIC_` vars below are only substituted on the server.
 *
 * Need colours M3 has no role for — alert levels, a status palette? Extend this
 * rather than editing it, so the next update of this item stays a clean
 * overwrite:
 *
 * ```ts
 * export const myMtb = {
 *   ...pmndrsMtb,
 *   customColors: [{ name: 'note', hex: '#1f6feb', blend: true }],
 * } satisfies MtbConfig
 * ```
 *
 * `blend: true` harmonizes them against the seed above, so they stay yours and
 * still belong to the pmndrs palette. Then name them in the `@plugin` line this
 * item added to your CSS. It is installed in statement form
 * (`@plugin '...';`); give it a body — that is all the wiring there is:
 *
 * ```css
 * @plugin "material-theme-builder/tailwind" {
 *   custom-colors: note;
 * }
 * ```
 *
 * Four roles follow (`bg-note`, `text-on-note`, `bg-note-container`,
 * `text-on-note-container`) and eleven shades (`bg-note-50` … `bg-note-950`).
 * The name is used verbatim, so `myColor` stays `bg-myColor`.
 */
export const pmndrsMtb = {
  /** poimandres lime-green — the primary (also exposed as accent-7 below). */
  source: process.env.THEME_PRIMARY || '#CAF543',
  // `vibrant` keeps the seed's chroma (neon); `tonalSpot` would clamp it to ~36.
  scheme: (process.env.THEME_SCHEME || 'vibrant') as MtbConfig['scheme'],
  contrast: Number(process.env.THEME_CONTRAST) || 0,
  /** Warm near-black / off-white — the pair that anchors the neutral ramp. */
  neutral: process.env.THEME_NEUTRAL || '#36342F',
  /** red. */
  error: process.env.THEME_ERROR || '#FF4980',
  /**
   * All seven brand hues (lime-green included), exposed as Accent 1..7
   * (`bg-accent-1` … `bg-accent-7`; the builder kebab-cases the names). Primary
   * is the lime-green `source` (accent-7 mirrors it for direct use); `red` also
   * drives the `error` role above.
   *
   * `blend: false` keeps each accent true to its hex. `blend: true` would
   * harmonize them toward the lime seed — more cohesive, but it pulls the hues
   * off their brand values (measured ΔE 12–27 vs ~0–9 when exact).
   *
   * Secondary and tertiary are intentionally unused — MD3 still generates them
   * (there's no flag to disable them), but the accents take their place.
   */
  customColors: [
    { name: 'accent-1', hex: '#D855F9', blend: false }, // purple
    { name: 'accent-2', hex: '#FF4980', blend: false }, // red
    { name: 'accent-3', hex: '#FFC043', blend: false }, // orange
    { name: 'accent-4', hex: '#EBFF0F', blend: false }, // yellow
    { name: 'accent-5', hex: '#00F7A3', blend: false }, // teal
    { name: 'accent-6', hex: '#2BDCF6', blend: false }, // blue
    { name: 'accent-7', hex: '#CAF543', blend: false }, // lime-green
    /**
     * The brand's off-white and near-black (`bg-neutral-1`, `bg-neutral-2-900`,
     * …), snapped onto the neutral ramp the surfaces use: neutral-90 (from
     * `#EAE5DA`) and neutral-22 (from `#36342F`). The baked ramps of both *are*
     * that ramp, and the build fails if either hex drifts off it — see
     * `scripts/palette-overrides.mjs`. `builder()` alone gives them the
     * primary's chroma instead, and turns both yellow.
     */
    { name: 'neutral-1', hex: '#E6E2DD', blend: false }, // off-white, neutral-90
    { name: 'neutral-2', hex: '#363532', blend: false }, // near-black, neutral-22
  ],
} satisfies MtbConfig
