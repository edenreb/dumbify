// The settings page, driven through the real built extension.
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { built, launch, tinyAnimatedGif, WALLPAPER_KEY } from './harness.mjs'

const skip = !built() && 'run `npm run build` first'
const V2 = { version: 2 }

/** A PNG drawn in the browser, returned as bytes. */
async function png(page, w, h) {
  const b64 = await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#1f6f8b')
    g.addColorStop(1, '#6d28d9')
    x.fillStyle = g
    x.fillRect(0, 0, w, h)
    return c.toDataURL('image/png').split(',')[1]
  }, { w, h })
  return Buffer.from(b64, 'base64')
}

/** A second of WebM video, recorded from a canvas in the browser. */
async function webm(page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 360
    const x = c.getContext('2d')
    const rec = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm;codecs=vp8' })
    const chunks = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    let t = 0
    const tick = setInterval(() => { x.fillStyle = `hsl(${(t++ * 25) % 360} 70% 50%)`; x.fillRect(0, 0, 640, 360) }, 50)
    rec.start(100)
    await new Promise((r) => setTimeout(r, 1200))
    const stopped = new Promise((r) => { rec.onstop = r })
    rec.stop()
    await stopped
    clearInterval(tick)
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
    return btoa(s)
  })
  return Buffer.from(b64, 'base64')
}

