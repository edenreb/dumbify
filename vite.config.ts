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
// chrome.scripting speaks camelCase where the manifest speaks snake_case, and it
// rejects the whole call on an unknown property rather than ignoring it - passing
// `run_at` straight through threw, so nothing was ever injected. Translate here, at
// build time, so the worker registers exactly what it is given.
const SCRIPT_KEYS: Record<string, string> = {
  matches: 'matches',
  exclude_matches: 'excludeMatches',
  css: 'css',
  js: 'js',
  run_at: 'runAt',
  all_frames: 'allFrames',
  match_origin_as_fallback: 'matchOriginAsFallback',
  world: 'world',
}

function toRegistration(script: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(script)) {
    const mapped = SCRIPT_KEYS[key]
    // include_globs and friends have no scripting equivalent; dropping them beats
    // failing the call.
    if (mapped) out[mapped] = value
  }
  return out
}

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
      writeFileSync(
        resolve(outDir, 'content-scripts.json'),
        JSON.stringify(scripts.map(toRegistration), null, 2)
      )
    },
  }
}

export default defineConfig({
  plugins: [crx({ manifest }), deferContentScripts()],
})
