/**
 * Generates `demo/palette.html` — a self-contained swatch page for the baked
 * palette, so the colour layer can be seen in a browser without scaffolding an
 * app or reaching the network.
 *
 * Reads the committed `registry.json` (never recomputes the palette), resolves
 * the `var(--md-ref-palette-*)` aliases each `--md-sys-color-*` role points at,
 * and lays out the 49 semantic roles (light ‖ dark) plus the tonal reference
 * ramps. Open the file directly — nothing is fetched.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'))
const md3 = registry.items.find((i) => i.name === 'md3')
if (!md3?.css) throw new Error('md3 item has no baked css — run `npm run build` first')

const light = { ...md3.css[':root'] }
const dark = { ...md3.css[':root'], ...md3.css['.dark'] }

// `--md-sys-color-*` values are `var(--md-ref-palette-*)`; the ref entries are
// raw hex. Resolve one hop (the only hop the palette uses) to a hex string.
const resolve = (map, value) => {
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  return ref ? map[ref[1]] ?? value : value
}

const sysRoles = Object.keys(light)
  .filter((k) => k.startsWith('--md-sys-color-'))
  .map((k) => ({
    name: k.replace('--md-sys-color-', ''),
    lightRef: light[k].match(/--md-ref-palette-([\w-]+)/)?.[1] ?? '',
    light: resolve(light, light[k]),
    dark: resolve(dark, dark[k]),
  }))

// Roles come in `x` / `on-x` / `x-container` / `on-x-container` families; group
// by the leading token so related roles sit together.
const groupOf = (name) => {
  const stem = name.replace(/^on-/, '').replace(/-(container|fixed|dim|bright|variant|lowest|low|high|highest)$/g, '')
  return stem.split('-')[0]
}
const groups = {}
for (const role of sysRoles) (groups[groupOf(role.name)] ??= []).push(role)

// Tonal ramps: `--md-ref-palette-<hue>-<tone>` → one row per hue, sorted by tone.
const tonal = {}
for (const [k, v] of Object.entries(light)) {
  const m = k.match(/^--md-ref-palette-([a-z-]+)-(\d+)$/)
  if (!m) continue
  ;(tonal[m[1]] ??= []).push({ tone: Number(m[2]), hex: v })
}
for (const ramp of Object.values(tonal)) ramp.sort((a, b) => a.tone - b.tone)

// Readable text colour for a swatch label, by luma of its background hex.
const ink = (hex) => {
  const h = hex.replace('#', '')
  if (h.length < 6) return '#000'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#111' : '#fff'
}

const roleCell = (hex, label, sub) => `
  <div class="cell" style="background:${hex};color:${ink(hex)}">
    <span class="lbl">${label}</span>
    <span class="hex">${sub}</span>
  </div>`

const groupBlocks = Object.entries(groups)
  .map(
    ([name, roles]) => `
    <section class="group">
      <h3>${name}</h3>
      <div class="roles">
        ${roles
          .map(
            (r) => `
          <div class="role">
            <div class="pair">
              ${roleCell(r.light, r.name, r.light)}
              ${roleCell(r.dark, 'dark', r.dark)}
            </div>
            <div class="ref">${r.lightRef}</div>
          </div>`
          )
          .join('')}
      </div>
    </section>`
  )
  .join('')

const tonalBlocks = Object.entries(tonal)
  .map(
    ([hue, ramp]) => `
    <div class="ramp">
      <div class="ramp-name">${hue}</div>
      <div class="tones">
        ${ramp
          .map(
            (t) => `<div class="tone" style="background:${t.hex};color:${ink(t.hex)}" title="${hue}-${t.tone}: ${t.hex}">${t.tone}</div>`
          )
          .join('')}
      </div>
    </div>`
  )
  .join('')

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>pmndrs design system — palette</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; background: #0e1116; color: #e6e6e6; }
    header { padding: 32px 40px 8px; }
    header h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: #9aa4b2; }
    main { padding: 16px 40px 64px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #9aa4b2; margin: 40px 0 12px; }
    .group { margin-bottom: 28px; }
    .group h3 { font-size: 13px; text-transform: capitalize; margin: 0 0 8px; color: #c9d2de; }
    .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .role { border-radius: 8px; overflow: hidden; border: 1px solid #222a35; }
    .pair { display: grid; grid-template-columns: 1fr 72px; }
    .cell { padding: 12px 10px; min-height: 56px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
    .lbl { font-weight: 600; font-size: 12px; word-break: break-word; }
    .hex { font-size: 11px; font-variant-numeric: tabular-nums; opacity: .85; }
    .ref { padding: 5px 10px; font-size: 10px; color: #7c879a; background: #161b22; font-variant-numeric: tabular-nums; }
    .ramp { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .ramp-name { width: 120px; text-align: right; font-size: 12px; text-transform: capitalize; color: #c9d2de; flex: none; }
    .tones { display: flex; flex: 1; border-radius: 6px; overflow: hidden; }
    .tone { flex: 1; min-width: 0; padding: 10px 2px; text-align: center; font-size: 10px; font-variant-numeric: tabular-nums; }
    .legend { color: #7c879a; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>pmndrs design system — Material Design 3 palette</h1>
    <p>${sysRoles.length} semantic roles · generated from <code>registry.json</code> · each role shows <strong>light ‖ dark</strong></p>
  </header>
  <main>
    <h2>Semantic roles (--md-sys-color-*)</h2>
    ${groupBlocks}
    <h2>Tonal reference ramps (--md-ref-palette-*)</h2>
    <p class="legend">Raw tones the roles above alias onto. Scheme-independent — identical in light and dark.</p>
    ${tonalBlocks}
  </main>
</body>
</html>
`

const out = new URL('../demo/palette.html', import.meta.url)
mkdirSync(new URL('./', out), { recursive: true })
writeFileSync(out, html)
console.log(`✔ wrote demo/palette.html (${sysRoles.length} roles, ${Object.keys(tonal).length} tonal ramps)`)