describe('settings page', { skip }, () => {
  let h
  before(async () => { h = await launch({ viewport: { width: 1440, height: 900 } }) })
  after(async () => { await h?.close() })
  beforeEach(async () => {
    for (const p of h.context.pages()) await p.close()
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.setSettings(V2)
  })

  const settings = () => h.getSettings()
  const upload = (o, name, mimeType, buffer) => o.locator('#wallpaper input[type="file"]').setInputFiles({ name, mimeType, buffer })

  test('every section is there, and a hash link opens on its section', async () => {
    const o = await h.options('#layout')
    for (const id of ['appearance', 'typography', 'wallpaper', 'layout', 'watch', 'shortcuts', 'backup', 'about']) {
      assert.equal(await o.locator(`section#${id}`).count(), 1, id)
    }
    await h.until(async () => (await o.locator('.nav-item.is-active').textContent()) === 'Layout', { what: 'Layout active' })
    await o.click('.nav-item[href="#wallpaper"]')
    await h.until(async () => (await o.locator('.nav-item.is-active').textContent()) === 'Wallpaper', { what: 'Wallpaper active' })
  })

  test('choosing a theme saves it, and the page itself wears it', async () => {
    const o = await h.options()
    await o.locator('.seg-opt', { hasText: 'Dark' }).first().click()
    await o.locator('.pick-card', { hasText: 'Nord' }).click()
    await h.until(async () => (await settings())?.darkTheme === 'nord' && (await settings())?.mode === 'dark', { what: 'nord saved' })
    await h.until(async () => (await o.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--df-bg').trim())) === '#2e3440', { what: 'page themed' })
  })

  test('accent: a preset swatch, then a custom colour', async () => {
    const o = await h.options()
    await o.locator('.swatch[title="Teal"], .swatch:has(.swatch-face[title="Teal"])').first().click()
    await h.until(async () => (await settings())?.accent === 'teal', { what: 'teal' })
    await o.locator('.swatch-custom input[type="color"]').evaluate((el) => {
      el.value = '#ff8800'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await h.until(async () => (await settings())?.accent === '#ff8800', { what: 'custom accent' })
  })

  test('fonts: a featured face and one from the list', async () => {
    const o = await h.options('#typography')
    await o.locator('.font-featured .pick-card', { hasText: 'Serif' }).click()
    await h.until(async () => (await settings())?.font === 'serif')
    await o.locator('.font-option', { hasText: 'Classic' }).click()
    await h.until(async () => (await settings())?.font === 'classic')
  })

  test('the live preview follows a slider mid-drag, before anything is saved', async () => {
    const o = await h.options('#typography')
    const frame = o.frameLocator('.preview-viewport iframe')
    await frame.locator('#dumbify-root .df-item-row').first().waitFor()
    const slider = o.locator('input[type="range"][aria-label="Text size"]')
    await slider.evaluate((el) => { el.value = '27'; el.dispatchEvent(new Event('input', { bubbles: true })) })
    const previewSize = () => frame.locator('#dumbify-root').evaluate((el) => getComputedStyle(el).getPropertyValue('--df-font-size').trim())
    await h.until(async () => (await previewSize()) === '27px', { what: 'preview to follow' })
    assert.notEqual((await settings()).fontSize, 27, 'not saved mid-drag')
    await slider.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })))
    await h.until(async () => (await settings())?.fontSize === 27, { what: 'saved on release' })
  })

  test('an animated GIF is stored as-is, with a still poster', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.wall-badges .badge-live')
    const rec = await h.getStored(WALLPAPER_KEY)
    assert.equal(rec.kind, 'animated')
    assert.equal(rec.mime, 'image/gif')
    assert.match(rec.dataUrl, /^data:image\/gif;base64,R0lGODlh/)
    assert.match(rec.posterUrl, /^data:image\/(webp|png|jpeg)/)
    const s = await settings()
    assert.equal(s.wallpaper.uploadId, rec.id)
    assert.equal(s.wallpaper.kind, 'animated')
    assert.match(s.wallpaper.average, /^#[0-9a-f]{6}$/)
    assert.equal(await o.locator('.row', { hasText: 'Play animation' }).isVisible(), true)
  })

  test('a still image is re-encoded smaller, and has no animation toggle', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'photo.png', 'image/png', await png(o, 1600, 900))
    await o.waitForSelector('.wall-badges .badge')
    const rec = await h.getStored(WALLPAPER_KEY)
    assert.equal(rec.kind, 'image')
    assert.equal(rec.mime, 'image/webp')
    assert.equal(rec.width, 1600)
    assert.equal(await o.locator('.row', { hasText: 'Play animation' }).isVisible(), false)
  })

  test('a tiny image is set to tile rather than refused', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'pattern.png', 'image/png', await png(o, 48, 48))
    await h.until(async () => (await settings())?.wallpaperFit === 'tile', { what: 'tile fit' })
    assert.match(await o.locator('.toast').textContent(), /tile/i)
  })

  test('something that is not an image is refused with a reason', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'notes.txt', 'text/plain', Buffer.from('definitely not a picture of anything'))
    await o.waitForSelector('.wall-error:not([hidden])')
    assert.match(await o.locator('.wall-error').textContent(), /JPG, PNG, WebP, GIF, MP4 or WebM/)
    assert.equal((await settings()).wallpaper?.source ?? 'none', 'none')
  })

  test('a video loop is accepted, with a poster, and cannot tile', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'loop.webm', 'video/webm', await webm(o))
    await o.waitForSelector('.wall-badges .badge-live', { timeout: 20000 })
    const rec = await h.getStored(WALLPAPER_KEY)
    assert.equal(rec.kind, 'video')
    assert.equal(rec.mime, 'video/webm')
    assert.match(rec.posterUrl, /^data:image\//)
    assert.equal(await o.locator('#wallpaper input[type="radio"][value="tile"]').isDisabled(), true)
  })

  test('dropping a file anywhere on the page uses it', async () => {
    const o = await h.options()
    const bytes = [...tinyAnimatedGif(400, 300)]
    await o.evaluate((arr) => {
      const file = new File([new Uint8Array(arr)], 'dropped.gif', { type: 'image/gif' })
      const dt = new DataTransfer()
      dt.items.add(file)
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, bytes)
    await h.until(async () => (await settings())?.wallpaper.name === 'dropped.gif', { what: 'dropped wallpaper' })
  })

  test('pasting an image uses it', async () => {
    const o = await h.options()
    const bytes = [...(await png(o, 800, 600))]
    await o.evaluate((arr) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(arr)], 'image.png', { type: 'image/png' }))
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, bytes)
    await h.until(async () => (await settings())?.wallpaper.source === 'upload', { what: 'pasted wallpaper' })
  })

  test('clicking the preview sets the focal point', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'photo.png', 'image/png', await png(o, 1600, 900))
    await o.waitForSelector('.wall-stage.can-focus')
    const box = await o.locator('.wall-stage').boundingBox()
    await o.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75)
    await h.until(async () => {
      const s = await settings()
      return Math.abs(s.wallpaperFocusX - 25) <= 1 && Math.abs(s.wallpaperFocusY - 75) <= 1
    }, { what: 'focal point' })
  })

  test('built-in wallpapers, None, and Remove', async () => {
    const o = await h.options('#wallpaper')
    await o.locator('.preset-grid .pick-card', { hasText: 'Aurora Live' }).click()
    await h.until(async () => (await settings())?.wallpaper.presetId === 'aurora-live')
    assert.equal((await settings()).wallpaper.kind, 'live')
    await o.locator('.preset-grid .pick-card', { hasText: 'None' }).click()
    await h.until(async () => (await settings())?.wallpaper.source === 'none')

    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.wall-badges .badge-live')
    await o.locator('#wallpaper button', { hasText: 'Remove' }).click()
    await h.until(async () => (await settings())?.wallpaper.source === 'none', { what: 'removed' })
    await h.until(async () => (await h.getStored(WALLPAPER_KEY)) === null, { what: 'bytes freed' })
  })

  test('export and import bring everything back, wallpaper included', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.wall-badges .badge-live')
    await h.patchSettings({ layout: 'table', darkTheme: 'dracula' })
    const before = await settings()

    const [download] = await Promise.all([o.waitForEvent('download'), o.locator('#backup button', { hasText: 'Export' }).click()])
    const file = readFileSync(await download.path(), 'utf8')
    assert.equal(JSON.parse(file).wallpaper.mime, 'image/gif')

    await h.sw.evaluate(() => chrome.storage.local.clear())
    await o.locator('#backup input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(file) })
    await o.locator('dialog.confirm button', { hasText: 'Import' }).click()
    await h.until(async () => (await settings())?.layout === 'table', { what: 'imported' })
    const after = await settings()
    assert.deepEqual(after, before)
    assert.equal((await h.getStored(WALLPAPER_KEY)).id, before.wallpaper.uploadId)
  })

  test('reset asks first, then restores defaults but keeps the switch', async () => {
    await h.patchSettings({ layout: 'cards', mode: 'dark', enabled: false })
    const o = await h.options('#backup')
    await o.locator('#backup button', { hasText: 'Reset' }).click()
    await o.locator('dialog.confirm button', { hasText: 'Cancel' }).click()
    assert.equal((await settings()).layout, 'cards')
    await o.locator('#backup button', { hasText: 'Reset' }).click()
    await o.locator('dialog.confirm .btn-danger-solid').click()
    await h.until(async () => (await settings())?.layout === 'list', { what: 'reset' })
    const s = await settings()
    assert.equal(s.mode, 'light')
    assert.equal(s.enabled, false)
  })

  test('the master switch turns the reading view off and back on', async () => {
    const o = await h.options()
    const registered = () => h.sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)
    await o.locator('.power [role="switch"]').click()
    await h.until(async () => (await registered()) === 0, { what: 'unregistered' })
    await o.waitForSelector('.off-banner:not([hidden])')
    await o.locator('.off-banner button', { hasText: 'Turn on' }).click()
    await h.until(async () => (await registered()) === 1, { what: 're-registered' })
    assert.equal(await o.locator('.off-banner').isHidden(), true)
  })
})
