// The settings model: every preference, its default, and the one function that turns
// whatever is in storage into a complete, valid settings object.
//
// Pure - no chrome, no DOM - so the migration from the old flat format and the
// validation of every field are covered by unit tests rather than by hoping.

import {
  ACCENTS, ACCENT_THEME, ACCENT_WALLPAPER, DEFAULT_DARK_THEME, DEFAULT_FONT,
  DEFAULT_LIGHT_THEME, FONTS, THEMES, getPreset,
} from './themes.ts'
import { isHex, normalizeHex } from './color.ts'

export const SETTINGS_VERSION = 2

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FeedLayout = 'list' | 'cards' | 'table'
export type Density = 'compact' | 'comfortable' | 'spacious'
export type Corners = 'square' | 'soft' | 'round'
export type PageWidth = 'narrow' | 'standard' | 'full'
export type SidebarMode = 'expanded' | 'rail' | 'hidden'
export type WatchLayout = 'classic' | 'theater' | 'split'
export type SurfaceStyle = 'solid' | 'glass' | 'clear'
export type WallpaperFit = 'fill' | 'fit' | 'tile'
export type WallpaperPlacement = 'window' | 'cover'
export type LineSpacing = 'tight' | 'normal' | 'relaxed'
export type WallpaperKind = 'none' | 'image' | 'animated' | 'video' | 'gradient' | 'pattern' | 'live'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto']
export const FEED_LAYOUTS: readonly FeedLayout[] = ['list', 'cards', 'table']
export const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'spacious']
export const CORNERS: readonly Corners[] = ['square', 'soft', 'round']
export const PAGE_WIDTHS: readonly PageWidth[] = ['narrow', 'standard', 'full']
export const SIDEBAR_MODES: readonly SidebarMode[] = ['expanded', 'rail', 'hidden']
export const WATCH_LAYOUTS: readonly WatchLayout[] = ['classic', 'theater', 'split']
export const SURFACE_STYLES: readonly SurfaceStyle[] = ['solid', 'glass', 'clear']
export const WALLPAPER_FITS: readonly WallpaperFit[] = ['fill', 'fit', 'tile']
export const WALLPAPER_PLACEMENTS: readonly WallpaperPlacement[] = ['window', 'cover']
export const LINE_SPACINGS: readonly LineSpacing[] = ['tight', 'normal', 'relaxed']
const WALLPAPER_KINDS: readonly WallpaperKind[] = ['none', 'image', 'animated', 'video', 'gradient', 'pattern', 'live']

export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 32

/**
 * What the settings object knows about the wallpaper. Small on purpose: an uploaded
 * image's bytes live under their own storage key (see storage.ts), because every
 * settings write and every change event carries this whole object.
 */
export interface WallpaperRef {
  source: 'none' | 'preset' | 'upload'
  presetId: string
  /** Matches WallpaperRecord.id for an upload. */
  uploadId: string
  kind: WallpaperKind
  name: string
  width: number
  height: number
  /** Painted before the image itself has loaded. '' when unknown. */
  average: string
  /** Backs the "accent from wallpaper" option. '' when unknown. */
  vibrant: string
}

export interface DumbifySettings {
  version: number
  enabled: boolean

  // Appearance
  mode: ThemeMode
  lightTheme: string
  darkTheme: string
  /** 'theme', 'wallpaper', an ACCENTS id, or a #rrggbb colour. */
  accent: string
  corners: Corners
  density: Density

  // Typography
  font: string
  fontSize: number
  lineSpacing: LineSpacing
  /** '' follows the theme. */
  textColorLight: string
  textColorDark: string

  // Wallpaper
  wallpaper: WallpaperRef
  wallpaperEnabled: boolean
  wallpaperAnimate: boolean
  wallpaperPlacement: WallpaperPlacement
  wallpaperFit: WallpaperFit
  wallpaperFocusX: number
  wallpaperFocusY: number
  wallpaperBlur: number
  wallpaperFade: number
  surface: SurfaceStyle
  surfaceOpacity: number
  /** '' uses the theme's own colours for the panels. */
  surfaceTint: string
  surfaceBlur: number

  // Layout
  layout: FeedLayout
  pageWidth: PageWidth
  sidebar: SidebarMode
  showNumbers: boolean
  showChannel: boolean
  showViews: boolean
  showDate: boolean
  showDuration: boolean

  // Watch page
  watchLayout: WatchLayout
  autoDescription: boolean
  autoComments: boolean
}

export const NO_WALLPAPER: WallpaperRef = {
  source: 'none', presetId: '', uploadId: '', kind: 'none', name: '',
  width: 0, height: 0, average: '', vibrant: '',
}

