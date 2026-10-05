import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** The demo page, `npm run preview`: a Vite app rooted in `demo/`. */
export default defineConfig({
  root: here('./demo'),
  plugins: [tailwindcss()],
  /**
   * `registry/md3-base/md3.ts` reads `THEME_*` overrides from `process.env`,
   * which a browser has none of. Like `scripts/build.mjs`, the page shows the
   * pmndrs default rather than one deployment's environment.
   */
  define: { 'process.env': {} },
  /**
   * The logo SVGs, served as-is from `assets/`: the same files the `logo`
   * registry item installs, and never inlined, so a query string can replay
   * the animated one.
   */
  publicDir: here('./assets'),
})
