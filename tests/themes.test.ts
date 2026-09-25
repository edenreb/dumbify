import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCENTS, DEFAULT_DARK_THEME, DEFAULT_FONT, DEFAULT_LIGHT_THEME, FONTS, THEMES,
  WALLPAPER_PRESETS, getFont, getTheme, themesFor,
} from '../src/core/themes.ts'
import { contrast, ensureContrast, isHex } from '../src/core/color.ts'

// These are the legibility guarantees every theme makes. A new theme that fails one
// is a theme that is hard to read somewhere in the product - fix the palette, not the
// threshold.

const COLOR_KEYS = ['bg', 'sidebar', 'surface', 'text', 'text2', 'text3', 'border', 'accent'] as const

test('theme ids and names are unique', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length)
  assert.equal(new Set(THEMES.map((t) => t.name)).size, THEMES.length)
})

test('every theme colour is a valid hex colour', () => {
  for (const t of THEMES) {
    for (const k of COLOR_KEYS) assert.ok(isHex(t[k]), `${t.id}.${k} = ${t[k]}`)
  }
})

test('there is a real choice in both schemes, and the defaults exist', () => {
  assert.ok(themesFor('light').length >= 6)
  assert.ok(themesFor('dark').length >= 6)
  assert.equal(getTheme(DEFAULT_LIGHT_THEME, 'light').id, DEFAULT_LIGHT_THEME)
  assert.equal(getTheme(DEFAULT_DARK_THEME, 'dark').id, DEFAULT_DARK_THEME)
})

test('getTheme never hands a dark theme to light mode', () => {
  assert.equal(getTheme('ink', 'light').id, DEFAULT_LIGHT_THEME)
  assert.equal(getTheme('nope', 'dark').id, DEFAULT_DARK_THEME)
})

test('scheme matches the actual background brightness', () => {
  for (const t of THEMES) {
    const darkBg = contrast(t.bg, '#000000') < contrast(t.bg, '#ffffff')
    assert.equal(darkBg, t.scheme === 'dark', `${t.id} is labelled ${t.scheme}`)
  }
})

test('body text is comfortably legible on every surface', () => {
  for (const t of THEMES) {
    for (const surface of ['bg', 'sidebar', 'surface'] as const) {
      const ratio = contrast(t.text, t[surface])
      assert.ok(ratio >= 6, `${t.id}: text on ${surface} is ${ratio.toFixed(2)}:1`)
    }
  }
})

test('secondary text meets WCAG AA on every surface', () => {
  for (const t of THEMES) {
    for (const surface of ['bg', 'sidebar', 'surface'] as const) {
      const ratio = contrast(t.text2, t[surface])
      assert.ok(ratio >= 4.5, `${t.id}: text2 on ${surface} is ${ratio.toFixed(2)}:1`)
    }
  }
})

test('tertiary marks stay visible', () => {
  for (const t of THEMES) {
    const ratio = contrast(t.text3, t.bg)
    assert.ok(ratio >= 3, `${t.id}: text3 is ${ratio.toFixed(2)}:1`)
  }
})

test('the text hierarchy actually descends', () => {
  for (const t of THEMES) {
    const c1 = contrast(t.text, t.bg)
    const c2 = contrast(t.text2, t.bg)
    const c3 = contrast(t.text3, t.bg)
    assert.ok(c1 > c2 && c2 > c3, `${t.id}: ${c1.toFixed(1)} / ${c2.toFixed(1)} / ${c3.toFixed(1)}`)
  }
})

test('dividers are visible but quiet', () => {
  for (const t of THEMES) {
    const ratio = contrast(t.border, t.bg)
    assert.ok(ratio >= 1.1 && ratio < 2, `${t.id}: border is ${ratio.toFixed(2)}:1`)
  }
})

test('every accent, as text, can be made legible on every theme', () => {
  const accents = [...ACCENTS.map((a) => a.color), ...THEMES.map((t) => t.accent)]
  for (const t of THEMES) {
    for (const a of accents) {
      const fixed = ensureContrast(a, t.bg, 4.5)
      assert.ok(contrast(fixed, t.bg) >= 4.5, `${a} on ${t.id}`)
    }
  }
})

test('accents are unique valid colours', () => {
  assert.equal(new Set(ACCENTS.map((a) => a.id)).size, ACCENTS.length)
  for (const a of ACCENTS) assert.ok(isHex(a.color), a.id)
})

test('fonts: unique ids, the three featured faces, and a real default', () => {
  assert.equal(new Set(FONTS.map((f) => f.id)).size, FONTS.length)
  assert.deepEqual(FONTS.filter((f) => f.featured).map((f) => f.id), ['sans', 'serif', 'mono'])
  assert.equal(getFont(DEFAULT_FONT).id, DEFAULT_FONT)
  assert.equal(getFont('missing').id, DEFAULT_FONT)
  for (const f of FONTS) assert.match(f.stack, /(sans-serif|serif|monospace)$/, `${f.id} needs a generic fallback`)
})

// The fonts a stock install has, as Chrome sees them (it resolves system-ui, but not
// ui-rounded or ui-serif, outside Safari).
const INSTALLED: Record<string, string[]> = {
  windows: ['system-ui', 'Segoe UI', 'Arial', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Consolas',
    'Constantia', 'Corbel', 'Courier New', 'Georgia', 'Lucida Console', 'Palatino Linotype', 'Sitka Small',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  macos: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Helvetica', 'Seravek',
    'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', 'Arial', 'Georgia', 'Times New Roman', 'Times',
    'Iowan Old Style', 'Palatino', 'Rockwell', 'Verdana', 'Geneva', 'Tahoma', 'Courier', 'Courier New'],
}

test('no two font styles land on the same installed font', () => {
  for (const [os, installed] of Object.entries(INSTALLED)) {
    const seen = new Map<string, string>()
    for (const f of FONTS.filter((font) => !font.featured)) {
      const names = f.stack.split(',').map((n) => n.trim().replace(/^"|"$/g, ''))
      const used = names.find((n) => installed.includes(n))
      assert.ok(used, `${os}: ${f.id} finds nothing installed`)
      assert.ok(!seen.has(used), `${os}: ${f.id} and ${seen.get(used)} are both ${used}`)
      seen.set(used, f.id)
    }
  }
})

test('patterns draw on the theme’s page, never on the panels’ tone', () => {
  for (const p of WALLPAPER_PRESETS.filter((w) => w.kind === 'pattern')) {
    assert.match(p.css, /var\(--df-wall-base\)$/, p.id)
    assert.doesNotMatch(p.css, /var\(--df-bg\)/, p.id)
  }
})

test('wallpaper presets are well formed', () => {
  assert.equal(new Set(WALLPAPER_PRESETS.map((p) => p.id)).size, WALLPAPER_PRESETS.length)
  for (const p of WALLPAPER_PRESETS) {
    assert.ok(p.css.length > 10, p.id)
    assert.ok(isHex(p.average) && isHex(p.vibrant), p.id)
    if (p.kind === 'animated') assert.ok(p.size, `${p.id} needs a background-size to move across`)
    // Presets are inlined into youtube.com's DOM - nothing in them may fetch.
    assert.doesNotMatch(p.css, /url\(/, `${p.id} must not load anything`)
  }
  assert.ok(WALLPAPER_PRESETS.some((p) => p.kind === 'animated'), 'at least one live preset')
})
