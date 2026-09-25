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
import { contrast, ensureContrast, isDark, isHex, luminance, mix, readableOn, rgba } from './color.ts'
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
  /**
   * Panels floating over a window wallpaper: the colour their text actually sits on, and
   * whether the ink had to change to stay readable there. null without them.
   */
  panels: PanelLegibility | null
}

export interface PanelLegibility {
  /** The panel as it looks over the wallpaper: its colour, its opacity and the fade. */
  tone: string
  ink: string
  /** The theme's (or the reader's own) text colour couldn't be read on the tone. */
  inkChanged: boolean
  /** Contrast of the ink on the tone. */
  ratio: number
}

export interface AppearanceOptions {
  /**
   * An extension page dressed in the reader's theme - settings, popup - rather than the
   * reading view. It has no panels over a wallpaper, so it keeps the theme's own colours.
   */
  plain?: boolean
}

// Neutral inks for text the theme's own can't serve: a dark tint under a light theme, a
// clear panel over a dark photo.
const LIGHT_INK = '#f5f4f0'
const DARK_INK = '#1f1e1c'

/** The theme's ink if it reads on `bg`; otherwise one from the other end of the scale. */
export function legibleInk(text: string, bg: string): string {
  if (contrast(text, bg) >= 4.5) return text
  const alt = isDark(bg) ? LIGHT_INK : DARK_INK
  return ensureContrast(contrast(alt, bg) > contrast(text, bg) ? alt : text, bg, 4.5)
}

/**
 * `c`, moved toward `ink` just far enough to read on `bg`. The ink itself always does,
 * so this always succeeds - and secondary text stays the same hue family as the body.
 */
function towardInk(c: string, ink: string, bg: string, min: number): string {
  if (contrast(c, bg) >= min) return c
  let lo = 0
  let hi = 1
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    if (contrast(mix(c, ink, mid), bg) >= min) hi = mid
    else lo = mid
  }
  return mix(c, ink, hi)
}

/**
 * A raised surface - menu, card, field - on a panel of `tone`. Light pages raise toward
 * white, which only helps dark ink; dark pages raise toward the ink, only as far as the
 * ink still reads on the result.
 */
