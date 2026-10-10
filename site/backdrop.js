// The page's backdrop: the hands from The Creation of Adam, as an ordered dither in their
// own colours, breathing out from the centre. Michelangelo's fresco is public domain.
// Cells are 9 device pixels, so the grid stays fine on a high-density screen.

const CELL = 9                           // device pixels
const CONTRAST = 1.58
const BIAS = 0.1                         // density 20: a little more lit than the tone alone
const PULSE = 0.3                        // brightness swings by ±30%
const FPS = 30
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const canvas = document.createElement('canvas')
canvas.className = 'backdrop'
canvas.setAttribute('aria-hidden', 'true')
document.body.prepend(canvas)
const ctx = canvas.getContext('2d')
const photo = new Image()

let cols = 0
let rows = 0
let lums = null
let dists = null
let thresholds = null
let colours = []        // the distinct colours in use, each with the cells that wear it

function layout() {
  const dpr = devicePixelRatio || 1
  canvas.width = Math.round(innerWidth * dpr)
  canvas.height = Math.round(innerHeight * dpr)
  cols = Math.ceil(canvas.width / CELL)
  rows = Math.ceil(canvas.height / CELL)

  // One pixel per cell, covering the window: the browser averages each cell for us.
  const grid = document.createElement('canvas')
  grid.width = cols
  grid.height = rows
  const g = grid.getContext('2d', { willReadFrequently: true })
  g.imageSmoothingQuality = 'high'
  const scale = Math.max(cols / photo.naturalWidth, rows / photo.naturalHeight)
  const w = photo.naturalWidth * scale
  const h = photo.naturalHeight * scale
  g.drawImage(photo, (cols - w) / 2, (rows - h) / 2, w, h)
  const d = g.getImageData(0, 0, cols, rows).data

  lums = new Float32Array(cols * rows)
  dists = new Float32Array(cols * rows)
  thresholds = new Float32Array(cols * rows)
  const byColour = new Map()
  for (let i = 0; i < cols * rows; i++) {
    const [r, gg, b] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((v) => Math.min(255, Math.max(0, (v - 128) * CONTRAST + 128)))
    const c = i % cols
    const row = (i / cols) | 0
    lums[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255
    dists[i] = Math.hypot(c - cols / 2, row - rows / 2)
    thresholds[i] = BAYER[(row % 4) * 4 + (c % 4)] - BIAS
    // Colours rounded to 16 steps a channel, so a frame is a few hundred fills, not thousands.
    const key = `rgb(${(r >> 4) * 17},${(gg >> 4) * 17},${(b >> 4) * 17})`
    if (!byColour.has(key)) byColour.set(key, [])
    byColour.get(key).push(i)
  }
  colours = [...byColour].map(([css, cells]) => ({ css, cells: Int32Array.from(cells) }))
}

function draw(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const phase = t * Math.PI * 1.6
  for (const { css, cells } of colours) {
    const path = new Path2D()
    let any = false
    for (const i of cells) {
      const lum = still ? lums[i] : lums[i] * (1 + PULSE * Math.sin(phase - dists[i] * 0.04))
      if (lum <= thresholds[i]) continue
      path.rect((i % cols) * CELL + 1, ((i / cols) | 0) * CELL + 1, CELL - 2, CELL - 2)
      any = true
    }
    if (!any) continue
    ctx.fillStyle = css
    ctx.fill(path)
  }
}

let last = 0
function loop(now) {
  if (now - last >= 1000 / FPS) {
    last = now
    draw(now / 1000)
  }
  requestAnimationFrame(loop)
}

let resizing
addEventListener('resize', () => {
  clearTimeout(resizing)
  resizing = setTimeout(() => {
    layout()
    draw(performance.now() / 1000)
  }, 150)
})

photo.onload = () => {
  layout()
  draw(0)
  if (!still) requestAnimationFrame(loop)
}
photo.src = new URL('adam.webp', import.meta.url).href
