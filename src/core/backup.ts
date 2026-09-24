// Settings backups: one JSON file holding the settings and, if there is one, the
// uploaded wallpaper - so "export, reinstall, import" gives back exactly what was there.

import { NO_WALLPAPER, SETTINGS_VERSION, normalizeSettings, type DumbifySettings } from './settings.ts'
import { isWallpaperRecord, type WallpaperRecord } from './wallpaper.ts'

export const BACKUP_APP = 'dumbify'

export interface Backup {
  settings: DumbifySettings
  wallpaper: WallpaperRecord | null
}

export function serializeBackup(settings: DumbifySettings, wallpaper: WallpaperRecord | null, now = new Date()): string {
  return JSON.stringify({
    app: BACKUP_APP,
    version: SETTINGS_VERSION,
    exportedAt: now.toISOString(),
    settings,
    wallpaper: wallpaper && settings.wallpaper.source === 'upload' && wallpaper.id === settings.wallpaper.uploadId ? wallpaper : null,
  })
}

export function backupFileName(now = new Date()): string {
  return `dumbify-settings-${now.toISOString().slice(0, 10)}.json`
}

/** Reads a backup file, or throws an Error whose message can be shown as-is. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t a Dumbify backup - it isn’t valid JSON.')
  }
  if (typeof data !== 'object' || data === null || (data as { app?: unknown }).app !== BACKUP_APP) {
    throw new Error('That file isn’t a Dumbify backup.')
  }
  const raw = data as { settings?: unknown; wallpaper?: unknown }
  if (typeof raw.settings !== 'object' || raw.settings === null) {
    throw new Error('That backup has no settings in it.')
  }
  const settings = normalizeSettings(raw.settings)
  const wallpaper = isWallpaperRecord(raw.wallpaper) ? raw.wallpaper : null
  // A backup that points at an upload it doesn't carry would leave a wallpaper that can
  // never load; say there is none instead.
  if (settings.wallpaper.source === 'upload' && wallpaper?.id !== settings.wallpaper.uploadId) {
    settings.wallpaper = { ...NO_WALLPAPER }
  }
  return { settings, wallpaper: settings.wallpaper.source === 'upload' ? wallpaper : null }
}
