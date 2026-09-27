// Captures the website's screenshots into site/shots, as WebP at 2x:
//   npm run build && npm run site:shots
// The looks come straight from src/core/looks.ts, so the pictures are the looks as shipped.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch } from './harness.mjs'
import { LOOKS, lookPatch } from '../../src/core/looks.ts'
import { DEFAULT_SETTINGS } from '../../src/core/settings.ts'

const out = resolve(process.argv[2] ?? 'site/shots')
mkdirSync(out, { recursive: true })
const settle = (page, ms = 800) => page.waitForTimeout(ms)
const withLook = (look) => ({ ...DEFAULT_SETTINGS, ...lookPatch(look, DEFAULT_SETTINGS) })
const ink = { ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'ink' }

const h = await launch({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
// Chromium already encodes WebP, so there is no image tool to install.
const encoder = await h.context.newPage()
async function save(page, name, opts = {}) {
  const png = await page.screenshot(opts)
  const webp = await encoder.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
    canvas.getContext('2d').drawImage(img, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
    const url = await new Promise((r) => {
      const reader = new FileReader()
      reader.onload = () => r(String(reader.result))
      reader.readAsDataURL(blob)
    })
    return url.slice(url.indexOf(',') + 1)
  }, png.toString('base64'))
  writeFileSync(join(out, `${name}.webp`), Buffer.from(webp, 'base64'))
  console.log('saved', name)
}

try {
  let p = await h.youtube('/')
  await p.waitForSelector('.df-item-row:not(.df-skeleton)')
  for (const look of LOOKS) {
    await h.setSettings(withLook(look))
    await settle(p, 1200)
    await save(p, `look-${look.id}`)
  }
  await p.close()

  await h.setSettings({ ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'graphite' })
  p = await h.youtube('/feed/history')
  await p.waitForSelector('.df-date-group')
  await settle(p)
  await save(p, 'history')
  await p.close()

  // The watch page from the preview, which has comments to show; the fixtures have none.
  p = await h.context.newPage()
  await p.goto(h.url('src/preview/index.html'))
  await p.waitForSelector('.df-item-row')
  for (const watchLayout of ['classic', 'theater', 'split']) {
    await p.evaluate((settings) => window.postMessage({ type: 'dumbify:preview', settings, page: 'watch', video: 0 }, location.origin),
      { ...ink, watchLayout })
    await settle(p, 600)
    await save(p, `watch-${watchLayout}`)
  }
  await p.close()

  await h.setSettings({ ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'rose-pine', accent: 'pink' })
  const o = await h.options('#appearance')
  await o.waitForSelector('.looks')
  await settle(o, 1000)
  await save(o, 'settings')
  await o.close()

  await h.setSettings(ink)
  const pop = await h.popup()
  await settle(pop, 600)
  await save(pop, 'popup', { fullPage: true })

  // The social card is the site's own hero, served straight from the working tree.
  await h.context.route('https://site.test/**', (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ path: resolve(`.${path.endsWith('/') ? `${path}index.html` : path}`) })
  })
  const og = await h.context.newPage()
  await og.setViewportSize({ width: 1200, height: 630 })
  await og.goto('https://site.test/')
  await og.addStyleTag({ content: '.nav-wrap { display: none } .hero-copy { padding-top: 64px } .demo, .stats { visibility: hidden }' })
  await settle(og, 1500)
  await og.screenshot({ path: join(out, 'og.jpg'), type: 'jpeg', quality: 88, scale: 'css' })
  console.log('saved og')

  console.log('page errors:', h.errors)
} finally {
  await h.close()
}
