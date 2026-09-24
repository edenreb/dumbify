import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAppearance, resolveAccent, resolveScheme, textColorWarning, uiFontSize,
  wallpaperMoves, wallpaperShowing,
} from '../src/core/appearance.ts'
import { DEFAULT_SETTINGS, type DumbifySettings } from '../src/core/settings.ts'
import { ACCENTS, THEMES, getTheme } from '../src/core/themes.ts'
import { contrast } from '../src/core/color.ts'

function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

function settings(patch: Partial<DumbifySettings> = {}): DumbifySettings {
  return { ...DEFAULT_SETTINGS, ...patch, wallpaper: { ...DEFAULT_SETTINGS.wallpaper, ...(patch.wallpaper ?? {}) } }
}

const gradient = { source: 'preset' as const, presetId: 'aurora', kind: 'gradient' as const, name: 'Aurora', average: '#16304a', vibrant: '#6d28d9' }

test('auto mode follows the system', () => {
  assert.equal(resolveScheme(settings({ mode: 'auto' }), true), 'dark')
  assert.equal(resolveScheme(settings({ mode: 'auto' }), false), 'light')
  assert.equal(resolveScheme(settings({ mode: 'dark' }), false), 'dark')
})

test('each mode uses its own theme', () => {
  const light = computeAppearance(settings({ mode: 'light', lightTheme: 'snow', darkTheme: 'mocha' }))
  const dark = computeAppearance(settings({ mode: 'dark', lightTheme: 'snow', darkTheme: 'mocha' }))
  assert.equal(light.theme.id, 'snow')
  assert.equal(dark.theme.id, 'mocha')
  assert.equal(dark.vars['--df-bg'], getTheme('mocha', 'dark').bg)
})

test('accent: theme default, preset, custom colour', () => {
  const theme = getTheme('paper', 'light')
  assert.equal(resolveAccent(settings(), theme), theme.accent)
  assert.equal(resolveAccent(settings({ accent: 'teal' }), theme), ACCENTS.find((a) => a.id === 'teal')!.color)
  assert.equal(resolveAccent(settings({ accent: '#123456' }), theme), '#123456')
})

test('accent from wallpaper uses its colour only while a wallpaper shows', () => {
  const theme = getTheme('paper', 'light')
  assert.equal(resolveAccent(settings({ accent: 'wallpaper', wallpaper: gradient as any }), theme), '#6d28d9')
  assert.equal(resolveAccent(settings({ accent: 'wallpaper' }), theme), theme.accent)
  assert.equal(resolveAccent(settings({ accent: 'wallpaper', wallpaper: gradient as any, wallpaperEnabled: false }), theme), theme.accent)
})

test('accent text is legible for every theme and accent combination', () => {
  for (const t of THEMES) {
    for (const a of ACCENTS) {
      const appearance = computeAppearance(settings({
        mode: t.scheme, lightTheme: t.scheme === 'light' ? t.id : 'paper',
        darkTheme: t.scheme === 'dark' ? t.id : 'ink', accent: a.id,
      }))
      const ratio = contrast(appearance.vars['--df-accent-text'], t.bg)
      assert.ok(ratio >= 4.5, `${a.id} on ${t.id}: ${ratio.toFixed(2)}`)
      // Text on an accent-filled button is legible too.
      assert.ok(contrast(appearance.vars['--df-accent-fg'], a.color) >= 3, `${a.id} fill`)
    }
  }
})

test('without a wallpaper the panels are the solid theme colours', () => {
  const a = computeAppearance(settings())
  assert.equal(a.wallpaper, 'none')
  assert.equal(a.vars['--df-panel'], a.theme.bg)
  assert.equal(a.vars['--df-panel-side'], a.theme.sidebar)
  assert.equal(a.vars['--df-panel-blur'], '0px')
  assert.equal(a.attrs.surface, 'solid')
})

test('frosted glass: translucent tinted panels with a blur', () => {
  const a = computeAppearance(settings({
    wallpaper: gradient as any, surface: 'glass', surfaceOpacity: 0.5, surfaceBlur: 24, surfaceTint: '#ff0000',
  }))
  assert.equal(a.wallpaper, 'window')
  assert.equal(a.vars['--df-panel'], 'rgba(255, 0, 0, 0.5)')
  assert.equal(a.vars['--df-panel-blur'], '24px')
  assert.equal(a.attrs.surface, 'glass')
})

