// Dumbify's site: the live demo's divider and dock, the YouTube it is compared with, the
// ASCII fields behind the hero and the close, and the reveal on scroll.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---- YouTube, as shipped: the busy half of the demo. Stand-ins, no real channels. ---- */

const CARDS = [
  { ad: true, t: 'Learn anything', g: '135deg, #00c6ff, #0072ff', title: 'Learn Anything in 30 Days. Guaranteed.', ch: 'Sponsored', a: '#0072ff' },
  { t: 'I tried it', g: '135deg, #ff0f57, #ff9b1a', d: '18:42', title: 'I Tried Every Productivity App So You Don’t Have To', ch: 'Hustle Daily', meta: '2.1M views · 2 days ago', a: '#ff7a18', p: 62, fx: 'ring' },
  { t: 'Don’t buy', g: '135deg, #1fa2ff, #7b2ff7', d: '12:07', title: 'Do NOT Buy This Until You Watch (Honest Review)', ch: 'Gadget Grind', meta: '846K views · 5 hours ago', a: '#7b2ff7', fx: 'arrow' },
  { t: 'Live', g: '135deg, #ff512f, #dd2476', d: 'LIVE', title: 'LIVE: Answering Your Comments All Night', ch: 'Stream Team', meta: '12K watching', a: '#dd2476' },
  { t: '$1 vs $1000', g: '135deg, #11998e, #38ef7d', d: '16:44', title: '$1 vs $1,000 Headphones: Can You Tell?', ch: 'Budget Beast', meta: '7.8M views · 2 weeks ago', a: '#11998e', fx: 'ring' },
  { t: '24 hrs', g: '135deg, #f7ff00, #db36a4', d: '21:30', title: '24 Hours Eating Only Gas Station Food', ch: 'Challenge Club', meta: '5.4M views · 1 week ago', a: '#db36a4', p: 30 },
  { t: 'Secret!', g: '135deg, #f12711, #f5af19', d: '11:11', title: 'Nobody Talks About This One Setting', ch: 'Settings Guy', meta: '412K views · 6 days ago', a: '#f12711', fx: 'arrow' },
  { t: 'It’s over', g: '135deg, #8e2de2, #4a00e0', d: '9:58', title: 'This Changes Everything…', ch: 'Tech Tea', meta: '1.1M views · 3 days ago', a: '#8e2de2' },
]
const SHORTS = [
  { t: 'POV', g: '160deg, #ff9966, #ff5e62', title: 'POV: you opened the app for one video', meta: '3.2M views' },
  { t: 'Wait', g: '160deg, #56ccf2, #2f80ed', title: 'wait for it…', meta: '18M views' },
  { t: '99%', g: '160deg, #f953c6, #b91d73', title: '99% of people fail this', meta: '870K views' },
  { t: 'Part 7', g: '160deg, #43e97b, #38f9d7', title: 'part 7 (link in bio)', meta: '2.4M views' },
  { t: 'No way', g: '160deg, #fa709a, #fee140', title: 'no way this is real', meta: '5.1M views' },
]
const NEXT = { t: 'Omg', g: '135deg, #ff416c, #ff4b2b', title: 'You Won’t Believe What Happens Next' }
const SIDE = ['Home', 'Shorts', 'Subscriptions', '-', 'You', 'History', 'Playlists', 'Watch later', 'Liked videos', '-', 'Trending', 'Music', 'Gaming', 'News', 'Sports']
const CHIPS = ['All', 'Music', 'Gaming', 'Live', 'Mixes', 'News', 'Podcasts', 'Cooking', 'Recently uploaded', 'Watched', 'New to you']

const thumb = (v) => `<div class="tube-thumb ${v.fx ?? ''}" style="--g: ${v.g}"><strong>${v.t}</strong>${
  v.d ? `<span class="tube-dur${v.d === 'LIVE' ? ' live' : ''}">${v.d}</span>` : ''}${
  v.p ? `<span class="tube-bar" style="--p: ${v.p}%"></span>` : ''}</div>`
