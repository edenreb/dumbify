// Dumbify's site: the live demo, its divider, and the YouTube it is compared with.

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
const looks = [...document.querySelectorAll('.switcher [data-look]')]
let ready = false

addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== location.origin || e.data?.type !== 'dumbify:demo') return
  for (const b of looks) b.setAttribute('aria-pressed', String(b.dataset.look === e.data.look))
  if (ready) return
  ready = true
  frame.classList.add('ready')
  intro()
})

// The demo announces itself once it has drawn; if that happened before this script ran,
// asking again gets the same answer.
send({})
frame.addEventListener('load', () => send({}))

for (const b of looks) {
  b.addEventListener('click', () => {
    send({ page: 'feed', look: b.dataset.look })
    take()
    showMore()
  })
}
