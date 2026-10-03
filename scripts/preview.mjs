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
import { overrideCssBlock, overridePalettes } from './palette-overrides.mjs'

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

// Neutral-1/2 never blend: their ramps are redrawn from the exact hex either way.
const seedFor = (blend) => {
  const { source, accents, neutrals, ...rest } = BRAND
  const customColors = [...accents.map(([name, hex]) => ({ name, hex, blend })), ...neutrals.map(([name, hex]) => ({ name, hex, blend: false }))]
  return { source, ...rest, customColors }
}
const buildTheme = (blend) => {
  const { source, ...rest } = seedFor(blend)
  return builder(source, rest)
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

// Build the render model for one blend mode.
const model = (blend) => {
  const css = buildTheme(blend).toCss()
  const overrides = overridePalettes(seedFor(blend))
  const blocks = parseBlocks(css)
  const rootBlock = overrideCssBlock(blocks[':root'], overrides)
  const darkBlock = overrideCssBlock(blocks['.dark'], overrides)
  const light = { ...rootBlock }
  const dark = { ...rootBlock, ...darkBlock }

  const sysKeys = Object.keys(light).filter((k) => k.startsWith('--md-sys-color-'))

  // Standard MD3 roles vs the named brand colours (and their on-/container).
  const isCustom = (name) => [...customNames].some((c) => name === c || name.startsWith(`${c}-`) || name === `on-${c}` || name.startsWith(`on-${c}-`))

  const roleOf = (k) => ({
    name: k.replace('--md-sys-color-', ''),
    lightRef: light[k].match(/--md-ref-palette-([\w-]+)/)?.[1] ?? '',
    darkRef: dark[k].match(/--md-ref-palette-([\w-]+)/)?.[1] ?? '',
    light: resolve(light, light[k]),
    dark: resolve(dark, dark[k]),
  })

  const roles = sysKeys.map(roleOf).filter((r) => !isCustom(r.name))
  const groupOf = (name) =>
    name
      .replace(/^on-/, '')
      .replace(/-(container|fixed|dim|bright|variant|lowest|low|high|highest)$/g, '')
      .split('-')[0]
  const groups = {}
  for (const r of roles) (groups[groupOf(r.name)] ??= []).push(r)
  // Secondary and tertiary are dropped from the surfaced palette. MD3 still
  // computes them internally — there's no flag to disable them — but they are
  // not shown or used; the accents below take their place.
  delete groups.secondary
  delete groups.tertiary

  // Accent colours: base role per accent, paired with its authored hex.
  const srcOf = Object.fromEntries(BRAND.accents)
  const accents = BRAND.accents.map(([name]) => {
    const r = roleOf(`--md-sys-color-${name}`)
    return { name, label: `Accent ${name.replace('accent-', '')}`, authored: srcOf[name], light: r.light, dark: r.dark }
  })

  // Neutral-1/2: the same shape, so they render with the accents' swatch markup.
  const neutralSrc = Object.fromEntries(BRAND.neutrals)
  const neutrals = BRAND.neutrals.map(([name]) => {
    const r = roleOf(`--md-sys-color-${name}`)
    return { name, label: `Neutral ${name.replace('neutral-', '')}`, authored: neutralSrc[name], light: r.light, dark: r.dark }
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
  const nearestIn = (authored, ramp) =>
    ramp.reduce((best, t) => { const de = deltaE(authored, t.hex); return de < best.de ? { tone: t.tone, hex: t.hex, de } : best }, { de: Infinity })
  const nearest = [
    { label: 'Primary', authored: BRAND.source, ...nearestIn(BRAND.source, ordered.primary) },
    ...BRAND.accents.map(([name], i) => ({ label: `Accent ${i + 1}`, authored: srcOf[name], ...nearestIn(srcOf[name], ordered[name]) })),
    ...BRAND.neutrals.map(([name], i) => ({ label: `Neutral ${i + 1}`, authored: neutralSrc[name], ...nearestIn(neutralSrc[name], ordered[name]) })),
  ].map((n) => ({ ...n, de: Math.round(n.de) }))

  return { groups, accents, neutrals, tonal: ordered, nearest }
}

const data = { harmonized: model(true), exact: model(false) }

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
    /* Page chrome. Defaults are neutral-dark (the "Both" view); the Light/Dark
       views override these from the palette's own surface roles via JS. */
    :root { --bg: #0e1116; --fg: #e6e6e6; --muted: #9aa4b2; --panel: #161b22; --border: #222a35; }
    body { margin: 0; font: 400 14px/1.4 'Geist', ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--fg); transition: background .15s ease, color .15s ease; }
    h1, h2, h3 { font-weight: 900; }
    code, kbd, pre, samp, .hex, .ref { font-family: 'Geist Mono', ui-monospace, monospace; font-weight: 400; }
    header { padding: 32px 40px 8px; }
    header h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: var(--muted); }
    main { padding: 8px 40px 64px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 12px; }
    .toggle { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 40px; background: var(--bg); backdrop-filter: blur(6px); border-bottom: 1px solid var(--border); }
    .toggle button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); cursor: pointer; }
    .toggle button[aria-pressed="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); font-weight: 600; }
    .toggle .grp-label { font-size: 12px; color: var(--muted); }
    .toggle .sep { width: 1px; align-self: stretch; background: var(--border); margin: 0 4px; }
    .toggle .note { color: var(--muted); font-size: 12px; margin-left: 4px; }
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
    <p>Computed live from the seed (lime-green primary + 7 accents + 2 neutrals, vibrant scheme; neutrals at chroma 2) · toggle fidelity and light/dark below</p>
  </header>
  <div class="toggle">
    <span class="grp-label">Fidelity:</span>
    <button id="t-harmonized" aria-pressed="true">Harmonized</button>
    <button id="t-exact" aria-pressed="false">Exact</button>
    <span class="sep"></span>
    <span class="grp-label">Mode:</span>
    <button id="m-both" aria-pressed="true">Both</button>
    <button id="m-light" aria-pressed="false">Light</button>
    <button id="m-dark" aria-pressed="false">Dark</button>
    <span class="note" id="toggle-note"></span>
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
  <script>
    const DATA = JSON.parse(document.getElementById('data').textContent)
    // Two independent axes: fidelity (harmonized or exact) picks the dataset;
    // view (both, light or dark) picks how each role is shown and themes the page.
    const state = { fidelity: 'harmonized', view: 'both' }

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

    // "both" shows the light/dark pair; a single-mode view fills one cell with
    // that mode's value and lets it span the row.
    const swatches = (o) => {
      const lab = o.label || o.name
      if (state.view === 'light') return cell(o.light, lab, o.light)
      if (state.view === 'dark') return cell(o.dark, lab, o.dark)
      return cell(o.light, lab, o.light) + cell(o.dark, 'dark', o.dark)
    }
    const pairStyle = () => (state.view === 'both' ? '' : 'grid-template-columns:1fr')

    function render() {
      const d = DATA[state.fidelity]
      let html = ''

      html += '<h2>Brand colours → nearest ramp step</h2>'
      html += '<p class="legend">For each brand colour, the closest step in its own ramp (by CIELAB ΔE). The big number is the level (tone); the chip is the authored value.</p>'
      html += '<div class="nearest">'
      for (const n of d.nearest) {
        html += '<div class="near"><div class="near-sw" style="background:' + n.hex + ';color:' + ink(n.hex) + '">' + n.tone + '</div>' +
          '<div class="near-meta"><span class="lbl">' + n.label + '</span><span class="hex">' + n.hex + '</span>' +
          '<span class="near-auth"><span class="chip" style="background:' + n.authored + '"></span>' + n.authored + ' · ΔE ' + n.de + '</span></div></div>'
      }
      html += '</div>'

      html += '<h2>Semantic roles (--md-sys-color-*)</h2>'
      for (const [name, roles] of Object.entries(d.groups)) {
        html += '<section class="group"><h3>' + name + '</h3><div class="roles">'
        for (const r of roles) {
          const ref = state.view === 'dark' ? (r.darkRef || r.lightRef) : r.lightRef
          html += '<div class="role"><div class="pair" style="' + pairStyle() + '">' + swatches(r) +
            '</div><div class="ref">' + ref + '</div></div>'
        }
        html += '</div></section>'
      }

      html += '<h2>Accent colours</h2>'
      html += '<p class="legend">The six non-primary brand hues, exposed as named custom colours (<code>bg-accent-1</code> … <code>bg-accent-6</code>). The chip is the authored value; swatches are the MD3 role it generates — the Fidelity toggle changes how close that stays to the authored hex.</p>'
      html += '<div class="brand">'
      for (const b of d.accents) {
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
      html += '<p class="legend">Scheme-independent tones the roles alias onto — identical in light and dark.</p>'
      for (const [hue, ramp] of Object.entries(d.tonal)) {
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
    // reads as a real light/dark theme; "both" keeps the neutral-dark defaults.
    const DEFAULTS = { '--bg': '#0e1116', '--fg': '#e6e6e6', '--muted': '#9aa4b2', '--panel': '#161b22', '--border': '#222a35' }
    const ROLE_FOR = { '--bg': 'surface', '--fg': 'on-surface', '--panel': 'surface-container-high', '--border': 'outline-variant', '--muted': 'on-surface-variant' }
    function theme() {
      const root = document.documentElement.style
      if (state.view === 'both') { for (const k in DEFAULTS) root.setProperty(k, DEFAULTS[k]); return }
      const d = DATA[state.fidelity]
      for (const [v, role] of Object.entries(ROLE_FOR)) { const r = find(d, role); if (r) root.setProperty(v, r[state.view]) }
    }

    const notes = {
      harmonized: 'blend: true — hues nudged toward the seed for cohesion',
      exact: 'blend: false — hues kept true to the authored hex',
    }
    const groups = {
      fidelity: { harmonized: 't-harmonized', exact: 't-exact' },
      view: { both: 'm-both', light: 'm-light', dark: 'm-dark' },
    }
    function update() {
      for (const [g, opts] of Object.entries(groups)) {
        for (const [val, id] of Object.entries(opts)) document.getElementById(id).setAttribute('aria-pressed', String(state[g] === val))
      }
      document.getElementById('toggle-note').textContent = notes[state.fidelity]
      theme()
      render()
    }
    for (const [g, opts] of Object.entries(groups)) {
      for (const [val, id] of Object.entries(opts)) document.getElementById(id).onclick = () => { state[g] = val; update() }
    }
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
console.log(`✔ wrote demo/palette.html (lime-green primary, ${n} accents, ${BRAND.neutrals.length} neutrals, harmonized + exact, ${LOGOS.length} logos)`)
