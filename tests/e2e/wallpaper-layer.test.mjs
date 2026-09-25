// WallpaperLayer on its own, in a real Chromium: the source modules are served with
// their types stripped, and each test drives the layer with a loader it controls - so
// races that depend on when storage answers can be set up exactly, not hoped for.
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { chromium } from 'playwright'

const ORIGIN = 'http://layer.test'

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0 }
  #window, #cover { position: relative; width: 640px; height: 360px; overflow: hidden }
  .df-wall { position: absolute; inset: 0; opacity: 0; transition: opacity 420ms ease }
  .df-wall.df-ready { opacity: 1 }
  .df-wall-fade { position: absolute; inset: 0 }
  .hidden { display: none }
</style></head><body>
<div id="window"><div class="df-wall-fade"></div></div>
<div id="cover"></div>
<script type="module">
  import { WallpaperLayer } from '/src/ui/wallpaper-layer.ts'
  import { DEFAULT_SETTINGS } from '/src/core/settings.ts'

  // Every blob: URL the layer makes, and which are still live.
  const live = new Set()
  const made = []
  const create = URL.createObjectURL.bind(URL)
  const revoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (b) => { const u = create(b); live.add(u); made.push(u); return u }
  URL.revokeObjectURL = (u) => { live.delete(u); revoke(u) }

  // A loader the test answers: each call waits until the test resolves it.
  const pending = []
  let auto = null
  const load = (ref) => {
    if (auto) return Promise.resolve(auto(ref))
    return new Promise((resolve) => pending.push({ ref, resolve }))
  }

  const layer = new WallpaperLayer({ window: document.getElementById('window'), cover: document.getElementById('cover') }, load)
  const upload = (id, kind = 'image', extra = {}) => ({
    ...DEFAULT_SETTINGS,
    wallpaper: { source: 'upload', presetId: '', uploadId: id, kind, name: id, width: 640, height: 360, average: '', vibrant: '' },
    ...extra,
  })
  const preset = (id, extra = {}) => ({
    ...DEFAULT_SETTINGS,
    wallpaper: { source: 'preset', presetId: id, uploadId: '', kind: 'gradient', name: id, width: 0, height: 0, average: '', vibrant: '' },
    ...extra,
  })
  window.t = {
    layer, live, made, pending, upload, preset,
    setAuto(fn) { auto = fn },
    walls: () => [...document.querySelectorAll('.df-wall')].map((el) => ({
      host: el.parentElement.id,
      ready: el.classList.contains('df-ready'),
      tag: el.tagName.toLowerCase(),
      bg: el.style.backgroundImage.slice(0, 40),
      preset: el.dataset.preset ?? '',
    })),
  }
  window.ready = true
