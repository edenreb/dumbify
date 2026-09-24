// Colour arithmetic for the theme system. Pure functions only - no DOM, no chrome - so
// the options page, the popup, the reading view and the unit tests all share one copy.
//
// Everything works on sRGB hex strings (#rgb or #rrggbb) because that is what themes are
// written in and what <input type="color"> hands back.

export interface RGB {
  r: number
  g: number
  b: number
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim())
}

export function parseHex(hex: string): RGB {
  const m = HEX.exec(hex.trim())
  if (!m) throw new Error(`Not a hex colour: ${hex}`)
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function channel(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

export function toHex({ r, g, b }: RGB): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Lower-case six-digit form, so equal colours compare equal as strings. */
export function normalizeHex(hex: string): string {
  return toHex(parseHex(hex))
}

/** Linear interpolation in sRGB: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  const k = Math.max(0, Math.min(1, t))
  return toHex({
    r: x.r + (y.r - x.r) * k,
    g: x.g + (y.g - x.g) * k,
    b: x.b + (y.b - x.b) * k,
  })
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
}

// WCAG 2.x relative luminance.
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.18
}

/**
 * Nudges `fg` toward black or white - whichever direction gains contrast against `bg` -
 * until it reaches `min`. A GNOME accent like #9141ac is a fine fill colour but reads at
 * barely 3:1 as text on a near-black page, so text uses this corrected version.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return normalizeHex(fg)
  const target = isDark(bg) ? '#ffffff' : '#000000'
  let lo = 0
  let hi = 1
  // Binary search for the smallest mix that clears the bar; 12 steps is sub-1/255.
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    if (contrast(mix(fg, target, mid), bg) >= min) hi = mid
    else lo = mid
  }
  return mix(fg, target, hi)
}

/** Black or white, whichever is more legible on `bg` - for text on accent fills. */
export function readableOn(bg: string): string {
  return contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111'
}

export interface HSL {
  h: number
  s: number
  l: number
}

export function toHsl(hex: string): HSL {
  const { r, g, b } = parseHex(hex)
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return { h: h * 60, s, l }
}

export function fromHsl({ h, s, l }: HSL): string {
  const hue = ((h % 360) + 360) % 360 / 360
  if (s === 0) return toHex({ r: l * 255, g: l * 255, b: l * 255 })
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const conv = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return toHex({ r: conv(hue + 1 / 3) * 255, g: conv(hue) * 255, b: conv(hue - 1 / 3) * 255 })
}

/**
 * The average colour and a vivid representative colour of an image's pixels.
 *
 * `average` paints the page the instant it loads, before the wallpaper itself has been
 * read out of storage, so a slow read shows the image's own tone rather than a flash of
 * the theme. `vibrant` backs the "accent from wallpaper" option: the most common hue
 * bucket among reasonably saturated, mid-lightness pixels, which is what a person would
 * call "the colour of that picture" far more often than the mean (which is usually mud).
 */
export function paletteFromPixels(data: ArrayLike<number>): { average: string; vibrant: string } {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue
    const pr = data[i]
    const pg = data[i + 1]
    const pb = data[i + 2]
    r += pr
    g += pg
    b += pb
    n++
    const hex = toHex({ r: pr, g: pg, b: pb })
    const { h, s, l } = toHsl(hex)
    if (s < 0.28 || l < 0.18 || l > 0.85) continue
    const key = Math.round(h / 20) % 18
    const slot = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    // Weight by saturation so a vivid patch beats a larger dull one of the same hue.
    const w = 0.5 + s
    slot.count += w
    slot.r += pr * w
    slot.g += pg * w
    slot.b += pb * w
    buckets.set(key, slot)
  }
  if (n === 0) return { average: '#808080', vibrant: '#808080' }
  const average = toHex({ r: r / n, g: g / n, b: b / n })
  let best: { count: number; r: number; g: number; b: number } | null = null
  for (const slot of buckets.values()) {
    if (!best || slot.count > best.count) best = slot
  }
  if (!best) return { average, vibrant: average }
  const vivid = toHex({ r: best.r / best.count, g: best.g / best.count, b: best.b / best.count })
  // Push the pick into a usable accent range: saturated enough to read as a colour, not
  // so light or dark that it disappears on either kind of theme.
  const hsl = toHsl(vivid)
  const vibrant = fromHsl({ h: hsl.h, s: Math.max(hsl.s, 0.45), l: Math.min(0.62, Math.max(0.38, hsl.l)) })
  return { average, vibrant }
}
