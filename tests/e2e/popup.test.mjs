// The toolbar popup, driven through the real built extension.
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { built, launch } from './harness.mjs'

const skip = !built() && 'run `npm run build` first'
const V2 = { version: 2 }

describe('popup', { skip }, () => {
  let h
  before(async () => { h = await launch() })
  after(async () => { await h?.close() })
  beforeEach(async () => {
    for (const p of h.context.pages()) await p.close()
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.setSettings(V2)
  })

  test('wears the reader’s theme, with real switches', async () => {
    await h.setSettings({ ...V2, mode: 'dark', darkTheme: 'dracula' })
    const p = await h.popup()
    await h.until(async () => (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(40, 42, 54)', { what: 'dracula background' })
    const power = p.locator('.pop-header [role="switch"]')
    assert.equal(await power.getAttribute('aria-checked'), 'true')
    // Chrome's own extension-page stylesheet shrinks body text to 75%; ours must win.
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).fontSize), '13.5px')
  })

  test('appearance, theme, size and layout all save at once', async () => {
    const p = await h.popup()
    await p.locator('.seg-opt[title="Dark"]').click()
    await h.until(async () => (await h.getSettings())?.mode === 'dark')
    // The theme dots follow the mode: dark themes now.
    await p.locator('.theme-dot:has(input[aria-label="Midnight"])').click()
    await h.until(async () => (await h.getSettings())?.darkTheme === 'midnight')
    // The dots don't say which is which; the row does.
    await h.until(async () => (await p.locator('.pop-label-value').textContent()) === 'Midnight', { what: 'theme name' })
    await p.locator('button[aria-label="Larger text"]').click()
    await h.until(async () => (await h.getSettings())?.fontSize === 21)
    await p.locator('.seg-opt[title="Table"]').click()
    await h.until(async () => (await h.getSettings())?.layout === 'table')
    await p.locator('.seg-opt', { hasText: 'Serif' }).click()
    await h.until(async () => (await h.getSettings())?.font === 'serif')
  })

  test('off hides the controls and says what off means', async () => {
    const p = await h.popup()
    await p.locator('.pop-header [role="switch"]').click()
    await h.until(async () => (await h.getSettings())?.enabled === false)
    await p.waitForSelector('.pop-off:not([hidden])')
    assert.equal(await p.locator('.pop-body').isHidden(), true)
  })

  test('the wallpaper row offers a switch once there is a wallpaper', async () => {
    const p = await h.popup()
    assert.equal(await p.locator('.wall-mini .link-btn').isVisible(), true)
    await h.patchSettings({ wallpaper: { source: 'preset', presetId: 'dusk' } })
    const sw = p.locator('.wall-mini [role="switch"]')
    await sw.waitFor()
    assert.equal(await sw.getAttribute('aria-checked'), 'true')
    await sw.click()
    await h.until(async () => (await h.getSettings())?.wallpaperEnabled === false)
  })

  test('an uploaded wallpaper shows as its small thumbnail, never the file itself', async () => {
    const THUMB = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
    // Megabytes the popup has no business reading.
    const big = `data:image/gif;base64,${'R0lGODlh'.padEnd(4_000_000, 'A')}`
    await h.putUpload({
      id: 'up-big', name: 'huge.gif', mime: 'image/gif', kind: 'animated', dataUrl: big, posterUrl: '',
      width: 1920, height: 1080, bytes: 3_000_000, addedAt: 1,
    }, { thumbUrl: THUMB, average: '#336699' })
    await h.patchSettings({ wallpaper: { source: 'upload', uploadId: 'up-big', kind: 'animated', name: 'huge.gif', average: '#336699' } })
    // Note every storage read the popup makes.
    await h.context.addInitScript(() => {
      if (!globalThis.chrome?.storage?.local) return
      const local = chrome.storage.local
      const get = local.get.bind(local)
      globalThis.readKeys = []
      local.get = (keys, ...rest) => { globalThis.readKeys.push(keys); return get(keys, ...rest) }
    })
    const p = await h.popup()
    await p.waitForSelector('.wall-thumb[style*="UklGRiIAAAB"]')
    assert.equal(await p.locator('.wall-name').textContent(), 'huge.gif')
    const read = await p.evaluate(() => globalThis.readKeys.flat().map(String))
    assert.ok(read.length > 0, 'the spy saw the popup read settings')
    assert.deepEqual(read.filter((k) => k.startsWith('dumbify:upload:')), [], `read ${read.join(', ')}`)
  })
})
