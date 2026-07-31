import type { DumbifySettings } from '../types'

const SETTINGS_KEY = 'dumbify:settings'

const DEFAULT_SETTINGS: DumbifySettings = {
  hideThumbnails: true,
  hideComments: false,
  hideRecommendations: true,
  hideShorts: true,
  hideNotifications: true,
  centerLayout: true,
  compactMode: false,
  readingModeDefault: false,
  autoFocusMode: false,
  fontSize: 20,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  theme: 'light',
}

function get<T>(key: string): Promise<T | null> {
  return new Promise((r) =>
    chrome.storage.local.get(key, (res) => r((res as Record<string, T | undefined>)[key] ?? null))
  )
}

function set(key: string, value: unknown): Promise<void> {
  return new Promise((r) => chrome.storage.local.set({ [key]: value }, r))
}

export async function getSettings(): Promise<DumbifySettings> {
  return (await get<DumbifySettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS
}

export async function setSettings(partial: Partial<DumbifySettings>): Promise<void> {
  const current = await getSettings()
  await set(SETTINGS_KEY, { ...current, ...partial })
}

export async function resetSettings(): Promise<void> {
  await set(SETTINGS_KEY, DEFAULT_SETTINGS)
}

export function onSettingsChange(cb: (s: DumbifySettings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[SETTINGS_KEY]) cb((changes[SETTINGS_KEY].newValue as DumbifySettings) ?? DEFAULT_SETTINGS)
  }
  chrome.storage.local.onChanged.addListener(listener)
  return () => chrome.storage.local.onChanged.removeListener(listener)
}
