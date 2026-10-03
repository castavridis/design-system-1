/**
 * Generates `demo/palette.html` — a self-contained swatch page for the pmndrs
 * colour layer, so it can be seen in a browser without scaffolding a consumer
 * app or reaching the network.
 *
 * It computes the palette **live** with Material Theme Builder rather than
 * reading the committed `registry.json`. Two reasons: the container's Node 20
 * can't run `npm run build` (that needs Node ≥22.18 for the `.ts` seed import),
 * so `registry.json` can be stale; and computing live lets the page render both
 * custom-colour blend modes for the harmonized ⇄ exact toggle.
 *
 * The brand seed below MIRRORS `registry/md3-base/md3.ts` (`pmndrsMtb`). That
 * file is a self-contained published registry item and can't import a shared
 * module, and this script can't import its `.ts`, so the values are duplicated —
 * keep the two in sync. The real `registry.json` is still produced by
 * `npm run build`; this is a viewer, not a second source of truth.
 *
 * The palette overrides (greyer neutrals, true-chroma Neutral-1/2) are imported
 * from `palette-overrides.mjs`, not mirrored, so the page shows the baked ramps.
 *
 * The logo SVGs are copied from `assets/` next to the page, like the fonts, so
 * it shows the same files the `logo` registry item installs.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { builder } from 'material-theme-builder'
import { contrastCustomColours, overrideCssBlock, overridePalettes, primaryModePalettes } from './palette-overrides.mjs'

// --- brand seed (mirror of pmndrsMtb in registry/md3-base/md3.ts) -----------
const BRAND = {
  source: '#CAF543', // lime-green — primary (also exposed as accent-7 for direct use)
  scheme: 'vibrant', // keeps the seed's chroma (neon); tonalSpot clamps it to ~36

  contrast: 0,
  neutral: '#36342F', // warm near-black / off-white — anchors the neutral ramp
  error: '#FF4980', // red
  // All seven brand hues (lime-green included) exposed as Accent 1..7. Names are
  // hyphenated because the builder kebab-cases custom names (accent1 → accent-1).
  accents: [
    ['accent-1', '#D855F9'], // purple
    ['accent-2', '#FF4980'], // red
    ['accent-3', '#FFC043'], // orange
    ['accent-4', '#EBFF0F'], // yellow
    ['accent-5', '#00F7A3'], // teal
    ['accent-6', '#2BDCF6'], // blue
    ['accent-7', '#CAF543'], // lime-green
  ],
  // The brand's off-white and near-black, snapped onto the neutral ramp.
  neutrals: [
    ['neutral-1', '#E6E2DD'], // off-white, neutral-90
    ['neutral-2', '#363532'], // near-black, neutral-22
  ],
}

// The primaries the page can switch between: each brand hue's pure hex as the
// seed, lime first since it is the one that ships. Only a preview — the
// published palette keeps `pmndrsMtb.source`.
const PRIMARY_NAMES = { 'accent-7': 'Lime', 'accent-1': 'Purple', 'accent-2': 'Red', 'accent-3': 'Orange', 'accent-4': 'Yellow', 'accent-5': 'Teal', 'accent-6': 'Blue' }
const PRIMARIES = Object.keys(PRIMARY_NAMES).map((key) => [key, PRIMARY_NAMES[key], Object.fromEntries(BRAND.accents)[key]])

// Neutral-1/2 never blend: they are shades of the neutral ramp either way.
// `extra` carries the optional secondary / tertiary seeds.
const seedFor = (blend, source = BRAND.source, extra = {}) => {
  const { accents, neutrals, ...rest } = BRAND
  const customColors = [...accents.map(([name, hex]) => ({ name, hex, blend })), ...neutrals.map(([name, hex]) => ({ name, hex, blend: false }))]
  return { ...rest, source, customColors, ...extra }
}

// --- parse / resolve helpers ------------------------------------------------
// `toCss()` emits exactly one `:root` and one `.dark` block.
const parseBlocks = (css) => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  if (blocks.length !== 2) throw new Error(`expected 2 CSS blocks from toCss(), got ${blocks.length}`)
  return Object.fromEntries(
    blocks.map(([, selector, body]) => [
      selector.trim(),
      Object.fromEntries(
        body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => {
            const i = d.indexOf(':')
            return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
          })
      ),
    ])
  )
}

// `--md-sys-color-*` values are `var(--md-ref-palette-*)`; ref entries are raw
// hex. Resolve the single hop the palette uses.
const resolve = (map, value) => {
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  return ref ? map[ref[1]] ?? value : value
}

// Perceptual colour distance, to find the ramp step closest to a brand hex.
// sRGB → linear → XYZ (D65) → CIELAB, then CIE76 ΔE (Euclidean in Lab).
const hexToLab = (hex) => {
  const h = hex.replace('#', '')
  const lin = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin(0), lin(2), lin(4)]
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const deltaE = (a, b) => {
  const [la, lb] = [hexToLab(a), hexToLab(b)]
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2])
}

const customNames = new Set([...BRAND.accents, ...BRAND.neutrals].map(([n]) => n))

/**
 * The four schemes the page shows for one seed, as flat `{ '--name': value }`
 * maps: light and dark as shipped (with the palette overrides), and Light /
 * Dark (Primary), where neutral and neutral-variant are re-tinted by the
 * primary's hue.
 */
