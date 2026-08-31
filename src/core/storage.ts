import type { DumbifySettings } from '../types'

const SETTINGS_KEY = 'dumbify:settings'

const DEFAULT_SETTINGS: DumbifySettings = {
  fontSize: 20,
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  fontColor: '#1d1d1d',
  fontColorDark: '#f3f0e8',
  backgroundImage: '',
  bgOpacity: 0.85,
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
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[SETTINGS_KEY]) cb((changes[SETTINGS_KEY].newValue as DumbifySettings) ?? DEFAULT_SETTINGS)
  }
  chrome.storage.local.onChanged.addListener(listener)
  return () => chrome.storage.local.onChanged.removeListener(listener)
}
