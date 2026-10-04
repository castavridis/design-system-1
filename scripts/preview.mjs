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
 * The palette overrides (greyer neutrals) are imported
 * from `palette-overrides.mjs`, not mirrored, so the page shows the baked ramps.
 *
 * The logo SVGs are copied from `assets/` next to the page, like the fonts, so
 * it shows the same files the `logo` registry item installs.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { builder } from 'material-theme-builder'
import { contrastCustomColours, overrideCssBlock, overridePalettes, tintedNeutralPalettes } from './palette-overrides.mjs'

// --- brand seed (mirror of pmndrsMtb in registry/md3-base/md3.ts) -----------
const BRAND = {
  source: '#CAF543', // lime — primary (also exposed as `lime` for direct use)
  scheme: 'vibrant', // keeps the seed's chroma (neon); tonalSpot clamps it to ~36

  contrast: 0,
  neutral: '#36342F', // warm near-black / off-white — anchors the neutral ramp
  error: '#FF4980', // red
  // The seven brand colours, by their CSS names (bg-lime, bg-teal, …).
  accents: [
    ['lime', '#CAF543'],
    ['teal', '#00F7A3'],
    ['cyan', '#2BDCF6'],
    ['purple', '#D855F9'],
    ['red', '#FF4980'],
    ['orange', '#FFC043'],
    ['yellow', '#EBFF0F'],
  ],
}

// The primaries the page can switch between: each brand hue's pure hex as the
// seed, lime first since it is the one that ships. Only a preview — the
// published palette keeps `pmndrsMtb.source`.
// Display names for the brand colours, in the order the page lists them.
const COLOR_NAMES = { lime: 'Lime', teal: 'Teal', cyan: 'Cyan', purple: 'Purple', red: 'Red', orange: 'Orange', yellow: 'Yellow' }
const COLOR_ORDER = Object.keys(COLOR_NAMES)
const PRIMARIES = COLOR_ORDER.map((key) => [key, COLOR_NAMES[key], Object.fromEntries(BRAND.accents)[key]])

