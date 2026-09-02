import type { DumbifySettings } from '../types'

const SETTINGS_KEY = 'dumbify:settings'

// The reading view's two paper colours. Shared because the options page paints itself
// with the same palette and used to carry its own copy of both hex values.
export const LIGHT_BG = '#f7f5ee'
export const DARK_BG = '#1d1d1d'

const DEFAULT_SETTINGS: DumbifySettings = {
  fontSize: 20,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontColor: '#1d1d1d',
  fontColorDark: '#f3f0e8',
  backgroundImage: '',
  bgOpacity: 0.85,
  theme: 'light',
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

// Reads degrade to "nothing stored", so callers fall back to DEFAULT_SETTINGS and the
// reading view still renders rather than dying on a rejected promise.
function get<T>(key: string): Promise<T | null> {
  const area = storageArea()
  if (!area) return Promise.resolve(null)
  return new Promise((r) =>
    area.get(key, (res) => r((res as Record<string, T | undefined>)[key] ?? null))
  )
}

// Rejects on failure instead of resolving regardless. chrome.storage.local is capped at
// 10 MB, so a large background image genuinely does fail to write - and callers were
// reporting "Saved" for a write that never happened.
// Writes cannot degrade quietly - a save that did not happen must say so - but it
// rejects with a message worth showing rather than a TypeError.
function set(key: string, value: unknown): Promise<void> {
  const area = storageArea()
  if (!area) return Promise.reject(new Error(NO_CONTEXT))
  return new Promise((resolve, reject) => {
    area.set({ [key]: value }, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message ?? 'Could not save to extension storage'))
      else resolve()
    })
  })
}

export async function getSettings(): Promise<DumbifySettings> {
  // Merge over the defaults rather than returning the stored object as-is: a settings
  // object written before a key existed would otherwise come back missing that key,
  // and callers read it as a complete DumbifySettings.
  const stored = await get<Partial<DumbifySettings>>(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function setSettings(partial: Partial<DumbifySettings>): Promise<void> {
  const current = await getSettings()
  await set(SETTINGS_KEY, { ...current, ...partial })
}

export async function resetSettings(): Promise<void> {
  await set(SETTINGS_KEY, DEFAULT_SETTINGS)
}

export function onSettingsChange(cb: (s: DumbifySettings) => void): () => void {
  // chrome.storage.local.onChanged is newer than the typings here describe, hence the
  // structural type rather than a named one.
  type ChangeEvent = {
    addListener(cb: (changes: Record<string, chrome.storage.StorageChange>) => void): void
    removeListener(cb: (changes: Record<string, chrome.storage.StorageChange>) => void): void
  }
  const area = storageArea() as (chrome.storage.StorageArea & { onChanged?: ChangeEvent }) | null
  const onChanged = area?.onChanged
  if (!onChanged) return () => {}
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[SETTINGS_KEY]) cb((changes[SETTINGS_KEY].newValue as DumbifySettings) ?? DEFAULT_SETTINGS)
  }
  onChanged.addListener(listener)
  return () => onChanged.removeListener(listener)
}
