// The reading view on (fixture) youtube.com, driven through the real built extension.
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { built, launch, WALLPAPER_KEY } from './harness.mjs'

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
    await h.setStored(WALLPAPER_KEY, GIF_RECORD)
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
