import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOKS, getLook, lookPatch, matchesLook } from '../src/core/looks.ts'
import { DEFAULT_SETTINGS, applySettingsPatch } from '../src/core/settings.ts'
import { FONTS, THEMES, getPreset } from '../src/core/themes.ts'
import { computeAppearance } from '../src/core/appearance.ts'
import { contrast } from '../src/core/color.ts'

test('every look is made of things that exist', () => {
  const ids = new Set<string>()
  for (const look of LOOKS) {
    assert.ok(!ids.has(look.id), `duplicate look ${look.id}`)
    ids.add(look.id)
    assert.equal(THEMES.find((t) => t.id === look.lightTheme)?.scheme, 'light', `${look.id}: light theme`)
    assert.equal(THEMES.find((t) => t.id === look.darkTheme)?.scheme, 'dark', `${look.id}: dark theme`)
    if (look.patch.font) assert.ok(FONTS.some((f) => f.id === look.patch.font), `${look.id}: font`)
    const w = look.patch.wallpaper
    if (w?.source === 'preset') assert.ok(getPreset(w.presetId), `${look.id}: wallpaper`)
  }
  assert.ok(LOOKS.length >= 4)
})

test('applying a look sets all of it, and the settings then match it', () => {
  for (const look of LOOKS) {
    const s = applySettingsPatch(DEFAULT_SETTINGS, lookPatch(look, DEFAULT_SETTINGS))
    assert.ok(matchesLook(s, look), `${look.id} survives normalising`)
    assert.equal(s.mode, look.mode)
    for (const other of LOOKS) {
      if (other.id !== look.id) assert.equal(matchesLook(s, other), false, `${look.id} is not also ${other.id}`)
    }
  }
})

test('a reader on Auto keeps Auto, with both halves of the look', () => {
  const auto = { ...DEFAULT_SETTINGS, mode: 'auto' as const }
  const look = getLook('terminal')!
  const s = applySettingsPatch(auto, lookPatch(look, auto))
  assert.equal(s.mode, 'auto')
  assert.equal(s.lightTheme, look.lightTheme)
  assert.equal(s.darkTheme, look.darkTheme)
  assert.ok(matchesLook(s, look))
})

test('changing anything a look set means it is no longer that look', () => {
  const look = getLook('library')!
  const s = applySettingsPatch(DEFAULT_SETTINGS, lookPatch(look, DEFAULT_SETTINGS))
  assert.equal(matchesLook({ ...s, font: 'sans' }, look), false)
  assert.equal(matchesLook({ ...s, wallpaper: { ...s.wallpaper, presetId: 'dots' } }, look), false)
  // Things a look leaves alone don't count - nor does light or dark, since a look is both.
  assert.equal(matchesLook({ ...s, fontSize: 26 }, look), true)
  assert.equal(matchesLook({ ...s, mode: 'dark' }, look), true)
})

test('every look reads well in light and in dark', () => {
  for (const look of LOOKS) {
    for (const mode of ['light', 'dark'] as const) {
      const s = applySettingsPatch(DEFAULT_SETTINGS, { ...lookPatch(look, DEFAULT_SETTINGS), mode })
      const a = computeAppearance(s)
      const bg = a.vars['--df-bg']
      assert.ok(contrast(a.vars['--df-text'], bg) >= 7, `${look.id} ${mode}: body text`)
      assert.ok(contrast(a.vars['--df-text-2'], bg) >= 4.5, `${look.id} ${mode}: secondary text`)
    }
  }
})