const schemesFor = (seed) => {
  const { source, ...rest } = seed
  const blocks = parseBlocks(builder(source, rest).toCss())
  const overrides = overridePalettes(seed)
  // Above standard contrast some roles are raw colours between shades; the
  // overrides need the contrast and the mode to redraw those at their tone.
  const light = { source, scheme: seed.scheme, contrast: seed.contrast, isDark: false }
  const dark = { ...light, isDark: true }
  // The builder gives custom colours no contrast; these give them the primary's.
  const rootBlock = contrastCustomColours(overrideCssBlock(blocks[':root'], overrides, light), seed, overrides, light)
  const darkBlock = contrastCustomColours(overrideCssBlock(blocks['.dark'], overrides, dark), seed, overrides, dark)
  const tint = primaryModePalettes({ source })
  const lightPrimary = overrideCssBlock(rootBlock, tint, light)
  return {
    light: { ...rootBlock },
    dark: { ...rootBlock, ...darkBlock },
    lightPrimary,
    darkPrimary: { ...lightPrimary, ...overrideCssBlock(darkBlock, tint, dark) },
  }
}

// One role across the four schemes.
const roleIn = ({ light, dark, lightPrimary, darkPrimary }) => (k) => ({
  name: k.replace('--md-sys-color-', ''),
  lightRef: light[k].match(/--md-ref-palette-([\w-]+)/)?.[1] ?? '',
  darkRef: dark[k].match(/--md-ref-palette-([\w-]+)/)?.[1] ?? '',
  light: resolve(light, light[k]),
  dark: resolve(dark, dark[k]),
  lightPrimary: resolve(lightPrimary, lightPrimary[k]),
  darkPrimary: resolve(darkPrimary, darkPrimary[k]),
})

// One palette's shades, ascending by tone.
const rampOf = (block, name) =>
  Object.entries(block)
    .map(([k, v]) => [k.match(/^--md-ref-palette-(.+)-(\d+)$/), v])
    .filter(([m]) => m && m[1] === name)
    .map(([m, hex]) => ({ tone: Number(m[2]), hex }))
    .sort((a, b) => a.tone - b.tone)

// For a brand colour, the step in a ramp closest to its authored hex.
const nearestIn = (authored, ramp) =>
  ramp.reduce((best, t) => { const de = deltaE(authored, t.hex); return de < best.de ? { tone: t.tone, hex: t.hex, de } : best }, { de: Infinity })

// Build the render model for one blend mode at one contrast level.
const model = (blend, source = BRAND.source, contrast = BRAND.contrast) => {
  const schemes = schemesFor(seedFor(blend, source, { contrast }))
  const { light, lightPrimary } = schemes

  const sysKeys = Object.keys(light).filter((k) => k.startsWith('--md-sys-color-'))

  // Standard MD3 roles vs the named brand colours (and their on-/container).
  const isCustom = (name) => [...customNames].some((c) => name === c || name.startsWith(`${c}-`) || name === `on-${c}` || name.startsWith(`on-${c}-`))

  const roleOf = roleIn(schemes)

  const roles = sysKeys.map(roleOf).filter((r) => !isCustom(r.name))
  const groupOf = (name) =>
    name
      .replace(/^on-/, '')
      .replace(/-(container|fixed|dim|bright|variant|lowest|low|high|highest)$/g, '')
      .split('-')[0]
  const groups = {}
  for (const r of roles) (groups[groupOf(r.name)] ??= []).push(r)
  // Secondary and tertiary come from `ROLE_SEEDS` below, per choice, so the page
  // can swap them without a model per combination; drop the ones built here.
  delete groups.secondary
  delete groups.tertiary

  // A custom colour's other three roles, for the scheme layout's custom-colour rows.
  const familyRoles = (name) => ({
    on: roleOf(`--md-sys-color-on-${name}`),
    container: roleOf(`--md-sys-color-${name}-container`),
    onContainer: roleOf(`--md-sys-color-on-${name}-container`),
  })

  // Accent colours: base role per accent, paired with its authored hex.
  const srcOf = Object.fromEntries(BRAND.accents)
  const accents = BRAND.accents.map(([name]) => {
    const r = roleOf(`--md-sys-color-${name}`)
    return { name, label: `Accent ${name.replace('accent-', '')}`, authored: srcOf[name], light: r.light, dark: r.dark, lightPrimary: r.lightPrimary, darkPrimary: r.darkPrimary, ...familyRoles(name) }
  })

  // Neutral-1/2: the same shape, so they render with the accents' swatch markup.
  const neutralSrc = Object.fromEntries(BRAND.neutrals)
  const neutrals = BRAND.neutrals.map(([name]) => {
    const r = roleOf(`--md-sys-color-${name}`)
    return { name, label: `Neutral ${name.replace('neutral-', '')}`, authored: neutralSrc[name], light: r.light, dark: r.dark, lightPrimary: r.lightPrimary, darkPrimary: r.darkPrimary, ...familyRoles(name) }
  })

  // Tonal ramps: primary (lime-green) + the six accent ramps, keeping the
  // structural neutral/error ramps. Secondary and tertiary are dropped.
  const SKIP = new Set(['secondary', 'tertiary'])
  const tonal = {}
  for (const [k, v] of Object.entries(light)) {
    const m = k.match(/^--md-ref-palette-([a-z0-9-]+)-(\d+)$/)
    if (!m || SKIP.has(m[1])) continue
    ;(tonal[m[1]] ??= []).push({ tone: Number(m[2]), hex: v })
  }
  for (const ramp of Object.values(tonal)) ramp.sort((a, b) => a.tone - b.tone)

  // Order: primary first, then the accents, then the structural ramps.
  const RAMP_ORDER = ['primary', 'accent-1', 'accent-2', 'accent-3', 'accent-4', 'accent-5', 'accent-6', 'accent-7', 'neutral-1', 'neutral-2', 'error', 'neutral', 'neutral-variant']
  const ordered = {}
  for (const k of RAMP_ORDER) if (tonal[k]) ordered[k] = tonal[k]
  for (const k of Object.keys(tonal)) if (!(k in ordered)) ordered[k] = tonal[k]

  // For each brand colour, the step in its own ramp closest to the authored hex.
  const nearest = [
    { label: 'Primary', authored: source, ...nearestIn(source, ordered.primary) },
    ...BRAND.accents.map(([name], i) => ({ name, label: `Accent ${i + 1}`, authored: srcOf[name], ...nearestIn(srcOf[name], ordered[name]) })),
    ...BRAND.neutrals.map(([name], i) => ({ label: `Neutral ${i + 1}`, authored: neutralSrc[name], ...nearestIn(neutralSrc[name], ordered[name]) })),
  ].map((n) => ({ ...n, de: Math.round(n.de) }))

  // The two ramps the primary modes redraw, for the ramps section in those views.
  const tonalPrimary = { ...ordered, neutral: rampOf(lightPrimary, 'neutral'), 'neutral-variant': rampOf(lightPrimary, 'neutral-variant') }

  return { groups, accents, neutrals, tonal: ordered, tonalPrimary, nearest }
}

