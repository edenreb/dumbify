import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

// Chrome injects a manifest-declared content script before any of our own code runs, so
// main.css hid YouTube whether or not the extension was switched on - the "off" path
// could only reveal the page again after an async storage read, which showed as a blank
// frame. Registering the script from the service worker instead means "off" injects
// nothing at all.
//
// crxjs still needs the manifest entry to know what to build and how to hash it, so the
// entry is lifted out of the built manifest here and handed to the worker as data.
// Build only: `vite dev` relies on the static declaration for content-script HMR.
function deferContentScripts(): Plugin {
  let outDir = 'dist'
  return {
    name: 'dumbify-defer-content-scripts',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir
    },
    // crxjs writes manifest.json itself, after generateBundle - it is not in the bundle
    // to rewrite there, so this edits the file it left behind.
    writeBundle() {
      const manifestPath = resolve(outDir, 'manifest.json')
      if (!existsSync(manifestPath)) return

      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const scripts = parsed.content_scripts
      if (!Array.isArray(scripts) || scripts.length === 0) return

      delete parsed.content_scripts
      writeFileSync(manifestPath, JSON.stringify(parsed, null, 2))
      writeFileSync(resolve(outDir, 'content-scripts.json'), JSON.stringify(scripts, null, 2))
    },
  }
}

export default defineConfig({
  plugins: [crx({ manifest }), deferContentScripts()],
})
