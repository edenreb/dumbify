import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wantsNewTab } from '../src/core/links.ts'

const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 }

test('a plain left click belongs to the router', () => {
  assert.equal(wantsNewTab(plain), false)
})

// Each of these is a browser gesture for "open this somewhere else". Claiming any of
// them left the reader unable to open history or the sidebar in a new tab.
for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
  test(`${key}-click is the browser's, not ours`, () => {
    assert.equal(wantsNewTab({ ...plain, [key]: true }), true)
  })
}

test('middle click is the browser\'s, not ours', () => {
  assert.equal(wantsNewTab({ ...plain, button: 1 }), true)
})
