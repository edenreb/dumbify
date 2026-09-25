import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS, LEGACY_FONT_MAP, LEGACY_UPLOAD_ID, applySettingsPatch, legacyBackground,
  normalizeSettings, normalizeWallpaper,
} from '../src/core/settings.ts'
import { DEFAULT_FONT, FONTS } from '../src/core/themes.ts'

// The exact object v1.1.0 wrote for a reader who changed nothing.
const V1_DEFAULTS = {
  enabled: true,
  fontSize: 20,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontColor: '#1d1d1d',
  fontColorDark: '#f3f0e8',
  backgroundImage: '',
  bgOpacity: 0.85,
  theme: 'light',
}

test('nothing stored gives the defaults', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
})

test('garbage stored gives the defaults rather than a throw', () => {
  for (const junk of ['nonsense', 42, [], true]) {
    assert.deepEqual(normalizeSettings(junk), DEFAULT_SETTINGS)
  }
})

test('the defaults are themselves valid', () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS)
})

test('normalising is idempotent', () => {
  const once = normalizeSettings({ ...V1_DEFAULTS, theme: 'dark', fontSize: 99 })
  assert.deepEqual(normalizeSettings(once), once)
})

test('v1 defaults migrate to v2 defaults', () => {
  const s = normalizeSettings(V1_DEFAULTS)
  assert.deepEqual(s, DEFAULT_SETTINGS)
})

test('v1 night theme becomes dark mode', () => {
  assert.equal(normalizeSettings({ ...V1_DEFAULTS, theme: 'dark' }).mode, 'dark')
})

test('v1 off switch survives the migration', () => {
  assert.equal(normalizeSettings({ ...V1_DEFAULTS, enabled: false }).enabled, false)
})

test('every v1 font maps to a real v2 font', () => {
  for (const [stack, id] of Object.entries(LEGACY_FONT_MAP)) {
    assert.ok(FONTS.some((f) => f.id === id), `${stack} -> ${id}`)
    assert.equal(normalizeSettings({ ...V1_DEFAULTS, fontFamily: stack }).font, id)
  }
  assert.equal(normalizeSettings({ ...V1_DEFAULTS, fontFamily: 'Comic Sans' }).font, DEFAULT_FONT)
})

test('v1 default text colours become "follow the theme"', () => {
  const s = normalizeSettings(V1_DEFAULTS)
  assert.equal(s.textColorLight, '')
  assert.equal(s.textColorDark, '')
})

test('a v1 custom text colour is kept', () => {
  const s = normalizeSettings({ ...V1_DEFAULTS, fontColor: '#553311', fontColorDark: '#AABBCC' })
  assert.equal(s.textColorLight, '#553311')
  assert.equal(s.textColorDark, '#aabbcc')
})

test('v1 background opacity becomes panel opacity', () => {
  assert.equal(normalizeSettings({ ...V1_DEFAULTS, bgOpacity: 0.4 }).surfaceOpacity, 0.4)
})

test('a v1 inline background becomes a reference to the migrated upload', () => {
  const s = normalizeSettings({ ...V1_DEFAULTS, backgroundImage: 'data:image/jpeg;base64,AAAA' })
  assert.equal(s.wallpaper.source, 'upload')
  assert.equal(s.wallpaper.uploadId, LEGACY_UPLOAD_ID)
  assert.equal(s.wallpaper.kind, 'image')
  // The bytes themselves never ride along in the settings object.
  assert.equal('backgroundImage' in s, false)
})

test('legacyBackground only reports an unmigrated v1 image', () => {
  assert.equal(legacyBackground({ ...V1_DEFAULTS, backgroundImage: 'data:image/png;base64,AA' }), 'data:image/png;base64,AA')
  assert.equal(legacyBackground(V1_DEFAULTS), null)
  assert.equal(legacyBackground({ version: 2, backgroundImage: 'data:x' }), null)
  assert.equal(legacyBackground(null), null)
})

test('numbers are clamped into range', () => {
  const s = normalizeSettings({
    version: 2, fontSize: 99, surfaceOpacity: 7, wallpaperFade: 3, wallpaperBlur: -4,
    wallpaperFocusX: 180, wallpaperFocusY: -20, surfaceBlur: 1000,
  })
  assert.equal(s.fontSize, 32)
  assert.equal(s.surfaceOpacity, 1)
  assert.equal(s.wallpaperFade, 0.9)
  assert.equal(s.wallpaperBlur, 0)
  assert.equal(s.wallpaperFocusX, 100)
  assert.equal(s.wallpaperFocusY, 0)
  assert.equal(s.surfaceBlur, 40)
  assert.equal(normalizeSettings({ version: 2, fontSize: 3 }).fontSize, 12)
  assert.equal(normalizeSettings({ version: 2, fontSize: 'NaN' }).fontSize, 20)
})

