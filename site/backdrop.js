// The page's backdrop: the hands from The Creation of Adam, as an ordered dither in their
// own colours, breathing out from the centre. Michelangelo's fresco is public domain.
//
// It is cheap by construction. Each frame writes one pixel a cell into a small canvas, and
// the GPU scales it up, crisp, to 8-device-pixel cells. The gaps between the dots are a
// fixed CSS mask over it, so they are never drawn at all.

const CELL = 8                           // device pixels
const DOT = 0.75                         // of the cell lit, in each direction
const CONTRAST = 1.58
const BIAS = 0.1                         // density 20: a little more lit than the tone alone
const PULSE = 0.3                        // brightness swings by ±30%
const FPS = 24
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
let rings = null        // each cell's distance from the centre, in whole cells
let wave = null         // the pulse at each distance, this frame
let thresholds = null
let colours = null      // each cell's colour as one 32-bit RGBA pixel
let image = null
let pixels = null

function layout() {
  const dpr = devicePixelRatio || 1
  cols = Math.ceil((innerWidth * dpr) / CELL)
  rows = Math.ceil((innerHeight * dpr) / CELL)
  canvas.width = cols
  canvas.height = rows
  const cell = CELL / dpr
  canvas.style.width = `${cols * cell}px`
  canvas.style.height = `${rows * cell}px`
  // The gaps: a mask of one square dot a cell.
  const dot = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='${DOT}' height='${DOT}'/%3E%3C/svg%3E")`
  for (const prop of ['maskImage', 'webkitMaskImage']) canvas.style[prop] = dot
  for (const prop of ['maskSize', 'webkitMaskSize']) canvas.style[prop] = `${cell}px ${cell}px`
  image = ctx.createImageData(canvas.width, canvas.height)
  pixels = new Uint32Array(image.data.buffer)

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

  const n = cols * rows
  lums = new Float32Array(n)
  rings = new Uint16Array(n)
  thresholds = new Float32Array(n)
  colours = new Uint32Array(n)
  wave = new Float32Array(Math.ceil(Math.hypot(cols, rows) / 2) + 2)
  const bytes = new Uint8Array(colours.buffer)
  for (let i = 0; i < n; i++) {
    const [r, gg, b] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((v) => Math.min(255, Math.max(0, (v - 128) * CONTRAST + 128)))
    const c = i % cols
    const row = (i / cols) | 0
    lums[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255
    rings[i] = Math.round(Math.hypot(c - cols / 2, row - rows / 2))
    thresholds[i] = BAYER[(row % 4) * 4 + (c % 4)] - BIAS
    bytes.set([r, gg, b, 255], i * 4)
  }
}

function draw(t) {
  // One sine per ring out from the centre, not one per cell.
  const phase = t * Math.PI * 1.6
  for (let d = 0; d < wave.length; d++) wave[d] = still ? 1 : 1 + PULSE * Math.sin(phase - d * 0.04)
  for (let i = 0; i < pixels.length; i++) pixels[i] = lums[i] * wave[rings[i]] > thresholds[i] ? colours[i] : 0
  ctx.putImageData(image, 0, 0)
}

// A device that can't keep up gets a still frame rather than a slow page: if frames
// keep arriving far apart, the backdrop stops moving.
let last = 0
let gaps = []
function loop(now) {
  if (now - last >= 1000 / FPS) {
    if (last) gaps.push(now - last)
    last = now
    draw(now / 1000)
  }
  if (gaps.length >= 48) {
    const median = gaps.sort((a, b) => a - b)[gaps.length >> 1]
    if (median > 80) return
    gaps = []
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
