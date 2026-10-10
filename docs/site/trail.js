// A faint trail behind the mouse pointer that spells d-u-m-b-i-f-y, over and over. Mouse only (not touch), off
// for reduced motion, and idle unless the pointer is moving.

const fine = matchMedia('(pointer: fine)').matches
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

if (fine && !still) {
  const WORD = 'dumbify'
  const LIFE = 650                 // ms a glyph stays visible
  const GAP = 14                   // px of pointer travel between glyphs
  const canvas = document.createElement('canvas')
  canvas.className = 'trail'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  const glyphs = []
  let lastX = -1e4
  let lastY = -1e4
  let running = false
  let seed = 7
  let next = 0                     // which letter of the word comes next

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = '500 13px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
  }

  function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (let i = glyphs.length - 1; i >= 0; i--) {
      const g = glyphs[i]
      const t = (now - g.born) / LIFE
      if (t >= 1) {
        glyphs.splice(i, 1)
        continue
      }
      // fades out and drifts up a little
      ctx.fillStyle = g.red ? `rgba(255, 59, 48, ${0.5 * (1 - t)})` : `rgba(244, 244, 244, ${0.32 * (1 - t)})`
      ctx.fillText(g.ch, g.x, g.y - t * 10)
    }
    running = glyphs.length > 0
    if (running) requestAnimationFrame(frame)
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < GAP) return
    lastX = e.clientX
    lastY = e.clientY
    seed = (seed * 16807) % 2147483647
    glyphs.push({
      x: e.clientX + ((seed % 9) - 4),
      y: e.clientY + (((seed >> 4) % 9) - 4),
      ch: WORD[next],
      red: seed % 7 === 0,
      born: performance.now(),
    })
    next = (next + 1) % WORD.length
    if (glyphs.length > 40) glyphs.shift()
    if (!running) {
      running = true
      requestAnimationFrame(frame)
    }
  }, { passive: true })

  addEventListener('resize', size)
  size()
}