function raisedSurface(tone: string, ink: string, dark: boolean): string {
  if (!dark) return mix(tone, '#ffffff', 0.6)
  for (const t of [0.08, 0.05, 0.03]) {
    const c = mix(tone, ink, t)
    if (contrast(ink, c) >= 4.5) return c
  }
  return tone
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

export function computeAppearance(s: DumbifySettings, systemDark = false, opts: AppearanceOptions = {}): Appearance {
  const scheme = resolveScheme(s, systemDark)
  const theme = getTheme(scheme === 'dark' ? s.darkTheme : s.lightTheme, scheme)
  const accent = resolveAccent(s, theme)
  const custom = scheme === 'dark' ? s.textColorDark : s.textColorLight
  const themeInk = custom || theme.text

  const showing = wallpaperShowing(s)
  const wallpaper: Appearance['wallpaper'] = showing ? s.wallpaperPlacement : 'none'
  const floating = wallpaper === 'window'
  const onPanels = floating && !opts.plain

  const preset = s.wallpaper.source === 'preset' ? getPreset(s.wallpaper.presetId) : undefined
  // A pattern is drawn in the theme's own colours - a few faint marks on its page - so as
  // far as the text is concerned, it is the page.
  const average = preset?.kind === 'pattern' ? theme.bg : (s.wallpaper.average || preset?.average || theme.bg)
  const fade = s.wallpaperFade
  // Panels over a wallpaper: what they are made of, and how much of it there is. Solid
  // is opaque, glass lets the wallpaper through, clear is no panel at all.
  const clear = s.surface === 'clear'
  const base = !clear && s.surfaceTint ? s.surfaceTint : theme.bg
  const sideBase = !clear && s.surfaceTint ? s.surfaceTint : theme.sidebar
  const alpha = s.surface === 'solid' ? 1 : s.surface === 'glass' ? s.surfaceOpacity : 0
  // The wallpaper as it looks through its fade...
  const behind = mix(average, base, fade)
  // ...and what text on a panel actually sits on: the panel, over that.
  const tone = onPanels ? mix(behind, base, alpha) : theme.bg
  const sideTone = onPanels ? mix(behind, sideBase, alpha) : theme.sidebar
  const paint = floating ? behind : theme.bg

  // The ink follows the tone. A tint or a clear panel can make the page far darker or
  // lighter than the theme it came from, and text in the theme's colour would vanish.
  const ink = onPanels ? legibleInk(themeInk, tone) : themeInk
  const inkChanged = ink !== themeInk
  const recoloured = onPanels && (inkChanged || base !== theme.bg)
  // A dark look is light text on a darker page - whatever the theme was called.
  const dark = onPanels ? luminance(ink) > luminance(tone) : scheme === 'dark'

  // A custom ink recolours the whole hierarchy, not just body text: secondary text is the
  // same ink faded toward the page, so a sepia pick doesn't leave grey metadata behind.
  let text2 = custom ? mix(custom, theme.bg, 0.36) : theme.text2
  let text3 = custom ? mix(custom, theme.bg, 0.55) : theme.text3
  let surface = theme.surface
  let border = theme.border
  if (recoloured) {
    text2 = mix(ink, tone, 0.34)
    text3 = mix(ink, tone, 0.52)
    surface = raisedSurface(tone, ink, dark)
    border = mix(tone, ink, dark ? 0.16 : 0.12)
  }
  if (onPanels) {
    // However the wallpaper shows through, secondary text stays readable.
    text2 = towardInk(text2, ink, tone, 4.5)
    text3 = towardInk(text3, ink, tone, 3)
    if (contrast(ink, surface) < 4.5) surface = raisedSurface(tone, ink, dark)
  }

  let panel = theme.bg
  let panelSide = theme.sidebar
  let panelBlur = '0px'
  if (onPanels) {
    panel = rgba(base, alpha)
    panelSide = rgba(sideBase, alpha)
    if (s.surface === 'glass') panelBlur = `${s.surfaceBlur}px`
  }

  const [rSm, r, rLg] = RADII[s.corners]

  const vars: Record<string, string> = {
    // Over a wallpaper, "the page" is the panel as it looks there.
    '--df-bg': tone,
    '--df-sidebar': sideTone,
    '--df-surface': surface,
    '--df-text': ink,
    '--df-text-2': text2,
    '--df-text-3': text3,
    '--df-border': border,
    '--df-border-strong': mix(border, ink, 0.18),
    // Washes are the ink at low alpha rather than a fixed grey, so hover and selection
    // read correctly on a translucent panel over any wallpaper, not just on the theme.
    '--df-hover': rgba(ink, dark ? 0.07 : 0.055),
    '--df-active': rgba(ink, dark ? 0.12 : 0.09),
    '--df-accent': accent,
    '--df-accent-text': ensureContrast(accent, tone, 4.5),
    '--df-accent-fg': readableOn(accent),
    '--df-accent-soft': rgba(accent, dark ? 0.2 : 0.13),
    '--df-selection': rgba(accent, 0.28),
    '--df-focus': rgba(accent, 0.55),
    '--df-shadow': dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 15, 15, 0.12)',
    '--df-live': dark ? '#ff6369' : '#dc3e42',
    // Patterns are drawn on the wallpaper, under the panels, in the theme's colours - on
    // the theme's page, not on --df-bg, which over a wallpaper is the panels' tone.
    '--df-pattern': rgba(theme.text, scheme === 'dark' ? 0.16 : 0.13),
    '--df-wall-base': theme.bg,
    // Text straight on a clear panel gets a glow in the opposite of its ink.
    '--df-halo': isDark(ink) ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.62)',

    '--df-panel': panel,
    '--df-panel-side': panelSide,
    '--df-panel-blur': panelBlur,
    '--df-menu': surface,

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
    '--df-wall-fade': rgba(base, fade),
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
    // Light or dark as the text actually sits: a dark tint under a light theme is dark.
    tone: dark ? 'dark' : 'light',
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

  const panels: PanelLegibility | null = onPanels ? { tone, ink, inkChanged, ratio: contrast(ink, tone) } : null
  return { scheme, theme, accent, vars, attrs, paint, wallpaper, panels }
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
