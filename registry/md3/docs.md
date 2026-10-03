The colours are already working. The pmndrs palette is baked into the CSS this item writes, so there is nothing to mount, no provider, and no client JavaScript.

Two things to know:

- **This is the item to depend on.** It pulls `md3-base` — the Tailwind `@theme` mapping, the shadcn remap and the seed — and adds the palette those point at.
- If you want a palette other than the pmndrs one, install **`md3-base`** instead and compute your own. See its docs. Installing both means committing 252 declarations you immediately override.
- **The baked neutrals are greyer than the seed computes.** Surfaces, outlines and secondary text are drawn at neutral chroma 2 (the `vibrant` scheme would give 10), and the `neutral-1` / `neutral-2` ramps keep the chroma of their hex. `material-theme-builder` has no option for either yet, so `builder(pmndrsMtb)` or `<Mtb>` at runtime reproduces the old, yellower neutrals — prefer this baked palette until it does.