const card = (v) => `<div>${thumb(v)}<div class="tube-meta"><span class="tube-av" style="--a: ${v.a}"></span><div><b>${v.title}</b>${
  v.ad ? '<small><i>Ad</i>Sponsored</small><span class="tube-install">Install</span>' : `<small>${v.ch}</small><small>${v.meta}</small>`}</div></div></div>`
const short = (v) => `<div>${thumb(v)}<b>${v.title}</b><small>${v.meta}</small></div>`

const tube = document.querySelector('.tube')
tube.innerHTML = `
  <div class="tube-top"><span class="tube-burger"></span><span class="tube-logo"></span><span class="tube-search">Search</span><span class="tube-mic"></span><span class="tube-create">+ Create</span><span class="tube-bell"><b>9+</b></span><span class="tube-me"></span></div>
  <div class="tube-body">
    <div class="tube-side">${SIDE.map((s) => (s === '-' ? '<hr>' : `<span${s === 'Home' ? ' class="on"' : ''}>${s}</span>`)).join('')}</div>
    <div class="tube-main">
      <div class="tube-chips">${CHIPS.map((c, i) => `<span${i ? '' : ' class="on"'}>${c}</span>`).join('')}</div>
      <div class="tube-grid">${CARDS.slice(0, 4).map(card).join('')}</div>
      <div class="tube-shorts"><h4>Shorts</h4><div>${SHORTS.map(short).join('')}</div></div>
      <div class="tube-grid">${CARDS.slice(4).map(card).join('')}</div>
    </div>
  </div>
  <div class="tube-next">${thumb(NEXT)}<div><small>Up next in 5</small><b>${NEXT.title}</b></div></div>`

/* ---- The live demo: laid out at desktop size and scaled to fit ---- */

const stage = document.querySelector('.stage')
const inner = stage.querySelector('.stage-inner')
const frame = stage.querySelector('.demo-frame')
const handle = stage.querySelector('.split-handle')
const power = document.querySelector('.ext')
const dock = document.querySelector('.dock')

// Below about 1000px the frame stops shrinking and lays out narrower instead, so a phone
// sees the reading view's own phone layout rather than a postage stamp of the desktop.
function fit() {
  const w = stage.clientWidth
  const scale = Math.min(1, Math.max(w / 1280, 0.8))
  const dw = w / scale
  const dh = dw >= 700 ? dw * 0.625 : dw * 1.45
  inner.style.width = `${dw}px`
  inner.style.height = `${dh}px`
  inner.style.transform = `scale(${scale})`
  // The stylesheet's aspect ratio is the no-script fallback; kept alongside a set height,
  // it would size the width from the height and widen the stage past its column.
  stage.style.aspectRatio = 'auto'
  stage.style.height = `${Math.round(dh * scale)}px`
}
fit()
new ResizeObserver(fit).observe(stage)

// The divider: x is how much of the window is Dumbify, from the left.
let x = 100
let glideFrame = 0
let touched = false

function setSplit(v) {
  x = Math.max(0, Math.min(100, v))
  const n = Math.round(x)
  stage.style.setProperty('--x', `${x}%`)
  stage.dataset.edge = x < 10 ? 'start' : x > 90 ? 'end' : ''
  handle.setAttribute('aria-valuenow', String(n))
  handle.setAttribute('aria-valuetext', n === 100 ? 'All Dumbify' : n === 0 ? 'All YouTube' : `${n}% Dumbify`)
  power.setAttribute('aria-checked', String(x > 0))
}

function glide(to, ms = 700) {
  cancelAnimationFrame(glideFrame)
  if (reduce) return setSplit(to)
  const from = x
  const start = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms)
    setSplit(from + (to - from) * (1 - (1 - p) ** 3))
    if (p < 1) glideFrame = requestAnimationFrame(step)
  }
  glideFrame = requestAnimationFrame(step)
}

const percentAt = (clientX) => {
  const r = stage.getBoundingClientRect()
  return ((clientX - r.left) / r.width) * 100
}

const take = () => {
  touched = true
  cancelAnimationFrame(glideFrame)
}

handle.addEventListener('pointerdown', (e) => {
  take()
  handle.setPointerCapture(e.pointerId)
  stage.classList.add('dragging')
  handle.onpointermove = (ev) => setSplit(percentAt(ev.clientX))
  handle.onpointerup = handle.onpointercancel = () => {
    handle.onpointermove = null
    stage.classList.remove('dragging')
  }
})

