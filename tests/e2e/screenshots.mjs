// Captures the main screens for review:  node tests/e2e/screenshots.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch, tinyAnimatedGif } from './harness.mjs'

const out = resolve(process.argv[2] ?? 'screenshots')
mkdirSync(out, { recursive: true })
const shot = (page, name, opts = {}) => page.screenshot({ path: join(out, `${name}.png`), ...opts })
const settle = (page, ms = 700) => page.waitForTimeout(ms)

const base = { version: 2 }
const h = await launch()
try {
  // Reading view: list (default)
  let p = await h.youtube('/')
  await p.waitForSelector('.df-item-row:not(.df-skeleton)')
  await settle(p)
  await shot(p, '01-home-list-paper')

  await h.setSettings({ ...base, layout: 'cards' })
  await settle(p)
  await shot(p, '02-home-cards-paper')

  await h.setSettings({ ...base, layout: 'table', mode: 'dark', darkTheme: 'graphite', accent: 'blue' })
  await settle(p)
  await shot(p, '03-home-table-graphite')

  await h.setSettings({ ...base, mode: 'dark', darkTheme: 'mocha', font: 'serif', sidebar: 'rail' })
  await settle(p)
  await shot(p, '04-home-mocha-serif-rail')

  await h.setSettings({ ...base, mode: 'light', lightTheme: 'snow', wallpaper: { source: 'preset', presetId: 'aurora' }, surface: 'glass', surfaceOpacity: 0.72 })
  await settle(p, 900)
  await shot(p, '05-home-snow-aurora-glass')

  await h.setSettings({ ...base, mode: 'light', lightTheme: 'sepia', wallpaper: { source: 'preset', presetId: 'meadow' }, wallpaperPlacement: 'cover', layout: 'cards' })
  await settle(p, 900)
  await shot(p, '06-home-sepia-cover-cards')

  // View menu
  await h.setSettings({ ...base })
  await settle(p)
  await p.click('.df-topbar .df-popover-anchor .df-icon-btn')
  await settle(p, 300)
  await shot(p, '07-view-menu')
  await p.close()

  // History with date groups and a Shorts bundle
  p = await h.youtube('/feed/history')
  await p.waitForSelector('.df-date-group')
  await p.click('.df-shorts-summary')
  await settle(p)
  await shot(p, '08-history')
  await p.close()

  // Watch page, split
  await h.setSettings({ ...base, watchLayout: 'split', mode: 'dark', darkTheme: 'ink' })
  p = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
  await settle(p, 3800)
  await shot(p, '09-watch-split-ink')
  await p.close()

  await h.setSettings({ ...base, watchLayout: 'classic', autoDescription: true })
  p = await h.youtube('/watch?v=vid00000000', { waitFor: '.df-watch-title' })
  await settle(p, 3800)
  await shot(p, '10-watch-classic-paper')
  await p.close()

  // Animated GIF wallpaper through the real upload path
  await h.setSettings({ ...base })
  const o = await h.options('#wallpaper')
  await o.setViewportSize({ width: 1440, height: 900 })
  const input = o.locator('#wallpaper input[type="file"]')
  await input.setInputFiles({ name: 'loop.gif', mimeType: 'image/gif', buffer: tinyAnimatedGif(640, 360) })
  await o.waitForSelector('.wall-badges .badge-live', { timeout: 15000 })
  await settle(o, 800)
  await shot(o, '11-options-wallpaper-gif')
  await o.evaluate(() => window.scrollTo(0, 0))
  await o.goto(h.url('src/options/index.html'))
  await o.waitForSelector('.app-body')
  await settle(o, 900)
  await shot(o, '12-options-top')
  await shot(o, '13-options-full', { fullPage: true })

  p = await h.youtube('/')
  await settle(p, 1200)
  await shot(p, '14-home-gif-wallpaper')
  await p.close()

  await h.setSettings({ ...base, mode: 'dark', darkTheme: 'rose-pine', accent: 'pink' })
  await o.goto(h.url('src/options/index.html#appearance'))
  await o.waitForSelector('.app-body')
  await settle(o, 900)
  await shot(o, '15-options-dark-rosepine')

  const pop = await h.popup()
  await settle(pop, 500)
  await shot(pop, '16-popup-dark', { fullPage: true })
  await h.setSettings({ ...base })
  await settle(pop, 500)
  await shot(pop, '17-popup-light', { fullPage: true })

  // Tinted and clear panels (issue #52): text follows what it sits on.
  await h.setSettings({ ...base, mode: 'light', lightTheme: 'paper', wallpaper: { source: 'preset', presetId: 'dusk' }, surface: 'solid', surfaceTint: '#1e2a44' })
  p = await h.youtube('/')
  await settle(p, 900)
  await shot(p, '18-home-paper-navy-tint')
  await h.setSettings({ ...base, mode: 'light', lightTheme: 'paper', wallpaper: { source: 'preset', presetId: 'aurora' }, surface: 'clear' })
  await settle(p, 900)
  await shot(p, '19-home-clear-aurora')
  await p.close()

  // Looks, and the uploads gallery
  await h.setSettings({ ...base })
  await o.setViewportSize({ width: 1440, height: 900 })
  await o.goto(h.url('src/options/index.html#appearance'))
  await o.waitForSelector('.looks')
  await settle(o, 900)
  await shot(o, '20-options-looks')
  await input.setInputFiles({ name: 'second.gif', mimeType: 'image/gif', buffer: tinyAnimatedGif(480, 320) })
  await o.goto(h.url('src/options/index.html#wallpaper'))
  await o.waitForSelector('.upload-tile')
  await settle(o, 900)
  await shot(o, '21-options-uploads')

  // Narrow settings: the floating preview
  await o.setViewportSize({ width: 900, height: 860 })
  await o.goto(h.url('src/options/index.html#typography'))
  await o.waitForSelector('.app-body')
  await settle(o, 900)
  await shot(o, '22-options-900')

  console.log('page errors:', h.errors)
} finally {
  await h.close()
}
