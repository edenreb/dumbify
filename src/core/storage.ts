import {
  DEFAULT_SETTINGS, LEGACY_UPLOAD_ID, NO_WALLPAPER, RESET_PRESERVES, applySettingsPatch,
  legacyBackground, normalizeSettings, type DumbifySettings, type WallpaperRef,
} from './settings.ts'
import {
  dataUrlBytes, isWallpaperRecord, mimeOfDataUrl, normalizeUploads, pruneUploads, refFromUpload,
  summarize, withUpload, type StillInfo, type UploadSummary, type WallpaperRecord,
} from './wallpaper.ts'

export const SETTINGS_KEY = 'dumbify:settings'
// Uploaded wallpapers live apart from the settings: each one's bytes under its own key,
// and one small list describing them all. v1 kept its image inside the settings object,
// so every font-size tweak re-read and re-wrote megabytes of base64, and every storage
// change event shipped all of it to every open YouTube tab and the service worker. Now a
// settings write is a few hundred bytes, and an image only moves when it changes.
export const UPLOADS_KEY = 'dumbify:uploads'
export const UPLOAD_PREFIX = 'dumbify:upload:'

export function uploadKey(id: string): string {
  return UPLOAD_PREFIX + id
}

// chrome.storage vanishes when the extension context is invalidated - the tab keeps
// running the already-injected content script after the extension reloads or Chrome
// auto-updates it. Every call below reached straight through chrome.storage.local, so
// the first one threw inside a Promise executor, which turns a synchronous throw into a
// rejected promise: "Uncaught (in promise) TypeError: Cannot read properties of
// undefined (reading 'local')", with no catch anywhere in the chain.
function storageArea(): chrome.storage.StorageArea | null {
  try {
    return chrome.storage?.local ?? null
  } catch {
    return null
  }
}

const NO_CONTEXT = 'Dumbify lost its connection to the extension. Reload the page.'

// Reads degrade to "nothing stored", so callers fall back to the defaults and the
// reading view still renders rather than dying on a rejected promise.
function get<T>(key: string): Promise<T | null> {
  const area = storageArea()
  if (!area) return Promise.resolve(null)
  return new Promise((r) => {
    try {
      area.get(key, (res) => r(((res ?? {}) as Record<string, T | undefined>)[key] ?? null))
    } catch {
      r(null)
    }
  })
}

function lastErrorMessage(): string | null {
  try {
    const err = chrome.runtime?.lastError
    return err ? (err.message ?? 'Could not save to extension storage') : null
  } catch {
    return null
  }
}

// Writes cannot degrade quietly - a save that did not happen must say so, and it
// rejects with a message worth showing rather than a TypeError.
function set(key: string, value: unknown): Promise<void> {
  const area = storageArea()
  if (!area) return Promise.reject(new Error(NO_CONTEXT))
  return new Promise((resolve, reject) => {
    area.set({ [key]: value }, () => {
      const err = lastErrorMessage()
      if (err) reject(new Error(friendlyQuotaMessage(err)))
      else resolve()
    })
  })
}

function remove(key: string): Promise<void> {
  const area = storageArea()
  if (!area) return Promise.reject(new Error(NO_CONTEXT))
  return new Promise((resolve, reject) => {
    area.remove(key, () => {
      const err = lastErrorMessage()
      if (err) reject(new Error(err))
      else resolve()
    })
  })
}

function friendlyQuotaMessage(message: string): string {
  return /quota/i.test(message)
    ? 'There isn’t room to store that. Try a smaller file.'
    : message
}

// setSettings is a read-modify-write. Two in flight at once - a double-click in the
// popup, a slider and a toggle - both read the same old object and the second write
// silently dropped the first change. Queueing them per context makes each one read the
// result of the last.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

export async function getUploads(): Promise<UploadSummary[]> {
  return normalizeUploads(await get<unknown>(UPLOADS_KEY))
}

/**
 * Files an upload in the gallery: the bytes first, then the list that names them, so
 * nothing ever lists bytes that are not there. Makes room by dropping the oldest uploads
 * not in `keep`, and returns them.
 */
async function storeUpload(record: WallpaperRecord, info: Partial<StillInfo> | null, keep: string[] = []): Promise<UploadSummary[]> {
  const before = await getUploads()
  await set(uploadKey(record.id), record)
  const { kept, removed } = pruneUploads(withUpload(before, summarize(record, info)), new Set([record.id, ...keep]))
  try {
    await set(UPLOADS_KEY, kept)
  } catch (err) {
    // Bytes no list names could never be seen or deleted again - unless the old list
    // already names them.
    if (!before.some((u) => u.id === record.id)) await remove(uploadKey(record.id)).catch(() => {})
    throw err
  }
  for (const u of removed) await remove(uploadKey(u.id)).catch(() => {})
  return removed
}

