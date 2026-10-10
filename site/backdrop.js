// The page's backdrop: The Creation of Adam, dithered into 9px cells that breathe out from
// the centre. Michelangelo's fresco is public domain; the photo comes from Wikimedia
// Commons, which allows a canvas to read it. Until it arrives, or if it can't, a drawn
// stand-in of the two hands shows instead.

const CELL = 9
const CONTRAST = 1.58
const BIAS = (20 - 50) / 100            // density 20: a sparse dither
const PULSE = 0.3                       // brightness swings by ±30%
const FPS = 30
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const PAINTING = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg/1280px-Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
]

const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const canvas = document.createElement('canvas')
canvas.className = 'backdrop'
canvas.setAttribute('aria-hidden', 'true')
document.body.prepend(canvas)
const ctx = canvas.getContext('2d')

let source = standIn()
let cells = []
let cols = 0
let rows = 0

function standIn() {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 760
  const g = c.getContext('2d')
  g.fillStyle = '#0b0908'
  g.fillRect(0, 0, 1200, 760)
  const skin = (x, y, r) => {
    const s = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.3)
    s.addColorStop(0, '#ffe2c4')
    s.addColorStop(0.6, '#d9a079')
    s.addColorStop(1, '#6e4128')
    return s
  }
  // A rounded limb from one point to another, tapering from w to w2.
  const limb = (x1, y1, x2, y2, w, w2 = w) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const nx = -Math.sin(a)
    const ny = Math.cos(a)
    g.fillStyle = skin((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) / 2 + w)
    g.beginPath()
    g.moveTo(x1 + (nx * w) / 2, y1 + (ny * w) / 2)
    g.lineTo(x2 + (nx * w2) / 2, y2 + (ny * w2) / 2)
    g.arc(x2, y2, w2 / 2, a + Math.PI / 2, a - Math.PI / 2, true)
    g.lineTo(x1 - (nx * w) / 2, y1 - (ny * w) / 2)
    g.arc(x1, y1, w / 2, a - Math.PI / 2, a + Math.PI / 2, true)
    g.fill()
  }
  const palm = (x, y, rx, ry, rot) => {
    g.fillStyle = skin(x, y, rx)
    g.beginPath()
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    g.fill()
  }
  // Adam, from the lower left, the index finger drooping toward the gap.
  limb(-60, 700, 420, 470, 120, 70)
  palm(462, 462, 52, 36, -0.25)
  limb(495, 486, 545, 500, 22, 18)
  limb(490, 500, 530, 514, 21, 17)
  limb(480, 512, 515, 524, 19, 15)
  limb(500, 452, 585, 452, 24, 19)
  limb(445, 440, 488, 418, 22, 18)
  // God, from the upper right, the finger straight and reaching.
  limb(1280, 120, 790, 380, 130, 76)
  palm(745, 395, 54, 38, 0.2)
  limb(708, 408, 662, 424, 22, 18)
  limb(712, 421, 668, 440, 21, 17)
  limb(716, 433, 676, 454, 19, 15)
  limb(706, 392, 622, 410, 24, 19)
  limb(760, 372, 712, 360, 22, 18)
  return c
}

// One pixel per cell, so the browser averages each cell's colour for us; then the contrast.
function sample() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cols = Math.ceil(innerWidth / CELL)
  rows = Math.ceil(innerHeight / CELL)
  const grid = document.createElement('canvas')
  grid.width = cols
  grid.height = rows
  const g = grid.getContext('2d', { willReadFrequently: true })
  g.imageSmoothingQuality = 'high'
  // Cover the window, keeping the hands' gap in the middle.
  const scale = Math.max(cols / source.width, rows / source.height)
  const w = source.width * scale
  const h = source.height * scale
  g.drawImage(source, (cols - w) / 2, (rows - h) / 2, w, h)
  const d = g.getImageData(0, 0, cols, rows).data
  cells = []
  for (let i = 0; i < cols * rows; i++) {
    const [r, gg, b] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((v) => Math.min(255, Math.max(0, (v - 128) * CONTRAST + 128)))
    cells.push({ css: `rgb(${r | 0},${gg | 0},${b | 0})`, lum: (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255 })
  }
}

function draw(t) {
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c]
      const d = Math.hypot(c - cols / 2, r - rows / 2)
      const lum = cell.lum * (still ? 1 : 1 + PULSE * Math.sin(t * Math.PI * 1.6 - d * 0.04))
      if (lum + BIAS <= BAYER[(r % 4) * 4 + (c % 4)]) continue
      ctx.fillStyle = cell.css
      ctx.fillRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1)
    }
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

function show() {
  sample()
  draw(performance.now() / 1000)
}

function painting(i = 0) {
  if (i >= PAINTING.length) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      // A photo the canvas may not read would fail here, at the first pixel.
      const probe = document.createElement('canvas').getContext('2d')
      probe.drawImage(img, 0, 0, 1, 1)
      probe.getImageData(0, 0, 1, 1)
      source = img
      show()
    } catch {
      painting(i + 1)
    }
  }
  img.onerror = () => painting(i + 1)
  img.src = PAINTING[i]
}

let resizing
addEventListener('resize', () => {
  clearTimeout(resizing)
  resizing = setTimeout(show, 150)
})
show()
painting()
if (!still) requestAnimationFrame(loop)
