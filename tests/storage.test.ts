import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeChrome, type FakeChrome } from './helpers/fake-chrome.ts'
import {
  SETTINGS_KEY, UPLOADS_KEY, addUpload, completeUploads, deleteUpload, getSettings, getUploads,
  getWallpaper, migrateStorage, onSettingsChange, onUploadChange, onUploadsChange, replaceSettings,
  resetSettings, setSettings, uploadKey,
} from '../src/core/storage.ts'
import { DEFAULT_SETTINGS, LEGACY_UPLOAD_ID } from '../src/core/settings.ts'
import { MAX_UPLOADS, refFromUpload, type StillInfo, type WallpaperRecord } from '../src/core/wallpaper.ts'

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

function record(id: string, fields: Partial<WallpaperRecord> = {}): WallpaperRecord {
  return {
    id, name: 'loop.gif', mime: 'image/gif', kind: 'animated',
    dataUrl: 'data:image/gif;base64,R0lGODlh', posterUrl: 'data:image/webp;base64,UklG',
    width: 800, height: 600, bytes: 9, addedAt: 1, ...fields,
  }
}

const INFO: StillInfo = {
  thumbUrl: 'data:image/webp;base64,UklGRg==', average: '#223344', vibrant: '#aa3344', width: 800, height: 600,
}

const tick = () => new Promise((r) => setTimeout(r, 5))

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

test('the first write after an update files the v1 background in the gallery before dropping it', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  await setSettings({ layout: 'cards' })

  const wall = chrome.data.get(uploadKey(LEGACY_UPLOAD_ID)) as WallpaperRecord
  assert.equal(wall.id, LEGACY_UPLOAD_ID)
  assert.equal(wall.dataUrl, LEGACY_IMAGE)
  // Order matters: the image must be safe - bytes, then the list naming them - before
  // the settings lose it.
  const bytesWrite = chrome.writes.findIndex(([k]) => k === uploadKey(LEGACY_UPLOAD_ID))
  const listWrite = chrome.writes.findIndex(([k]) => k === UPLOADS_KEY)
  const settingsWrite = chrome.writes.findIndex(([k]) => k === SETTINGS_KEY)
  assert.ok(bytesWrite < listWrite && listWrite < settingsWrite, JSON.stringify(chrome.writes.map(([k]) => k)))
  assert.deepEqual((await getUploads()).map((u) => u.id), [LEGACY_UPLOAD_ID])

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

test('a migrated v1 image gets its thumbnail and colours, in the gallery and the settings', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  await migrateStorage()
  assert.equal((await getSettings()).wallpaper.average, '', 'nothing has analysed it yet')

  const seen: string[] = []
  const done = await completeUploads(async (r) => { seen.push(r.dataUrl); return INFO })
  assert.equal(done, 1)
  assert.deepEqual(seen, [LEGACY_IMAGE])
  const [u] = await getUploads()
  assert.equal(u.thumbUrl, INFO.thumbUrl)
  assert.equal(u.width, 800)
  const s = await getSettings()
  assert.equal(s.wallpaper.average, INFO.average)
  assert.equal(s.wallpaper.vibrant, INFO.vibrant)
  assert.equal(s.fontSize, 22, 'the rest of the settings are untouched')

  // Nothing left to do the second time.
  assert.equal(await completeUploads(async () => INFO), 0)
})

test('completeUploads skips what cannot be analysed, and leaves the settings alone for other uploads', async () => {
  await addUpload(record('up-a'), null, {})
  await addUpload(record('up-b'), INFO)
  const before = await getSettings()
  assert.equal(await completeUploads(async () => null), 0)
  assert.equal((await getUploads()).find((u) => u.id === 'up-a')?.thumbUrl, '')
  assert.deepEqual(await getSettings(), before)
})

test('addUpload stores the bytes, then the list, then points the settings at them', async () => {
  const { settings, removed } = await addUpload(record('up-a'), INFO, { wallpaperFit: 'tile' })
  assert.deepEqual(removed, [])
  assert.deepEqual(chrome.writes.map(([k]) => k), [uploadKey('up-a'), UPLOADS_KEY, SETTINGS_KEY])
  assert.equal(settings.wallpaper.uploadId, 'up-a')
  assert.equal(settings.wallpaper.average, INFO.average, 'the colours ride along for the first paint')
  assert.equal(settings.wallpaperFit, 'tile')
  assert.equal((await getWallpaper(settings.wallpaper))?.kind, 'animated')
  const [summary] = await getUploads()
  assert.equal(summary.thumbUrl, INFO.thumbUrl)
  assert.equal(summary.mime, 'image/gif')
})

test('an upload whose list cannot be written is not left behind unlisted', async () => {
  await addUpload(record('up-a'), INFO, {})
  // The bytes land, then the list write fails.
  const set = (globalThis as any).chrome.storage.local.set
  let calls = 0
  ;(globalThis as any).chrome.storage.local.set = (items: Record<string, unknown>, cb: () => void) => {
    if (Object.keys(items)[0] === UPLOADS_KEY && calls++ === 0) {
      chrome.failNextSet('QUOTA_BYTES quota exceeded')
    }
    return set(items, cb)
  }
  await assert.rejects(addUpload(record('up-b'), INFO, {}), /isn’t room/)
  assert.equal(chrome.data.has(uploadKey('up-b')), false, 'new bytes cleaned up')
  // Storing again an upload the list already names keeps its bytes whatever happens.
  calls = 0
  await assert.rejects(addUpload(record('up-a'), INFO), /isn’t room/)
  assert.equal(chrome.data.has(uploadKey('up-a')), true)
  assert.deepEqual((await getUploads()).map((u) => u.id), ['up-a'])
})