/** v1 kept the background image inside the settings object; file it in the gallery. */
async function migrateLegacyWallpaper(raw: unknown): Promise<void> {
  const bg = legacyBackground(raw)
  if (!bg) return
  if (isWallpaperRecord(await get<unknown>(uploadKey(LEGACY_UPLOAD_ID)))) return
  await storeUpload({
    id: LEGACY_UPLOAD_ID,
    name: 'Background image',
    mime: mimeOfDataUrl(bg) || 'image/jpeg',
    kind: 'image',
    dataUrl: bg,
    posterUrl: '',
    width: 0,
    height: 0,
    bytes: dataUrlBytes(bg),
    addedAt: Date.now(),
  }, null)
}

function inUse(s: DumbifySettings): string[] {
  return s.wallpaper.source === 'upload' ? [s.wallpaper.uploadId] : []
}

export async function getSettings(): Promise<DumbifySettings> {
  return normalizeSettings(await get<unknown>(SETTINGS_KEY))
}

/** Applies a partial update and resolves with the settings as stored. */
export function setSettings(partial: Partial<DumbifySettings>): Promise<DumbifySettings> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    // The image has to be safe in the gallery before the settings are rewritten without
    // it - otherwise the first settings change after an update loses it.
    await migrateLegacyWallpaper(raw)
    const next = applySettingsPatch(normalizeSettings(raw), partial)
    await set(SETTINGS_KEY, next)
    return next
  })
}

/** Moves v1 data into place. Safe to call repeatedly; the service worker calls it on update. */
export function migrateStorage(): Promise<void> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    if (!legacyBackground(raw) && (raw === null || (raw as { version?: unknown }).version !== undefined)) return
    await migrateLegacyWallpaper(raw)
    await set(SETTINGS_KEY, normalizeSettings(raw))
  })
}

/**
 * Back to defaults - except the on/off switch, which is not a look. Uploads stay in the
 * gallery: they are the reader's files, and deleting them is a separate, explicit act.
 */
export function resetSettings(): Promise<DumbifySettings> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    await migrateLegacyWallpaper(raw)
    const current = normalizeSettings(raw)
    const next: DumbifySettings = { ...DEFAULT_SETTINGS, wallpaper: { ...DEFAULT_SETTINGS.wallpaper } }
    for (const key of RESET_PRESERVES) (next as any)[key] = current[key]
    await set(SETTINGS_KEY, next)
    return next
  })
}

/**
 * Replaces the settings with an imported backup, adding its wallpaper to the gallery.
 * Like a reset, it leaves the on/off switch as it is: a backup made while Dumbify was
 * switched off should not switch it off here.
 */
export function replaceSettings(settings: DumbifySettings, wallpaper: WallpaperRecord | null): Promise<DumbifySettings> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    await migrateLegacyWallpaper(raw)
    const current = normalizeSettings(raw)
    const next = normalizeSettings(settings)
    for (const key of RESET_PRESERVES) (next as any)[key] = current[key]
    if (wallpaper) {
      await storeUpload(wallpaper, { average: next.wallpaper.average, vibrant: next.wallpaper.vibrant }, inUse(current))
    }
    await set(SETTINGS_KEY, next)
    return next
  })
}

/**
 * The stored upload the settings point at, or null. Before the service worker has run
 * the migration, a v1 image is still inline in the settings object - read it from there.
 */
export async function getWallpaper(ref: WallpaperRef): Promise<WallpaperRecord | null> {
  if (ref.source !== 'upload' || !ref.uploadId) return null
  const record = await get<unknown>(uploadKey(ref.uploadId))
  if (isWallpaperRecord(record) && record.id === ref.uploadId) return record
  if (ref.uploadId === LEGACY_UPLOAD_ID) {
    const bg = legacyBackground(await get<unknown>(SETTINGS_KEY))
    if (bg) {
      return {
        id: LEGACY_UPLOAD_ID, name: 'Background image', mime: mimeOfDataUrl(bg) || 'image/jpeg',
        kind: 'image', dataUrl: bg, posterUrl: '', width: 0, height: 0,
        bytes: dataUrlBytes(bg), addedAt: 0,
      }
    }
  }
  return null
}

/**
 * Adds an upload to the gallery - and, given `use`, makes it the wallpaper with those
 * settings alongside, after the bytes are safely stored: a reader who sees the new
 * settings must be able to find what they name.
 */
