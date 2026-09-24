// The settings page, driven through the real built extension.
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { built, launch, tinyAnimatedGif, uploadKey } from './harness.mjs'

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

  test('the live preview stays in view at every width, floating - and tuckable - when narrow', async () => {
    const o = await h.options('#typography')
    const viewport = o.locator('.app-preview .preview-viewport')
    for (const width of [1440, 1280, 1100, 1024, 900]) {
      await o.setViewportSize({ width, height: 860 })
      await o.evaluate(() => document.getElementById('layout').scrollIntoView())
      await o.waitForTimeout(150)
      const r = await viewport.boundingBox()
      assert.ok(r && r.y >= 58 && r.y + r.height <= 860 && r.height > 120, `${width}px: preview at ${JSON.stringify(r)}`)
    }
    // Icons only, with the names still there for screen readers and tooltips.
    const label = await o.locator('.nav-item .nav-label').first().boundingBox()
    assert.ok(label.width <= 1, 'section names hidden visually at 1024px')
    assert.equal(await o.locator('.nav-item').first().getAttribute('title'), 'Appearance')

    // Beside the settings, it covers none of them.
    const controls = await o.locator('#typography .row').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().right))
    const left = (await viewport.boundingBox()).x
    assert.ok(controls.every((right) => right <= left), 'no setting under the preview at 900px')

    // On a tablet it floats - tucked away until asked for, so it covers nothing either.
    await o.setViewportSize({ width: 800, height: 860 })
    const toggle = o.locator('.preview-toggle')
    await toggle.waitFor()
    assert.equal(await viewport.isVisible(), false)
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    await toggle.click()
    const r = await viewport.boundingBox()
    assert.ok(r && r.y + r.height <= 860 && r.x + r.width <= 800, `floating at ${JSON.stringify(r)}`)
    // Remembered next time.
    await o.reload()
    await o.waitForSelector('.app-body')
    assert.equal(await o.locator('.app-preview .preview-viewport').isVisible(), true)
    await o.locator('.preview-toggle').click()
    assert.equal(await o.locator('.app-preview .preview-viewport').isVisible(), false)
  })

  test('a look applies in one click, is marked while it holds, and undoes', async () => {
    const o = await h.options('#appearance')
    const paper = o.locator('.look', { hasText: 'Paper' })
    const terminal = o.locator('.look', { hasText: 'Terminal' })
    assert.equal(await paper.getAttribute('aria-pressed'), 'true', 'the defaults are the Paper look')
    await terminal.click()
    await h.until(async () => {
      const s = await settings()
      return s?.font === 'mono' && s.layout === 'table' && s.darkTheme === 'gruvbox' && s.mode === 'dark'
    }, { what: 'Terminal applied' })
    assert.equal(await terminal.getAttribute('aria-pressed'), 'true')
    assert.equal(await paper.getAttribute('aria-pressed'), 'false')
    // The preview wears it too.
    const frame = o.frameLocator('.preview-viewport iframe')
    await h.until(async () => (await frame.locator('#dumbify-root').getAttribute('data-layout')) === 'table', { what: 'preview' })

    await o.locator('.toast .toast-action', { hasText: 'Undo' }).click()
    await h.until(async () => {
      const s = await settings()
      return s?.font === 'sans' && s.layout === 'list' && s.mode === 'light'
    }, { what: 'undone' })
    assert.equal(await paper.getAttribute('aria-pressed'), 'true')
  })

  test('the Layout thumbnails keep their shapes - the Looks art can’t reach them', async () => {
    const o = await h.options('#layout')
    const tiles = await o.locator('.layout-art.la-cards i').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), height: r.height }
    }))
    assert.equal(tiles.length, 6)
    assert.equal(new Set(tiles.map((t) => t.top)).size, 2, 'two rows of three cards')
    assert.ok(tiles.every((t) => t.height > 24), `cards are ${tiles.map((t) => t.height).join(', ')}px tall`)
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
    const s = await settings()
    const rec = await h.getStored(uploadKey(s.wallpaper.uploadId))
    assert.equal(rec.kind, 'animated')
    assert.equal(rec.mime, 'image/gif')
    assert.match(rec.dataUrl, /^data:image\/gif;base64,R0lGODlh/)
    assert.match(rec.posterUrl, /^data:image\/(webp|png|jpeg)/)
    assert.equal(s.wallpaper.kind, 'animated')
    assert.match(s.wallpaper.average, /^#[0-9a-f]{6}$/)
    assert.equal(await o.locator('.row', { hasText: 'Play animation' }).isVisible(), true)
    // Filed in the gallery with a small thumbnail - the popup reads that, never the file.
    const [summary] = await h.getUploads()
    assert.equal(summary.id, rec.id)
    assert.match(summary.thumbUrl, /^data:image\/(webp|jpeg);base64,/)
    assert.ok(summary.thumbUrl.length < 30000, `thumbnail is ${summary.thumbUrl.length} chars`)
    await o.waitForSelector('.upload-tile .upload-art[style*="background-image"]')
    assert.equal(await o.locator('.upload-tile input').isChecked(), true)
    assert.equal(await o.locator('.upload-tile .live-dot').textContent(), 'GIF')
  })

  test('a still image is re-encoded smaller, and has no animation toggle', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'photo.png', 'image/png', await png(o, 1600, 900))
    await o.waitForSelector('.wall-badges .badge')
    const rec = await h.getStored(uploadKey((await settings()).wallpaper.uploadId))
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
    const rec = await h.getStored(uploadKey((await settings()).wallpaper.uploadId))
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

  test('built-in wallpapers and None leave your upload one click away', async () => {
    const o = await h.options('#wallpaper')
    await o.locator('.preset-grid .pick-card', { hasText: 'Aurora Live' }).click()
    await h.until(async () => (await settings())?.wallpaper.presetId === 'aurora-live')
    assert.equal((await settings()).wallpaper.kind, 'live')
    await o.locator('.preset-grid .pick-card', { hasText: 'None' }).click()
    await h.until(async () => (await settings())?.wallpaper.source === 'none')

    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.wall-badges .badge-live')
    const id = (await settings()).wallpaper.uploadId
    await o.locator('.preset-grid .pick-card', { hasText: 'Dusk' }).click()
    await h.until(async () => (await settings())?.wallpaper.presetId === 'dusk')
    // Still there, and one click brings it back.
    assert.equal(await o.locator('.upload-tile input').isChecked(), false)
    await o.locator('.upload-tile .pick-card').click()
    await h.until(async () => (await settings())?.wallpaper.uploadId === id, { what: 'upload chosen again' })
  })

  test('deleting an upload frees its bytes, and Undo brings it back', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.upload-tile')
    const id = (await settings()).wallpaper.uploadId
    await o.locator('.upload-tile').hover()
    await o.locator('.upload-tile .tile-delete').click()
    await h.until(async () => (await settings())?.wallpaper.source === 'none', { what: 'wallpaper gone with it' })
    await h.until(async () => (await h.getStored(uploadKey(id))) === null, { what: 'bytes freed' })
    assert.deepEqual(await h.getUploads(), [])
    await o.waitForSelector('.uploads', { state: 'hidden' })

    await o.locator('.toast .toast-action', { hasText: 'Undo' }).click()
    await h.until(async () => (await settings())?.wallpaper.uploadId === id, { what: 'restored as the wallpaper' })
    assert.equal((await h.getStored(uploadKey(id)))?.id, id)
    await o.waitForSelector('.upload-tile input:checked')
  })

  test('keyboard only: delete an upload, apply a look, and Ctrl+Z undoes each', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'loop.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await o.waitForSelector('.upload-tile')
    const id = (await settings()).wallpaper.uploadId
    await o.locator('.upload-tile .tile-delete').focus()
    await o.keyboard.press('Enter')
    await h.until(async () => (await h.getUploads()).length === 0, { what: 'deleted' })
    assert.equal(await o.locator('.toast .toast-action').getAttribute('aria-keyshortcuts'), 'Control+Z')
    await o.keyboard.press('Control+z')
    await h.until(async () => (await settings())?.wallpaper.uploadId === id, { what: 'restored' })
    await o.waitForSelector('.upload-tile')

    await o.locator('.look', { hasText: 'Library' }).focus()
    await o.keyboard.press('Enter')
    await h.until(async () => (await settings())?.font === 'serif', { what: 'look applied' })
    await o.keyboard.press('Control+z')
    await h.until(async () => (await settings())?.font === 'sans' && (await settings())?.wallpaper.uploadId === id, { what: 'look undone' })
  })

  test('Ctrl+Z does nothing behind an open dialog', async () => {
    const o = await h.options('#appearance')
    await o.locator('.look', { hasText: 'Terminal' }).click()
    await h.until(async () => (await settings())?.font === 'mono', { what: 'look applied' })
    await o.locator('#backup button', { hasText: 'Reset' }).click()
    await o.waitForSelector('dialog.confirm[open]')
    await o.keyboard.press('Control+z')
    await o.waitForTimeout(300)
    assert.equal((await settings()).font, 'mono', 'the look behind the dialog stays')
    await o.locator('dialog.confirm button', { hasText: 'Cancel' }).click()
    // Once it is closed, the offer still stands.
    await o.keyboard.press('Control+z')
    await h.until(async () => (await settings())?.font === 'sans', { what: 'undone after the dialog' })
  })

  test('deleting an upload that is not in use keeps the wallpaper', async () => {
    const o = await h.options('#wallpaper')
    await upload(o, 'first.gif', 'image/gif', tinyAnimatedGif(640, 360))
    await h.until(async () => (await h.getUploads()).length === 1)
    await upload(o, 'second.gif', 'image/gif', tinyAnimatedGif(480, 320))
    await h.until(async () => (await h.getUploads()).length === 2)
    const current = (await settings()).wallpaper.uploadId
    const tile = o.locator('.upload-tile', { hasText: 'first.gif' })
    await tile.hover()
    await tile.locator('.tile-delete').click()
    await h.until(async () => (await h.getUploads()).length === 1, { what: 'one left' })
    assert.equal((await settings()).wallpaper.uploadId, current)
    assert.equal(await o.locator('.upload-tile').count(), 1)
  })

  test('panels: solid, glass and clear - and a note when text has to change to stay readable', async () => {
    await h.setSettings({ ...V2, mode: 'light', lightTheme: 'paper', wallpaper: { source: 'preset', presetId: 'aurora' } })
    const o = await h.options('#wallpaper')
    const panels = o.locator('#wallpaper')
    const opacity = panels.locator('.row', { hasText: 'Opacity' })
    // Frosted glass is the default, and the only style with an opacity.
    assert.equal(await opacity.isVisible(), true)
    await panels.locator('.seg-opt', { hasText: 'Solid' }).click()
    await h.until(async () => (await settings())?.surface === 'solid')
    assert.equal(await opacity.isVisible(), false, 'solid is opaque')
    const note = panels.locator('.contrast-warning.is-info')
    assert.equal(await note.isVisible(), false)

    // A navy tint under a light theme: the text turns light, and the page says so.
    await panels.locator('.row', { hasText: 'Tint' }).locator('input[type="color"]').evaluate((el) => {
      el.value = '#1e2a44'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await h.until(async () => (await settings())?.surfaceTint === '#1e2a44', { what: 'tint saved' })
    await note.waitFor()
    assert.match(await note.textContent(), /light ink/)
    // The preview wears it too.
    const frame = o.frameLocator('.preview-viewport iframe')
    await h.until(async () => (await frame.locator('#dumbify-root').getAttribute('data-tone')) === 'dark', { what: 'preview on dark panels' })

    await panels.locator('.seg-opt', { hasText: 'Clear' }).click()
    await h.until(async () => (await settings())?.surface === 'clear')
    assert.match(await note.textContent(), /right on the wallpaper/)
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

    // A fresh browser, where Dumbify happens to be switched off.
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.setSettings({ version: 2, enabled: false })
    await o.reload()
    await o.locator('#backup input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(file) })
    await o.locator('dialog.confirm button', { hasText: 'Import' }).click()
    await h.until(async () => (await settings())?.layout === 'table', { what: 'imported' })
    const after = await settings()
    assert.equal(after.enabled, false, 'importing a look does not flip the switch')
    assert.deepEqual({ ...after, enabled: true }, before)
    assert.equal((await h.getStored(uploadKey(before.wallpaper.uploadId))).id, before.wallpaper.uploadId)
    // The backup carries no thumbnail; the page makes one for the gallery.
    await h.until(async () => (await h.getUploads())[0]?.thumbUrl?.startsWith('data:image/'), { what: 'thumbnail made' })
  })

  test('reset asks first, then restores defaults but keeps the switch and your uploads', async () => {
    await h.patchSettings({ layout: 'cards', mode: 'dark', enabled: false })
    await h.putUpload({
      id: 'up-kept', name: 'kept.gif', mime: 'image/gif', kind: 'animated',
      dataUrl: `data:image/gif;base64,${tinyAnimatedGif(320, 240).toString('base64')}`, posterUrl: '',
      width: 320, height: 240, bytes: 100, addedAt: 1,
    })
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
    assert.deepEqual((await h.getUploads()).map((u) => u.id), ['up-kept'])
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
