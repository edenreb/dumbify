import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAppearance, resolveAccent, resolveScheme, textColorWarning, uiFontSize,
  wallpaperMoves, wallpaperShowing,
} from '../src/core/appearance.ts'
import { DEFAULT_SETTINGS, type DumbifySettings } from '../src/core/settings.ts'
import { ACCENTS, THEMES, getTheme } from '../src/core/themes.ts'
import { contrast } from '../src/core/color.ts'

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
