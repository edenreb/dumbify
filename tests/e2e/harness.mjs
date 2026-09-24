// Loads the built extension into a real Chromium and serves youtube.com from fixtures.
//
//   npm run build && npm run test:e2e
//
// Uses the Chromium that Playwright installs (`npx playwright install chromium`), run
// headless with extension support.

import { chromium } from 'playwright'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fixtureFor } from './fixtures.mjs'

export const DIST = resolve('dist')
export const SETTINGS_KEY = 'dumbify:settings'
export const UPLOADS_KEY = 'dumbify:uploads'
export const uploadKey = (id) => `dumbify:upload:${id}`

export function built() {
  return existsSync(join(DIST, 'manifest.json'))
}

async function until(check, { timeout = 10000, interval = 50, what = 'condition' } = {}) {
  const end = Date.now() + timeout
  for (;;) {
    try {
      if (await check()) return
    } catch { /* not yet */ }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, interval))
  }
}

export async function launch({ colorScheme = 'light', reducedMotion = 'no-preference', viewport = { width: 1280, height: 860 }, locale = 'en-US' } = {}) {
  if (!built()) throw new Error('Run `npm run build` before the end-to-end tests')
  const userDir = mkdtempSync(join(tmpdir(), 'dumbify-e2e-'))
  const context = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    viewport,
    colorScheme,
    reducedMotion,
    locale,
  })
  const errors = []
  context.on('weberror', (e) => errors.push(String(e.error())))
  // Nothing reaches the network: youtube.com comes from fixtures, everything else fails.
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url()
    if (/^https:\/\/www\.youtube\.com\//.test(url)) {
      const f = fixtureFor(url)
      await route.fulfill({ status: f.status, contentType: f.contentType, body: f.body, headers: f.headers })
    } else {
      await route.abort()
    }
  })

  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const id = new URL(sw.url()).host
  // The reading view is registered at runtime; pages opened before that inject nothing.
  await until(async () => (await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length > 0,
    { what: 'content script registration' })

  const api = {
    context,
    sw,
    id,
    errors,
    url: (path) => `chrome-extension://${id}/${path}`,
    until,
    async setSettings(settings) {
      await sw.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [SETTINGS_KEY, settings])
    },
    async patchSettings(patch) {
      await sw.evaluate(([k, p]) => new Promise((resolve) => chrome.storage.local.get(k, (res) => {
        chrome.storage.local.set({ [k]: { version: 2, ...(res[k] ?? {}), ...p } }, resolve)
      })), [SETTINGS_KEY, patch])
    },
    async getSettings() {
      return sw.evaluate((k) => new Promise((resolve) => chrome.storage.local.get(k, (res) => resolve(res[k] ?? null))), SETTINGS_KEY)
    },
    async getStored(key) {
      return sw.evaluate((k) => new Promise((resolve) => chrome.storage.local.get(k, (res) => resolve(res[k] ?? null))), key)
    },
    async setStored(key, value) {
      await sw.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [key, value])
    },
    /** Files a wallpaper in the gallery the way the settings page does: bytes, then the list. */
    async putUpload(record, summary = {}) {
      await sw.evaluate(async ([rec, extra, listKey, key]) => {
        await chrome.storage.local.set({ [key]: rec })
        const res = await chrome.storage.local.get(listKey)
        const list = (res[listKey] ?? []).filter((u) => u.id !== rec.id)
        list.unshift({
          id: rec.id, name: rec.name, kind: rec.kind, mime: rec.mime, width: rec.width, height: rec.height,
          bytes: rec.bytes, addedAt: rec.addedAt, thumbUrl: '', average: '', vibrant: '', ...extra,
        })
        await chrome.storage.local.set({ [listKey]: list })
      }, [record, summary, UPLOADS_KEY, uploadKey(record.id)])
    },
    async getUploads() {
      return (await api.getStored(UPLOADS_KEY)) ?? []
    },
    /** Opens a youtube.com path and waits for the reading view to render. */
    async youtube(path = '/', { waitFor = '#dumbify-root .df-sidebar .df-nav-link' } = {}) {
      const page = await context.newPage()
      await page.goto(`https://www.youtube.com${path}`)
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 })
      return page
    },
    async options(hash = '') {
      const page = await context.newPage()
      await page.goto(api.url(`src/options/index.html${hash}`))
      await page.waitForSelector('.app-body', { timeout: 15000 })
      return page
    },
    async popup() {
      const page = await context.newPage()
      await page.setViewportSize({ width: 348, height: 600 })
      await page.goto(api.url('src/popup/index.html'))
      await page.waitForSelector('.pop-header', { timeout: 15000 })
      return page
    },
    async close() {
      await context.close()
      rmSync(userDir, { recursive: true, force: true })
    },
  }
  return api
}

/** A structurally valid two-frame GIF, `w`x`h`, solid colours - enough to be "animated". */
export function tinyAnimatedGif(w = 320, h = 240) {
  const out = [...Buffer.from('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0x80, 0, 0,
    0xd0, 0x5a, 0x3a, 0x2a, 0x6f, 0xd8]
  out.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0)
  for (const index of [0, 1]) {
    out.push(0x21, 0xf9, 4, 0, 20, 0, 0, 0)
    out.push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0)
    // LZW: min code size 2, clear code then every pixel `index`, then end - built as
    // a minimal valid stream using clear codes every few pixels to stay at 3-bit codes.
    const pixels = w * h
    const codes = []
    const clear = 4
    const end = 5
    for (let p = 0; p < pixels; p++) {
      if (p % 2 === 0) codes.push(clear)
      codes.push(index)
    }
    codes.push(end)
    const bytes = []
    let acc = 0
    let bits = 0
    for (const c of codes) {
      acc |= c << bits
      bits += 3
      while (bits >= 8) {
        bytes.push(acc & 255)
        acc >>= 8
        bits -= 8
      }
    }
    if (bits > 0) bytes.push(acc & 255)
    out.push(2)
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.slice(i, i + 255)
      out.push(chunk.length, ...chunk)
    }
    out.push(0)
  }
  out.push(0x3b)
  return Buffer.from(out)
}
