---
"@pmndrs/design-system": minor
---

Switch the seed to Material Theme Builder's Color match, and grey down the neutrals with it.

`pmndrsMtb` now sets `colorMatch: true` ("Stay true to my color inputs") in place of `scheme: 'vibrant'`, and seeds both neutral ramps: `neutral: '#c1b793'` and `neutralVariant: '#495720'`. Under Color match a neutral ramp takes an eighth of its seed's chroma (neutral-variant adds 4), so those seeds give surfaces and body text a warm grey at chroma 2 where `vibrant` gave 10, and outlines and secondary text the lime's hue at chroma 8. The light background moves from `#fff9ed` to `#fef8f4`, the dark one from `#161306` to `#141311`. `THEME_SCHEME` is gone, `THEME_NEUTRAL_VARIANT` is new, and `THEME_NEUTRAL` now reads the same way: a seed carrying 8x the chroma the ramp gets.

The palette is Material Theme Builder's output with nothing redrawn on top, so `builder(pmndrsMtb)` or `<Mtb>` at runtime renders exactly what the baked `md3` ships, and the Figma tokens follow.

Color match moves other roles too:

- Containers take their seed's hex, or a shade of it where the light scheme needs a darker one: light `primary-container` and `lime-container` are the lime `#caf543`, `teal-container` `#00f7a3`, `cyan-container` `#2bdcf6`, `orange-container` `#ffc043`; light `error-container` / `red-container` are `#da2b66` and `purple-container` `#b833da`, against `#ff4d82` and `#d956f9` in dark. Their on-container colours are re-picked to match, so `on-error-container` is now `#fffbff` in light.
- In dark mode `primary`, `tertiary`, `lime` and `yellow` are `#ffffff`, and `teal`, `cyan` and `orange` near-white tints.
- Secondary and tertiary are derived differently: secondary is a more saturated olive, tertiary a vivid green.
- As in Material Theme Builder, custom colours keep their standard-contrast roles at medium and high contrast; only the core roles move. The bake is standard contrast, so it is unaffected.
