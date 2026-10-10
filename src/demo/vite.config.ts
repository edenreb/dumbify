// Builds the website's live demo (this folder) into docs/site/demo, beside the landing page.
// GitHub Pages publishes docs/ as it is, so the output is committed:  npm run site
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: at('.'),
  // Relative, so the demo works under /dumbify/ on Pages and from any local server.
  base: './',
  // The preview's fonts.css points at /fonts/, which this copies in beside it.
  publicDir: at('../public'),
  build: { outDir: at('../../docs/site/demo'), emptyOutDir: true },
})