handle.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 20 : 5
  const to = { ArrowLeft: x - step, ArrowDown: x - step, ArrowRight: x + step, ArrowUp: x + step,
    PageDown: x - 20, PageUp: x + 20, Home: 0, End: 100 }[e.key]
  if (to === undefined) return
  e.preventDefault()
  take()
  setSplit(to)
})

// A click on YouTube's side wipes it back to there: the divider, without the drag.
tube.addEventListener('click', (e) => {
  take()
  glide(percentAt(e.clientX))
})

power.addEventListener('click', () => {
  take()
  glide(x > 0 ? 0 : 100)
})

// Start on YouTube and wipe Dumbify across once the demo has drawn.
setSplit(reduce ? 64 : 0)
const intro = () => {
  if (!touched) setTimeout(() => !touched && glide(64, 1600), 350)
}
const showMore = () => {
  if (x < 64) glide(64)
}

/* ---- Talking to the demo (src/demo/index.ts) ---- */

const send = (msg) => frame.contentWindow?.postMessage({ type: 'dumbify:demo-set', ...msg }, location.origin)
const lookBtns = [...dock.querySelectorAll('[data-look]')]
const nameEl = dock.querySelector('.dock-name')
const darkBtn = dock.querySelector('[data-dark]')
const pop = document.getElementById('themes')
const popBtn = dock.querySelector('[popovertarget]')
const themeList = pop.querySelector('.themes-list')
let themes = []
let state = null

function buildThemes(list) {
  themes = list
  const group = (scheme, label) => `<div role="group" aria-labelledby="themes-${scheme}"><p class="themes-label" id="themes-${scheme}">${label}</p><div class="themes-grid">${
    list.filter((t) => t.scheme === scheme).map((t) =>
      `<button class="theme-opt" type="button" data-theme="${t.id}" aria-pressed="false" style="--bgc: ${t.bg}; --ac: ${t.accent}"><i></i>${t.name}</button>`).join('')}</div></div>`
  themeList.innerHTML = group('light', 'Light themes') + group('dark', 'Dark themes')
}

const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text
}

function paint(s) {
  state = s
  for (const b of lookBtns) b.setAttribute('aria-pressed', String(b.dataset.look === s.look))
  for (const b of dock.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === s.layout))
  for (const b of dock.querySelectorAll('[data-page]')) b.setAttribute('aria-pressed', String(b.dataset.page === s.page))
  for (const b of themeList.querySelectorAll('[data-theme]')) b.setAttribute('aria-pressed', String(b.dataset.theme === s.theme))
  darkBtn.setAttribute('aria-checked', String(s.dark))
  const look = lookBtns.find((b) => b.dataset.look === s.look)
  const theme = themes.find((t) => t.id === s.theme)
  setText(nameEl.firstElementChild, look ? look.dataset.name : theme?.name ?? 'Custom')
  setText(nameEl.lastElementChild, look ? look.dataset.note : `${s.dark ? 'Dark' : 'Light'} theme, your own mix`)
}

addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== location.origin || e.data?.type !== 'dumbify:demo') return
  if (!themes.length && e.data.themes) buildThemes(e.data.themes)
  const first = !state
  paint(e.data)
  if (first) {
    frame.classList.add('ready')
    intro()
  }
})

// The demo announces itself once it has drawn; if that happened before this script ran,
// asking again gets the same answer.
send({})
frame.addEventListener('load', () => send({}))

dock.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.look) send({ look: b.dataset.look })
  else if (b.dataset.layout) send({ layout: b.dataset.layout })
  else if (b.dataset.page) send({ page: b.dataset.page })
  else if (b.hasAttribute('data-dark')) send({ dark: !state?.dark })
  else return
  take()
  showMore()
})

themeList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]')
  if (!b) return
  send({ theme: b.dataset.theme })
  take()
  showMore()
})

