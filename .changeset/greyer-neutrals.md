---
"@pmndrs/design-system": minor
---

Grey down the baked neutrals and add Neutral-1 and Neutral-2.

Surfaces, outlines and secondary text now come from neutral ramps at chroma 2 (warm grey) where the `vibrant` scheme gave 10: the light background moves from `#fff9ed` to `#fef8f4`, the dark one from `#161306` to `#141311`. The Figma tokens follow.

`neutral-1` (`#EAE5DA`, off-white) and `neutral-2` (`#36342F`, near-black) are new custom colours, with ramps that keep each hex's own chroma.

`material-theme-builder` cannot express either yet, so a palette computed at runtime from `pmndrsMtb` keeps the old neutrals. The baked `md3` palette is the one to use until it can.
