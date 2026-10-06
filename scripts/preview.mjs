/**
 * Generates `demo/palette.html` — a self-contained swatch page for the pmndrs
 * colour layer, so it can be seen in a browser without scaffolding a consumer
 * app or reaching the network.
 *
 * It computes the palette **live** with Material Theme Builder from the real
 * seed, `pmndrsMtb` — imported from `registry/md3-base/md3.ts`, not mirrored
 * (Node ≥22.18 strips the types, as for `npm run build`) — so the page shows
 * what ships. The real `registry.json` is still produced by `npm run build`;
 * this is a viewer, not a second source of truth.
 *
 * The scheme and the tonal ramps are Material Theme Builder's own poster
 * (`Poster`, `Scheme` and `Shades` from `material-theme-builder/react`),
 * rendered here once with `renderToStaticMarkup`. They paint with nothing but
 * `var(--md-sys-color-*)` and `var(--md-ref-palette-*)`, so the controls only
 * swap the `<style>` that defines those: one `builder().toCss()` per choice,
 * all computed here so the page needs no builder.
 *
 * The logo SVGs are copied from `assets/` next to the page, like the fonts, so
 * it shows the same files the `logo` registry item installs.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { builder } from 'material-theme-builder'
import { Poster, Scheme, Shades } from 'material-theme-builder/react'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { pmndrsMtb } from '../registry/md3-base/md3.ts'

const cap = (word) => word[0].toUpperCase() + word.slice(1)

// The primaries the page can switch between: each brand colour's pure hex as
// the seed, lime first since it is the one that ships. Only a preview — the
// published palette keeps `pmndrsMtb.source`.
const PRIMARIES = pmndrsMtb.customColors.map(({ name, hex }) => [name, cap(name), hex])
const hexOf = (key) => PRIMARIES.find(([k]) => k === key)[2]

// MD3's three contrast levels. Standard is what the registry ships.
const CONTRASTS = [['standard', 0, 'Standard'], ['medium', 0.5, 'Medium'], ['high', 1, 'High']]

// `pmndrsMtb` with the page's choices on top; every choice left out is as shipped.
const configFor = ({ primary, contrast, blend = false, secondary, tertiary }) => ({
  ...pmndrsMtb,
  source: hexOf(primary),
  contrast,
  ...(secondary ? { secondary: hexOf(secondary) } : {}),
  ...(tertiary ? { tertiary: hexOf(tertiary) } : {}),
  customColors: pmndrsMtb.customColors.map((color) => ({ ...color, blend })),
})

// `toCss()` emits exactly one `:root` and one `.dark` block; this reads them as
// `{ ':root': { '--name': value }, '.dark': { … } }`.
const blocksOf = (config) => {
  const { source, ...options } = config
  const blocks = [...builder(source, options).toCss().matchAll(/([^{}]+)\{([^}]*)\}/g)]
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

// Only the declarations `to` changes from `from`, block by block.
const changes = (from, to) =>
  Object.fromEntries(Object.entries(to).map(([selector, decls]) => [selector, Object.fromEntries(Object.entries(decls).filter(([k, v]) => from[selector][k] !== v))]))

// Back to CSS. The `--md-ref-palette-*` shades are scheme-independent, so
// `.dark` re-emits them unchanged; `:root` alone carries them.
const cssOf = (blocks) => {
  const decls = (map) => Object.entries(map).map(([k, v]) => `${k}: ${v};`).join(' ')
  const dark = Object.fromEntries(Object.entries(blocks['.dark']).filter(([k]) => !k.startsWith('--md-ref-palette-')))
  return `:root { ${decls(blocks[':root'])} }\n.dark { ${decls(dark)} }`
}

/**
 * The page's stylesheets, keyed `primary/contrast/…`. Per primary and contrast,
 * one full palette per custom colors' `blend` (off, as the registry ships, or
 * on), and on top of it what each brand hue changes as the secondary or the
 * tertiary seed. A palette per combination would be 7 × 3 × 2 × 8 × 8; these
 * are separable instead — a secondary seed moves only the secondary roles, a
 * tertiary seed only the tertiary ones — so the page stacks them.
 */
