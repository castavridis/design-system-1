The colours are already working. The pmndrs palette is baked into the CSS this item writes, so there is nothing to mount, no provider, and no client JavaScript.

Two things to know:

- **This is the item to depend on.** It pulls `md3-base` — the Tailwind `@theme` mapping, the shadcn remap and the seed — and adds the palette those point at.
- **The brand colours are named.** Lime, teal, cyan, purple, red, orange and yellow are custom colours: list them in the `@plugin` line `md3-base` added (`custom-colors: lime, teal, cyan, purple, red, orange, yellow;`) for `bg-lime`, `text-on-teal`, `bg-cyan-container`, `bg-purple-500` and the rest. Their shade utilities take over Tailwind's stock palettes of the same names.
- If you want a palette other than the pmndrs one, install **`md3-base`** instead and compute your own. See its docs. Installing both means committing 252 declarations you immediately override.
- **The baked neutrals differ from what the seed computes.** Surfaces and body text are a warm grey at chroma 2 (the `vibrant` scheme would give 10); outlines and secondary text carry a hint of the primary, its hue at chroma 8. `material-theme-builder` has no option for that yet, so `builder(pmndrsMtb)` or `<Mtb>` at runtime reproduces the old, yellower neutrals — prefer this baked palette until it does.