test('clear panels are fully transparent whatever the opacity slider says', () => {
  const a = computeAppearance(settings({ wallpaper: gradient as any, surface: 'clear', surfaceOpacity: 0.9 }))
  assert.match(a.vars['--df-panel'], /, 0\)$/)
})

test('solid panels are opaque; only frosted glass takes the opacity slider', () => {
  const solid = computeAppearance(settings({ wallpaper: gradient as any, surface: 'solid', surfaceOpacity: 0.4 }))
  assert.match(solid.vars['--df-panel'], /, 1\)$/)
  assert.equal(solid.vars['--df-bg'], solid.theme.bg, 'nothing shows through, so the page is the theme')
  const glass = computeAppearance(settings({ wallpaper: gradient as any, surface: 'glass', surfaceOpacity: 0.4 }))
  assert.match(glass.vars['--df-panel'], /, 0\.4\)$/)
})

test('a dark tint under a light theme turns the text light - and says so', () => {
  const a = computeAppearance(settings({
    mode: 'light', lightTheme: 'paper', wallpaper: gradient as any, surface: 'solid', surfaceTint: '#1e2a44',
  }))
  assert.equal(a.panels?.inkChanged, true)
  assert.equal(a.attrs.scheme, 'light', 'still the light theme...')
  assert.equal(a.attrs.tone, 'dark', '...on dark panels')
  const bg = a.vars['--df-bg']
  assert.equal(bg, '#1e2a44')
  assert.ok(contrast(a.vars['--df-text'], bg) >= 7, 'body text')
  assert.ok(contrast(a.vars['--df-text-2'], bg) >= 4.5, 'secondary text')
  assert.ok(contrast(a.vars['--df-text-3'], bg) >= 3, 'tertiary marks')
  // Menus and fields come from the panel too, rather than staying paper white under
  // light text.
  assert.ok(contrast(a.vars['--df-text'], a.vars['--df-menu']) >= 4.5, 'menus')
  assert.ok(contrast(a.vars['--df-text'], a.vars['--df-surface']) >= 4.5, 'raised surfaces')
})

test('a tint the theme ink already reads on keeps the theme ink', () => {
  const a = computeAppearance(settings({
    mode: 'light', lightTheme: 'paper', wallpaper: gradient as any, surface: 'solid', surfaceTint: '#fdf6e3',
  }))
  assert.equal(a.panels?.inkChanged, false)
  assert.equal(a.vars['--df-text'], a.theme.text)
})