const PALETTES = {}
for (const [primary] of PRIMARIES) {
  for (const [level, contrast] of CONTRASTS) {
    const key = `${primary}/${level}`
    const shipped = blocksOf(configFor({ primary, contrast }))
    PALETTES[`${key}/unblended`] = cssOf(shipped)
    PALETTES[`${key}/blended`] = cssOf(blocksOf(configFor({ primary, contrast, blend: true })))
    for (const which of ['secondary', 'tertiary']) {
      for (const [hue] of PRIMARIES) PALETTES[`${key}/${which}/${hue}`] = cssOf(changes(shipped, blocksOf(configFor({ primary, contrast, [which]: hue }))))
    }
  }
}

// Material Theme Builder's poster, rendered once: it reads the colours from the
// stylesheet above, so the same markup serves every choice. Both schemes, the
// page shows the one for the mode; every brand colour gets its custom-colour
// row and its ramp, and the page hides the rows of the hues picked as a role.
const schemeHtml = renderToStaticMarkup(
  h(
    Poster,
    { className: 'schemes' },
    h(Scheme, { id: 'scheme-light', theme: 'light', title: 'Light Scheme', fixedAccents: false, customColors: pmndrsMtb.customColors }),
    h(Scheme, { id: 'scheme-dark', theme: 'dark', title: 'Dark Scheme', fixedAccents: false, customColors: pmndrsMtb.customColors })
  )
)
const shadesHtml = renderToStaticMarkup(h(Poster, null, h(Shades, { customColors: pmndrsMtb.customColors })))

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
  <title>Poimandres Theme Builder</title>
  <!-- The palette on screen: the script swaps this for the chosen one. It opens on what ships. -->
  <style id="palette">${PALETTES['lime/standard/unblended']}</style>
  <!-- The custom-colour rows the script hides: the hues picked as primary, secondary or tertiary. -->
  <style id="picked"></style>
  <style>
    /* Geist for the page, Geist Mono for the controls and hex values — both from the
       geist package, copied next to the page below, so nothing is fetched. */
    @font-face { font-family: 'Geist'; src: url('fonts/Geist-Variable.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
    @font-face { font-family: 'Geist Mono'; src: url('fonts/GeistMono-Variable.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }
    * { box-sizing: border-box; }
    /* Page chrome, from the palette's own surface roles, so the page reads as a
       real light or dark theme: .dark on <html> is what switches them. */
    :root { --bg: var(--md-sys-color-surface); --fg: var(--md-sys-color-on-surface); --panel: var(--md-sys-color-surface-container-high); --border: var(--md-sys-color-outline-variant); --muted: var(--md-sys-color-on-surface-variant); }
    /* !important: the poster sets display inline. */
    [hidden] { display: none !important; }
    body { margin: 0; font: 400 14px/1.4 'Geist', ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--fg); transition: background .15s ease, color .15s ease; }
    h1, h2, h3 { font-weight: 900; }
    code, kbd, pre, samp { font-family: 'Geist Mono', ui-monospace, monospace; font-weight: 400; }
    main { padding: 32px 40px 0 380px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 12px; }
    /* Controls: a vertical sheet floating at the left; main and .logos leave room for it (380px). */
    .controls { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace; position: fixed; top: 16px; left: 16px; z-index: 3; width: 324px; max-height: calc(100vh - 32px); overflow-y: auto; display: grid; gap: 14px; padding: 18px; background: var(--panel); color: var(--fg); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, .18); }
    .controls .checks { display: grid; gap: 10px; }
    .builder-title { margin: 0; font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-weight: 900; font-size: 20px; line-height: 1.15; letter-spacing: -.01em; }
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
      main, .logos { padding-left: 16px; padding-right: 16px; }
    }
    .lbl { font-weight: 600; font-size: 12px; word-break: break-word; }
    .legend { color: var(--muted); font-size: 12px; margin: 0 0 12px; }
    /* Scheme: Material Theme Builder's poster, one card per mode. */
    .schemes > div { border-radius: 16px; }
    .logos { padding: 8px 40px 64px 380px; }
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
  <aside class="controls" aria-labelledby="builder-title">
    <h1 class="builder-title" id="builder-title">Poimandres Theme Builder</h1>
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
      <div class="swatches" role="group" aria-labelledby="l-${which}">${PRIMARIES.map(([key, name, hex]) => `<button class="swatch" id="${which[0]}-${key}" style="background:${hex}" title="${name} ${hex}" aria-label="${name}" aria-pressed="false"></button>`).join('')}<button class="auto" id="${which[0]}-auto" title="Derived from the primary" aria-pressed="true">Auto</button></div>
    </div>`).join('\n    ')}
    <div class="checks">
      <label class="check" title="Keep primary, secondary and tertiary on different brand hues"><input type="checkbox" id="sw-unique" checked /> Unique colors</label>
      <label class="check" title="The custom colors' blend. Checked: blend: true, each is harmonized toward the primary. Unchecked: blend: false, as shipped, each is taken as given."><input type="checkbox" id="sw-blend" /> Blend custom colors</label>
    </div>
    <p class="summary" id="summary" aria-live="polite"></p>
  </aside>
  <main>
    ${schemeHtml}
    <h2>Tonal reference ramps (--md-ref-palette-*)</h2>
    <p class="legend">Scheme-independent tones the roles alias onto — identical in light and dark. Neutral is a warm grey; Neutral-Variant carries a hint of the lime.</p>
    ${shadesHtml}
  </main>
  <section class="logos">
    <h2>Logo (registry item <code>logo</code>)</h2>
    <div class="logo-grid">
      ${LOGOS.map(([file, label, note]) => `<figure class="logo"><img src="logos/${file}" alt="pmndrs logo, ${label.toLowerCase()}" width="600" height="600" /><figcaption><span class="lbl-row"><span class="lbl">${label}</span>${file === 'logo_animated.svg' ? '<button class="replay" id="logo-replay">Replay</button>' : ''}</span><span class="file">${note} · ${file}</span></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="legend logo-note"><span>The animation is CSS inside each SVG, so a plain &lt;img&gt; plays it. Under reduced motion the one-shot holds still and the loader only fades.</span></p>
  </section>
  <script id="palettes" type="application/json">${JSON.stringify(PALETTES)}</script>
  <script>
    const PALETTES = JSON.parse(document.getElementById('palettes').textContent)
    // The primary is a brand hue's key: its pure hex is the seed. Secondary and
    // tertiary are 'auto' (MD3 derives them from the primary) or a brand hue's
    // key; with Unique on, no two of the three share a brand hue.
    // Mode opens on the viewer's system setting.
    const state = { primary: 'lime', secondary: 'auto', tertiary: 'auto', unique: true, mode: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', blend: false, contrast: 'standard' }
    const PRIMARIES = ${JSON.stringify(PRIMARIES)}
    const cap = (word) => word[0].toUpperCase() + word.slice(1)
    // 'Primary (Lime)', 'Secondary (Cyan)', 'Tertiary (Auto)'.
    const hueName = (key) => (key === 'auto' ? 'Auto' : PRIMARIES.find(([k]) => k === key)[1])

    function render() {
      // The chosen palette: the one for the custom colors' blend, then what a
      // seeded secondary or tertiary changes on top of it.
      const key = state.primary + '/' + state.contrast
      const seeded = ['secondary', 'tertiary'].filter((which) => state[which] !== 'auto')
      const css = [
        PALETTES[key + '/' + (state.blend ? 'blended' : 'unblended')],
        ...seeded.map((which) => PALETTES[key + '/' + which + '/' + state[which]]),
      ].join('\\n')
      document.getElementById('palette').textContent = css
      document.documentElement.classList.toggle('dark', state.mode === 'dark')
      document.getElementById('scheme-light').hidden = state.mode !== 'light'
      document.getElementById('scheme-dark').hidden = state.mode !== 'dark'

      // The primary's hue, and a brand hue picked as secondary or tertiary, show
      // as that role instead, so they drop out of the scheme's custom rows: the
      // seven brand colours, each once. The ramps still show every one. A custom row is the one whose cell is titled with
      // the hue's name; !important, as the poster lays it out inline.
      const picked = new Set([state.primary, ...seeded.map((which) => state[which])])
      document.getElementById('picked').textContent = [...picked].map((name) => '.schemes div:has(> div > [title="' + name + '"]) { display: none !important; }').join('\\n')
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
    // Checkbox → state: checked is true.
    const switches = { unique: 'sw-unique', blend: 'sw-blend' }
    let lastMove = ''
    function update() {
      for (const [g, opts] of Object.entries(groups)) {
        for (const [val, id] of Object.entries(opts)) document.getElementById(id).setAttribute('aria-pressed', String(state[g] === val))
      }
      for (const which of ['secondary', 'tertiary']) {
        const taken = takenFor(which)
        for (const [key] of PRIMARIES) document.getElementById(which[0] + '-' + key).disabled = taken.includes(key)
      }
      for (const [key, id] of Object.entries(switches)) document.getElementById(id).checked = state[key]
      for (const which of ['primary', 'secondary', 'tertiary']) document.getElementById('l-' + which).textContent = cap(which) + ' Color: ' + hueName(state[which])
      // One plain sentence for what is on screen.
      const [, name, hex] = PRIMARIES.find(([key]) => key === state.primary)
      const role = (which) => (state[which] === 'auto' ? which + ' from the primary' : hueName(state[which]) + ' ' + which)
      document.getElementById('summary').textContent = [
        name + ' (' + hex + ') primary, ' + role('secondary') + ', ' + role('tertiary') + '.',
        { standard: 'Standard', medium: 'Medium', high: 'High' }[state.contrast] + ' contrast, ' + (state.blend ? 'custom colors blended toward the primary.' : 'custom colors unblended.'),
        lastMove,
      ].filter(Boolean).join(' ')
      render()
    }
    for (const [g, opts] of Object.entries(groups)) {
      for (const [val, id] of Object.entries(opts)) document.getElementById(id).onclick = () => { state[g] = val; lastMove = enforceUnique(); update() }
    }
    for (const [key, id] of Object.entries(switches)) document.getElementById(id).onchange = (event) => { state[key] = event.target.checked; lastMove = enforceUnique(); update() }
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

// The fonts the page uses, both variable cuts: Geist for the page (400 body, 900
// headlines) and Geist Mono for the controls and hex values.
const fonts = new URL('../node_modules/geist/dist/fonts/', import.meta.url)
mkdirSync(new URL('./fonts/', out), { recursive: true })
for (const file of ['geist-sans/Geist-Variable.woff2', 'geist-mono/GeistMono-Variable.woff2']) {
  copyFileSync(new URL(file, fonts), new URL(`./fonts/${file.split('/')[1]}`, out))
}
// The logo SVGs, from assets/ — the same files the `logo` registry item installs.
mkdirSync(new URL('./logos/', out), { recursive: true })
for (const [file] of LOGOS) copyFileSync(new URL(`../assets/${file}`, import.meta.url), new URL(`./logos/${file}`, out))
writeFileSync(out, html)
console.log(`✔ wrote demo/palette.html (${PRIMARIES.length} primaries, ${Object.keys(PALETTES).length} stylesheets, ${LOGOS.length} logos)`)