// MD3's three contrast levels. Standard is what the registry ships.
const CONTRASTS = [['standard', 0, 'Standard'], ['medium', 0.5, 'Medium'], ['high', 1, 'High']]

// One model per primary × contrast × fidelity: 7 × 3 × 2, all computed here so the page needs no builder.
const data = Object.fromEntries(
  PRIMARIES.map(([key, , hex]) => [
    key,
    Object.fromEntries(CONTRASTS.map(([level, contrast]) => [level, { harmonized: model(true, hex, contrast), exact: model(false, hex, contrast) }])),
  ])
)

/**
 * Secondary and tertiary, per choice: `auto` (MD3 derives them from the
 * primary) or a brand hue's pure hex as the seed. A model per combination
 * would be 7 × 8 × 8 × 2; these are separable instead — measured on
 * material-theme-builder 5.0.0, a secondary seed moves only the secondary
 * roles, a tertiary seed only the tertiary ones, and neither depends on the
 * other or on blend. So each is built once per primary and the page combines
 * them. Seeded families are also primary-independent, but `auto` is not, and
 * keeping one shape per primary is simpler than special-casing it.
 */
const familyFor = (source, which, hex, contrast) => {
  const schemes = schemesFor(seedFor(false, source, { contrast, ...(hex ? { [which]: hex } : {}) }))
  const pattern = new RegExp(`^--md-sys-color-(on-)?${which}(-|$)`)
  const roles = Object.keys(schemes.light).filter((k) => pattern.test(k)).map(roleIn(schemes))
  const ramp = rampOf(schemes.light, which)
  return { roles, ramp, ...(hex ? { nearest: { ...nearestIn(hex, ramp), authored: hex } } : {}) }
}
const ROLE_SEEDS = Object.fromEntries(
  PRIMARIES.map(([key, , primaryHex]) => [
    key,
    Object.fromEntries(
      CONTRASTS.map(([level, contrast]) => [
        level,
        Object.fromEntries(
          ['secondary', 'tertiary'].map((which) => [
            which,
            {
              auto: familyFor(primaryHex, which, undefined, contrast),
              ...Object.fromEntries(PRIMARIES.map(([seedKey, , hex]) => [seedKey, familyFor(primaryHex, which, hex, contrast)])),
            },
          ])
        ),
      ])
    ),
  ])
)
for (const levels of Object.values(ROLE_SEEDS))
  for (const families of Object.values(levels)) for (const family of Object.values(families)) for (const f of Object.values(family)) if (f.nearest) f.nearest.de = Math.round(f.nearest.de)

// The page's own chrome comes from these roles — the same map the script uses.
const ROLE_FOR = { '--bg': 'surface', '--fg': 'on-surface', '--panel': 'surface-container-high', '--border': 'outline-variant', '--muted': 'on-surface-variant' }
const shippedRole = (name) => Object.values(data['accent-7'].standard.exact.groups).flat().find((r) => r.name === name)
const chromeCss = (mode) => Object.entries(ROLE_FOR).map(([v, role]) => `${v}: ${shippedRole(role)[mode]};`).join(' ')

// The four SVGs the `logo` registry item installs, in the order it lists them.
const LOGOS = [
  ['logo_complete.svg', 'Complete', 'The full mark'],
  ['logo_idle.svg', 'Idle', 'The resting state'],
  ['logo_animated.svg', 'Animated', 'Idle → complete, once'],
  ['logo_loading.svg', 'Loading', 'Each corner and back, looping'],
]

