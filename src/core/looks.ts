// Looks: a handful of finished combinations - theme, type, layout, wallpaper, accent - to
// start from, the way GNOME offers a few curated styles before any fine-tuning. One click
// applies the whole set, and everything stays adjustable afterwards.

import { ACCENT_THEME, ACCENT_WALLPAPER } from './themes.ts'
import { NO_WALLPAPER, normalizeWallpaper, type DumbifySettings, type WallpaperRef } from './settings.ts'

export interface Look {
  id: string
  name: string
  /** A few words on what it is. */
  note: string
  /** The mode it is shown in. A reader on Auto keeps Auto, with both halves set. */
  mode: 'light' | 'dark'
  lightTheme: string
  darkTheme: string
  patch: Partial<DumbifySettings>
}

const preset = (presetId: string): WallpaperRef => normalizeWallpaper({ source: 'preset', presetId })

export const LOOKS: Look[] = [
  {
    id: 'paper',
    name: 'Paper',
    note: 'The calm default',
    mode: 'light',
    lightTheme: 'paper',
    darkTheme: 'ink',
    patch: {
      accent: ACCENT_THEME, font: 'sans', layout: 'list', density: 'comfortable', corners: 'soft',
      pageWidth: 'standard', wallpaper: { ...NO_WALLPAPER },
    },
  },
  {
    id: 'library',
    name: 'Library',
    note: 'Serif on sepia, room to read',
    mode: 'light',
    lightTheme: 'sepia',
    darkTheme: 'mocha',
    patch: {
      accent: ACCENT_THEME, font: 'serif', layout: 'list', density: 'spacious', corners: 'soft',
      pageWidth: 'narrow', wallpaper: preset('peach'), wallpaperEnabled: true, wallpaperPlacement: 'cover',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    note: 'Frosted glass on moving light',
    mode: 'dark',
    lightTheme: 'frost',
    darkTheme: 'midnight',
    patch: {
      accent: ACCENT_WALLPAPER, font: 'sans', layout: 'cards', density: 'comfortable', corners: 'round',
      pageWidth: 'standard', wallpaper: preset('aurora-live'), wallpaperEnabled: true, wallpaperPlacement: 'window',
      surface: 'glass', surfaceOpacity: 0.8, surfaceTint: '', wallpaperFade: 0, wallpaperBlur: 0,
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    note: 'Mono, dense, a table',
    mode: 'dark',
    lightTheme: 'solarized-light',
    darkTheme: 'gruvbox',
    patch: {
      accent: ACCENT_THEME, font: 'mono', layout: 'table', density: 'compact', corners: 'square',
      pageWidth: 'full', wallpaper: { ...NO_WALLPAPER },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    note: 'Warm glass, soft corners',
    mode: 'light',
    lightTheme: 'paper',
    darkTheme: 'rose-pine',
    patch: {
      accent: 'orange', font: 'rounded', layout: 'cards', density: 'comfortable', corners: 'round',
      pageWidth: 'standard', wallpaper: preset('sunset-live'), wallpaperEnabled: true, wallpaperPlacement: 'window',
      surface: 'glass', surfaceOpacity: 0.8, surfaceTint: '', wallpaperFade: 0, wallpaperBlur: 0,
    },
  },
  {
    id: 'notebook',
    name: 'Notebook',
    note: 'A cover on every page',
    mode: 'light',
    lightTheme: 'snow',
    darkTheme: 'graphite',
    patch: {
      accent: 'blue', font: 'sans', layout: 'list', density: 'comfortable', corners: 'soft',
      pageWidth: 'standard', wallpaper: preset('ocean'), wallpaperEnabled: true, wallpaperPlacement: 'cover',
    },
  },
]

export function getLook(id: string): Look | undefined {
  return LOOKS.find((l) => l.id === id)
}

/** What applying a look changes, for a reader whose settings are `current`. */
export function lookPatch(look: Look, current: DumbifySettings): Partial<DumbifySettings> {
  return {
    ...look.patch,
    mode: current.mode === 'auto' ? 'auto' : look.mode,
    lightTheme: look.lightTheme,
    darkTheme: look.darkTheme,
  }
}

/**
 * True while the settings are still this look. Light or dark doesn't matter: a look is
 * both halves, and switching between them is still the same look.
 */
export function matchesLook(s: DumbifySettings, look: Look): boolean {
  if (s.lightTheme !== look.lightTheme || s.darkTheme !== look.darkTheme) return false
  for (const [key, value] of Object.entries(look.patch) as [keyof DumbifySettings, unknown][]) {
    if (key === 'wallpaper') {
      const want = value as WallpaperRef
      if (s.wallpaper.source !== want.source || s.wallpaper.presetId !== want.presetId) return false
    } else if (s[key] !== value) {
      return false
    }
  }
  return true
}
