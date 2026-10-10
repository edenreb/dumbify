// Builds the Chrome Web Store / AMO listing images into store/:
//   npm run build && npm run store:shots
// Captures the extension at 2x, then frames each capture on a slide styled like the site.
// Store sizes: screenshots 1280x800, small promo tile 440x280, marquee 1400x560.
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch } from './harness.mjs'
import { LOOKS, lookPatch } from '../../src/core/looks.ts'
import { DEFAULT_SETTINGS } from '../../src/core/settings.ts'

const out = resolve(process.argv[2] ?? 'store')
mkdirSync(out, { recursive: true })
const settle = (page, ms = 1000) => page.waitForTimeout(ms)
const look = (id) => ({ ...DEFAULT_SETTINGS, ...lookPatch(LOOKS.find((l) => l.id === id), DEFAULT_SETTINGS) })
const ink = { ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'ink' }
const font = readFileSync('site/demo/fonts/inter-tight-400-latin.woff2').toString('base64')

const h = await launch({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const raw = {}
const grab = async (page, name, opts) => { raw[name] = `data:image/png;base64,${(await page.screenshot(opts)).toString('base64')}` }

const CSS = `
@font-face { font-family: 'Inter Tight'; font-weight: 400 600; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0 }
body { width: 100vw; height: 100vh; overflow: hidden; background: #000; color: #ededed;
  font-family: 'Inter Tight', system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  display: flex; flex-direction: column; align-items: center; }
body::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 50% at 50% 100%, rgb(255 255 255 / 0.09), transparent 70%); }
.copy { text-align: center; padding-top: 64px; z-index: 1 }
.tag { display: inline-block; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #8f8f8f;
  border: 1px solid rgb(255 255 255 / .14); border-radius: 99px; padding: 5px 12px; margin-bottom: 20px }
h1 { font-size: 52px; font-weight: 500; letter-spacing: -0.035em; line-height: 1.05 }
p { margin-top: 14px; font-size: 19px; color: #8f8f8f; letter-spacing: -0.01em }
.stage { position: relative; flex: 1; width: 100%; margin-top: 44px; z-index: 1 }
.win { position: absolute; border-radius: 14px; overflow: hidden; background: #111;
  border: 1px solid rgb(255 255 255 / .12);
  box-shadow: 0 40px 100px -20px rgb(0 0 0 / .9), 0 0 0 1px rgb(0 0 0 / .6) }
.win img { display: block; width: 100%; height: 100% ; object-fit: cover; object-position: top left }
`
// One browser-chrome-free window, cropped by the slide's bottom edge.
const win = (src, style) => `<div class="win" style="${style}"><img src="${raw[src]}"></div>`
const slide = ({ tag, title, sub, stage }) => `<style>${CSS}</style>
  <div class="copy">${tag ? `<span class="tag">${tag}</span><br>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
  <div class="stage">${stage}</div>`

try {
  // Captures
  let p = await h.youtube('/')
  await p.waitForSelector('.df-item-row:not(.df-skeleton)')
  for (const id of ['paper', 'aurora', 'terminal', 'sunset']) {
    await h.setSettings(look(id))
    await settle(p, 1200)
    await grab(p, id)
  }
  await p.close()

  await h.setSettings({ ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'graphite' })
  p = await h.youtube('/feed/history')
  await p.waitForSelector('.df-date-group')
  await settle(p)
  await grab(p, 'history')
  await p.close()

  p = await h.context.newPage()
  await p.goto(h.url('src/preview/index.html'))
  await p.waitForSelector('.df-item-row')
  await p.evaluate((settings) => window.postMessage({ type: 'dumbify:preview', settings, page: 'watch', video: 0 }, location.origin),
    { ...ink, watchLayout: 'split' })
  await settle(p, 800)
  await grab(p, 'watch')
  await p.close()

  await h.setSettings({ ...DEFAULT_SETTINGS, mode: 'dark', darkTheme: 'rose-pine', accent: 'pink' })
  const o = await h.options('#appearance')
  await o.waitForSelector('.looks')
  await settle(o)
  await grab(o, 'settings')
  await o.close()

  await h.setSettings(ink)
  const pop = await h.popup()
  await pop.setViewportSize({ width: 348, height: 100 }) // fullPage then fits the content
  await settle(pop, 600)
  await grab(pop, 'popup', { fullPage: true })
  await pop.close()

  // Slides
  const full = 'left: 50%; transform: translateX(-50%); top: 0; width: 1040px; height: 650px'
  const slides = {
    '1-hero': {
      tag: 'Dumbify 2.0', title: 'YouTube, without the noise.', sub: 'No thumbnails, no autoplay, no clutter. Just what you came for.',
      stage: win('paper', full),
    },
    '2-looks': {
      title: 'Make it yours.', sub: '19 themes, six ready-made looks, layouts, fonts and wallpapers.',
      stage: win('terminal', 'left: 60px; top: 70px; width: 620px; height: 388px; transform: rotate(-4deg); opacity: .85')
        + win('sunset', 'right: 60px; top: 70px; width: 620px; height: 388px; transform: rotate(4deg); opacity: .85')
        + win('aurora', 'left: 50%; transform: translateX(-50%); top: 20px; width: 820px; height: 513px'),
    },
    '3-watch': {
      title: 'Watch without the rabbit hole.', sub: 'Classic, theater or split. Nothing autoplays next.',
      stage: win('watch', full),
    },
    '4-settings': {
      title: 'Every detail, one page.', sub: 'A live preview shows each change as you make it.',
      stage: win('settings', full),
    },
    '5-popup': {
      title: 'One click away.', sub: 'Switch looks from the toolbar. Your history, grouped by day.',
      stage: win('history', 'left: 80px; top: 30px; width: 820px; height: 513px')
        + win('popup', 'right: 110px; top: 0; width: 348px; height: auto'),
    },
    '6-promise': {
      title: 'No trackers. No ads.<br>Free forever.', sub: 'Everything stays in your browser. No account, no server, nothing sent anywhere.',
      stage: win('paper', 'left: 50%; transform: translateX(-50%); top: 150px; width: 1040px; height: 650px; opacity: .35')
        + `<div style="position: absolute; left: 0; right: 0; top: 150px; height: 300px; background: linear-gradient(#000 0%, transparent 100%)"></div>
        <div class="cards">${[
          ['<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', 'No trackers', 'Zero analytics. No data collected, ever.'],
          ['<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 5l18 14"/>', 'No ads', 'Nothing to sell you, nothing in the way.'],
          ['<path d="M12 21s-7-4.4-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 6c-2.3 4.6-9.3 9-9.3 9z"/>', 'Free forever', 'Open source, GPL-3.0. No paywall.'],
        ].map(([icon, t, d]) => `<div class="card"><svg viewBox="0 0 24 24">${icon}</svg><b>${t}</b><span>${d}</span></div>`).join('')}</div>
        <style>
          h1 { font-size: 58px }
          .cards { position: absolute; left: 50%; transform: translateX(-50%); top: 40px; display: flex; gap: 20px }
          .card { width: 330px; padding: 30px; border-radius: 18px; background: rgb(20 20 20 / .85); backdrop-filter: blur(12px);
            border: 1px solid rgb(255 255 255 / .12); box-shadow: 0 30px 80px -20px #000; display: flex; flex-direction: column; gap: 8px }
          .card svg { width: 28px; height: 28px; fill: none; stroke: #ededed; stroke-width: 1.6; stroke-linecap: round; margin-bottom: 14px }
          .card b { font-size: 24px; font-weight: 500; letter-spacing: -0.02em }
          .card span { font-size: 16px; color: #8f8f8f; line-height: 1.45 }
        </style>`,
    },
  }

  const page = await h.context.newPage()
  const render = async (html, name, width, height) => {
    await page.setViewportSize({ width, height })
    await page.setContent(html)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(out, `${name}.png`), scale: 'css' })
    console.log('saved', name)
  }
  for (const [name, s] of Object.entries(slides)) await render(slide(s), name, 1280, 800)

  // Closing card: logo, links, credits. Store images aren't clickable, so links are plain text.
  await render(`<style>${CSS}
    body { justify-content: center }
    body::before { display: none }
    h1 { font-size: 64px }
    p { font-size: 20px; margin-top: 8px }
    .meta { position: absolute; bottom: 56px; display: flex; gap: 28px; font-size: 14px; color: #5f5f5f }
  </style>
  <h1>Dumbify</h1>
  <p>YouTube, reimagined.</p>
  <div class="meta"><span>edenrebello.me/dumbify</span><span>github.com/edenreb/dumbify</span><span>Eden Rebello &amp; Gabriel Tan</span></div>`,
  '7-credits', 1280, 800)

  // Promo tiles: no subtitle, smaller type.
  await render(slide({ title: 'YouTube, without<br>the noise.', stage: win('paper', 'left: 50%; transform: translateX(-50%); top: 0; width: 360px; height: 225px') })
    .replace('</style>', 'h1 { font-size: 26px } .copy { padding-top: 28px } .stage { margin-top: 22px } .win { border-radius: 8px }</style>'),
  'promo-small-440x280', 440, 280)
  await render(`<style>${CSS} body { flex-direction: row; justify-content: space-between } .copy { text-align: left; padding: 0 0 0 90px; align-self: center }
    .stage { margin: 0; flex: none; width: 720px; height: 100% }</style>
    <div class="copy"><span class="tag">Dumbify 2.0</span><h1>YouTube,<br>without the noise.</h1><p>Free and open source.</p></div>
    <div class="stage">${win('aurora', 'left: 0; top: 70px; width: 800px; height: 500px')}</div>`,
  'promo-marquee-1400x560', 1400, 560)

  console.log('page errors:', h.errors)
} finally {
  await h.close()
}
