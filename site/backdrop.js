// The hero's backdrop: the hands from The Creation of Adam (Michelangelo, public domain) as
// an ordered dither of small dots, inverted so the hands are lit on black, with a slow
// diagonal shimmer passing through them.
//
// Cheap by construction: the photo is sampled once per resize into one luminance value per
// cell, and each frame only thresholds those values and draws the lit dots.

const CELL = 9                    // CSS px per cell
const DOT = 3                     // CSS px square per lit dot
// The recipe's contrast 128, measured on this photo: plaster sits near 0.56, the hands
// between 0.09 and 0.49. Inverted, everything below LOW is wall and drops out.
const LOW = 0.46
const HIGH = 0.85
const SHIMMER = 0.6               // how far the shimmer swings a cell's tone
const FPS = 24
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

const host = document.querySelector('.backdrop')
const canvas = host?.querySelector('canvas')
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

if (canvas) {
  const ctx = canvas.getContext('2d')
  const photo = new Image()
  let cols = 0
  let rows = 0
  let tone = null      // per cell, 0..1, inverted and contrast-stretched
  let visible = true
  let last = 0

  function sample() {
    const w = host.clientWidth
    const h = host.clientHeight
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    cols = Math.ceil(w / CELL)
    rows = Math.ceil(h / CELL)

    // Fit the hands across the canvas, the fingertips meeting just above the demo window.
    const small = new OffscreenCanvas(cols, rows)
    const sctx = small.getContext('2d', { willReadFrequently: true })
    const scale = cols / photo.width
    const dw = photo.width * scale
    const dh = photo.height * scale
    sctx.fillStyle = '#fff'
    sctx.fillRect(0, 0, cols, rows)
    sctx.drawImage(photo, 0, rows * 0.24 - dh * 0.52, dw, dh)
    const px = sctx.getImageData(0, 0, cols, rows).data

    tone = new Float32Array(cols * rows)
    for (let i = 0; i < tone.length; i++) {
      const lum = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
      const t = (1 - lum - LOW) / (HIGH - LOW)         // inverted: hands bright, wall dark
      tone[i] = Math.min(1, Math.max(0, t))
    }
  }

  function draw(time) {
    const t = time / 1000
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f4f4f4'
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        let v = tone[i]
        if (v < 0.04) continue
        // shimmer: a soft band sweeping diagonally, plus a little per-cell twinkle
        const band = Math.sin((x + y * 0.6) * 0.09 - t * 1.6)
        const twinkle = Math.sin(i * 12.9898 + t * 3.1) * 0.5
        v += (band * 0.7 + twinkle * 0.3) * SHIMMER * v * 0.5
        if (v > BAYER[(y & 3) * 4 + (x & 3)]) ctx.fillRect(x * CELL + 3, y * CELL + 3, DOT, DOT)
      }
    }
  }

  function loop(time) {
    if (visible && time - last >= 1000 / FPS) {
      last = time
      draw(time)
    }
    if (!still) requestAnimationFrame(loop)
  }

  photo.onload = () => {
    sample()
    if (still) draw(0)
    else requestAnimationFrame(loop)
  }
  photo.src = 'site/adam.webp'

  let resizeTimer = 0
  addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      sample()
      draw(performance.now())
    }, 120)
  })

  // Only animate while the hero is on screen.
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }).observe(host)
}
