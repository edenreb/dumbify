// Turns settings into what the CSS actually reads: custom properties for every colour,
// size and font, and data- attributes for every discrete choice (layout, density, ...).
//
// computeAppearance is pure so it can be tested; applyAppearance is the thin DOM half.
// The reading view, the settings page's live preview, the settings page itself and the
// popup all go through here, which is what keeps the four looking like one product.

import {
  ACCENT_THEME, ACCENT_WALLPAPER, MONO_FONT, UI_FONT, accentPreset, getFont, getPreset,
  getTheme, type Scheme, type Theme,
} from './themes.ts'
import { contrast, ensureContrast, isHex, mix, readableOn, rgba } from './color.ts'
import type { DumbifySettings } from './settings.ts'

export interface Appearance {
  scheme: Scheme
  theme: Theme
  accent: string
  /** Custom properties, keyed with their leading dashes. */
  vars: Record<string, string>
  /** data- attributes, keyed without the "data-" prefix. */
  attrs: Record<string, string>
  /** What to paint the page with before anything else has loaded. */
  paint: string
  /** Whether a wallpaper is showing, and how. */
  wallpaper: 'none' | 'window' | 'cover'
}

export function resolveScheme(s: DumbifySettings, systemDark: boolean): Scheme {
  if (s.mode === 'auto') return systemDark ? 'dark' : 'light'
  return s.mode
}

/** True when there is a wallpaper to show and it is switched on. */
export function wallpaperShowing(s: DumbifySettings): boolean {
  if (!s.wallpaperEnabled) return false
  const w = s.wallpaper
  if (w.source === 'preset') return !!getPreset(w.presetId)
  if (w.source === 'upload') return !!w.uploadId
  return false
}

/** True for anything that moves: GIFs, animated WebP/PNG, video and the live presets. */
export function wallpaperMoves(s: DumbifySettings): boolean {
  const k = s.wallpaper.kind
  return k === 'animated' || k === 'video' || k === 'live'
}

export function resolveAccent(s: DumbifySettings, theme: Theme): string {
  const a = s.accent
  if (a === ACCENT_THEME) return theme.accent
  if (a === ACCENT_WALLPAPER) {
    return wallpaperShowing(s) && isHex(s.wallpaper.vibrant) ? s.wallpaper.vibrant : theme.accent
  }
  const preset = accentPreset(a)
  if (preset) return preset.color
  return isHex(a) ? a : theme.accent
}

const RADII: Record<DumbifySettings['corners'], [number, number, number]> = {
  // [small controls, default, large panels]
  square: [0, 0, 0],
  soft: [4, 6, 12],
  round: [8, 12, 20],
}

const ROW_PAD: Record<DumbifySettings['density'], string> = {
  compact: '0.42em',
  comfortable: '0.78em',
  spacious: '1.15em',
}

const GAP: Record<DumbifySettings['density'], string> = {
  compact: '10px',
  comfortable: '16px',
  spacious: '24px',
}

const LEADING: Record<DumbifySettings['lineSpacing'], string> = {
  tight: '1.4',
  normal: '1.6',
  relaxed: '1.8',
}

const PAGE_WIDTH: Record<DumbifySettings['pageWidth'], string> = {
  narrow: '720px',
  standard: '940px',
  full: 'none',
}

/** Interface text (navigation, buttons, labels) scales with reading size, gently. */
export function uiFontSize(readingSize: number): number {
  return Math.max(13, Math.min(17, Math.round(readingSize * 0.7)))
}