export const DEFAULT_SETTINGS: DumbifySettings = {
  version: SETTINGS_VERSION,
  enabled: true,

  mode: 'light',
  lightTheme: DEFAULT_LIGHT_THEME,
  darkTheme: DEFAULT_DARK_THEME,
  accent: ACCENT_THEME,
  corners: 'soft',
  density: 'comfortable',

  font: DEFAULT_FONT,
  fontSize: 20,
  lineSpacing: 'normal',
  textColorLight: '',
  textColorDark: '',

  wallpaper: NO_WALLPAPER,
  wallpaperEnabled: true,
  wallpaperAnimate: true,
  wallpaperPlacement: 'window',
  wallpaperFit: 'fill',
  wallpaperFocusX: 50,
  wallpaperFocusY: 50,
  wallpaperBlur: 0,
  wallpaperFade: 0,
  surface: 'glass',
  surfaceOpacity: 0.85,
  surfaceTint: '',
  surfaceBlur: 18,

  layout: 'list',
  pageWidth: 'standard',
  sidebar: 'expanded',
  showNumbers: true,
  showChannel: true,
  showViews: true,
  showDate: true,
  showDuration: true,

  watchLayout: 'classic',
  autoDescription: false,
  autoComments: false,
}

/** The id an upload migrated out of the v1 settings object is filed under. */
export const LEGACY_UPLOAD_ID = 'legacy'

// v1 stored the font as the CSS stack itself, picked from eight fixed options. Each maps
// to the closest v2 choice. The old default ("System") was never a deliberate pick for
// most people, so it follows the new default rather than pinning them to system-ui.
export const LEGACY_FONT_MAP: Record<string, string> = {
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif': DEFAULT_FONT,
  'Georgia, "Times New Roman", serif': 'classic',
  '"Helvetica Neue", Helvetica, Arial, sans-serif': 'grotesk',
  'Garamond, "Times New Roman", serif': 'oldstyle',
  'Courier, "Courier New", monospace': 'typewriter',
  'Verdana, Geneva, sans-serif': 'verdana',
  '"Lucida Grande", "Lucida Sans Unicode", sans-serif': 'humanist',
  '"Times New Roman", Times, serif': 'classic',
}

// v1's text colour defaults. Carried over verbatim they would pin every existing reader
// to a colour picked for the old palette; recognised, they become "follow the theme".
const LEGACY_DEFAULT_TEXT_LIGHT = '#1d1d1d'
const LEGACY_DEFAULT_TEXT_DARK = '#f3f0e8'

type Raw = Record<string, unknown>

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function num(value: unknown, min: number, max: number, fallback: number, decimals = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  const clamped = Math.max(min, Math.min(max, n))
  const f = 10 ** decimals
  return Math.round(clamped * f) / f
}

/** A hex colour, or '' meaning "use the theme's". */
function optionalColor(value: unknown): string {
  return isHex(value) ? normalizeHex(value) : ''
}

