---
"@pmndrs/design-system": minor
---

Grey down the baked neutrals and add Neutral-1 and Neutral-2.

Surfaces, outlines and secondary text now come from neutral ramps at chroma 2 (warm grey) where the `vibrant` scheme gave 10: the light background moves from `#fff9ed` to `#fef8f4`, the dark one from `#161306` to `#141311`. The Figma tokens follow.

`neutral-1` (`#E6E2DD`, off-white) and `neutral-2` (`#363532`, near-black) are new custom colours: the brand's `#EAE5DA` and `#36342F` snapped to the nearest shades of the new neutral ramp (neutral-90 and neutral-22), which is also their ramp.

`material-theme-builder` cannot express either yet, so a palette computed at runtime from `pmndrsMtb` keeps the old neutrals. The baked `md3` palette is the one to use until it can.
