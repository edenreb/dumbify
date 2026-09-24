import {
  DEFAULT_SETTINGS, LEGACY_UPLOAD_ID, RESET_PRESERVES, applySettingsPatch,
  legacyBackground, normalizeSettings, type DumbifySettings, type WallpaperRef,
} from './settings.ts'
import { dataUrlBytes, isWallpaperRecord, mimeOfDataUrl, type WallpaperRecord } from './wallpaper.ts'

export const SETTINGS_KEY = 'dumbify:settings'
// The wallpaper's bytes live apart from the settings. v1 kept the image inside the
// settings object, so every font-size tweak re-read and re-wrote megabytes of base64,
// and every storage change event shipped all of it to every open YouTube tab and the
// service worker. Now a settings write is a few hundred bytes, and the image only moves
// when the image changes.
export const WALLPAPER_KEY = 'dumbify:wallpaper'

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

/** v1 kept the background image inside the settings object; file it under its own key. */
async function migrateLegacyWallpaper(raw: unknown): Promise<void> {
  const bg = legacyBackground(raw)
  if (!bg) return
  const existing = await get<WallpaperRecord>(WALLPAPER_KEY)
  if (isWallpaperRecord(existing) && existing.id === LEGACY_UPLOAD_ID) return
  const record: WallpaperRecord = {
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
  }
  await set(WALLPAPER_KEY, record)
}

export async function getSettings(): Promise<DumbifySettings> {
  return normalizeSettings(await get<unknown>(SETTINGS_KEY))
}

/** Applies a partial update and resolves with the settings as stored. */
export function setSettings(partial: Partial<DumbifySettings>): Promise<DumbifySettings> {
  return enqueue(async () => {
    const raw = await get<unknown>(SETTINGS_KEY)
    // The image has to be safe under its own key before the settings are rewritten
    // without it - otherwise the first settings change after an update loses it.
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

/** Back to defaults, wallpaper included - except the on/off switch, which is not a look. */
export function resetSettings(): Promise<DumbifySettings> {
  return enqueue(async () => {
    const current = normalizeSettings(await get<unknown>(SETTINGS_KEY))
    const next: DumbifySettings = { ...DEFAULT_SETTINGS, wallpaper: { ...DEFAULT_SETTINGS.wallpaper } }
    for (const key of RESET_PRESERVES) (next as any)[key] = current[key]
    await set(SETTINGS_KEY, next)
    await remove(WALLPAPER_KEY)
    return next
  })
}

/** Replaces everything with an imported backup. */
export function replaceSettings(settings: DumbifySettings, wallpaper: WallpaperRecord | null): Promise<DumbifySettings> {
  return enqueue(async () => {
    if (wallpaper) await set(WALLPAPER_KEY, wallpaper)
    const next = normalizeSettings(settings)
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
  const record = await get<unknown>(WALLPAPER_KEY)
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
 * Stores a new upload and points the settings at it, in that order: a reader who sees
 * the new settings must be able to find the bytes they name.
 */
export function saveWallpaper(record: WallpaperRecord, ref: WallpaperRef, extra: Partial<DumbifySettings> = {}): Promise<DumbifySettings> {
  return enqueue(async () => {
    await set(WALLPAPER_KEY, record)
    const raw = await get<unknown>(SETTINGS_KEY)
    const next = applySettingsPatch(normalizeSettings(raw), { ...extra, wallpaper: ref })
    await set(SETTINGS_KEY, next)
    return next
  })
}

/** Frees an upload's storage once nothing points at it. */
export function clearStoredWallpaper(): Promise<void> {
  return enqueue(() => remove(WALLPAPER_KEY))
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

export function onWallpaperChange(cb: () => void): () => void {
  return onLocalChange((changes) => {
    if (changes[WALLPAPER_KEY]) cb()
  })
}
