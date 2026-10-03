/**
 * The baked palette only ships standard contrast, where every role aliases a
 * ramp shade and redrawing the shades is the whole override. Medium and high
 * contrast are where it can quietly fail: material-theme-builder writes roles
 * whose tone falls between shades as raw colours, and a shade redraw never
 * reaches them — they would keep the scheme's yellow chroma-10 neutrals.
 *
 * These pin the raw-role path: every neutral-family role ends up on the
 * redrawn ramp, at the tone MD3 chose for that contrast level, so the greyer
 * neutrals cost nothing in contrast.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { argbFromHex, Hct } from '@material/material-color-utilities'
import { builder } from 'material-theme-builder'
import { pmndrsMtb } from './registry/md3-base/md3.ts'
import { contrastCustomColours, NEUTRAL_CHROMA, NEUTRAL_VARIANT_CHROMA, overrideCssBlock, overridePalettes } from './scripts/palette-overrides.mjs'

const NEUTRAL = ['background', 'on-background', 'surface', 'surface-dim', 'surface-bright', 'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest', 'on-surface', 'inverse-surface', 'inverse-on-surface']
const NEUTRAL_VARIANT = ['surface-variant', 'on-surface-variant', 'outline', 'outline-variant']

/** `toCss()` → `{ ':root': {...}, '.dark': {...} }`. */
const blocks = (css) =>
  Object.fromEntries(
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => [
      selector.trim(),
      Object.fromEntries(
        body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()])
      ),
    ])
  )

const resolve = (block, value) => {
  for (let ref; (ref = value.match(/^var\((--[\w-]+)\)$/)); ) value = block[ref[1]]
  return value
}

for (const contrast of [0.5, 1]) {
  const seed = { ...pmndrsMtb, contrast }
  const { source, ...options } = seed
  const raw = blocks(builder(source, options).toCss())
  const palettes = overridePalettes(seed)

  for (const [selector, isDark] of [[':root', false], ['.dark', true]]) {
    const mode = isDark ? 'dark' : 'light'
    const before = isDark ? { ...raw[':root'], ...raw['.dark'] } : raw[':root']

    test(`contrast ${contrast} ${mode}: raw neutral roles refuse to pass without context`, () => {
      assert.throws(() => overrideCssBlock(raw[selector], palettes), /raw colour/)
    })

    test(`contrast ${contrast} ${mode}: every neutral role is redrawn, at the tone MD3 chose`, () => {
      const out = overrideCssBlock(raw[selector], palettes, { source, scheme: seed.scheme, contrast, isDark })
      const after = isDark ? { ...overrideCssBlock(raw[':root'], palettes, { source, scheme: seed.scheme, contrast, isDark: false }), ...out } : out

      const problems = []
      for (const [roles, chroma] of [[NEUTRAL, NEUTRAL_CHROMA], [NEUTRAL_VARIANT, NEUTRAL_VARIANT_CHROMA]]) {
        for (const role of roles) {
          const name = `--md-sys-color-${role}`
          const was = Hct.fromInt(argbFromHex(resolve(before, before[name])))
          const now = Hct.fromInt(argbFromHex(resolve(after, after[name])))
          // Tone is contrast: it must not move beyond 8-bit rounding.
          if (Math.abs(now.tone - was.tone) > 0.6) problems.push(`${role}: tone ${was.tone.toFixed(1)} → ${now.tone.toFixed(1)}`)
          // Chroma is the override: checked where sRGB can hold it.
          if (now.tone > 8 && now.tone < 96 && Math.abs(now.chroma - chroma) > 1) problems.push(`${role}: chroma ${now.chroma.toFixed(2)}, expected ${chroma}`)
        }
      }
      assert.deepEqual(problems, [])
    })
  }
}

/**
 * Custom colours: the builder leaves them at standard contrast at every level,
 * so `contrastCustomColours` redraws them. Two things keep that honest — at
 * standard contrast its rebuilt ramps reproduce the builder's exactly (so it is
 * the builder's colour, not a lookalike), and above it each custom colour's
 * roles land on the tones the primary's roles take.
 */
const roles = (name) => [[name, 'primary'], [`on-${name}`, 'on-primary'], [`${name}-container`, 'primary-container'], [`on-${name}-container`, 'on-primary-container']]

for (const blend of [false, true]) {
  test(`custom colours (blend ${blend}): the rebuilt ramps are the builder's at standard contrast`, () => {
    const seed = { ...pmndrsMtb, customColors: pmndrsMtb.customColors.map((c) => ({ ...c, blend: c.name.startsWith('accent') ? blend : c.blend })) }
    const { source, ...options } = seed
    const raw = blocks(builder(source, options).toCss())
    const palettes = overridePalettes(seed)
    const diffs = []
    for (const [selector, isDark] of [[':root', false], ['.dark', true]]) {
      const base = overrideCssBlock(raw[selector], palettes)
      const block = isDark ? { ...overrideCssBlock(raw[':root'], palettes), ...base } : base
      // A vanishing contrast takes the rebuild path while every tone stays standard.
      const out = contrastCustomColours(block, { ...seed, contrast: 1e-9 }, palettes, { isDark })
      for (const { name } of seed.customColors)
        for (const [role] of roles(name)) {
          const want = resolve(block, block[`--md-sys-color-${role}`]).toLowerCase()
          if (out[`--md-sys-color-${role}`].toLowerCase() !== want) diffs.push(`${selector} ${role}: ${out[`--md-sys-color-${role}`]} vs ${want}`)
        }
    }
    assert.deepEqual(diffs, [])
  })
}

for (const contrast of [0.5, 1]) {
  test(`contrast ${contrast}: custom colours take the primary's tones`, () => {
    const seed = { ...pmndrsMtb, contrast }
    const { source, ...options } = seed
    const raw = blocks(builder(source, options).toCss())
    const palettes = overridePalettes(seed)
    const off = []
    for (const [selector, isDark] of [[':root', false], ['.dark', true]]) {
      const context = { source, scheme: seed.scheme, contrast, isDark }
      const base = overrideCssBlock(raw[selector], palettes, context)
      const block = isDark ? { ...overrideCssBlock(raw[':root'], palettes, { ...context, isDark: false }), ...base } : base
      const out = contrastCustomColours(block, seed, palettes, { isDark })
      const tone = (name) => Hct.fromInt(argbFromHex(resolve(out, out[`--md-sys-color-${name}`]))).tone
      for (const { name } of seed.customColors)
        for (const [role, primaryRole] of roles(name))
          if (Math.abs(tone(role) - tone(primaryRole)) > 0.6) off.push(`${selector} ${role}: tone ${tone(role).toFixed(1)}, primary ${tone(primaryRole).toFixed(1)}`)
    }
    assert.deepEqual(off, [])
  })
}