function str(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function themeId(value: unknown, scheme: 'light' | 'dark', fallback: string): string {
  return typeof value === 'string' && THEMES.some((t) => t.id === value && t.scheme === scheme) ? value : fallback
}

function fontId(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_FONT
  if (FONTS.some((f) => f.id === value)) return value
  return LEGACY_FONT_MAP[value] ?? DEFAULT_FONT
}

function accentValue(value: unknown): string {
  if (value === ACCENT_THEME || value === ACCENT_WALLPAPER) return value
  if (typeof value === 'string' && ACCENTS.some((a) => a.id === value)) return value
  if (isHex(value)) return normalizeHex(value)
  return ACCENT_THEME
}

export function normalizeWallpaper(value: unknown): WallpaperRef {
  if (!isRecord(value)) return { ...NO_WALLPAPER }
  const source = pick(value.source, ['none', 'preset', 'upload'] as const, 'none')
  if (source === 'none') return { ...NO_WALLPAPER }
  if (source === 'preset') {
    const preset = getPreset(str(value.presetId))
    if (!preset) return { ...NO_WALLPAPER }
    return {
      ...NO_WALLPAPER,
      source,
      presetId: preset.id,
      kind: preset.kind === 'animated' ? 'live' : preset.kind,
      name: preset.name,
      average: preset.kind === 'pattern' ? '' : preset.average,
      vibrant: preset.kind === 'pattern' ? '' : preset.vibrant,
    }
  }
  const uploadId = str(value.uploadId, 80)
  if (!uploadId) return { ...NO_WALLPAPER }
  const kind = pick(value.kind, WALLPAPER_KINDS, 'image')
  return {
    source,
    presetId: '',
    uploadId,
    kind: kind === 'image' || kind === 'animated' || kind === 'video' ? kind : 'image',
    name: str(value.name, 120),
    width: num(value.width, 0, 100000, 0),
    height: num(value.height, 0, 100000, 0),
    average: optionalColor(value.average),
    vibrant: optionalColor(value.vibrant),
  }
}

function isLegacy(raw: Raw): boolean {
  return raw.version === undefined && (
    'theme' in raw || 'fontFamily' in raw || 'backgroundImage' in raw ||
    'bgOpacity' in raw || 'fontColor' in raw || 'fontColorDark' in raw
  )
}

// Maps a v1 object onto v2 field names. Only the fields v1 had; normalizeSettings then
// validates everything and fills the rest from defaults.
function fromLegacy(raw: Raw): Raw {
  const out: Raw = {}
  if ('enabled' in raw) out.enabled = raw.enabled
  if (raw.theme === 'light' || raw.theme === 'dark') out.mode = raw.theme
  if ('fontSize' in raw) out.fontSize = raw.fontSize
  if ('fontFamily' in raw) out.font = raw.fontFamily
  const light = optionalColor(raw.fontColor)
  if (light && light !== LEGACY_DEFAULT_TEXT_LIGHT) out.textColorLight = light
  const dark = optionalColor(raw.fontColorDark)
  if (dark && dark !== LEGACY_DEFAULT_TEXT_DARK) out.textColorDark = dark
  if ('bgOpacity' in raw) out.surfaceOpacity = raw.bgOpacity
  if (typeof raw.backgroundImage === 'string' && raw.backgroundImage.startsWith('data:')) {
    out.wallpaper = {
      source: 'upload',
      uploadId: LEGACY_UPLOAD_ID,
      kind: 'image',
      name: 'Background image',
    }
  }
  return out
}

/**
 * Whatever was stored - nothing, a v1 object, a v2 object from a newer or older build,
 * or garbage - becomes a complete, valid DumbifySettings. Unknown keys are dropped;
 * out-of-range numbers are clamped; unknown ids fall back to their defaults.
 */
export function normalizeSettings(input: unknown): DumbifySettings {
  if (!isRecord(input)) return structuredCloneSettings(DEFAULT_SETTINGS)
  const raw = isLegacy(input) ? fromLegacy(input) : input
  const d = DEFAULT_SETTINGS
  return {
    version: SETTINGS_VERSION,
    enabled: bool(raw.enabled, d.enabled),

    mode: pick(raw.mode, THEME_MODES, d.mode),
    lightTheme: themeId(raw.lightTheme, 'light', d.lightTheme),
    darkTheme: themeId(raw.darkTheme, 'dark', d.darkTheme),
    accent: accentValue(raw.accent),
    corners: pick(raw.corners, CORNERS, d.corners),
    density: pick(raw.density, DENSITIES, d.density),

    font: fontId(raw.font),
    fontSize: num(raw.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, d.fontSize),
    lineSpacing: pick(raw.lineSpacing, LINE_SPACINGS, d.lineSpacing),
    textColorLight: optionalColor(raw.textColorLight),
    textColorDark: optionalColor(raw.textColorDark),

    wallpaper: normalizeWallpaper(raw.wallpaper),
    wallpaperEnabled: bool(raw.wallpaperEnabled, d.wallpaperEnabled),
    wallpaperAnimate: bool(raw.wallpaperAnimate, d.wallpaperAnimate),
    wallpaperPlacement: pick(raw.wallpaperPlacement, WALLPAPER_PLACEMENTS, d.wallpaperPlacement),
    wallpaperFit: pick(raw.wallpaperFit, WALLPAPER_FITS, d.wallpaperFit),
    wallpaperFocusX: num(raw.wallpaperFocusX, 0, 100, d.wallpaperFocusX),
    wallpaperFocusY: num(raw.wallpaperFocusY, 0, 100, d.wallpaperFocusY),
    wallpaperBlur: num(raw.wallpaperBlur, 0, 40, d.wallpaperBlur),
    wallpaperFade: num(raw.wallpaperFade, 0, 0.9, d.wallpaperFade, 2),
    surface: pick(raw.surface, SURFACE_STYLES, d.surface),
    surfaceOpacity: num(raw.surfaceOpacity, 0, 1, d.surfaceOpacity, 2),
    surfaceTint: optionalColor(raw.surfaceTint),
    surfaceBlur: num(raw.surfaceBlur, 0, 40, d.surfaceBlur),

    layout: pick(raw.layout, FEED_LAYOUTS, d.layout),
    pageWidth: pick(raw.pageWidth, PAGE_WIDTHS, d.pageWidth),
    sidebar: pick(raw.sidebar, SIDEBAR_MODES, d.sidebar),
    showNumbers: bool(raw.showNumbers, d.showNumbers),
    showChannel: bool(raw.showChannel, d.showChannel),
    showViews: bool(raw.showViews, d.showViews),
    showDate: bool(raw.showDate, d.showDate),
    showDuration: bool(raw.showDuration, d.showDuration),

    watchLayout: pick(raw.watchLayout, WATCH_LAYOUTS, d.watchLayout),
    autoDescription: bool(raw.autoDescription, d.autoDescription),
    autoComments: bool(raw.autoComments, d.autoComments),
  }
}

function structuredCloneSettings(s: DumbifySettings): DumbifySettings {
  return { ...s, wallpaper: { ...s.wallpaper } }
}

/** Merges a partial update over current settings and re-validates the result. */
export function applySettingsPatch(current: DumbifySettings, patch: Partial<DumbifySettings>): DumbifySettings {
  return normalizeSettings({ ...current, ...patch, version: SETTINGS_VERSION })
}

/** True when the stored object is v1 and still carries its background image inline. */
export function legacyBackground(raw: unknown): string | null {
  if (!isRecord(raw) || raw.version !== undefined) return null
  const bg = raw.backgroundImage
  return typeof bg === 'string' && bg.startsWith('data:') ? bg : null
}

/** Settings that only exist to be flipped from the page, so resets can spare them. */
export const RESET_PRESERVES: (keyof DumbifySettings)[] = ['enabled']