</script>
</body></html>`

describe('wallpaper layer', () => {
  let browser
  before(async () => { browser = await chromium.launch({ headless: true }) })
  after(async () => { await browser?.close() })

  async function open({ csp = '' } = {}) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') {
        await route.fulfill({
          contentType: 'text/html',
          body: PAGE,
          headers: csp ? { 'Content-Security-Policy': csp } : {},
        })
      } else if (path.startsWith('/src/') && path.endsWith('.ts')) {
        const code = readFileSync(resolve(`.${path}`), 'utf8')
        await route.fulfill({ contentType: 'text/javascript', body: stripTypeScriptTypes(code, { mode: 'transform' }) })
      } else {
        await route.fulfill({ status: 404, body: '' })
      }
    })
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => window.ready === true)
    page.errors = errors
    return page
  }

  /** Solid-colour images drawn in the page, as data: URLs keyed by name. */
  async function images(page, specs) {
    return page.evaluate((specs) => {
      const out = {}
      for (const [name, color, type] of specs) {
        const c = document.createElement('canvas')
        c.width = 64
        c.height = 36
        const x = c.getContext('2d')
        x.fillStyle = color
        x.fillRect(0, 0, 64, 36)
        out[name] = c.toDataURL(type ?? 'image/png')
      }
      return out
    }, specs)
  }

  const record = (id, dataUrl, extra = {}) => ({
    id, name: id, mime: 'image/png', kind: 'image', dataUrl, posterUrl: '', width: 640, height: 360, bytes: 1, addedAt: 1, ...extra,
  })

  async function until(page, fn, arg, what) {
    await page.waitForFunction(fn, arg, { timeout: 5000 }).catch(() => { throw new Error(`timed out waiting for ${what}`) })
  }

  test('a second sync for the same wallpaper, while it loads, does not blank it', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00']])
    // The upload starts loading; a setting changes (text size) before storage answers.
    await page.evaluate(() => {
      void t.layer.sync(t.upload('up-a'), 'window', false)
      void t.layer.sync(t.upload('up-a', 'image', { fontSize: 26 }), 'window', false)
    })
    assert.equal(await page.evaluate(() => t.pending.length), 1, 'one load, not two')
    await page.evaluate((rec) => t.pending[0].resolve(rec), record('up-a', img.a))
    await until(page, () => t.walls().some((w) => w.ready && w.bg.startsWith('url("blob:')), null, 'the wallpaper to show')
    assert.equal((await page.evaluate(() => t.walls())).length, 1)
    assert.deepEqual(page.errors, [])
    await page.close()
  })

  test('a sync that lands mid-decode does not cancel it', async () => {
    const page = await open()
    // Big, noisy stills, so decoding takes long enough to land a sync in the middle of it.
    const img = await page.evaluate(() => {
      const draw = (hue) => {
        const c = document.createElement('canvas')
        c.width = 2400
        c.height = 1400
        const x = c.getContext('2d')
        const d = x.createImageData(c.width, c.height)
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i] = hue === 'blue' ? 0 : 200
          d.data[i + 1] = (i * 7919) % 97
          d.data[i + 2] = hue === 'blue' ? 200 : 0
          d.data[i + 3] = 255
        }
        x.putImageData(d, 0, 0)
        return c.toDataURL('image/png')
      }
      return { a: draw('red'), poster: draw('blue') }
    })
    await page.evaluate((recs) => t.setAuto((ref) => recs[ref.uploadId]), { 'up-a': record('up-a', img.a, { kind: 'animated', posterUrl: img.poster }) })
    for (const delay of [0, 2, 8, 20, 40]) {
      // Animation on, then off, then a text size change a moment later: the sequence
      // that left the page with no wallpaper at all.
      await page.evaluate(async (delay) => {
        await t.layer.sync(t.upload('up-a', 'animated'), 'window', false)
        void t.layer.sync(t.upload('up-a', 'animated', { wallpaperAnimate: false }), 'window', true)
        await new Promise((r) => setTimeout(r, delay))
        void t.layer.sync(t.upload('up-a', 'animated', { wallpaperAnimate: false, fontSize: 26 }), 'window', true)
      }, delay)
      // In the end, one wallpaper, ready - and it is the poster.
      await until(page, async () => {
        const walls = document.querySelectorAll('.df-wall')
        if (walls.length !== 1 || !walls[0].classList.contains('df-ready')) return false
        const url = /url\("([^"]+)"\)/.exec(walls[0].style.backgroundImage)?.[1]
        if (!url) return false
        const bmp = await createImageBitmap(await (await fetch(url)).blob())
        const c = new OffscreenCanvas(1, 1).getContext('2d')
        c.drawImage(bmp, 0, 0)
        return c.getImageData(0, 0, 1, 1).data[2] === 200
      }, null, `the poster, alone and ready (delay ${delay}ms)`)
      // And back to moving, for the next round.
      await page.evaluate(() => t.layer.sync(t.upload('up-a', 'animated'), 'window', false))
      await until(page, () => t.walls().length === 1 && t.walls()[0].ready, null, 'live again')
    }
    await page.close()
  })

  test('a newer wallpaper wins over one still loading', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00'], ['b', '#0c0']])
    await page.evaluate(() => {
      void t.layer.sync(t.upload('up-a'), 'window', false)
      void t.layer.sync(t.upload('up-b'), 'window', false)
    })
    // Storage answers in the wrong order.
    await page.evaluate(({ a, b }) => {
      t.pending[1].resolve(b)
      t.pending[0].resolve(a)
    }, { a: record('up-a', img.a), b: record('up-b', img.b) })
    await page.waitForTimeout(600)
    const walls = await page.evaluate(() => t.walls())
    assert.equal(walls.length, 1)
    assert.ok(walls[0].ready)
    // up-a's blob URL was made and dropped, never left live.
    assert.equal(await page.evaluate(() => t.live.size), 1)
    await page.close()
  })

  test('a change fades the new wallpaper in over the old, beneath the fade layer', async () => {
    const page = await open()
    await page.evaluate(() => t.layer.sync(t.preset('aurora'), 'window', false))
    await until(page, () => t.walls()[0]?.ready, null, 'first preset')
    await page.evaluate(() => t.layer.sync(t.preset('dusk'), 'window', false))
    const order = await page.evaluate(() => [...document.getElementById('window').children].map((el) => el.dataset.preset || el.className))
    assert.deepEqual(order, ['aurora', 'dusk', 'df-wall-fade'])
    // The newcomer starts transparent and fades, rather than popping in ready-made.
    const opacity = await page.evaluate(() => getComputedStyle(document.querySelector('[data-preset="dusk"]')).opacity)
    assert.ok(Number(opacity) < 1, `opacity ${opacity}`)
    await page.waitForTimeout(700)
    assert.deepEqual((await page.evaluate(() => t.walls())).map((w) => w.preset), ['dusk'])
    await page.close()
  })

  test('changing where it shows moves it without reloading', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00']])
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-a', img.a))
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls()[0]?.ready, null, 'window wallpaper')
    const made = await page.evaluate(() => t.made.length)
    await page.evaluate(() => t.layer.sync(t.upload('up-a', 'image', { wallpaperPlacement: 'cover' }), 'cover', false))
    const walls = await page.evaluate(() => t.walls())
    assert.deepEqual(walls.map((w) => w.host), ['cover'])
    assert.equal(await page.evaluate(() => t.made.length), made, 'no second decode')
    await page.close()
  })

  test('blob: URLs are revoked when their wallpaper leaves', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00'], ['b', '#0c0']])
    await page.evaluate((recs) => t.setAuto((ref) => recs[ref.uploadId]), { 'up-a': record('up-a', img.a), 'up-b': record('up-b', img.b) })
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls()[0]?.ready, null, 'a')
    await page.evaluate(() => t.layer.sync(t.upload('up-b'), 'window', false))
    await page.waitForTimeout(700)
    assert.equal(await page.evaluate(() => t.live.size), 1, 'only the one on screen')
    await page.evaluate(() => t.layer.sync(t.upload('up-b'), 'none', false))
    assert.equal(await page.evaluate(() => t.live.size), 0)
    assert.deepEqual(await page.evaluate(() => t.walls()), [])
    await page.close()
  })

  test('reload() shows new bytes stored under the same id', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00'], ['b', '#0c0']])
    await page.evaluate((a) => { window.current = a; t.setAuto(() => window.current) }, record('up-a', img.a))
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls()[0]?.ready, null, 'a')
    const first = await page.evaluate(() => t.made.at(-1))
    await page.evaluate((b) => { window.current = b; t.layer.reload() }, record('up-a', img.b))
    await until(page, (first) => t.made.at(-1) !== first && t.walls().length === 1 && t.walls()[0].ready, first, 'the new bytes')
    await page.close()
  })

  test('an upload that is gone clears the wallpaper', async () => {
    const page = await open()
    await page.evaluate(() => t.setAuto(() => null))
    await page.evaluate(() => t.layer.sync(t.preset('aurora'), 'window', false))
    await page.evaluate(() => t.layer.sync(t.upload('up-gone'), 'window', false))
    await page.waitForTimeout(100)
    assert.deepEqual(await page.evaluate(() => t.walls()), [])
    await page.close()
  })

  test('a page that refuses blob: images gets the wallpaper as data:', async () => {
    const page = await open({ csp: "img-src 'self' data:; media-src 'self' data:" })
    const img = await images(page, [['a', '#c00']])
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-a', img.a))
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls()[0]?.ready, null, 'the wallpaper')
    assert.match((await page.evaluate(() => t.walls()))[0].bg, /^url\("data:image\/png/)
    await page.close()
  })

  test('a real refusal of blob: switches a shown wallpaper to data:', async () => {
    // In a content script the decode check isn't bound by the page's policy, so it
    // passes - then the page refuses the CSS background. Make the check pass here the
    // same way, and let the page's policy do the refusing for real.
    const page = await open({ csp: "img-src 'self' data:" })
    const img = await images(page, [['a', '#c00']])
    await page.evaluate(() => {
      window.reports = []
      document.addEventListener('securitypolicyviolation', (e) => window.reports.push([e.blockedURI, e.effectiveDirective, e.isTrusted]))
      HTMLImageElement.prototype.decode = () => Promise.resolve()
    })
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-a', img.a))
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls().length === 1 && t.walls()[0].ready && t.walls()[0].bg.startsWith('url("data:'), null, 'data: wallpaper')
    const reports = await page.evaluate(() => window.reports)
    assert.ok(reports.some(([uri, directive, trusted]) => uri.startsWith('blob') && directive === 'img-src' && trusted), JSON.stringify(reports))
    assert.equal(await page.evaluate(() => t.live.size), 0, 'the refused blob: URL was let go')
    await page.close()
  })

  test('a made-up CSP report changes nothing', async () => {
    const page = await open()
    const img = await images(page, [['a', '#c00']])
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-a', img.a))
    await page.evaluate(() => t.layer.sync(t.upload('up-a'), 'window', false))
    await until(page, () => t.walls()[0]?.bg.startsWith('url("blob:'), null, 'blob wallpaper')
    // A report-only policy is not a refusal, and a page script can't fake one either.
    for (const disposition of ['report', 'enforce']) {
      await page.evaluate((disposition) => document.dispatchEvent(new SecurityPolicyViolationEvent('securitypolicyviolation', {
        blockedURI: 'blob', effectiveDirective: 'img-src', violatedDirective: 'img-src', originalPolicy: '',
        disposition, statusCode: 200,
      })), disposition)
    }
    await page.waitForTimeout(150)
    const walls = await page.evaluate(() => t.walls())
    assert.equal(walls.length, 1)
    assert.match(walls[0].bg, /^url\("blob:/)
    await page.close()
  })

  test('a video that cannot play shows its poster instead', async () => {
    const page = await open()
    const img = await images(page, [['poster', '#00c']])
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-v', 'data:video/mp4;base64,AAAAIGZ0eXBpc29t', {
      kind: 'video', mime: 'video/mp4', posterUrl: img.poster,
    }))
    await page.evaluate(() => t.layer.sync(t.upload('up-v', 'video'), 'window', false))
    await until(page, () => t.walls().length === 1 && t.walls()[0].tag === 'div' && t.walls()[0].ready, null, 'the poster')
    await page.close()
  })

  test('a video plays only while it can be seen', async () => {
    const page = await open()
    const video = await page.evaluate(async () => {
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
    await page.evaluate((rec) => t.setAuto(() => rec), record('up-v', video, { kind: 'video', mime: 'video/webm' }))
    await page.evaluate(() => t.layer.sync(t.upload('up-v', 'video', { wallpaperPlacement: 'cover' }), 'cover', false))
    await until(page, () => { const v = document.querySelector('video.df-wall'); return v && v.classList.contains('df-ready') && !v.paused }, null, 'playing')
    // Hidden - as the cover is on a watch page - it stops.
    await page.evaluate(() => document.getElementById('cover').classList.add('hidden'))
    await until(page, () => document.querySelector('video.df-wall').paused, null, 'paused while hidden')
    await page.evaluate(() => document.getElementById('cover').classList.remove('hidden'))
    await until(page, () => !document.querySelector('video.df-wall').paused, null, 'playing again')
    // "Play animation" off, and no poster: it holds still on its first frame.
    await page.evaluate(() => t.layer.sync(t.upload('up-v', 'video', { wallpaperPlacement: 'cover', wallpaperAnimate: false }), 'cover', true))
    await until(page, () => { const v = document.querySelector('video.df-wall[data-still]'); return v && v.classList.contains('df-ready') && v.paused }, null, 'held still')
    await page.waitForTimeout(600)
    assert.equal(await page.evaluate(() => document.querySelectorAll('video.df-wall').length), 1, 'the playing one has gone')
    await page.close()
  })
})
