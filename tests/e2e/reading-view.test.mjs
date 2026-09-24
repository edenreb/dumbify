// The reading view on (fixture) youtube.com, driven through the real built extension.
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { built, launch, uploadKey } from './harness.mjs'

const skip = !built() && 'run `npm run build` first'
const V2 = { version: 2 }

// A one-pixel-per-frame record is enough to drive the reading view's wallpaper layer.
const GIF_RECORD = {
  id: 'up-e2e-gif',
  name: 'loop.gif',
  mime: 'image/gif',
  kind: 'animated',
  // 1x1 GIFs, different colours - the layer only needs something decodable.
  dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  posterUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAA/wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  width: 1280,
  height: 720,
  bytes: 43,
  addedAt: 1,
}
const GIF_REF = { source: 'upload', uploadId: 'up-e2e-gif', kind: 'animated', name: 'loop.gif', width: 1280, height: 720, average: '#ff0000', vibrant: '#ee2222' }

describe('reading view', { skip }, () => {
  let h
  before(async () => { h = await launch() })
  after(async () => { await h?.close() })
  beforeEach(async () => {
    for (const p of h.context.pages()) await p.close()
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.setSettings(V2)
  })

  const rootAttr = (p, name) => p.evaluate((n) => document.getElementById('dumbify-root').getAttribute(`data-${n}`), name)
  const rootVar = (p, name) => p.evaluate((n) => getComputedStyle(document.getElementById('dumbify-root')).getPropertyValue(n).trim(), name)

  test('the home feed renders as a numbered list by default', async () => {
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-row:not(.df-skeleton)')
    assert.equal(await p.locator('#df-feed > .df-item-row').count(), 18)
    assert.equal(await rootAttr(p, 'layout'), 'list')
    // Numbers are a CSS counter: every row counts, and each one shows the counter.
    assert.equal(await p.locator('#df-feed > .df-item-row').first().evaluate((el) => getComputedStyle(el).counterIncrement), 'df-item 1')
    assert.match(await p.locator('.df-item-number').first().evaluate((el) => getComputedStyle(el, '::before').content), /counter\(df-item/)
    assert.match(await p.locator('.df-page-title').textContent(), /^Good (morning|afternoon|evening)$/)
    assert.deepEqual(h.errors, [])
  })

  test('the font family setting reaches titles, not just body text', async () => {
    // v1 hard-wired every title to Newsreader, so the Font setting barely showed.
    await h.setSettings({ ...V2, font: 'mono' })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-title')
    const family = await p.locator('.df-item-title').first().evaluate((el) => getComputedStyle(el).fontFamily)
    assert.match(family, /IBM Plex Mono/)
  })

  test('switching layout re-flows the page live, with no reload', async () => {
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-row:not(.df-skeleton)')
    await p.evaluate(() => { window.__sameDocument = true })
    await h.patchSettings({ layout: 'cards' })
    await h.until(async () => (await rootAttr(p, 'layout')) === 'cards', { what: 'cards layout' })
    assert.equal(await p.locator('#df-feed').evaluate((el) => getComputedStyle(el).display), 'grid')
    assert.equal(await p.locator('#df-feed .df-item-row').first().evaluate((el) => getComputedStyle(el).display), 'flex')

    await h.patchSettings({ layout: 'table' })
    await h.until(async () => (await rootAttr(p, 'layout')) === 'table', { what: 'table layout' })
    assert.equal(await p.locator('.df-table-head').evaluate((el) => getComputedStyle(el).display), 'grid')
    assert.equal(await p.evaluate(() => window.__sameDocument), true)
  })

  test('a theme colours the whole page, and dark readers never get a light first frame', async () => {
    await h.setSettings({ ...V2, mode: 'dark', darkTheme: 'mocha' })
    let p = await h.youtube('/')
    await h.until(async () => (await p.evaluate(() => getComputedStyle(document.getElementById('dumbify-root')).backgroundColor)) === 'rgb(30, 30, 46)', { what: 'mocha background' })
    await p.close()
    // Second load: the reading view is dark from the moment it exists - before the
    // (async) settings read has answered - because the last appearance is cached.
    p = await h.context.newPage()
    await p.addInitScript(() => {
      new MutationObserver((_, obs) => {
        const root = document.getElementById('dumbify-root')
        if (!root) return
        obs.disconnect()
        window.__firstFrame = { scheme: root.getAttribute('data-scheme'), bg: root.style.getPropertyValue('--df-bg') }
      }).observe(document, { childList: true, subtree: true })
    })
    await p.goto('https://www.youtube.com/')
    await p.waitForSelector('#dumbify-root')
    assert.deepEqual(await p.evaluate(() => window.__firstFrame), { scheme: 'dark', bg: '#1e1e2e' })
  })

  test('hidden properties disappear and the separators stay correct', async () => {
    await h.setSettings({ ...V2, showViews: false, showNumbers: false })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-row:not(.df-skeleton)')
    const row = p.locator('#df-feed > .df-item-row').first()
    assert.equal(await row.locator('.df-item-views').evaluate((el) => getComputedStyle(el).display), 'none')
    assert.equal(await row.locator('.df-item-number').evaluate((el) => getComputedStyle(el).display), 'none')
    // Views gone, so the date's separator now follows the channel directly.
    assert.equal(await row.locator('.df-item-date').evaluate((el) => getComputedStyle(el, '::before').content), '"·"')
    await h.patchSettings({ showChannel: false })
    await h.until(async () => (await rootAttr(p, 'hide')) === 'channel views')
    // Channel and views both hidden: the date is first and takes no separator.
    assert.equal(await row.locator('.df-item-date').evaluate((el) => getComputedStyle(el, '::before').content), 'none')
  })

  test('live streams say so in the length slot', async () => {
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-live')
    assert.equal((await p.locator('.df-item-live').first().textContent()).trim(), 'Live')
  })

  test('sidebar: icons-only rail, and hidden becomes a drawer', async () => {
    await h.setSettings({ ...V2, sidebar: 'rail' })
    const p = await h.youtube('/')
    await h.until(async () => (await p.locator('.df-sidebar').evaluate((el) => el.getBoundingClientRect().width)) < 80, { what: 'rail width' })
    assert.equal(await p.locator('.df-nav-link .df-nav-label').first().evaluate((el) => getComputedStyle(el).display), 'none')

    await h.patchSettings({ sidebar: 'hidden' })
    await h.until(async () => (await p.locator('.df-sidebar').evaluate((el) => el.getBoundingClientRect().right)) <= 0, { what: 'sidebar off screen' })
    await p.click('.df-drawer-btn')
    await h.until(async () => (await p.locator('.df-sidebar').evaluate((el) => el.getBoundingClientRect().left)) >= 0, { what: 'drawer open' })
    await p.keyboard.press('Escape')
    await h.until(async () => !(await p.evaluate(() => document.getElementById('dumbify-root').classList.contains('df-drawer-open'))), { what: 'drawer closed' })
  })

  test('keyboard: search, sidebar and dark mode shortcuts', async () => {
    const p = await h.youtube('/')
    await p.waitForSelector('.df-search-input')
    await p.keyboard.press('Control+k')
    assert.equal(await p.evaluate(() => document.activeElement?.className), 'df-search-input')
    await p.locator('.df-search-input').blur()

    await p.keyboard.press('Control+Shift+L')
    await h.until(async () => (await h.getSettings())?.mode === 'dark', { what: 'dark mode' })
    await h.until(async () => (await rootAttr(p, 'scheme')) === 'dark')

    await p.keyboard.press('Control+Backslash')
    await h.until(async () => (await h.getSettings())?.sidebar === 'hidden', { what: 'sidebar hidden' })
    // ...and back again, the way Notion's does.
    await p.keyboard.press('Control+Backslash')
    await h.until(async () => (await h.getSettings())?.sidebar === 'expanded', { what: 'sidebar back' })
  })

  // A real click, with hit-testing: the scrim once sat above the drawer and swallowed
  // every click on its links, which a geometry check alone never noticed.
  for (const [label, viewport, settings] of [
    ['hidden sidebar, wide window', { width: 1280, height: 860 }, { sidebar: 'hidden' }],
    ['narrow window', { width: 390, height: 800 }, {}],
    ['hidden sidebar over a wallpaper', { width: 1280, height: 860 }, { sidebar: 'hidden', wallpaper: { source: 'preset', presetId: 'aurora' }, surface: 'glass' }],
  ]) {
    test(`drawer links can be clicked: ${label}`, async () => {
      await h.setSettings({ ...V2, ...settings })
      const p = await h.context.newPage()
      await p.setViewportSize(viewport)
      await p.goto('https://www.youtube.com/')
      await p.waitForSelector('.df-drawer-btn')
      if (settings.sidebar) await p.waitForSelector(`#dumbify-root[data-sidebar="${settings.sidebar}"]`)
      const sidebar = p.locator('.df-sidebar')
      // Closed: out of sight and out of the tab order (once any slide-out has finished).
      await h.until(async () => (await sidebar.evaluate((el) => getComputedStyle(el).visibility)) === 'hidden', { what: 'drawer closed' })
      await p.click('.df-drawer-btn')
      await h.until(async () => (await sidebar.evaluate((el) => getComputedStyle(el).visibility)) === 'visible', { what: 'drawer open' })
      await Promise.all([
        p.waitForURL(/\/feed\/history/),
        p.locator('.df-sidebar .df-nav-link', { hasText: 'History' }).click({ timeout: 5000 }),
      ])
    })
  }

  test('closing the drawer with Escape hands focus back to the menu button', async () => {
    await h.setSettings({ ...V2, sidebar: 'hidden' })
    const p = await h.youtube('/', { waitFor: '.df-drawer-btn' })
    await p.click('.df-drawer-btn')
    await h.until(async () => (await p.evaluate(() => !!document.activeElement?.closest('.df-sidebar'))), { what: 'focus in drawer' })
    await p.keyboard.press('Escape')
    await h.until(async () => (await p.evaluate(() => document.activeElement?.classList.contains('df-drawer-btn'))), { what: 'focus back' })
    assert.equal(await p.locator('.df-drawer-btn').getAttribute('aria-expanded'), 'false')
  })

  test('Tab never walks into the closed drawer', async () => {
    await h.setSettings(V2)
    const p = await h.youtube('/')
    await p.setViewportSize({ width: 390, height: 800 })
    await p.waitForSelector('.df-drawer-btn')
    await h.until(async () => (await p.locator('.df-sidebar').evaluate((el) => getComputedStyle(el).visibility)) === 'hidden', { what: 'drawer closed' })
    await p.locator('.df-drawer-btn').focus()
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press('Shift+Tab')
      assert.equal(await p.evaluate(() => !!document.activeElement?.closest('.df-sidebar')), false, `step ${i}`)
    }
  })

  test('the sidebar dark mode switch follows changes made elsewhere', async () => {
    const p = await h.youtube('/')
    const sw = p.locator('.df-sidebar-foot [role="switch"]')
    assert.equal(await sw.getAttribute('aria-checked'), 'false')
    await h.patchSettings({ mode: 'dark' })
    await h.until(async () => (await sw.getAttribute('aria-checked')) === 'true', { what: 'switch to follow' })
  })

  test('view menu: style, size and layout apply at once', async () => {
    const p = await h.youtube('/')
    await p.click('.df-topbar [aria-label="View options"]')
    const menu = p.locator('.df-menu')
    await menu.waitFor()
    await menu.locator('[data-font="serif"]').click()
    await menu.locator('[aria-label="Larger text"]').click()
    await menu.locator('[role="radio"][aria-label="Cards"]').click()
    await h.until(async () => {
      const s = await h.getSettings()
      return s?.font === 'serif' && s?.fontSize === 21 && s?.layout === 'cards'
    }, { what: 'menu choices saved' })
    await h.until(async () => (await rootVar(p, '--df-font-size')) === '21px')
    await p.keyboard.press('Escape')
    assert.equal(await menu.count(), 0)
  })

  test('view menu: quick clicks on the size stepper are each a step', async () => {
    await h.setSettings({ ...V2, fontSize: 20 })
    const p = await h.youtube('/')
    await p.click('.df-topbar [aria-label="View options"]')
    const larger = p.locator('.df-menu [aria-label="Larger text"]')
    await larger.click()
    await larger.click()
    await larger.click()
    assert.equal(await p.locator('.df-stepper-value').textContent(), '23px', 'shown at once')
    await h.until(async () => (await h.getSettings())?.fontSize === 23, { what: 'three steps saved' })
    await h.until(async () => (await rootVar(p, '--df-font-size')) === '23px')
    assert.equal(await p.locator('.df-stepper-value').textContent(), '23px')
  })

  test('"All settings" opens one settings tab, reuses it, and leaves YouTube alone', async () => {
    const p = await h.youtube('/')
    const openSettings = async () => {
      await p.bringToFront()
      await p.click('.df-topbar [aria-label="View options"]')
      await p.locator('.df-menu-item', { hasText: 'All settings' }).click()
    }
    const settingsTabs = () => h.context.pages().filter((x) => x.url().includes('/src/options/index.html'))
    await openSettings()
    await h.until(() => settingsTabs().length === 1, { what: 'a settings tab' })
    await openSettings()
    await p.waitForTimeout(500)
    assert.equal(settingsTabs().length, 1, 'the open settings tab is reused')
    assert.equal(new URL(p.url()).hostname, 'www.youtube.com', 'the YouTube tab is untouched')
  })

  test('a channel name in a row goes to the channel; Ctrl-click opens it in a tab', async () => {
    const p = await h.youtube('/')
    await p.waitForSelector('.df-item-channel-link')
    const [tab] = await Promise.all([
      h.context.waitForEvent('page'),
      p.locator('.df-item-channel-link').first().click({ modifiers: ['Control'] }),
    ])
    await tab.waitForURL(/\/channel\/UC/)
    assert.equal(new URL(p.url()).pathname, '/')
    await Promise.all([p.waitForURL(/\/channel\/UC/), p.locator('.df-item-channel-link').first().click()])
  })

  test('history groups by day, counts each day, and bundles Shorts without numbering them', async () => {
    const p = await h.youtube('/feed/history')
    await p.waitForSelector('.df-date-group')
    assert.equal(await p.locator('.df-date-group').count(), 3)
    assert.match(await p.locator('.df-date-group-header').first().innerText(), /^Today\s+6$/)
    assert.equal(await p.locator('.df-date-group-header .df-group-count').first().textContent(), '6')
    const bundle = p.locator('.df-shorts-bundle')
    assert.equal(await bundle.count(), 1)
    assert.equal(await bundle.locator('.df-shorts-count').textContent(), '3 shorts')
    await bundle.locator('summary').click()
    assert.equal(await bundle.locator('.df-shorts-items > .df-item-row').count(), 3)
    // Shorts carry the mark instead of a number and do not advance the count.
    const increments = await p.locator('.df-date-group').first().locator('.df-item-row')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).counterIncrement))
    assert.deepEqual(increments, ['df-item 1', 'none', 'none', 'none', 'none', 'df-item 1', 'df-item 1'])
  })

  test('search shows the featured channel and other channels as cards', async () => {
    const p = await h.youtube('/results?search_query=joinery')
    await p.waitForSelector('.df-channel-banner')
    assert.match(await p.locator('.df-channel-banner .df-channel-card-name').textContent(), /Workshop Notes/)
    assert.equal(await p.locator('.df-channel-banner .df-verified').count(), 1)
    assert.equal(await p.locator('#df-feed .df-channel-card').count(), 1)
    assert.equal(await p.locator('.df-crumbs-label').textContent(), 'joinery')
  })

  test('watch page: split layout puts comments beside the video', async () => {
    await h.setSettings({ ...V2, watchLayout: 'split' })
    const p = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
    await p.waitForSelector('.df-watch-side .df-comments')
    const cols = await p.locator('.df-watch-layout').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    assert.equal(cols, 2)
    assert.equal(await p.locator('.df-watch-title').textContent(), 'The quiet genius of Japanese joinery')
    // No switch that could only empty the column; the video gets the room.
    assert.equal(await p.locator('.df-comments-btn').isVisible(), false)
    const video = await p.locator('.df-player').boundingBox()
    assert.ok(video.width >= 600, `video is ${video.width}px wide at 1280`)
  })

  test('watch page: widening a narrow window into split fills the side column', async () => {
    await h.setSettings({ ...V2, watchLayout: 'split' })
    const p = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
    await p.setViewportSize({ width: 900, height: 860 })
    await p.goto('https://www.youtube.com/watch?v=vid00000000')
    await p.waitForSelector('.df-watch-title')
    // Too narrow to sit side by side: the switch is there, and comments wait for it.
    await p.waitForSelector('.df-comments-btn', { state: 'visible' })
    assert.equal(await p.locator('.df-comments').count(), 0)
    await p.setViewportSize({ width: 1280, height: 860 })
    await p.waitForSelector('.df-watch-side .df-comments')
  })

  test('watch page: the description opens automatically when asked', async () => {
    await h.setSettings({ ...V2, autoDescription: true })
    const p = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
    await h.until(async () => p.locator('.df-watch-description').evaluate((el) => el.open), { what: 'description open' })
  })

  test('wallpaper: a built-in preset floats the panels over it', async () => {
    await h.setSettings({ ...V2, wallpaper: { source: 'preset', presetId: 'aurora' }, surface: 'glass', surfaceOpacity: 0.6 })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-backdrop .df-wall.df-ready')
    assert.equal(await rootAttr(p, 'wallpaper'), 'window')
    assert.equal(await rootAttr(p, 'surface'), 'glass')
    assert.match(await p.locator('.df-backdrop .df-wall').evaluate((el) => el.style.background), /radial-gradient/)
    assert.match(await p.locator('.df-sheet').evaluate((el) => getComputedStyle(el).backdropFilter), /blur/)
  })

  test('wallpaper: an animated GIF plays, and "Play animation" off swaps in its still poster', async () => {
    await h.putUpload(GIF_RECORD)
    await h.setSettings({ ...V2, wallpaper: GIF_REF })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-backdrop .df-wall.df-upload.df-ready')
    const decoded = async () => p.locator('.df-backdrop .df-wall.df-ready').last().evaluate(async (el) => {
      const url = /url\("([^"]+)"\)/.exec(el.style.backgroundImage)?.[1] ?? ''
      const blob = await (await fetch(url)).blob()
      return { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())].slice(13, 16) }
    })
    const live = await decoded()
    assert.equal(live.type, 'image/gif')
    assert.deepEqual(live.bytes, [255, 0, 0], 'the animated original is the one on screen')

    await h.patchSettings({ wallpaperAnimate: false })
    await h.until(async () => (await decoded()).bytes[2] === 255, { what: 'poster frame' })
  })

  test('wallpaper: a page cover, and switching it off without losing it', async () => {
    await h.setSettings({ ...V2, wallpaper: { source: 'preset', presetId: 'dusk' }, wallpaperPlacement: 'cover' })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-cover .df-wall')
    assert.ok((await p.locator('.df-cover').evaluate((el) => el.getBoundingClientRect().height)) > 100)
    await h.patchSettings({ wallpaperEnabled: false })
    await h.until(async () => (await rootAttr(p, 'wallpaper')) === 'none')
    assert.equal((await h.getSettings()).wallpaper.presetId, 'dusk')
  })

  test('wallpaper: changing settings while a wallpaper loads never blanks it', async () => {
    // A poster big enough that decoding it takes a moment, as a real one does.
    const o = await h.options()
    const poster = await o.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 2400
      c.height = 1400
      const x = c.getContext('2d')
      const d = x.createImageData(c.width, c.height)
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i + 1] = (i * 7919) % 97
        d.data[i + 2] = 200
        d.data[i + 3] = 255
      }
      x.putImageData(d, 0, 0)
      return c.toDataURL('image/png')
    })
    await o.close()
    await h.putUpload({ ...GIF_RECORD, posterUrl: poster })
    await h.setSettings({ ...V2, wallpaper: GIF_REF })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-backdrop .df-wall.df-upload.df-ready')
    // "Play animation" off, and the text size straight after - two writes back to back.
    await h.sw.evaluate(async (key) => {
      const { [key]: s } = await chrome.storage.local.get(key)
      await chrome.storage.local.set({ [key]: { ...s, wallpaperAnimate: false } })
      await chrome.storage.local.set({ [key]: { ...s, wallpaperAnimate: false, fontSize: 24 } })
    }, 'dumbify:settings')
    await h.until(async () => (await rootAttr(p, 'animate')) === 'off' &&
      (await p.evaluate(() => getComputedStyle(document.getElementById('dumbify-root')).getPropertyValue('--df-font-size').trim())) === '24px',
    { what: 'both settings applied' })
    // One wallpaper, ready - the poster - once the crossfade has settled.
    await h.until(async () => {
      const walls = await p.locator('.df-backdrop .df-wall').evaluateAll((els) => els.map((el) => el.classList.contains('df-ready')))
      return walls.length === 1 && walls[0]
    }, { what: 'the poster, alone and ready', timeout: 6000 })
  })

  test('wallpaper: a v1 image migrated while its tab is open stays on screen', async () => {
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.setSettings({
      enabled: true, fontSize: 20, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      fontColor: '#1d1d1d', fontColorDark: '#f3f0e8', backgroundImage: GIF_RECORD.posterUrl, bgOpacity: 0.85, theme: 'light',
    })
    const p = await h.youtube('/')
    await p.waitForSelector('.df-backdrop .df-wall.df-ready')
    // Watch for any moment with no ready wallpaper at all.
    await p.evaluate(() => {
      window.blank = 0
      const check = () => { if (!document.querySelector('.df-backdrop .df-wall.df-ready')) window.blank++ }
      new MutationObserver(check).observe(document.querySelector('.df-backdrop'), { subtree: true, childList: true, attributes: true })
    })
    // Any settings change from the settings page migrates: the image moves into the
    // gallery, the settings are rewritten without it, and the page makes a thumbnail.
    const o = await h.options('#layout')
    await o.locator('.layout-cards .pick-card', { hasText: 'Cards' }).click()
    await h.until(async () => (await h.getSettings())?.version === 2, { what: 'migrated' })
    await h.until(async () => (await h.getUploads())[0]?.thumbUrl, { what: 'thumbnail' })
    await h.until(async () => /^#[0-9a-f]{6}$/.test((await h.getSettings()).wallpaper.average), { what: 'colours' })
    await h.until(async () => (await rootAttr(p, 'layout')) === 'cards', { what: 'tab updated' })
    await p.waitForTimeout(600)
    assert.equal(await p.evaluate(() => window.blank), 0, 'the wallpaper never went away')
    assert.equal(await p.locator('.df-backdrop .df-wall.df-ready').count(), 1)
  })

  test('wallpaper: a site that refuses blob: images still shows it', async () => {
    await h.putUpload(GIF_RECORD)
    // A blue average, so a wallpaper that failed to load would show as blue, not red.
    await h.setSettings({ ...V2, wallpaper: { ...GIF_REF, average: '#0000ff' }, wallpaperFade: 0 })
    const p = await h.context.newPage()
    const refused = []
    p.on('console', (m) => { if (/Refused to load/.test(m.text())) refused.push(m.text()) })
    await p.goto('https://www.youtube.com/?csp=strict')
    await p.waitForSelector('.df-backdrop .df-wall.df-ready')
    await p.waitForTimeout(600)
    // The frame around the panels, where the wallpaper shows: red, from the GIF itself.
    const png = await p.screenshot({ clip: { x: 2, y: 400, width: 4, height: 4 } })
    const pixel = await p.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(1, 1).getContext('2d')
      c.drawImage(bmp, 0, 0)
      return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }, png.toString('base64'))
    assert.ok(pixel[0] > 200 && pixel[2] < 60, `wallpaper pixel ${pixel}`)
    assert.deepEqual(refused, [])
  })

  test('wallpaper: a video loop plays on a site that refuses blob: media', async () => {
    const o = await h.options()
    const video = await o.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 320
      c.height = 180
      const x = c.getContext('2d')
      const rec = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm;codecs=vp8' })
      const chunks = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      let n = 0
      const tick = setInterval(() => { x.fillStyle = `hsl(${(n++ * 30) % 360} 70% 50%)`; x.fillRect(0, 0, 320, 180) }, 50)
      rec.start(100)
      await new Promise((r) => setTimeout(r, 1000))
      const stopped = new Promise((r) => { rec.onstop = r })
      rec.stop()
      await stopped
      clearInterval(tick)
      const blob = new Blob(chunks, { type: 'video/webm' })
      return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })
    })
    await o.close()
    await h.putUpload({ ...GIF_RECORD, id: 'up-e2e-video', kind: 'video', mime: 'video/webm', dataUrl: video, posterUrl: GIF_RECORD.posterUrl })
    await h.setSettings({ ...V2, wallpaper: { ...GIF_REF, uploadId: 'up-e2e-video', kind: 'video' } })
    const p = await h.youtube('/?csp=strict')
    await h.until(async () => p.locator('.df-backdrop video.df-wall.df-ready').evaluate((v) => !v.paused && v.readyState >= 2), { what: 'video playing' })
  })

  test('panels: a dark tint under a light theme keeps the text readable', async () => {
    await h.setSettings({
      ...V2, mode: 'light', lightTheme: 'paper', wallpaper: { source: 'preset', presetId: 'aurora' },
      surface: 'solid', surfaceTint: '#1e2a44',
    })
    const p = await h.youtube('/')
    await p.waitForSelector('#dumbify-root[data-tone="dark"] .df-item-row')
    const [title, sheet] = await p.evaluate(() => [
      getComputedStyle(document.querySelector('.df-item-title')).color,
      getComputedStyle(document.querySelector('.df-sheet')).backgroundColor,
    ])
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => {
        const c = Number(v) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (lum(title) + 0.05) / (lum(sheet) + 0.05)
    assert.ok(ratio >= 7, `title ${title} on ${sheet} is ${ratio.toFixed(1)}:1`)
    // The top bar follows the panels rather than staying paper-cream over navy.
    const bar = await p.locator('.df-topbar').evaluate((el) => getComputedStyle(el).backgroundColor)
    assert.ok(lum(bar) < 0.1, `top bar ${bar}`)
  })

  test('panels: clear panels give text a glow against the picture', async () => {
    await h.setSettings({ ...V2, wallpaper: { source: 'preset', presetId: 'aurora' }, surface: 'clear' })
    const p = await h.youtube('/')
    await p.waitForSelector('#dumbify-root[data-surface="clear"] .df-item-row')
    const shadow = await p.locator('.df-item-title').first().evaluate((el) => getComputedStyle(el).textShadow)
    assert.match(shadow, /rgba?\(/)
    assert.ok(shadow.split('rgba').length >= 3, `a layered glow: ${shadow}`)
  })

  test('a v1 background image still shows before anything has migrated it', async () => {
    await h.sw.evaluate(() => chrome.storage.local.clear())
    await h.sw.evaluate((img) => chrome.storage.local.set({ 'dumbify:settings': {
      enabled: true, fontSize: 20, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      fontColor: '#1d1d1d', fontColorDark: '#f3f0e8', backgroundImage: img, bgOpacity: 0.85, theme: 'dark',
    } }), GIF_RECORD.dataUrl)
    const p = await h.youtube('/')
    await p.waitForSelector('.df-backdrop .df-wall.df-ready')
    assert.equal(await rootAttr(p, 'scheme'), 'dark')
  })
})

describe('reading view in another language', { skip }, () => {
  let h
  before(async () => { h = await launch({ locale: 'de-DE' }) })
  after(async () => { await h?.close() })

  test('dates and counts are written in English, like every other word', async () => {
    await h.setSettings(V2)
    const p = await h.youtube('/')
    const sub = await p.locator('.df-page-sub').first().textContent()
    assert.match(sub, /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2} · /)
    const w = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
    const meta = await w.locator('.df-watch-meta-bar').textContent()
    assert.doesNotMatch(meta, /Aufrufe|Jan\.|Okt\.|Dez\./)
  })
})

