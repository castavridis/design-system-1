---
"@pmndrs/design-system": minor
---

Grey down the baked neutrals, and tint the outlines.

Surfaces and body text now come from a warm-grey neutral ramp at chroma 2 where the `vibrant` scheme gave 10; outlines and secondary text from a neutral-variant ramp at the primary's hue, chroma 8: the light background moves from `#fff9ed` to `#fef8f4`, the dark one from `#161306` to `#141311`. The Figma tokens follow.

`material-theme-builder` cannot express that yet, so a palette computed at runtime from `pmndrsMtb` keeps the old neutrals. The baked `md3` palette is the one to use until it can.