test('unknown choices fall back to their defaults', () => {
  const s = normalizeSettings({
    version: 2, mode: 'sepia', layout: 'masonry', density: 'huge', corners: 'blob',
    pageWidth: 'infinite', sidebar: 'left', watchLayout: 'vr', surface: 'chrome',
  })
  assert.equal(s.mode, DEFAULT_SETTINGS.mode)
  assert.equal(s.layout, DEFAULT_SETTINGS.layout)
  assert.equal(s.density, DEFAULT_SETTINGS.density)
  assert.equal(s.corners, DEFAULT_SETTINGS.corners)
  assert.equal(s.pageWidth, DEFAULT_SETTINGS.pageWidth)
  assert.equal(s.sidebar, DEFAULT_SETTINGS.sidebar)
  assert.equal(s.watchLayout, DEFAULT_SETTINGS.watchLayout)
  assert.equal(s.surface, DEFAULT_SETTINGS.surface)
})

test('a theme is only accepted for its own scheme', () => {
  const s = normalizeSettings({ version: 2, lightTheme: 'ink', darkTheme: 'paper' })
  assert.equal(s.lightTheme, DEFAULT_SETTINGS.lightTheme)
  assert.equal(s.darkTheme, DEFAULT_SETTINGS.darkTheme)
  const ok = normalizeSettings({ version: 2, lightTheme: 'snow', darkTheme: 'mocha' })
  assert.equal(ok.lightTheme, 'snow')
  assert.equal(ok.darkTheme, 'mocha')
})

test('accent accepts theme, wallpaper, presets and colours only', () => {
  assert.equal(normalizeSettings({ version: 2, accent: 'wallpaper' }).accent, 'wallpaper')
  assert.equal(normalizeSettings({ version: 2, accent: 'teal' }).accent, 'teal')
  assert.equal(normalizeSettings({ version: 2, accent: '#ABCDEF' }).accent, '#abcdef')
  assert.equal(normalizeSettings({ version: 2, accent: 'javascript:alert(1)' }).accent, 'theme')
})

test('text colours must be hex; anything else follows the theme', () => {
  const s = normalizeSettings({ version: 2, textColorLight: 'red', textColorDark: 'url(x)' })
  assert.equal(s.textColorLight, '')
  assert.equal(s.textColorDark, '')
})

test('a preset wallpaper is filled in from the catalogue', () => {
  const w = normalizeWallpaper({ source: 'preset', presetId: 'aurora' })
  assert.equal(w.name, 'Aurora')
  assert.equal(w.kind, 'gradient')
  assert.match(w.average, /^#[0-9a-f]{6}$/)
  assert.equal(normalizeWallpaper({ source: 'preset', presetId: 'aurora-live' }).kind, 'live')
})

test('a wallpaper that points at nothing is no wallpaper', () => {
  assert.equal(normalizeWallpaper({ source: 'preset', presetId: 'gone' }).source, 'none')
  assert.equal(normalizeWallpaper({ source: 'upload', uploadId: '' }).source, 'none')
  assert.equal(normalizeWallpaper({ source: 'bogus' }).source, 'none')
  assert.equal(normalizeWallpaper('aurora').source, 'none')
})

test('an upload reference keeps only safe, bounded fields', () => {
  const w = normalizeWallpaper({
    source: 'upload', uploadId: 'up-1', kind: 'animated', name: 'x'.repeat(500),
    width: 1920, height: 1080, average: '#112233', vibrant: 'not-a-colour', extra: 'dropped',
  })
  assert.equal(w.kind, 'animated')
  assert.equal(w.name.length, 120)
  assert.equal(w.vibrant, '')
  assert.equal('extra' in w, false)
})

test('applySettingsPatch merges and re-validates', () => {
  const next = applySettingsPatch(DEFAULT_SETTINGS, { layout: 'cards', fontSize: 400 })
  assert.equal(next.layout, 'cards')
  assert.equal(next.fontSize, 32)
  assert.equal(next.lightTheme, DEFAULT_SETTINGS.lightTheme)
})

test('a v2 object is not mistaken for v1 because it lacks keys', () => {
  const s = normalizeSettings({ version: 2, mode: 'dark' })
  assert.equal(s.mode, 'dark')
})