export function addUpload(
  record: WallpaperRecord,
  info: Partial<StillInfo> | null,
  use?: Partial<DumbifySettings>,
): Promise<{ settings: DumbifySettings; removed: UploadSummary[] }> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    await migrateLegacyWallpaper(raw)
    let settings = normalizeSettings(raw)
    const removed = await storeUpload(record, info, use ? [] : inUse(settings))
    if (use) {
      settings = applySettingsPatch(settings, { ...use, wallpaper: refFromUpload(summarize(record, info)) })
      await set(SETTINGS_KEY, settings)
    }
    return { settings, removed }
  })
}

/** Deletes an upload from the gallery. If it was the wallpaper, now there is none. */
export function deleteUpload(id: string): Promise<DumbifySettings> {
  return enqueue(async () => {
    // Written back even when unchanged: a v1 object still holding its image inline would
    // otherwise bring a deleted "Background image" straight back.
    let settings = normalizeSettings(await get<unknown>(SETTINGS_KEY))
    if (settings.wallpaper.source === 'upload' && settings.wallpaper.uploadId === id) {
      settings = applySettingsPatch(settings, { wallpaper: { ...NO_WALLPAPER } })
    }
    await set(SETTINGS_KEY, settings)
    await set(UPLOADS_KEY, (await getUploads()).filter((u) => u.id !== id))
    await remove(uploadKey(id))
    return settings
  })
}

/**
 * Fills in the thumbnails and colours uploads are missing: an image carried over from
 * v1, or one restored from a backup. `analyze` does the pixel work, which needs a
 * context with OffscreenCanvas. Resolves with how many it completed.
 */
export async function completeUploads(analyze: (record: WallpaperRecord) => Promise<StillInfo | null>): Promise<number> {
  let done = 0
  for (const pending of (await getUploads()).filter((u) => !u.thumbUrl)) {
    const record = await getWallpaper(refFromUpload(pending))
    const info = record ? await analyze(record) : null
    if (!info) continue
    await enqueue(async () => {
      const list = await getUploads()
      const i = list.findIndex((u) => u.id === pending.id)
      if (i === -1) return // deleted meanwhile
      const u = list[i]
      const filled: UploadSummary = {
        ...u,
        thumbUrl: info.thumbUrl,
        average: u.average || info.average,
        vibrant: u.vibrant || info.vibrant,
        width: u.width || info.width,
        height: u.height || info.height,
      }
      list[i] = filled
      await set(UPLOADS_KEY, list)
      // The settings carry the colours too: the first paint and "accent from wallpaper"
      // read them there.
      const raw = await get<unknown>(SETTINGS_KEY)
      const s = normalizeSettings(raw)
      const ref = s.wallpaper
      if (ref.source === 'upload' && ref.uploadId === u.id && (!ref.average || !ref.vibrant || !ref.width)) {
        await migrateLegacyWallpaper(raw)
        await set(SETTINGS_KEY, applySettingsPatch(s, {
          wallpaper: {
            ...ref,
            average: ref.average || filled.average,
            vibrant: ref.vibrant || filled.vibrant,
            width: ref.width || filled.width,
            height: ref.height || filled.height,
          },
        }))
      }
    })
    done++
  }
  return done
}

type Changes = Record<string, chrome.storage.StorageChange>
// chrome.storage.local.onChanged is newer than the typings here describe, hence the
// structural type rather than a named one.
type ChangeEvent = {
  addListener(cb: (changes: Changes) => void): void
  removeListener(cb: (changes: Changes) => void): void
}

function onLocalChange(cb: (changes: Changes) => void): () => void {
  const area = storageArea() as (chrome.storage.StorageArea & { onChanged?: ChangeEvent }) | null
  const onChanged = area?.onChanged
  if (!onChanged) return () => {}
  onChanged.addListener(cb)
  return () => {
    try { onChanged.removeListener(cb) } catch { /* context gone */ }
  }
}

export function onSettingsChange(cb: (s: DumbifySettings) => void): () => void {
  return onLocalChange((changes) => {
    // Normalised like every read: the new value may be a v1 object written by a tab
    // still running the old build, or missing keys entirely.
    if (changes[SETTINGS_KEY]) cb(normalizeSettings(changes[SETTINGS_KEY].newValue))
  })
}

export function onUploadsChange(cb: (uploads: UploadSummary[]) => void): () => void {
  return onLocalChange((changes) => {
    if (changes[UPLOADS_KEY]) cb(normalizeUploads(changes[UPLOADS_KEY].newValue))
  })
}

/** An upload's bytes were stored, stored again, or deleted. */
export function onUploadChange(cb: (id: string) => void): () => void {
  return onLocalChange((changes) => {
    for (const key of Object.keys(changes)) {
      if (key.startsWith(UPLOAD_PREFIX)) cb(key.slice(UPLOAD_PREFIX.length))
    }
  })
}