test('clear panels over a dark picture get light text with a dark glow', () => {
  const a = computeAppearance(settings({
    mode: 'light', lightTheme: 'paper', wallpaper: { ...gradient, average: '#101418' } as any,
    surface: 'clear', wallpaperFade: 0,
  }))
  assert.equal(a.panels?.inkChanged, true)
  assert.ok(contrast(a.vars['--df-text'], '#101418') >= 4.5)
  assert.match(a.vars['--df-halo'], /^rgba\(0, 0, 0,/)
  const light = computeAppearance(settings({
    mode: 'light', lightTheme: 'paper', wallpaper: { ...gradient, average: '#f4f1ea' } as any, surface: 'clear',
  }))
  assert.equal(light.panels?.inkChanged, false)
  assert.match(light.vars['--df-halo'], /^rgba\(255, 255, 255,/)
})

test('text stays readable on every theme, tint, panel style and wallpaper', () => {
  const tints = ['', '#000000', '#ffffff', '#1e2a44', '#e62d42', '#7f7f7f', '#fdf6e3', '#2d5a27']
  const walls = ['#101418', '#f0f0f0', '#808080', '#6d28d9', '#f6c945']
  let checked = 0
  for (const theme of THEMES) {
    for (const surfaceTint of tints) {
      for (const surface of ['solid', 'glass', 'clear'] as const) {
        for (const average of walls) {
          for (const surfaceOpacity of [0.2, 0.85]) {
            const a = computeAppearance(settings({
              mode: theme.scheme,
              [theme.scheme === 'dark' ? 'darkTheme' : 'lightTheme']: theme.id,
              wallpaper: { ...gradient, average } as any,
              surface, surfaceTint, surfaceOpacity, wallpaperFade: 0.2,
            }))
            const bg = a.vars['--df-bg']
            const where = `${theme.id} ${surface} tint=${surfaceTint || 'theme'} wall=${average} opacity=${surfaceOpacity}`
            assert.ok(contrast(a.vars['--df-text'], bg) >= 4.5, `text: ${where}`)
            assert.ok(contrast(a.vars['--df-text-2'], bg) >= 4.5, `text-2: ${where}`)
            assert.ok(contrast(a.vars['--df-text-3'], bg) >= 3, `text-3: ${where}`)
            assert.ok(contrast(a.vars['--df-accent-text'], bg) >= 4.5, `accent: ${where}`)
            assert.ok(contrast(a.vars['--df-text'], a.vars['--df-menu']) >= 4.5, `menu: ${where}`)
            checked++
          }
        }
      }
    }
  }
  assert.ok(checked > 4000)
})

test('a pattern wallpaper is the theme’s own page: every theme keeps its colours, clear or glass', () => {
  for (const theme of THEMES) {
    for (const presetId of ['dots', 'grid', 'ruled']) {
      for (const surface of ['clear', 'glass'] as const) {
        const a = computeAppearance(settings({
          mode: theme.scheme,
          [theme.scheme === 'dark' ? 'darkTheme' : 'lightTheme']: theme.id,
          wallpaper: { source: 'preset', presetId, kind: 'pattern', name: presetId } as any,
          surface, wallpaperFade: 0.3,
        }))
        const where = `${theme.id} ${presetId} ${surface}`
        assert.equal(a.vars['--df-bg'], theme.bg, `page: ${where}`)
        assert.equal(a.vars['--df-wall-base'], theme.bg, `pattern ground: ${where}`)
        assert.equal(a.vars['--df-wall-average'], theme.bg, `backdrop: ${where}`)
        assert.equal(a.paint, theme.bg, `first paint: ${where}`)
        assert.equal(a.attrs.tone, theme.scheme, `a dark theme stays dark: ${where}`)
        assert.equal(a.panels?.inkChanged, false, `ink: ${where}`)
      }
    }
  }
})

test('an extension page keeps the theme’s own colours whatever the panels do', () => {
  const s = settings({ mode: 'light', lightTheme: 'paper', wallpaper: gradient as any, surface: 'solid', surfaceTint: '#1e2a44' })
  const a = computeAppearance(s, false, { plain: true })
  assert.equal(a.vars['--df-bg'], a.theme.bg)
  assert.equal(a.vars['--df-text'], a.theme.text)
  assert.equal(a.panels, null)
  assert.equal(a.attrs.tone, 'light')
  // Everything else - the accent, the layout - is the reader's.
  assert.equal(a.attrs.wallpaper, 'window')
})

test('the wallpaper fades toward the tint, the panels’ own colour', () => {
  const a = computeAppearance(settings({ wallpaper: gradient as any, surface: 'glass', surfaceTint: '#1e2a44', wallpaperFade: 0.5 }))
  assert.equal(a.vars['--df-wall-fade'], 'rgba(30, 42, 68, 0.5)')
  const clear = computeAppearance(settings({ wallpaper: gradient as any, surface: 'clear', surfaceTint: '#1e2a44', wallpaperFade: 0.5 }))
  assert.equal(clear.vars['--df-wall-fade'], `rgba(${hexRgb(clear.theme.bg)}, 0.5)`, 'clear has no panels, so no tint')
})

test('a page cover keeps the panels solid', () => {
  const a = computeAppearance(settings({ wallpaper: gradient as any, wallpaperPlacement: 'cover', surface: 'glass' }))
  assert.equal(a.wallpaper, 'cover')
  assert.equal(a.vars['--df-panel'], a.theme.bg)
  assert.equal(a.attrs.surface, 'solid')
})

test('a switched-off wallpaper is not shown', () => {
  const s = settings({ wallpaper: gradient as any, wallpaperEnabled: false })
  assert.equal(wallpaperShowing(s), false)
  assert.equal(computeAppearance(s).attrs.wallpaper, 'none')
})

test('only animations, videos and live presets count as moving', () => {
  assert.equal(wallpaperMoves(settings({ wallpaper: { ...gradient, kind: 'gradient' } as any })), false)
  assert.equal(wallpaperMoves(settings({ wallpaper: { ...gradient, kind: 'live' } as any })), true)
  assert.equal(wallpaperMoves(settings({ wallpaper: { source: 'upload', uploadId: 'x', kind: 'animated' } as any })), true)
})

test('the pre-load paint is the wallpaper tone faded toward the theme', () => {
  const plain = computeAppearance(settings())
  assert.equal(plain.paint, plain.theme.bg)
  const walled = computeAppearance(settings({ wallpaper: gradient as any, wallpaperFade: 0 }))
  assert.equal(walled.paint, '#16304a')
  const faded = computeAppearance(settings({ wallpaper: gradient as any, wallpaperFade: 0.9 }))
  assert.ok(contrast(faded.paint, faded.theme.bg) < contrast(walled.paint, walled.theme.bg))
})

test('a custom text colour recolours the whole text hierarchy', () => {
  const a = computeAppearance(settings({ textColorLight: '#5b3a1a' }))
  assert.equal(a.vars['--df-text'], '#5b3a1a')
  assert.notEqual(a.vars['--df-text-2'], a.theme.text2)
  assert.notEqual(a.vars['--df-text-3'], a.theme.text3)
})

test('the custom text colour for the other mode is ignored', () => {
  const a = computeAppearance(settings({ mode: 'light', textColorDark: '#ff00ff' }))
  assert.equal(a.vars['--df-text'], a.theme.text)
})

test('hidden properties are listed for the stylesheet', () => {
  assert.equal(computeAppearance(settings()).attrs.hide, '')
  assert.equal(computeAppearance(settings({ showViews: false, showDuration: false })).attrs.hide, 'views duration')
})

test('discrete choices become data attributes', () => {
  const a = computeAppearance(settings({ layout: 'cards', density: 'compact', sidebar: 'rail', watchLayout: 'split', showNumbers: false }))
  assert.equal(a.attrs.layout, 'cards')
  assert.equal(a.attrs.density, 'compact')
  assert.equal(a.attrs.sidebar, 'rail')
  assert.equal(a.attrs.watch, 'split')
  assert.equal(a.attrs.numbers, 'off')
})

test('fonts, sizes and corners become custom properties', () => {
  const a = computeAppearance(settings({ font: 'serif', fontSize: 24, corners: 'square', pageWidth: 'full' }))
  assert.match(a.vars['--df-font-read'], /Newsreader/)
  assert.equal(a.vars['--df-font-size'], '24px')
  assert.equal(a.vars['--df-radius'], '0px')
  assert.equal(a.vars['--df-page-width'], 'none')
})

test('interface text scales gently and within bounds', () => {
  assert.equal(uiFontSize(20), 14)
  assert.equal(uiFontSize(12), 13)
  assert.equal(uiFontSize(32), 17)
})

test('wallpaper geometry maps to background properties', () => {
  const fill = computeAppearance(settings({ wallpaperFit: 'fill', wallpaperFocusX: 20, wallpaperFocusY: 80 }))
  assert.equal(fill.vars['--df-wall-size'], 'cover')
  assert.equal(fill.vars['--df-wall-position'], '20% 80%')
  const tile = computeAppearance(settings({ wallpaperFit: 'tile' }))
  assert.equal(tile.vars['--df-wall-repeat'], 'repeat')
})

test('textColorWarning flags illegible custom colours only', () => {
  const paper = getTheme('paper', 'light')
  assert.equal(textColorWarning('#222222', paper), null)
  assert.match(textColorWarning('#eeeeee', paper) ?? '', /Low contrast/)
})

test('every value is a string the style API will accept', () => {
  const a = computeAppearance(settings({ wallpaper: gradient as any, surface: 'glass' }))
  for (const [k, v] of Object.entries(a.vars)) {
    assert.equal(typeof v, 'string', k)
    assert.ok(v.length > 0, `${k} is empty`)
    assert.doesNotMatch(v, /NaN|undefined/, k)
  }
})