// --- html -------------------------------------------------------------------
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pmndrs design system — palette</title>
  <style>
    /* Geist, from the geist package — copied next to the page below, so nothing is fetched. */
    @font-face { font-family: 'Geist'; src: url('fonts/Geist-Variable.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
    @font-face { font-family: 'Geist Mono'; src: url('fonts/GeistMono-Regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
    * { box-sizing: border-box; }
    /* Page chrome, from the shipped palette's own surface roles. These are the
       first paint; the script then sets them for whichever view is chosen. */
    :root { ${chromeCss('light')} }
    @media (prefers-color-scheme: dark) { :root { ${chromeCss('dark')} } }
    body { margin: 0; font: 400 14px/1.4 'Geist', ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--fg); transition: background .15s ease, color .15s ease; }
    h1, h2, h3 { font-weight: 900; }
    code, kbd, pre, samp, .hex, .ref { font-family: 'Geist Mono', ui-monospace, monospace; font-weight: 400; }
    header { padding: 32px 40px 8px; }
    header h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: var(--muted); }
    main { padding: 8px 40px 64px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 12px; }
    /* Controls: two labelled rows (colours, display) and a one-line summary. */
    .controls { position: sticky; top: 0; z-index: 2; display: grid; gap: 10px; padding: 14px 40px 12px; background: var(--bg); border-bottom: 1px solid var(--border); }
    .controls .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 28px; }
    .controls .field { display: flex; align-items: center; gap: 10px; }
    .controls .label { font-size: 12px; color: var(--muted); min-width: 64px; }
    .controls button { font: inherit; color: var(--fg); cursor: pointer; }
    .controls button:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
    /* Colour pickers: one swatch per brand hue, the name on hover and in the summary. */
    .swatches { display: flex; align-items: center; gap: 6px; }
    .swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--border); }
    .swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--fg); }
    .swatch:disabled { opacity: .2; cursor: not-allowed; }
    .auto { height: 24px; padding: 0 9px; border-radius: 999px; border: 1px dashed var(--border); background: transparent; font-size: 12px; }
    .auto[aria-pressed="true"] { border: 1px solid var(--fg); background: var(--fg); color: var(--bg); }
    /* Segmented choices. */
    .seg { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: 999px; }
    .seg button { border: 0; background: transparent; padding: 4px 12px; border-radius: 999px; font-size: 13px; }
    .seg button[aria-pressed="true"] { background: var(--fg); color: var(--bg); font-weight: 600; }
    /* On/off switches. */
    .switch { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 0; font-size: 13px; }
    .switch .track { position: relative; width: 32px; height: 18px; border-radius: 999px; background: var(--border); transition: background .15s ease; flex: none; }
    .switch .track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); transition: transform .15s ease; }
    .switch[aria-checked="true"] .track { background: var(--fg); }
    .switch[aria-checked="true"] .track::after { transform: translateX(14px); }
    .switch .hint { color: var(--muted); font-size: 12px; }
    .summary { margin: 0; color: var(--muted); font-size: 12px; }
    @media (prefers-reduced-motion: reduce) { .switch .track, .switch .track::after { transition: none; } }
    /* On a phone the panel would cover most of the screen, so it scrolls away there. */
    @media (max-width: 700px) { .controls { position: static; padding: 12px 16px; } header, main, .logos { padding-left: 16px; padding-right: 16px; } }
    .group { margin-bottom: 24px; }
    .group h3 { font-size: 13px; text-transform: capitalize; margin: 0 0 8px; color: var(--fg); }
    .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .role { border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    .pair { display: grid; grid-template-columns: 1fr 72px; }
    .cell { padding: 12px 10px; min-height: 56px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
    .lbl { font-weight: 600; font-size: 12px; word-break: break-word; }
    .hex { font-size: 11px; font-variant-numeric: tabular-nums; opacity: .85; }
    .ref { padding: 5px 10px; font-size: 10px; color: var(--muted); background: var(--panel); font-variant-numeric: tabular-nums; }
    .brand { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
    .brand .role { border-color: var(--border); }
    .authored { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--panel); font-size: 11px; color: var(--muted); }
    .chip { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--border); flex: none; }
    .ramp { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .ramp-name { width: 120px; text-align: right; font-size: 12px; text-transform: capitalize; color: var(--fg); flex: none; }
    .tones { display: flex; flex: 1; border-radius: 6px; overflow: hidden; }
    .tone { flex: 1; min-width: 0; padding: 10px 2px; text-align: center; font-size: 10px; font-variant-numeric: tabular-nums; }
    .legend { color: var(--muted); font-size: 12px; margin: 0 0 12px; }
    .nearest { display: flex; flex-wrap: wrap; gap: 12px; }
    .near { width: 132px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .near-sw { height: 60px; display: flex; align-items: flex-end; justify-content: flex-end; padding: 6px 9px; font-weight: 900; font-size: 18px; font-variant-numeric: tabular-nums; }
    .near-meta { padding: 7px 9px; display: flex; flex-direction: column; gap: 3px; background: var(--panel); }
    /* Scheme: Material Theme Builder's layout, one card per scheme in the view. */
    .schemes { display: grid; gap: 16px; }
    .m3 { border: 1px solid var(--border); border-radius: 16px; padding: 20px 24px 24px; display: grid; gap: 12px; }
    .m3 h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
    .m3-split { display: grid; grid-template-columns: 3fr 1fr; gap: 12px 28px; }
    .m3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .m3-col { display: grid; grid-template-rows: 80px 36px 80px 36px; }
    .m3-strip { display: grid; }
    .m3-cell { padding: 8px 12px; font-size: 13px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; min-width: 0; }
    .m3-cell .h { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 10px; opacity: .8; font-variant-numeric: tabular-nums; }
    .m3-cell.short { flex-direction: row; align-items: center; }
    .m3-surfaces { display: grid; grid-template-rows: 96px 96px 36px; }
    .m3-side { display: grid; grid-template-rows: 112px 36px 36px auto; gap: 0; align-content: start; }
    .m3-side .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
    .m3-custom { display: grid; grid-template-columns: repeat(4, 1fr); }
    .m3-custom .m3-cell { min-height: 52px; }
    @media (max-width: 900px) { .m3-split { grid-template-columns: 1fr; } .m3-custom { grid-template-columns: repeat(2, 1fr); } }
    .near-auth { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
    /* Outside #app: render() rewrites that on every toggle, which would restart the animations. */
    .logos { padding: 8px 40px 0; }
    .logo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .logo { margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
    .logo img { display: block; width: 100%; height: auto; aspect-ratio: 1; }
    .logo figcaption { flex: 1; padding: 8px 10px; background: var(--panel); display: flex; flex-direction: column; gap: 2px; }
    .logo .file { font-size: 11px; color: var(--muted); }
    .logo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 12px 0 0; }
    .logo-actions .legend { margin: 0; }
    .logo-actions button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1>pmndrs design system — brand palette</h1>
    <p>The palette the registry ships, computed live from the seed. Try the brand hues as primary, secondary and tertiary, and see the result in light and dark.</p>
  </header>
  <div class="controls" role="toolbar" aria-label="Palette options">
    <div class="row">
      <div class="field"><span class="label" id="l-primary">Primary</span>
        <div class="swatches" role="group" aria-labelledby="l-primary">${PRIMARIES.map(([key, name, hex]) => `<button class="swatch" id="p-${key}" style="background:${hex}" title="${name} ${hex}" aria-label="${name}" aria-pressed="${key === 'accent-7'}"></button>`).join('')}</div>
      </div>
      ${['secondary', 'tertiary'].map((which) => `<div class="field"><span class="label" id="l-${which}">${which[0].toUpperCase() + which.slice(1)}</span>
        <div class="swatches" role="group" aria-labelledby="l-${which}"><button class="auto" id="${which[0]}-auto" title="Derived from the primary" aria-pressed="true">Auto</button>${PRIMARIES.map(([key, name, hex]) => `<button class="swatch" id="${which[0]}-${key}" style="background:${hex}" title="${name} ${hex}" aria-label="${name}" aria-pressed="false"></button>`).join('')}</div>
      </div>`).join('\n      ')}
      <button class="switch" id="sw-unique" role="switch" aria-checked="true" title="Keep primary, secondary and tertiary on different brand hues"><span class="track"></span>Unique colours</button>
    </div>
    <div class="row">
      <div class="field"><span class="label" id="l-mode">Mode</span>
        <div class="seg" role="group" aria-labelledby="l-mode"><button id="m-light" aria-pressed="false">Light</button><button id="m-dark" aria-pressed="false">Dark</button><button id="m-both" aria-pressed="true">Both</button></div>
      </div>
      <div class="field"><span class="label" id="l-contrast">Contrast</span>
        <div class="seg" role="group" aria-labelledby="l-contrast">${CONTRASTS.map(([level, , label]) => `<button id="c-${level}" aria-pressed="${level === 'standard'}">${label}</button>`).join('')}</div>
      </div>
      <button class="switch" id="sw-tint" role="switch" aria-checked="false" title="Surfaces, text and outlines take a hint of the primary"><span class="track"></span>Tint neutrals</button>
      <button class="switch" id="sw-match" role="switch" aria-checked="true" title="On: accents keep their exact brand hex. Off: harmonized toward the primary."><span class="track"></span>Color match</button>
    </div>
    <p class="summary" id="summary" aria-live="polite"></p>
  </div>
  <section class="logos">
    <h2>Logo (registry item <code>logo</code>)</h2>
    <div class="logo-grid">
      ${LOGOS.map(([file, label, note]) => `<figure class="logo"><img src="logos/${file}" alt="pmndrs logo, ${label.toLowerCase()}" width="600" height="600" /><figcaption><span class="lbl">${label}</span><span class="file">${note} · ${file}</span></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="logo-actions"><button id="logo-replay">Replay</button><span class="legend">The animation is CSS inside each SVG, so a plain &lt;img&gt; plays it. Under reduced motion the one-shot holds still and the loader only fades.</span></p>
  </section>
  <main id="app"></main>
  <script id="data" type="application/json">${JSON.stringify(data)}</script>
  <script id="role-seeds" type="application/json">${JSON.stringify(ROLE_SEEDS)}</script>
  <script>
    const DATA = JSON.parse(document.getElementById('data').textContent)
    // Two independent axes: fidelity (exact by default, as the registry ships, or
    // harmonized) picks the dataset;
    // view (both, light or dark) picks how each role is shown and themes the page.
    // A third axis picks the primary: each brand hue's pure hex as the seed.
    // Secondary and tertiary are 'auto' (MD3 derives them from the primary) or a
    // brand hue's key; with Unique on, no two of the three share a brand hue.
    // The controls set mode, tint and match; view and fidelity follow from them
    // (in update) and are what the rendering reads.
    const state = { primary: 'accent-7', secondary: 'auto', tertiary: 'auto', unique: true, mode: 'both', tint: false, match: true, contrast: 'standard', view: 'both', fidelity: 'exact' }
    const PRIMARIES = ${JSON.stringify(PRIMARIES)}
    const ROLE_SEEDS = JSON.parse(document.getElementById('role-seeds').textContent)
    const hueName = (key) => (key === 'auto' ? 'Auto' : PRIMARIES.find(([k]) => k === key)[1])
    const familyOf = (which) => ROLE_SEEDS[state.primary][state.contrast][which][state[which]]

    const ink = (hex) => {
      const h = hex.replace('#', '')
      if (h.length < 6) return '#000'
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#111' : '#fff'
    }
    const cell = (hex, label, sub) =>
      '<div class="cell" style="background:' + hex + ';color:' + ink(hex) + '">' +
      '<span class="lbl">' + label + '</span><span class="hex">' + sub + '</span></div>'

    const find = (d, name) => { for (const rs of Object.values(d.groups)) { const x = rs.find((r) => r.name === name); if (x) return x } }

    // Each view names the scheme(s) it shows. A "both" view shows the light/dark
    // pair; a single-mode view fills one cell with that mode's value.
    const VIEWS = {
      both: ['light', 'dark'],
      light: ['light'],
      dark: ['dark'],
      'both-primary': ['lightPrimary', 'darkPrimary'],
      'light-primary': ['lightPrimary'],
      'dark-primary': ['darkPrimary'],
    }
    const isPrimaryView = () => state.view.endsWith('primary')
    const swatches = (o) => {
      const lab = o.label || o.name
      const [a, b] = VIEWS[state.view]
      return cell(o[a], lab, o[a]) + (b ? cell(o[b], 'dark', o[b]) : '')
    }
    const pairStyle = () => (VIEWS[state.view].length === 2 ? '' : 'grid-template-columns:1fr')

    function render() {
      const d = DATA[state.primary][state.contrast][state.fidelity]
      let html = ''

      // Every role by name, for the scheme cards: MD3's own, the chosen secondary
      // and tertiary, and each custom colour's four.
      const byName = {}
      for (const roles of Object.values(d.groups)) for (const r of roles) byName[r.name] = r
      for (const which of ['secondary', 'tertiary']) for (const r of familyOf(which).roles) byName[r.name] = r
      const pickedNow = new Set(['secondary', 'tertiary'].filter((w) => state[w] !== 'auto').map((w) => state[w]))
      const customs = [...d.accents.filter((a) => !pickedNow.has(a.name)), ...d.neutrals]
      for (const c of customs) Object.assign(byName, { [c.name]: c, ['on-' + c.name]: c.on, [c.name + '-container']: c.container, ['on-' + c.name + '-container']: c.onContainer })

      const SCHEME_TITLES = { light: 'Light Scheme', dark: 'Dark Scheme', lightPrimary: 'Light (Primary) Scheme', darkPrimary: 'Dark (Primary) Scheme' }
      const schemeCard = (scheme) => {
        const v = (name) => byName[name][scheme]
        // A cell is a role's colour with another role's colour as its text, the way
        // Material Theme Builder pairs them; \`short\` cells hold one line.
        const c = (label, bg, fg, short) => '<div class="m3-cell' + (short ? ' short' : '') + '" style="background:' + v(bg) + ';color:' + (fg ? v(fg) : ink(v(bg))) + '">' +
          '<span>' + label + '</span><span class="h">' + v(bg) + '</span></div>'
        const column = (role, label) => '<div class="m3-col">' +
          c(label, role, 'on-' + role) + c('On ' + label, 'on-' + role, role, true) +
          c(label + ' Container', role + '-container', 'on-' + role + '-container') + c('On ' + label + ' Container', 'on-' + role + '-container', role + '-container', true) + '</div>'
        let h = '<div class="m3" style="background:' + v('surface') + ';color:' + v('on-surface') + '"><h3>' + SCHEME_TITLES[scheme] + '</h3>'
        h += '<div class="m3-split"><div class="m3-cols">' + column('primary', 'Primary') + column('secondary', 'Secondary') + column('tertiary', 'Tertiary') + '</div>' + column('error', 'Error') + '</div>'
        h += '<div class="m3-split"><div class="m3-surfaces">'
        h += '<div class="m3-strip" style="grid-template-columns:repeat(3,1fr)">' + c('Surface Dim', 'surface-dim', 'on-surface') + c('Surface', 'surface', 'on-surface') + c('Surface Bright', 'surface-bright', 'on-surface') + '</div>'
        h += '<div class="m3-strip" style="grid-template-columns:repeat(5,1fr)">' + [['Lowest', '-lowest'], ['Low', '-low'], ['', ''], ['High', '-high'], ['Highest', '-highest']].map(([l, k]) => c('Surf. Container' + (l ? ' ' + l : ''), 'surface-container' + k, 'on-surface')).join('') + '</div>'
        h += '<div class="m3-strip" style="grid-template-columns:repeat(4,1fr)">' + c('On Surface', 'on-surface', 'surface', true) + c('On Surface Var.', 'on-surface-variant', 'surface', true) + c('Outline', 'outline', 'surface', true) + c('Outline Variant', 'outline-variant', 'on-surface', true) + '</div>'
        h += '</div><div class="m3-side">' + c('Inverse Surface', 'inverse-surface', 'inverse-on-surface') + c('Inverse On Surface', 'inverse-on-surface', 'inverse-surface', true) + c('Inverse Primary', 'inverse-primary', 'inverse-surface', true) +
          '<div class="pair">' + c('Scrim', 'scrim', null, true) + c('Shadow', 'shadow', null, true) + '</div></div></div>'
        for (const x of customs) {
          const label = x.label
          h += '<div class="m3-custom">' + c(label, x.name, 'on-' + x.name, true) + c('On ' + label, 'on-' + x.name, x.name, true) +
            c(label + ' Container', x.name + '-container', 'on-' + x.name + '-container', true) + c('On ' + label + ' Container', 'on-' + x.name + '-container', x.name + '-container', true) + '</div>'
        }
        return h + '</div>'
      }
      html += '<h2>Scheme</h2>'
      html += '<p class="legend">Laid out like Material Theme Builder. Accents (and Neutral 1/2) are the custom-colour rows: Accent 1 Container is MTB\u2019s Custom Color 1 Container. Hues picked as secondary or tertiary show in those columns instead.</p>'
      html += '<div class="schemes">' + VIEWS[state.view].map(schemeCard).join('') + '</div>'

      html += '<h2>Brand colours → nearest ramp step</h2>'
      html += '<p class="legend">For each brand colour, the closest step in its own ramp (by CIELAB ΔE). The big number is the level (tone); the chip is the authored value.</p>'
      html += '<div class="nearest">'
      const seeded = ['secondary', 'tertiary'].filter((which) => state[which] !== 'auto')
      // A brand hue picked as secondary or tertiary shows in that group instead,
      // so it drops out of the accents everywhere they are listed.
      const picked = new Set(seeded.map((which) => state[which]))
      const nearest = d.nearest.filter((n) => !picked.has(n.name))
      nearest.splice(1, 0, ...seeded.map((which) => ({ label: which[0].toUpperCase() + which.slice(1), ...familyOf(which).nearest })))
      for (const n of nearest) {
        html += '<div class="near"><div class="near-sw" style="background:' + n.hex + ';color:' + ink(n.hex) + '">' + n.tone + '</div>' +
          '<div class="near-meta"><span class="lbl">' + n.label + '</span><span class="hex">' + n.hex + '</span>' +
          '<span class="near-auth"><span class="chip" style="background:' + n.authored + '"></span>' + n.authored + ' · ΔE ' + n.de + '</span></div></div>'
      }
      html += '</div>'

      html += '<h2>Semantic roles (--md-sys-color-*)</h2>'
      const shown = {}
      for (const [name, roles] of Object.entries(d.groups)) {
        shown[name] = roles
        if (name === 'primary') for (const which of ['secondary', 'tertiary']) shown[which] = familyOf(which).roles
      }
      for (const [name, roles] of Object.entries(shown)) {
        html += '<section class="group"><h3>' + name + '</h3><div class="roles">'
        for (const r of roles) {
          const ref = VIEWS[state.view][0].startsWith('dark') ? (r.darkRef || r.lightRef) : r.lightRef
          html += '<div class="role"><div class="pair" style="' + pairStyle() + '">' + swatches(r) +
            '</div><div class="ref">' + ref + '</div></div>'
        }
        html += '</div></section>'
      }

      html += '<h2>Accent colours</h2>'
      html += '<p class="legend">The six non-primary brand hues, exposed as named custom colours (<code>bg-accent-1</code> … <code>bg-accent-6</code>). The chip is the authored value; swatches are the MD3 role it generates — Color match keeps it on the authored hex; off, it is harmonized toward the primary.' +
        (picked.size ? ' Hues picked as secondary or tertiary are left out here; they show in those groups.' : '') + '</p>'
      html += '<div class="brand">'
      for (const b of d.accents.filter((a) => !picked.has(a.name))) {
        html += '<div class="role"><div class="pair" style="' + pairStyle() + '">' + swatches(b) +
          '</div><div class="authored"><span class="chip" style="background:' + b.authored + '"></span>authored ' + b.authored + '</div></div>'
      }
      html += '</div>'

      html += '<h2>Neutral colours</h2>'
      html += '<p class="legend">The brand off-white and near-black as custom colours (<code>bg-neutral-1</code>, <code>bg-neutral-2-900</code> …). Both are shades of the neutral ramp the surfaces use, neutral-90 and neutral-22, and that ramp is their ramp; the swatches are the tone-40 role.</p>'
      html += '<div class="brand">'
      for (const b of d.neutrals) {
        html += '<div class="role"><div class="pair" style="' + pairStyle() + '">' + swatches(b) +
          '</div><div class="authored"><span class="chip" style="background:' + b.authored + '"></span>authored ' + b.authored + '</div></div>'
      }
      html += '</div>'

      html += '<h2>Tonal reference ramps (--md-ref-palette-*)</h2>'
      html += '<p class="legend">Scheme-independent tones the roles alias onto — identical in light and dark.' + (isPrimaryView() ? ' Primary views: Neutral and Neutral-Variant are tinted by the primary; Neutral-1/2 keep the brand ramp.' : '') + '</p>'
      const ramps = {}
      for (const [hue, ramp] of Object.entries(isPrimaryView() ? d.tonalPrimary : d.tonal)) {
        ramps[hue] = ramp
        if (hue === 'primary') for (const which of ['secondary', 'tertiary']) ramps[which] = familyOf(which).ramp
      }
      for (const [hue, ramp] of Object.entries(ramps).filter(([hue]) => !picked.has(hue))) {
        const label = /^accent-\d$/.test(hue) ? 'Accent ' + hue.slice(7) : /^neutral-\d$/.test(hue) ? 'Neutral ' + hue.slice(8) : hue
        html += '<div class="ramp"><div class="ramp-name">' + label + '</div><div class="tones">'
        for (const t of ramp) {
          html += '<div class="tone" title="' + hue + '-' + t.tone + ': ' + t.hex + '" style="background:' + t.hex + ';color:' + ink(t.hex) + '">' + t.tone + '</div>'
        }
        html += '</div></div>'
      }

      document.getElementById('app').innerHTML = html
    }

    // Page chrome follows the selected mode's own surface roles so the preview
    // reads as a real light/dark theme. A "both" view shows two schemes, so its
    // chrome takes whichever of the pair matches the viewer's system setting:
    // Both looks like Light or Dark, Both (Primary) like Light or Dark (Primary).
    const ROLE_FOR = ${JSON.stringify(ROLE_FOR)}
    const prefersDark = matchMedia('(prefers-color-scheme: dark)')
    function theme() {
      const root = document.documentElement.style
      const pair = VIEWS[state.view]
      const scheme = pair.length === 2 ? pair[prefersDark.matches ? 1 : 0] : pair[0]
      const d = DATA[state.primary][state.contrast][state.fidelity]
      for (const [v, role] of Object.entries(ROLE_FOR)) { const r = find(d, role); if (r) root.setProperty(v, r[scheme]) }
    }
    prefersDark.addEventListener('change', theme)

    // With Unique on, a seeded secondary or tertiary may not share the primary's
    // hue or each other's. Their taken hues are disabled; changing the primary
    // (or switching Unique on) onto a taken hue moves the role that now clashes
    // to the next free brand hue, in toolbar order. 'auto' never clashes.
    function enforceUnique() {
      if (!state.unique) return ''
      const order = PRIMARIES.map(([key]) => key)
      const moved = []
      const settle = (which, others) => {
        if (state[which] === 'auto' || !others.includes(state[which])) return
        const was = state[which]
        state[which] = order.find((key) => !others.includes(key))
        moved.push(which + ' from ' + hueName(was) + ' to ' + hueName(state[which]))
      }
      settle('secondary', [state.primary, state.tertiary].filter((k) => k !== 'auto'))
      settle('tertiary', [state.primary, state.secondary].filter((k) => k !== 'auto'))
      return moved.length ? 'Moved ' + moved.join(' and ') + ' to keep the colours unique.' : ''
    }
    const takenFor = (which) => (state.unique ? [state.primary, state[which === 'secondary' ? 'tertiary' : 'secondary']] : [])

    const groups = {
      primary: Object.fromEntries(PRIMARIES.map(([key]) => [key, 'p-' + key])),
      secondary: Object.fromEntries([['auto', 's-auto'], ...PRIMARIES.map(([key]) => [key, 's-' + key])]),
      tertiary: Object.fromEntries([['auto', 't-auto'], ...PRIMARIES.map(([key]) => [key, 't-' + key])]),
      contrast: { standard: 'c-standard', medium: 'c-medium', high: 'c-high' },
      mode: { light: 'm-light', dark: 'm-dark', both: 'm-both' },
    }
    const switches = { unique: 'sw-unique', tint: 'sw-tint', match: 'sw-match' }
    let lastMove = ''
    function update() {
      state.view = state.tint ? state.mode + '-primary' : state.mode
      state.fidelity = state.match ? 'exact' : 'harmonized'
      for (const [g, opts] of Object.entries(groups)) {
        for (const [val, id] of Object.entries(opts)) document.getElementById(id).setAttribute('aria-pressed', String(state[g] === val))
      }
      for (const which of ['secondary', 'tertiary']) {
        const taken = takenFor(which)
        for (const [key] of PRIMARIES) document.getElementById(which[0] + '-' + key).disabled = taken.includes(key)
      }
      for (const [key, id] of Object.entries(switches)) document.getElementById(id).setAttribute('aria-checked', String(state[key]))
      // One plain sentence for what is on screen.
      const [, name, hex] = PRIMARIES.find(([key]) => key === state.primary)
      const role = (which) => (state[which] === 'auto' ? which + ' from the primary' : hueName(state[which]) + ' ' + which)
      document.getElementById('summary').textContent = [
        name + ' (' + hex + ') primary, ' + role('secondary') + ', ' + role('tertiary') + '.',
        { standard: 'Standard', medium: 'Medium', high: 'High' }[state.contrast] + ' contrast' + (state.tint ? ', tinted neutrals' : '') + ', ' + (state.match ? 'accents match the brand exactly.' : 'accents harmonized toward the primary.'),
        lastMove,
      ].filter(Boolean).join(' ')
      theme()
      render()
    }
    for (const [g, opts] of Object.entries(groups)) {
      for (const [val, id] of Object.entries(opts)) document.getElementById(id).onclick = () => { state[g] = val; lastMove = enforceUnique(); update() }
    }
    for (const [key, id] of Object.entries(switches)) document.getElementById(id).onclick = () => { state[key] = !state[key]; lastMove = enforceUnique(); update() }
    update()

    // A fresh query string loads the SVG as a new document, so its animation starts over.
    let replays = 0
    document.getElementById('logo-replay').onclick = () => {
      replays++
      for (const img of document.querySelectorAll('.logo img')) img.src = img.src.split('?')[0] + '?' + replays
    }
  </script>
</body>
</html>
`

const out = new URL('../demo/palette.html', import.meta.url)
mkdirSync(new URL('./', out), { recursive: true })

// The fonts the page uses: Geist (variable: Regular 400 for body, Black 900 for headlines) and Mono Regular (code).
const fonts = new URL('../node_modules/geist/dist/fonts/', import.meta.url)
mkdirSync(new URL('./fonts/', out), { recursive: true })
for (const file of ['geist-sans/Geist-Variable.woff2', 'geist-mono/GeistMono-Regular.woff2']) {
  copyFileSync(new URL(file, fonts), new URL(`./fonts/${file.split('/')[1]}`, out))
}
// The logo SVGs, from assets/ — the same files the `logo` registry item installs.
mkdirSync(new URL('./logos/', out), { recursive: true })
for (const [file] of LOGOS) copyFileSync(new URL(`../assets/${file}`, import.meta.url), new URL(`./logos/${file}`, out))
writeFileSync(out, html)
const n = BRAND.accents.length
console.log(`✔ wrote demo/palette.html (${PRIMARIES.length} primaries, ${n} accents, ${BRAND.neutrals.length} neutrals, harmonized + exact, ${LOGOS.length} logos)`)
