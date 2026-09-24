import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupFileName, parseBackup, serializeBackup } from '../src/core/backup.ts'
import { DEFAULT_SETTINGS, type DumbifySettings } from '../src/core/settings.ts'
import type { WallpaperRecord } from '../src/core/wallpaper.ts'

const record: WallpaperRecord = {
  id: 'up-1', name: 'loop.gif', mime: 'image/gif', kind: 'animated',
  dataUrl: 'data:image/gif;base64,R0lGODlh', posterUrl: '', width: 640, height: 360, bytes: 9, addedAt: 1,
}

const withUpload: DumbifySettings = {
  ...DEFAULT_SETTINGS,
  layout: 'cards',
  wallpaper: { ...DEFAULT_SETTINGS.wallpaper, source: 'upload', uploadId: 'up-1', kind: 'animated', name: 'loop.gif' },
}

test('a backup round-trips settings and wallpaper', () => {
  const back = parseBackup(serializeBackup(withUpload, record))
  assert.deepEqual(back.settings, withUpload)
  assert.deepEqual(back.wallpaper, record)
})

test('a wallpaper the settings do not point at is left out', () => {
  const text = serializeBackup(DEFAULT_SETTINGS, record)
  assert.equal(JSON.parse(text).wallpaper, null)
})

test('a backup whose upload is missing imports with no wallpaper rather than a broken one', () => {
  const text = JSON.stringify({ app: 'dumbify', version: 2, settings: withUpload, wallpaper: null })
  const back = parseBackup(text)
  assert.equal(back.settings.wallpaper.source, 'none')
  assert.equal(back.settings.layout, 'cards')
})

test('backups from v1-shaped settings are migrated on import', () => {
  const text = JSON.stringify({ app: 'dumbify', settings: { theme: 'dark', fontSize: 24, fontFamily: 'Georgia, "Times New Roman", serif' } })
  const back = parseBackup(text)
  assert.equal(back.settings.mode, 'dark')
  assert.equal(back.settings.font, 'classic')
})

test('anything that is not a Dumbify backup is refused with a readable reason', () => {
  assert.throws(() => parseBackup('not json'), /valid JSON/)
  assert.throws(() => parseBackup('{"app":"other"}'), /isn’t a Dumbify backup/)
  assert.throws(() => parseBackup('{"app":"dumbify"}'), /no settings/)
})

test('a tampered wallpaper record is dropped', () => {
  const text = JSON.stringify({ app: 'dumbify', settings: withUpload, wallpaper: { ...record, dataUrl: 'https://evil.example/x.gif' } })
  const back = parseBackup(text)
  assert.equal(back.wallpaper, null)
  assert.equal(back.settings.wallpaper.source, 'none')
})

test('backupFileName is dated', () => {
  assert.equal(backupFileName(new Date('2026-09-24T12:00:00Z')), 'dumbify-settings-2026-09-24.json')
})