// `extra` carries the optional secondary / tertiary seeds.
const seedFor = (blend, source = BRAND.source, extra = {}) => {
  const { accents, ...rest } = BRAND
  const customColors = accents.map(([name, hex]) => ({ name, hex, blend }))
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

const customNames = new Set(BRAND.accents.map(([n]) => n))

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
  const tint = tintedNeutralPalettes(seed)
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
  const accents = COLOR_ORDER.map((name) => {
    const r = roleOf(`--md-sys-color-${name}`)
    return { name, label: COLOR_NAMES[name], authored: srcOf[name], light: r.light, dark: r.dark, lightPrimary: r.lightPrimary, darkPrimary: r.darkPrimary, ...familyRoles(name) }
  })

  // Tonal ramps: primary + the seven brand ramps, keeping the
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
  const RAMP_ORDER = ['primary', ...COLOR_ORDER, 'error', 'neutral', 'neutral-variant']
  const ordered = {}
  for (const k of RAMP_ORDER) if (tonal[k]) ordered[k] = tonal[k]
  for (const k of Object.keys(tonal)) if (!(k in ordered)) ordered[k] = tonal[k]

  // For each brand colour, the step in its own ramp closest to the authored hex.
  const nearest = [
    { label: 'Primary', authored: source, ...nearestIn(source, ordered.primary) },
    ...COLOR_ORDER.map((name) => ({ name, label: COLOR_NAMES[name], authored: srcOf[name], ...nearestIn(srcOf[name], ordered[name]) })),
  ].map((n) => ({ ...n, de: Math.round(n.de) }))

  // The two ramps the primary modes redraw, for the ramps section in those views.
  const tonalPrimary = { ...ordered, neutral: rampOf(lightPrimary, 'neutral'), 'neutral-variant': rampOf(lightPrimary, 'neutral-variant') }

  return { groups, accents, tonal: ordered, tonalPrimary, nearest }
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
const shippedRole = (name) => Object.values(data.lime.standard.exact.groups).flat().find((r) => r.name === name)
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
    /* Geist Mono, from the geist package — copied next to the page below, so nothing is fetched. */
    @font-face { font-family: 'Geist Mono'; src: url('fonts/GeistMono-Variable.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
    * { box-sizing: border-box; }
    /* Page chrome, from the shipped palette's own surface roles. These are the
       first paint; the script then sets them for whichever view is chosen. */
    :root { ${chromeCss('light')} }
    @media (prefers-color-scheme: dark) { :root { ${chromeCss('dark')} } }
    body { margin: 0; font: 400 14px/1.4 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--bg); color: var(--fg); transition: background .15s ease, color .15s ease; }
    h1, h2, h3 { font-weight: 900; }
    code, kbd, pre, samp, .hex { font-family: 'Geist Mono', ui-monospace, monospace; font-weight: 400; }
    header { padding: 32px 40px 8px; }
    header h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: var(--muted); }
    main { padding: 8px 40px 64px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 12px; }
    /* Controls: a vertical sheet floating at the right; the page leaves room for it. */
    .controls { position: fixed; top: 16px; right: 16px; z-index: 3; width: 324px; max-height: calc(100vh - 32px); overflow-y: auto; display: grid; gap: 14px; padding: 18px; background: var(--panel); color: var(--fg); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, .18); }
    header, .logos, main { padding-right: 380px; }
    .controls .checks { display: grid; gap: 10px; }
    .controls .field { display: grid; gap: 6px; }
    .controls .label { font-size: 12px; color: var(--muted); }
    .controls button { font: inherit; color: var(--fg); cursor: pointer; }
    .controls button:focus-visible, .check input:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
    /* Colour pickers: one swatch per brand hue; the name is on hover and in the label. */
    .swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .swatch { width: 26px; height: 26px; padding: 0; border-radius: 50%; border: 2px solid var(--panel); box-shadow: 0 0 0 1px var(--border); }
    .swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--fg); }
    .swatch:disabled { opacity: .2; cursor: not-allowed; }
    .auto { height: 26px; padding: 0 10px; border-radius: 999px; border: 1px dashed var(--border); background: transparent; font-size: 12px; }
    .auto[aria-pressed="true"] { border: 1px solid var(--fg); background: var(--fg); color: var(--panel); }
    /* Segmented choices, full width in the sheet. */
    .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 2px; border: 1px solid var(--border); border-radius: 999px; }
    .seg button { border: 0; background: transparent; padding: 5px 8px; border-radius: 999px; font-size: 13px; }
    .seg button[aria-pressed="true"] { background: var(--fg); color: var(--panel); font-weight: 600; }
    /* Checkboxes. */
    .check { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    .check input { width: 16px; height: 16px; margin: 0; accent-color: var(--fg); cursor: pointer; }
    .summary { margin: 0; padding-top: 12px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; line-height: 1.45; }
    /* Narrow screens: no room to float, so the sheet sits at the top and scrolls away. */
    @media (max-width: 900px) {
      .controls { position: static; width: auto; max-height: none; margin: 0 16px; box-shadow: none; }
      header, .logos, main { padding-right: 16px; }
      header, main, .logos { padding-left: 16px; }
    }
    .lbl { font-weight: 600; font-size: 12px; word-break: break-word; }
    .hex { font-size: 11px; font-variant-numeric: tabular-nums; opacity: .85; }
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
    /* Heights are minimums: a label that wraps at narrow widths grows its row instead of spilling. */
    .m3-col { display: grid; grid-template-rows: minmax(80px, auto) minmax(36px, auto) minmax(80px, auto) minmax(36px, auto); }
    .m3-strip { display: grid; }
    .m3-cell { padding: 8px 12px; font-size: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; min-width: 0; }
    .m3-cell .h { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 10px; opacity: .8; font-variant-numeric: tabular-nums; }
    .m3-cell.short { flex-direction: row; flex-wrap: wrap; align-items: center; }
    .m3-surfaces { display: grid; grid-template-rows: minmax(96px, auto) minmax(96px, auto) minmax(36px, auto); }
    .m3-side { display: grid; grid-template-rows: minmax(112px, auto) minmax(36px, auto) minmax(36px, auto) auto; gap: 0; align-content: start; }
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
    .logo-note { margin: 12px 0 0; }
    .lbl-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .replay { font: inherit; font-size: 12px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--fg); cursor: pointer; }
    .replay:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
    @media (max-width: 900px) { .logos { padding-left: 16px; padding-right: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>pmndrs design system — brand palette</h1>
    <p>The palette the registry ships, computed live from the seed. Try the brand hues as primary, secondary and tertiary, and see the result in light and dark.</p>
  </header>
  <aside class="controls" aria-label="Palette options">
    <div class="field"><span class="label" id="l-mode">Mode</span>
      <div class="seg" role="group" aria-labelledby="l-mode"><button id="m-light" aria-pressed="false">Light</button><button id="m-dark" aria-pressed="false">Dark</button></div>
    </div>
    <div class="field"><span class="label" id="l-contrast">Contrast</span>
      <div class="seg" role="group" aria-labelledby="l-contrast">${CONTRASTS.map(([level, , label]) => `<button id="c-${level}" aria-pressed="${level === 'standard'}">${label}</button>`).join('')}</div>
    </div>
    <div class="field"><span class="label" id="l-primary">Primary Color: Lime</span>
      <div class="swatches" role="group" aria-labelledby="l-primary">${PRIMARIES.map(([key, name, hex]) => `<button class="swatch" id="p-${key}" style="background:${hex}" title="${name} ${hex}" aria-label="${name}" aria-pressed="${key === 'lime'}"></button>`).join('')}</div>
    </div>
    ${['secondary', 'tertiary'].map((which) => `<div class="field"><span class="label" id="l-${which}">${which[0].toUpperCase() + which.slice(1)} Color: Auto</span>
      <div class="swatches" role="group" aria-labelledby="l-${which}"><button class="auto" id="${which[0]}-auto" title="Derived from the primary" aria-pressed="true">Auto</button>${PRIMARIES.map(([key, name, hex]) => `<button class="swatch" id="${which[0]}-${key}" style="background:${hex}" title="${name} ${hex}" aria-label="${name}" aria-pressed="false"></button>`).join('')}</div>
    </div>`).join('\n    ')}
    <div class="checks">
      <label class="check" title="Keep primary, secondary and tertiary on different brand hues"><input type="checkbox" id="sw-unique" checked /> Use unique colors</label>
      <label class="check" title="Checked: brand colors are harmonized toward the primary. Unchecked: they keep their exact hex."><input type="checkbox" id="sw-harmonize" /> Use harmonized colors</label>
      <label class="check" title="Swap the neutrals: surfaces and text take the primary's hue, outlines and secondary text go grey"><input type="checkbox" id="sw-tint" /> Tint neutrals</label>
    </div>
    <p class="summary" id="summary" aria-live="polite"></p>
  </aside>
  <section class="logos">
    <h2>Logo (registry item <code>logo</code>)</h2>
    <div class="logo-grid">
      ${LOGOS.map(([file, label, note]) => `<figure class="logo"><img src="logos/${file}" alt="pmndrs logo, ${label.toLowerCase()}" width="600" height="600" /><figcaption><span class="lbl-row"><span class="lbl">${label}</span>${file === 'logo_animated.svg' ? '<button class="replay" id="logo-replay">Replay</button>' : ''}</span><span class="file">${note} · ${file}</span></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="legend logo-note"><span>The animation is CSS inside each SVG, so a plain &lt;img&gt; plays it. Under reduced motion the one-shot holds still and the loader only fades.</span></p>
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
    // Mode opens on the viewer's system setting.
    const startMode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const state = { primary: 'lime', secondary: 'auto', tertiary: 'auto', unique: true, mode: startMode, tint: false, match: true, contrast: 'standard', view: startMode, fidelity: 'exact' }
    const PRIMARIES = ${JSON.stringify(PRIMARIES)}
    const ROLE_SEEDS = JSON.parse(document.getElementById('role-seeds').textContent)
    const COLOR_NAMES = ${JSON.stringify(COLOR_NAMES)}
    const cap = (word) => word[0].toUpperCase() + word.slice(1)
    // 'Primary (Lime)', 'Secondary (Cyan)', 'Tertiary (Auto)'.
    const roleTitle = (which) => cap(which) + ' (' + hueName(state[which]) + ')'
    const hueName = (key) => (key === 'auto' ? 'Auto' : PRIMARIES.find(([k]) => k === key)[1])
    const familyOf = (which) => ROLE_SEEDS[state.primary][state.contrast][which][state[which]]

    const ink = (hex) => {
      const h = hex.replace('#', '')
      if (h.length < 6) return '#000'
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#111' : '#fff'
    }
    const find = (d, name) => { for (const rs of Object.values(d.groups)) { const x = rs.find((r) => r.name === name); if (x) return x } }

    // The scheme each view shows: light or dark, with or without tinted neutrals.
    const VIEWS = {
      light: ['light'],
      dark: ['dark'],
      'light-primary': ['lightPrimary'],
      'dark-primary': ['darkPrimary'],
    }
    const isPrimaryView = () => state.view.endsWith('primary')

    function render() {
      const d = DATA[state.primary][state.contrast][state.fidelity]
      let html = ''

      // Every role by name, for the scheme cards: MD3's own, the chosen secondary
      // and tertiary, and each custom colour's four.
      const byName = {}
      for (const roles of Object.values(d.groups)) for (const r of roles) byName[r.name] = r
      for (const which of ['secondary', 'tertiary']) for (const r of familyOf(which).roles) byName[r.name] = r
      // The primary's hue and any picked secondary / tertiary hue show as those
      // roles, so none of them repeats as a custom-colour row.
      const pickedNow = new Set([state.primary, ...['secondary', 'tertiary'].filter((w) => state[w] !== 'auto').map((w) => state[w])])
      const customs = d.accents.filter((a) => !pickedNow.has(a.name))
      for (const c of customs) Object.assign(byName, { [c.name]: c, ['on-' + c.name]: c.on, [c.name + '-container']: c.container, ['on-' + c.name + '-container']: c.onContainer })

      const SCHEME_TITLES = { light: 'Light Scheme', dark: 'Dark Scheme', lightPrimary: 'Light Scheme', darkPrimary: 'Dark Scheme' }
      const schemeCard = (scheme) => {
        const v = (name) => byName[name][scheme]
        // A cell is a role's colour with another role's colour as its text, the way
        // Material Theme Builder pairs them; \`short\` cells hold one line.
        const c = (label, bg, fg, short) => '<div class="m3-cell' + (short ? ' short' : '') + '" style="background:' + v(bg) + ';color:' + (fg ? v(fg) : ink(v(bg))) + '">' +
          '<span>' + label + '</span><span class="h">' + v(bg) + '</span></div>'
        // The first cell carries the colour's name when it has one: Primary (Lime).
        const column = (role, label, title = label) => '<div class="m3-col">' +
          c(title, role, 'on-' + role) + c('On ' + label, 'on-' + role, role, true) +
          c(label + ' Container', role + '-container', 'on-' + role + '-container') + c('On ' + label + ' Container', 'on-' + role + '-container', role + '-container', true) + '</div>'
        let h = '<div class="m3" style="background:' + v('surface') + ';color:' + v('on-surface') + '"><h3>' + SCHEME_TITLES[scheme] + '</h3>'
        h += '<div class="m3-split"><div class="m3-cols">' + column('primary', 'Primary', roleTitle('primary')) + column('secondary', 'Secondary', roleTitle('secondary')) + column('tertiary', 'Tertiary', roleTitle('tertiary')) + '</div>' + column('error', 'Error') + '</div>'
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
      html += '<p class="legend">Laid out like Material Theme Builder. Each brand color is a custom-color row: Purple Container is MTB\u2019s Custom Color 1 Container. Hues picked as secondary or tertiary show in those columns instead.</p>'
      html += '<div class="schemes">' + VIEWS[state.view].map(schemeCard).join('') + '</div>'

      html += '<h2>Brand colors → nearest ramp step</h2>'
      html += '<p class="legend">For each brand colour, the closest step in its own ramp (by CIELAB ΔE). The big number is the level (tone); the chip is the authored value.</p>'
      html += '<div class="nearest">'
      const seeded = ['secondary', 'tertiary'].filter((which) => state[which] !== 'auto')
      // The primary's hue, and a brand hue picked as secondary or tertiary, show
      // as that role instead, so they drop out of the accents everywhere they
      // are listed: the seven brand colours, each once.
      const picked = new Set([state.primary, ...seeded.map((which) => state[which])])
      const nearest = d.nearest.filter((n) => !picked.has(n.name))
      nearest.splice(1, 0, ...seeded.map((which) => ({ label: roleTitle(which), ...familyOf(which).nearest })))
      nearest[0] = { ...nearest[0], label: roleTitle('primary') }
      for (const n of nearest) {
        html += '<div class="near"><div class="near-sw" style="background:' + n.hex + ';color:' + ink(n.hex) + '">' + n.tone + '</div>' +
          '<div class="near-meta"><span class="lbl">' + n.label + '</span><span class="hex">' + n.hex + '</span>' +
          '<span class="near-auth"><span class="chip" style="background:' + n.authored + '"></span>' + n.authored + ' · ΔE ' + n.de + '</span></div></div>'
      }
      html += '</div>'

      html += '<h2>Tonal reference ramps (--md-ref-palette-*)</h2>'
      html += '<p class="legend">Scheme-independent tones the roles alias onto — identical in light and dark. Neutral is grey; Neutral-Variant carries a hint of the primary.' + (isPrimaryView() ? ' Tint neutrals swaps the pair: Neutral takes the primary\u2019s hue and Neutral-Variant goes grey.' : '') + '</p>'
      const ramps = {}
      for (const [hue, ramp] of Object.entries(isPrimaryView() ? d.tonalPrimary : d.tonal)) {
        ramps[hue] = ramp
        if (hue === 'primary') for (const which of ['secondary', 'tertiary']) ramps[which] = familyOf(which).ramp
      }
      for (const [hue, ramp] of Object.entries(ramps).filter(([hue]) => !picked.has(hue))) {
        const label = COLOR_NAMES[hue] ?? hue
        html += '<div class="ramp"><div class="ramp-name">' + label + '</div><div class="tones">'
        for (const t of ramp) {
          html += '<div class="tone" title="' + hue + '-' + t.tone + ': ' + t.hex + '" style="background:' + t.hex + ';color:' + ink(t.hex) + '">' + t.tone + '</div>'
        }
        html += '</div></div>'
      }

      document.getElementById('app').innerHTML = html
    }

    // Page chrome follows the selected mode's own surface roles so the preview
    // reads as a real light/dark theme.
    const ROLE_FOR = ${JSON.stringify(ROLE_FOR)}
    function theme() {
      const scheme = VIEWS[state.view][0]
      const d = DATA[state.primary][state.contrast][state.fidelity]
      for (const [v, role] of Object.entries(ROLE_FOR)) { const r = find(d, role); if (r) document.documentElement.style.setProperty(v, r[scheme]) }
    }

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
      return moved.length ? 'Moved ' + moved.join(' and ') + ' to keep the colors unique.' : ''
    }
    const takenFor = (which) => (state.unique ? [state.primary, state[which === 'secondary' ? 'tertiary' : 'secondary']] : [])

    const groups = {
      primary: Object.fromEntries(PRIMARIES.map(([key]) => [key, 'p-' + key])),
      secondary: Object.fromEntries([['auto', 's-auto'], ...PRIMARIES.map(([key]) => [key, 's-' + key])]),
      tertiary: Object.fromEntries([['auto', 't-auto'], ...PRIMARIES.map(([key]) => [key, 't-' + key])]),
      contrast: { standard: 'c-standard', medium: 'c-medium', high: 'c-high' },
      mode: { light: 'm-light', dark: 'm-dark' },
    }
    // Checkbox → state. "Use harmonized colors" is the inverse of colour match:
    // checked means match = false.
    const switches = { unique: ['sw-unique', false], tint: ['sw-tint', false], match: ['sw-harmonize', true] }
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
      for (const [key, [id, inverse]] of Object.entries(switches)) document.getElementById(id).checked = inverse ? !state[key] : state[key]
      for (const which of ['primary', 'secondary', 'tertiary']) document.getElementById('l-' + which).textContent = cap(which) + ' Color: ' + hueName(state[which])
      // One plain sentence for what is on screen.
      const [, name, hex] = PRIMARIES.find(([key]) => key === state.primary)
      const role = (which) => (state[which] === 'auto' ? which + ' from the primary' : hueName(state[which]) + ' ' + which)
      document.getElementById('summary').textContent = [
        name + ' (' + hex + ') primary, ' + role('secondary') + ', ' + role('tertiary') + '.',
        { standard: 'Standard', medium: 'Medium', high: 'High' }[state.contrast] + ' contrast' + (state.tint ? ', tinted neutrals' : '') + ', ' + (state.match ? 'exact brand colors.' : 'brand colors harmonized toward the primary.'),
        lastMove,
      ].filter(Boolean).join(' ')
      theme()
      render()
    }
    for (const [g, opts] of Object.entries(groups)) {
      for (const [val, id] of Object.entries(opts)) document.getElementById(id).onclick = () => { state[g] = val; lastMove = enforceUnique(); update() }
    }
    for (const [key, [id, inverse]] of Object.entries(switches)) document.getElementById(id).onchange = (event) => { state[key] = inverse ? !event.target.checked : event.target.checked; lastMove = enforceUnique(); update() }
    update()

    // A fresh query string loads the SVG as a new document, so its animation starts over.
    let replays = 0
    document.getElementById('logo-replay').onclick = () => {
      const img = document.querySelector('.logo img[src*="logo_animated"]')
      img.src = img.src.split('?')[0] + '?' + ++replays
    }
  </script>
</body>
</html>
`

const out = new URL('../demo/palette.html', import.meta.url)
mkdirSync(new URL('./', out), { recursive: true })

// The page is set in Geist Mono, the variable cut: Regular 400 for body, Black 900 for headlines.
const fonts = new URL('../node_modules/geist/dist/fonts/', import.meta.url)
mkdirSync(new URL('./fonts/', out), { recursive: true })
for (const file of ['geist-mono/GeistMono-Variable.woff2']) {
  copyFileSync(new URL(file, fonts), new URL(`./fonts/${file.split('/')[1]}`, out))
}
// The logo SVGs, from assets/ — the same files the `logo` registry item installs.
mkdirSync(new URL('./logos/', out), { recursive: true })
for (const [file] of LOGOS) copyFileSync(new URL(`../assets/${file}`, import.meta.url), new URL(`./logos/${file}`, out))
writeFileSync(out, html)
const n = BRAND.accents.length
console.log(`✔ wrote demo/palette.html (${PRIMARIES.length} primaries, ${n} brand colours, harmonized + exact, ${LOGOS.length} logos)`)