test('addUpload without `use` only files it: the wallpaper in use stays', async () => {
  await addUpload(record('up-a'), INFO, {})
  const { settings } = await addUpload(record('up-b'), INFO)
  assert.equal(settings.wallpaper.uploadId, 'up-a')
  assert.deepEqual((await getUploads()).map((u) => u.id), ['up-b', 'up-a'])
})

test('uploads stay reachable after switching to a built-in wallpaper', async () => {
  await addUpload(record('up-a'), INFO, {})
  await setSettings({ wallpaper: { ...DEFAULT_SETTINGS.wallpaper, source: 'preset', presetId: 'aurora' } })
  const [u] = await getUploads()
  assert.equal(u.id, 'up-a')
  assert.equal((await getWallpaper(refFromUpload(u)))?.id, 'up-a')
})

test('the gallery keeps the newest uploads, never dropping the one in use', async () => {
  await addUpload(record('up-0', { name: 'first.gif' }), INFO, {})
  for (let i = 1; i < MAX_UPLOADS; i++) await addUpload(record(`up-${i}`), INFO)
  assert.equal((await getUploads()).length, MAX_UPLOADS)
  // up-0 is the oldest but the wallpaper in use, so up-1 makes room instead.
  const { removed } = await addUpload(record('up-new'), INFO)
  assert.deepEqual(removed.map((u) => u.id), ['up-1'])
  const ids = (await getUploads()).map((u) => u.id)
  assert.equal(ids.length, MAX_UPLOADS)
  assert.ok(ids.includes('up-0'))
  assert.equal(chrome.data.has(uploadKey('up-1')), false, 'its bytes are gone too')
})

test('deleteUpload frees the bytes, and the wallpaper goes with it if it was in use', async () => {
  await addUpload(record('up-a'), INFO, {})
  await addUpload(record('up-b'), INFO)
  let s = await deleteUpload('up-b')
  assert.equal(s.wallpaper.uploadId, 'up-a', 'deleting another upload leaves the wallpaper')
  assert.equal(chrome.data.has(uploadKey('up-b')), false)
  s = await deleteUpload('up-a')
  assert.equal(s.wallpaper.source, 'none')
  assert.deepEqual(await getUploads(), [])
  assert.equal(chrome.data.has(uploadKey('up-a')), false)
})

test('a deleted v1 image does not come back from the settings it came from', async () => {
  chrome = fakeChrome({ [SETTINGS_KEY]: V1_WITH_BACKGROUND })
  chrome.install()
  await migrateStorage()
  await deleteUpload(LEGACY_UPLOAD_ID)
  await setSettings({ fontSize: 30 })
  assert.deepEqual(await getUploads(), [])
  const s = await getSettings()
  assert.equal(s.wallpaper.source, 'none')
  assert.equal(await getWallpaper({ ...s.wallpaper, source: 'upload', uploadId: LEGACY_UPLOAD_ID }), null)
})

test('getWallpaper ignores an upload that is not stored', async () => {
  await addUpload(record('up-old'), INFO)
  const ref = { ...DEFAULT_SETTINGS.wallpaper, source: 'upload' as const, uploadId: 'up-new', kind: 'image' as const }
  assert.equal(await getWallpaper(ref), null)
})

test('settings stay small: the image never rides along in them', async () => {
  await addUpload(record('up-b'), INFO, {})
  await setSettings({ fontSize: 24 })
  const size = JSON.stringify(chrome.data.get(SETTINGS_KEY)).length
  assert.ok(size < 2000, `settings object is ${size} bytes`)
})

test('reset restores the defaults but keeps the switch and the uploads', async () => {
  await addUpload(record('up-c'), INFO, {})
  await setSettings({ enabled: false, layout: 'cards', mode: 'dark' })
  await resetSettings()
  const s = await getSettings()
  assert.equal(s.enabled, false)
  assert.equal(s.layout, DEFAULT_SETTINGS.layout)
  assert.equal(s.mode, DEFAULT_SETTINGS.mode)
  assert.equal(s.wallpaper.source, 'none')
  assert.deepEqual((await getUploads()).map((u) => u.id), ['up-c'], 'deleting files is its own, explicit act')
})

test('replaceSettings restores a backup into the gallery and keeps Dumbify switched on', async () => {
  await addUpload(record('up-mine'), INFO, {})
  const backup = {
    ...DEFAULT_SETTINGS,
    enabled: false,
    layout: 'table' as const,
    wallpaper: { ...DEFAULT_SETTINGS.wallpaper, source: 'upload' as const, uploadId: 'up-d', kind: 'animated' as const, average: '#445566' },
  }
  await replaceSettings(backup, record('up-d'))
  const s = await getSettings()
  assert.equal(s.layout, 'table')
  assert.equal(s.enabled, true, 'a backup made while switched off does not switch it off here')
  assert.equal((await getWallpaper(s.wallpaper))?.id, 'up-d')
  const uploads = await getUploads()
  assert.deepEqual(uploads.map((u) => u.id), ['up-d', 'up-mine'], 'your own upload is still there')
  assert.equal(uploads[0].average, '#445566')
})

test('upload events name what changed', async () => {
  const ids: string[] = []
  const lists: number[] = []
  const offA = onUploadChange((id) => ids.push(id))
  const offB = onUploadsChange((list) => lists.push(list.length))
  await addUpload(record('up-a'), INFO, {})
  await deleteUpload('up-a')
  await tick()
  offA()
  offB()
  assert.deepEqual(ids, ['up-a', 'up-a'])
  assert.deepEqual(lists, [1, 0])
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
