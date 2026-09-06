import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// The service worker hands dist/content-scripts.json straight to
// chrome.scripting.registerContentScripts, which rejects the whole call on an unknown
// property rather than ignoring it. A manifest `run_at` shipped once and the extension
// silently injected nothing at all - on or off, it did the same thing.
const SPEC = 'dist/content-scripts.json'
const built = existsSync(SPEC)

// chrome.scripting.RegisteredContentScript, minus the id/persistAcrossSessions the
// worker adds itself.
const ALLOWED = new Set([
  'matches', 'excludeMatches', 'css', 'js', 'runAt', 'allFrames',
  'matchOriginAsFallback', 'world',
])

function scripts(): Record<string, unknown>[] {
  return JSON.parse(readFileSync(SPEC, 'utf8'))
}

test('registration spec uses only properties chrome.scripting accepts', { skip: !built && 'run npm run build first' }, () => {
  for (const script of scripts()) {
    for (const key of Object.keys(script)) {
      assert.ok(ALLOWED.has(key), `chrome.scripting rejects "${key}" - camelCase it or drop it`)
    }
  }
})

test('registration spec keeps document_start, or YouTube flashes before we hide it', { skip: !built && 'run npm run build first' }, () => {
  for (const script of scripts()) {
    assert.equal(script.runAt, 'document_start')
  }
})

test('registration spec points at files that were actually emitted', { skip: !built && 'run npm run build first' }, () => {
  for (const script of scripts()) {
    const files = [...(script.js as string[] ?? []), ...(script.css as string[] ?? [])]
    assert.ok(files.length > 0, 'nothing to inject')
    for (const f of files) {
      assert.ok(existsSync(`dist/${f}`), `registration points at missing file ${f}`)
    }
  }
})