export function computeAppearance(s: DumbifySettings, systemDark = false): Appearance {
  const scheme = resolveScheme(s, systemDark)
  const theme = getTheme(scheme === 'dark' ? s.darkTheme : s.lightTheme, scheme)
  const accent = resolveAccent(s, theme)
  const custom = scheme === 'dark' ? s.textColorDark : s.textColorLight
  const text = custom || theme.text
  // A custom ink recolours the whole hierarchy, not just body text: secondary text is the
  // same ink faded toward the page, so a sepia pick doesn't leave grey metadata behind.
  const text2 = custom ? mix(custom, theme.bg, 0.36) : theme.text2
  const text3 = custom ? mix(custom, theme.bg, 0.55) : theme.text3

  const showing = wallpaperShowing(s)
  const wallpaper: Appearance['wallpaper'] = showing ? s.wallpaperPlacement : 'none'
  const floating = wallpaper === 'window'

  let panel = theme.bg
  let panelSide = theme.sidebar
  let panelBlur = '0px'
  if (floating) {
    const alpha = s.surface === 'clear' ? 0 : s.surfaceOpacity
    panel = rgba(s.surfaceTint || theme.bg, alpha)
    panelSide = rgba(s.surfaceTint || theme.sidebar, alpha)
    if (s.surface === 'glass') panelBlur = `${s.surfaceBlur}px`
  }

  const [rSm, r, rLg] = RADII[s.corners]
  const preset = s.wallpaper.source === 'preset' ? getPreset(s.wallpaper.presetId) : undefined
  const average = s.wallpaper.average || preset?.average || theme.bg
  const fade = s.wallpaperFade
  const paint = floating ? mix(average, theme.bg, fade) : theme.bg

  const vars: Record<string, string> = {
    '--df-bg': theme.bg,
    '--df-sidebar': theme.sidebar,
    '--df-surface': theme.surface,
    '--df-text': text,
    '--df-text-2': text2,
    '--df-text-3': text3,
    '--df-border': theme.border,
    '--df-border-strong': mix(theme.border, text, 0.18),
    // Washes are the ink at low alpha rather than a fixed grey, so hover and selection
    // read correctly on a translucent panel over any wallpaper, not just on the theme.
    '--df-hover': rgba(text, scheme === 'dark' ? 0.07 : 0.055),
    '--df-active': rgba(text, scheme === 'dark' ? 0.12 : 0.09),
    '--df-accent': accent,
    '--df-accent-text': ensureContrast(accent, theme.bg, 4.5),
    '--df-accent-fg': readableOn(accent),
    '--df-accent-soft': rgba(accent, scheme === 'dark' ? 0.2 : 0.13),
    '--df-selection': rgba(accent, 0.28),
    '--df-focus': rgba(accent, 0.55),
    '--df-shadow': scheme === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 15, 15, 0.12)',
    '--df-live': scheme === 'dark' ? '#ff6369' : '#dc3e42',
    '--df-pattern': rgba(text, scheme === 'dark' ? 0.16 : 0.13),

    '--df-panel': panel,
    '--df-panel-side': panelSide,
    '--df-panel-blur': panelBlur,
    '--df-menu': theme.surface,

    '--df-font-read': getFont(s.font).stack,
    '--df-title-weight': String(getFont(s.font).titleWeight),
    '--df-font-ui': UI_FONT,
    '--df-font-mono': MONO_FONT,
    '--df-font-size': `${s.fontSize}px`,
    '--df-ui-size': `${uiFontSize(s.fontSize)}px`,
    '--df-leading': LEADING[s.lineSpacing],

    '--df-radius-sm': `${rSm}px`,
    '--df-radius': `${r}px`,
    '--df-radius-lg': `${rLg}px`,
    '--df-row-pad': ROW_PAD[s.density],
    '--df-gap': GAP[s.density],
    '--df-page-width': PAGE_WIDTH[s.pageWidth],

    '--df-wall-blur': `${s.wallpaperBlur}px`,
    '--df-wall-fade': rgba(theme.bg, fade),
    '--df-wall-position': `${s.wallpaperFocusX}% ${s.wallpaperFocusY}%`,
    '--df-wall-size': s.wallpaperFit === 'fill' ? 'cover' : s.wallpaperFit === 'fit' ? 'contain' : 'auto',
    '--df-wall-repeat': s.wallpaperFit === 'tile' ? 'repeat' : 'no-repeat',
    '--df-wall-average': average,
    '--df-paint': paint,
  }

  const hidden: string[] = []
  if (!s.showChannel) hidden.push('channel')
  if (!s.showViews) hidden.push('views')
  if (!s.showDate) hidden.push('date')
  if (!s.showDuration) hidden.push('duration')

  const attrs: Record<string, string> = {
    scheme,
    theme: theme.id,
    layout: s.layout,
    density: s.density,
    corners: s.corners,
    width: s.pageWidth,
    sidebar: s.sidebar,
    watch: s.watchLayout,
    numbers: s.showNumbers ? 'on' : 'off',
    fit: s.wallpaperFit,
    wallpaper,
    surface: floating ? s.surface : 'solid',
    animate: s.wallpaperAnimate ? 'on' : 'off',
    hide: hidden.join(' '),
  }

  return { scheme, theme, accent, vars, attrs, paint, wallpaper }
}

/** The DOM half: writes an Appearance onto an element. */
export function applyAppearance(el: HTMLElement, a: Appearance) {
  for (const [k, v] of Object.entries(a.vars)) el.style.setProperty(k, v)
  for (const [k, v] of Object.entries(a.attrs)) el.setAttribute(`data-${k}`, v)
}

/** Whether a colour is legible enough on the theme to be used as body text. */
export function textColorWarning(color: string, theme: Theme): string | null {
  if (!isHex(color)) return null
  const ratio = contrast(color, theme.bg)
  if (ratio >= 4.5) return null
  return `Low contrast on ${theme.name} (${ratio.toFixed(1)}:1). Text may be hard to read.`
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** Calls back whenever the OS switches between light and dark. */
export function onSystemSchemeChange(cb: (dark: boolean) => void): () => void {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (e: MediaQueryListEvent) => cb(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  } catch {
    return () => {}
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