// The themes popover sits above its button; browsers without popovers skip the button.
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) popBtn.hidden = true
pop.addEventListener('beforetoggle', (e) => {
  if (e.newState === 'open') pop.style.visibility = 'hidden'
})
pop.addEventListener('toggle', (e) => {
  if (e.newState !== 'open') return
  const r = popBtn.getBoundingClientRect()
  const w = pop.offsetWidth
  const h = pop.offsetHeight
  pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`
  pop.style.top = `${r.top - h - 12 > 8 ? r.top - h - 12 : r.bottom + 12}px`
  pop.style.visibility = ''
})
addEventListener('scroll', () => {
  if (pop.matches(':popover-open')) pop.hidePopover()
}, { passive: true })

// "Try it" on a look in the gallery: apply it to the feed, as pictured, and bring the
// demo into view.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-try]')
  if (!b) return
  send({ page: 'feed' })
  send({ look: b.dataset.try })
  take()
  document.getElementById('demo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
  showMore()
})

/* ---- ASCII: shapes drawn in text, lit by the pointer ---- */

const WORDS = 'no thumbnails · no autoplay · no rabbit holes · just the list · '
const RAMP = ' .:-=+*#%@'
const NOISE = '01<>/\\{}[]=+*#%&@$'
const LEVELS = 10
const COLORS = [[255, 59, 59], [245, 245, 243]].flatMap(([r, g, b]) =>
  Array.from({ length: LEVELS }, (_, i) => `rgba(${r},${g},${b},${((i + 1) / LEVELS).toFixed(2)})`))

function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Signed distance to a triangle (after Inigo Quilez): negative inside.
function sdTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy
  const k0 = clamp01((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y))
  const k1 = clamp01((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y))
  const k2 = clamp01((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y))
  const q0x = v0x - e0x * k0, q0y = v0y - e0y * k0
  const q1x = v1x - e1x * k1, q1y = v1y - e1y * k1
  const q2x = v2x - e2x * k2, q2y = v2y - e2y * k2
  const s = Math.sign(e0x * e2y - e0y * e2x)
  const d = Math.min(q0x * q0x + q0y * q0y, q1x * q1x + q1y * q1y, q2x * q2x + q2y * q2y)
  const g = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x))
  return -Math.sqrt(d) * Math.sign(g)
}

function sdRoundBox(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r
  const qy = Math.abs(y) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// Each shape is built for the canvas's size: `d` is the outline, lit red and filled with
// words; `core`, when there is one, is a second shape lit white - the switch's knob.
const SHAPES = {
  // The play mark: beside the headline where there is room, faint behind it where not.
  play(canvas, w) {
    const copy = document.querySelector('.hero-copy').getBoundingClientRect()
    const box = canvas.getBoundingClientRect()
    // Where the words actually end, not where their boxes do.
    const range = document.createRange()
    const right = Math.max(...['h1', '.lede'].map((sel) => {
      range.selectNodeContents(document.querySelector(sel))
      return range.getBoundingClientRect().right
    })) - box.left
    const room = w - right
    const wide = room >= 360
    const s = wide ? Math.min(copy.height * 0.85, room * 0.85, 540) : Math.min(w * 0.9, 380)
    const cx = wide ? right + room / 2 - s * 0.1 : w * 0.88
    const cy = copy.top - box.top + (wide ? copy.height / 2 : s * 0.3)
    const ax = cx - s * 0.2887
    const tx = cx + s * 0.5774
    return { gain: wide ? 1 : 0.3, d: (px, py) => sdTriangle(px, py, ax, cy - s / 2, tx, cy, ax, cy + s / 2) - 14 }
  },
  // Dumbify's own switch, flicking on as it comes into view.
  switch(canvas, w, h) {
    const tw = Math.min(w * 0.72, 700)
    const th = Math.min(tw * 0.44, h * 0.84)
    const r = th / 2
    const cx = w / 2
    const cy = h / 2
    return {
      gain: 0.9,
      d: (px, py) => sdRoundBox(px - cx, py - cy, tw / 2, th / 2, r),
      core: (px, py, on) => Math.hypot(px - (cx - tw / 2 + r + (tw - 2 * r) * on), py - cy) - r * 0.72,
    }
  },
}

function field(canvas) {
  const make = SHAPES[canvas.dataset.shape]
  const ctx = canvas.getContext('2d')
  const buckets = Array.from({ length: LEVELS * 2 }, () => [])
  const ch = 18
  let w = 0, h = 0, cw = 8, cols = 0, rows = 0, shape = null
  let px = -1e4, py = -1e4, raf = 0, last = 0, seenAt = 0

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    w = canvas.clientWidth
    h = canvas.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = '13px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textBaseline = 'top'
    cw = ctx.measureText('0').width
    cols = Math.ceil(w / cw)
    rows = Math.ceil(h / ch)
    shape = make(canvas, w, h)
    draw(performance.now())
  }

  function draw(now) {
    const t = reduce ? 0 : now / 1000
    const flick = reduce ? 1 : clamp01((now - seenAt - 600) / 1100)
    const on = seenAt || reduce ? flick * flick * (3 - 2 * flick) : 0
    for (const b of buckets) b.length = 0
    for (let r = 0; r < rows; r++) {
      const y = r * ch + ch / 2
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw / 2
        const i = r * cols + c
        const d = shape.d(x, y)
        let b
        let g
        let tint = 0
        if (d < 0) {
          // Inside, the shape is made of words, brightest at its edge.
          g = WORDS[(i + r * 3) % WORDS.length]
          b = (0.16 + 0.84 * Math.exp(d / 10) + 0.07 * Math.sin(x * 0.018 - y * 0.012 + t * 1.3)) * shape.gain
        } else {
          const halo = 0.6 * Math.exp(-d / 30) * shape.gain
          const drift = Math.sin(c * 0.11 + t * 0.4 + 2 * Math.sin(r * 0.09 - t * 0.3))
          const dust = Math.max(0, drift * hash(i) - 0.66) * 0.9
          b = halo + dust
          g = RAMP[Math.min(RAMP.length - 1, 1 + ((b * 12) | 0))]
          if (dust > halo) tint = 1
        }
        if (shape.core) {
          const k = shape.core(x, y, on)
          if (k < 0) {
            b = Math.max(b, 0.45 + 0.55 * Math.exp(k / 8))
            g = RAMP[RAMP.length - 1 - ((hash(i) * 3) | 0)]
            tint = 1
          } else if (on < 0.5) {
            tint = 1
          }
        }
        const dx = x - px
        const dy = y - py
        const lens = Math.exp(-(dx * dx + dy * dy) / 26000)
        if (lens > 0.03) {
          b += lens * 0.55
          tint = 1
          if (lens > 0.3 && hash(i + ((t * 14) | 0) * 7919) < lens * 0.5) g = NOISE[(hash(i * 3 + ((t * 20) | 0)) * NOISE.length) | 0]
          else if (g === ' ') g = RAMP[1 + ((lens * 5) | 0)]
        }
        if (b < 0.05 || g === ' ') continue
        buckets[tint * LEVELS + Math.min(LEVELS - 1, (b * LEVELS) | 0)].push(i, g)
      }
    }
    ctx.clearRect(0, 0, w, h)
    buckets.forEach((cells, k) => {
      if (!cells.length) return
      ctx.fillStyle = COLORS[k]
      for (let j = 0; j < cells.length; j += 2) ctx.fillText(cells[j + 1], (cells[j] % cols) * cw, ((cells[j] / cols) | 0) * ch)
    })
  }

  // About 30 frames a second, and only while on screen.
  function tick(now) {
    raf = requestAnimationFrame(tick)
    if (now - last < 33) return
    last = now
    draw(now)
  }

  new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(raf)
    if (!entry.isIntersecting) return
    if (!seenAt) seenAt = performance.now()
    if (!reduce) raf = requestAnimationFrame(tick)
  }).observe(canvas)
  new ResizeObserver(resize).observe(canvas)
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    px = e.clientX - r.left
    py = e.clientY - r.top
  }, { passive: true })
  document.documentElement.addEventListener('pointerleave', () => {
    px = py = -1e4
  })
  document.fonts.load('13px "IBM Plex Mono"').then(resize)
}

document.querySelectorAll('canvas.ascii').forEach(field)

/* ---- Reveal on scroll ---- */

const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    entry.target.classList.add('in')
    reveal.unobserve(entry.target)
  }
}, { rootMargin: '0px 0px -8% 0px' })
document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el))
