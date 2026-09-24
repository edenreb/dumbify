import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeChrome, type FakeChrome } from './helpers/fake-chrome.ts'
import {
  SETTINGS_KEY, WALLPAPER_KEY, getSettings, getWallpaper, migrateStorage, onSettingsChange,
  replaceSettings, resetSettings, saveWallpaper, setSettings,
} from '../src/core/storage.ts'
import { DEFAULT_SETTINGS, LEGACY_UPLOAD_ID } from '../src/core/settings.ts'
import type { WallpaperRecord } from '../src/core/wallpaper.ts'

const LEGACY_IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

const V1_WITH_BACKGROUND = {
  enabled: true,
  fontSize: 22,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontColor: '#1d1d1d',
  fontColorDark: '#f3f0e8',
  backgroundImage: LEGACY_IMAGE,
  bgOpacity: 0.6,
  theme: 'dark',
}

function record(id: string): WallpaperRecord {
  return {
    id, name: 'loop.gif', mime: 'image/gif', kind: 'animated',
    dataUrl: 'data:image/gif;base64,R0lGODlh', posterUrl: 'data:image/webp;base64,UklG',
    width: 800, height: 600, bytes: 9, addedAt: 1,
  }
}

let chrome: FakeChrome

beforeEach(() => {
  chrome = fakeChrome()
  chrome.install()
})

test('nothing stored reads as the defaults', async () => {
  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
})

test('setSettings persists a partial update over the defaults', async () => {
  await setSettings({ layout: 'cards' })
  const s = await getSettings()
  assert.equal(s.layout, 'cards')
  assert.equal(s.fontSize, DEFAULT_SETTINGS.fontSize)
})

test('concurrent writes are serialised - neither change is lost', async () => {
  // Both would read the same old object without the queue, and the second write would
  // silently undo the first.
  await Promise.all([
    setSettings({ layout: 'table' }),
    setSettings({ fontSize: 26 }),
    setSettings({ mode: 'dark' }),
  ])
  const s = await getSettings()
  assert.equal(s.layout, 'table')
  assert.equal(s.fontSize, 26)
  assert.equal(s.mode, 'dark')
})

test('a failed write rejects with a readable message and does not poison the queue', async () => {
  chrome.failNextSet('QUOTA_BYTES quota exceeded')
  await assert.rejects(setSettings({ layout: 'cards' }), /isn’t room/)
  await setSettings({ layout: 'table' })
  assert.equal((await getSettings()).layout, 'table')
})

test('the first write after an update moves the v1 background out before dropping it', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  await setSettings({ layout: 'cards' })

  const wall = chrome.data.get(WALLPAPER_KEY) as WallpaperRecord
  assert.equal(wall.id, LEGACY_UPLOAD_ID)
  assert.equal(wall.dataUrl, LEGACY_IMAGE)
  // Order matters: the image must be safe before the settings lose it.
  const firstWallpaperWrite = chrome.writes.findIndex(([k]) => k === WALLPAPER_KEY)
  const firstSettingsWrite = chrome.writes.findIndex(([k]) => k === SETTINGS_KEY)
  assert.ok(firstWallpaperWrite < firstSettingsWrite)

  const stored = chrome.data.get(SETTINGS_KEY) as Record<string, unknown>
  assert.equal('backgroundImage' in stored, false)
  const s = await getSettings()
  assert.equal(s.mode, 'dark')
  assert.equal(s.font, 'classic')
  assert.equal(s.fontSize, 22)
  assert.equal(s.surfaceOpacity, 0.6)
  assert.equal(s.layout, 'cards')
  assert.equal(s.wallpaper.uploadId, LEGACY_UPLOAD_ID)
})

test('the legacy image is readable even before anything has migrated it', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  const s = await getSettings()
  const wall = await getWallpaper(s.wallpaper)
  assert.equal(wall?.dataUrl, LEGACY_IMAGE)
})

test('migrateStorage is idempotent', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  await migrateStorage()
  const writes = chrome.writes.length
  await migrateStorage()
  assert.equal(chrome.writes.length, writes, 'a second run should write nothing')
  assert.equal((chrome.data.get(SETTINGS_KEY) as { version: number }).version, 2)
})

test('saveWallpaper stores the bytes before pointing the settings at them', async () => {
  await saveWallpaper(record('up-a'), {
    source: 'upload', presetId: '', uploadId: 'up-a', kind: 'animated', name: 'loop.gif',
    width: 800, height: 600, average: '#112233', vibrant: '#aa3344',
  }, { wallpaperFit: 'tile' })
  const [first, second] = chrome.writes
  assert.equal(first[0], WALLPAPER_KEY)
  assert.equal(second[0], SETTINGS_KEY)
  const s = await getSettings()
  assert.equal(s.wallpaper.uploadId, 'up-a')
  assert.equal(s.wallpaperFit, 'tile')
  assert.equal((await getWallpaper(s.wallpaper))?.kind, 'animated')
})

test('getWallpaper ignores a stored upload the settings do not point at', async () => {
  chrome = fakeChrome({ [WALLPAPER_KEY]: record('up-old') })
  chrome.install()
  const ref = { ...DEFAULT_SETTINGS.wallpaper, source: 'upload' as const, uploadId: 'up-new', kind: 'image' as const }
  assert.equal(await getWallpaper(ref), null)
})

test('settings stay small: the image never rides along in them', async () => {
  await saveWallpaper(record('up-b'), {
    ...DEFAULT_SETTINGS.wallpaper, source: 'upload', uploadId: 'up-b', kind: 'animated',
  })
  await setSettings({ fontSize: 24 })
  const size = JSON.stringify(chrome.data.get(SETTINGS_KEY)).length
  assert.ok(size < 2000, `settings object is ${size} bytes`)
})

test('reset restores the defaults and removes the wallpaper, but keeps the switch', async () => {
  await saveWallpaper(record('up-c'), { ...DEFAULT_SETTINGS.wallpaper, source: 'upload', uploadId: 'up-c', kind: 'animated' })
  await setSettings({ enabled: false, layout: 'cards', mode: 'dark' })
  await resetSettings()
  const s = await getSettings()
  assert.equal(s.enabled, false)
  assert.equal(s.layout, DEFAULT_SETTINGS.layout)
  assert.equal(s.mode, DEFAULT_SETTINGS.mode)
  assert.equal(s.wallpaper.source, 'none')
  assert.equal(chrome.data.has(WALLPAPER_KEY), false)
})

test('replaceSettings restores a backup, wallpaper included', async () => {
  const backup = { ...DEFAULT_SETTINGS, layout: 'table' as const, wallpaper: { ...DEFAULT_SETTINGS.wallpaper, source: 'upload' as const, uploadId: 'up-d', kind: 'animated' as const } }
  await replaceSettings(backup, record('up-d'))
  const s = await getSettings()
  assert.equal(s.layout, 'table')
  assert.equal((await getWallpaper(s.wallpaper))?.id, 'up-d')
})

test('change events arrive normalised', async () => {
  const seen: number[] = []
  const off = onSettingsChange((s) => seen.push(s.fontSize))
  await setSettings({ fontSize: 28 })
  await new Promise((r) => setTimeout(r, 5))
  off()
  assert.deepEqual(seen, [28])
})

test('reads survive a missing extension context', async () => {
  ;(globalThis as any).chrome = undefined
  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS)
  await assert.rejects(setSettings({ layout: 'cards' }), /lost its connection/)
})
