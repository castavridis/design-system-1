Four SVGs, written to `public/pmndrs/`, so the site serves them at `/pmndrs/…`:

- `logo_complete.svg` — the full mark
- `logo_idle.svg` — the resting state, four concentric rings
- `logo_animated.svg` — idle → complete once, in 0.73 s
- `logo_loading.svg` — out to each corner and back, looping every 5.3 s

Use them as images. The animation is CSS inside each file, so a plain `<img>` plays it, and so does `next/image` with `unoptimized`:

```tsx
<img src="/pmndrs/logo_loading.svg" width={48} height={48} alt="Loading" />
```

Both animated files respect `prefers-reduced-motion`: `logo_animated.svg` shows the complete mark without moving, and `logo_loading.svg` holds it and fades gently, so it still reads as busy.

Every file paints its own black square background; there is no transparent variant yet. The PNGs live in the repo's `assets/` and are not part of this item.

Logo by Mike Douges. _Placeholder — credit wording, link and licence still to be confirmed with Mike._
