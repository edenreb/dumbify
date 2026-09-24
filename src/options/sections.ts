import {
  ACCENTS, ACCENT_THEME, ACCENT_WALLPAPER, FONTS, THEMES, accentPreset, getFont, getPreset, getTheme,
  themesFor, type Theme,
} from '../core/themes'
import { resolveScheme, systemPrefersDark, textColorWarning, wallpaperShowing } from '../core/appearance'
import { LOOKS, lookPatch, matchesLook, type Look } from '../core/looks'
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type DumbifySettings } from '../core/settings'
import { getWallpaper, replaceSettings, resetSettings } from '../core/storage'
import { backupFileName, parseBackup, serializeBackup } from '../core/backup'
import { isHex, rgba } from '../core/color'
import type { SettingsStore } from '../ui/store'
import { h } from '../ui/dom'
import { icon } from '../ui/icons'
import { cardGroup, checkboxChips, colorChoice, row, segmented, slider, toggle } from '../ui/controls'
import { shortcutLabel } from '../ui/routes'
import { confirmDialog, groupTitle, section, toast } from './feedback'

type S = DumbifySettings

const STORE_URL = 'https://chromewebstore.google.com/detail/dumbify-customizable-text/lhnjjldhbllcdfdldeacdgalkkofhicf'
const REPO_URL = 'https://github.com/edenreb/dumbify'

// ---- Appearance ----

function themeArt(t: Theme): HTMLElement {
  const line = () => h('span', { class: 'ta-row' }, h('i'), h('b'))
  const art = h('span', { class: 'art theme-art', 'aria-hidden': 'true' },
    h('span', { class: 'ta-side' }, h('i'), h('i'), h('i'), h('i')),
    h('span', { class: 'ta-page' }, h('span', { class: 'ta-title' }), line(), line(), line(), h('span', { class: 'ta-pill' })),
  )
  for (const [k, v] of Object.entries({ bg: t.bg, side: t.sidebar, text: t.text, text2: t.text2, text3: t.text3, border: t.border, accent: t.accent })) {
    art.style.setProperty(`--t-${k}`, v)
  }
  return art
}

function themePicker(store: SettingsStore, scheme: 'light' | 'dark'): HTMLElement {
  return cardGroup(store, {
    label: scheme === 'light' ? 'Light theme' : 'Dark theme',
    className: 'theme-grid',
    items: themesFor(scheme).map((t) => ({
      value: t.id,
      label: t.name,
      title: t.credit ? `${t.name} - palette from ${t.credit}` : t.name,
      art: themeArt(t),
    })),
    get: (s) => (scheme === 'light' ? s.lightTheme : s.darkTheme),
    set: (v) => (scheme === 'light' ? { lightTheme: v } : { darkTheme: v }),
  })
}

function schemeNote(store: SettingsStore, scheme: 'light' | 'dark'): HTMLElement {
  const note = h('span', { class: 'group-note' })
  store.subscribe((s) => {
    const active = resolveScheme(s, systemPrefersDark()) === scheme
    note.textContent = s.mode === 'auto'
      ? (scheme === 'dark' ? '· when your system is dark' : '· when your system is light')
      : active ? '· in use' : ''
  })
  return note
}

function accentPicker(store: SettingsStore): HTMLElement {
  const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent colour' })
  const name = 'accent'
  const radios: { input: HTMLInputElement; value: string }[] = []

  const radio = (value: string, label: string, className: string, color?: string) => {
    const input = h('input', { type: 'radio', name, value, class: 'sr-only', 'aria-label': label })
    input.addEventListener('change', () => { if (input.checked) void store.commit({ accent: value }) })
    const face = h('span', { class: 'swatch-face', title: label }, icon('check'))
    const el = h('label', { class: `swatch ${className}` }, input, face)
    if (color) el.style.setProperty('--swatch', color)
    radios.push({ input, value })
    wrap.appendChild(el)
    return el
  }

  const themeSwatch = radio(ACCENT_THEME, 'Theme accent', 'swatch-theme')
  const wallSwatch = radio(ACCENT_WALLPAPER, 'From wallpaper', 'swatch-wall')
  for (const a of ACCENTS) radio(a.id, a.name, '', a.color)

  // Custom: the swatch *is* the system colour picker.
  const picker = h('input', { type: 'color', 'aria-label': 'Custom accent colour' })
  const custom = h('label', { class: 'swatch swatch-custom', title: 'Custom colour' }, h('span', { class: 'swatch-face' }, icon('check')), picker)
  picker.addEventListener('input', () => store.preview({ accent: picker.value }))
  picker.addEventListener('change', () => void store.commit({ accent: picker.value }))
  wrap.appendChild(custom)

  store.subscribe((s) => {
    const scheme = resolveScheme(s, systemPrefersDark())
    const theme = getTheme(scheme === 'dark' ? s.darkTheme : s.lightTheme, scheme)
    themeSwatch.style.setProperty('--swatch', theme.accent)
    themeSwatch.style.setProperty('--swatch-2', theme.bg)
    const wallInput = wallSwatch.querySelector('input')!
    const hasWall = wallpaperShowing(s) && isHex(s.wallpaper.vibrant)
    wallInput.disabled = !hasWall
    wallSwatch.title = hasWall ? 'From wallpaper' : 'From wallpaper - add a wallpaper first'
    wallSwatch.style.setProperty('--swatch', hasWall ? s.wallpaper.vibrant : 'transparent')
    for (const r of radios) r.input.checked = r.value === s.accent
    const isCustom = isHex(s.accent)
    custom.classList.toggle('is-set', isCustom)
    if (isCustom) {
      custom.style.setProperty('--swatch', s.accent)
      picker.value = s.accent
    }
  })
  return wrap
}

/** A look, drawn small: its wallpaper, its page, its type and its layout. */
function lookArt(look: Look): HTMLElement {
  const theme = getTheme(look.mode === 'dark' ? look.darkTheme : look.lightTheme, look.mode)
  const p = look.patch
  const preset = p.wallpaper?.source === 'preset' ? getPreset(p.wallpaper.presetId) : undefined
  const placement = preset ? (p.wallpaperPlacement ?? 'window') : 'none'
  const accent = p.accent === ACCENT_WALLPAPER ? (preset?.vibrant ?? theme.accent)
    : accentPreset(p.accent ?? '')?.color ?? theme.accent
  const font = getFont(p.font ?? 'sans')

  const line = (cls = '') => h('i', { class: `la-line ${cls}` })
  const rows = p.layout === 'cards'
    ? h('span', { class: 'la-cards' }, h('i'), h('i'), h('i'))
    : h('span', { class: `la-rows${p.layout === 'table' ? ' is-table' : ''}` }, line(), line(), line())
  const aa = h('span', { class: 'la-aa', text: 'Aa' })
  aa.style.fontFamily = font.stack
  aa.style.fontWeight = String(font.titleWeight)

  const art = h('span', { class: `art look-art is-${placement}`, 'aria-hidden': 'true' },
    placement === 'cover' ? h('span', { class: 'la-cover' }) : null,
    h('span', { class: 'la-page' }, aa, line('la-accent'), rows),
  )
  const vars: Record<string, string> = {
    '--t-bg': theme.bg, '--t-text': theme.text, '--t-accent': accent,
    '--t-panel': rgba(theme.bg, p.surfaceOpacity ?? 0.85),
    // Pattern wallpapers draw in the page's own colours.
    '--df-bg': theme.bg, '--df-pattern': rgba(theme.text, theme.scheme === 'dark' ? 0.16 : 0.13),
  }
  if (preset) {
    vars['--t-wall'] = preset.css
    if (preset.size) vars['--t-wall-size'] = preset.size
  }
  for (const [k, v] of Object.entries(vars)) art.style.setProperty(k, v)
  return art
}

/**
 * Finished combinations to start from. Each applies in one click and can be undone for a
 * few seconds; the look that still matches the settings is marked.
 */
function looksGallery(store: SettingsStore): HTMLElement {
  const grid = h('div', { class: 'looks', role: 'group', 'aria-label': 'Looks' })
  const buttons = LOOKS.map((look) => {
    const btn = h('button', { class: 'look', type: 'button', 'aria-pressed': 'false' },
      lookArt(look),
      h('span', { class: 'look-text' },
        h('span', { class: 'look-name', text: look.name }),
        h('span', { class: 'look-note', text: look.note })))
    btn.addEventListener('click', async () => {
      const before = store.value
      if (matchesLook(before, look)) return
      const patch = lookPatch(look, before)
      if (!(await store.commit(patch))) return
      // Undo puts back just what the look changed.
      const undo: Partial<S> = {}
      for (const key of Object.keys(patch) as (keyof S)[]) (undo as Record<string, unknown>)[key] = before[key]
      toast(`${look.name} applied`, 'ok', { label: 'Undo', run: () => void store.commit(undo) })
    })
    grid.appendChild(btn)
    return { btn, look }
  })
  store.subscribe((s) => {
    for (const { btn, look } of buttons) btn.setAttribute('aria-pressed', String(matchesLook(s, look)))
  })
  return grid
}

export function appearanceSection(store: SettingsStore): HTMLElement {
  return section('appearance', 'palette', 'Appearance', 'Themes, colour and the overall feel.',
    groupTitle('Looks', h('span', { class: 'group-note', text: '· start from one, then make it yours' })),
    looksGallery(store),
    groupTitle('Mode and themes'),
    row('Mode', 'Auto follows your system’s light and dark setting.', segmented(store, {
      label: 'Mode',
      options: [
        { value: 'light', label: 'Light', icon: 'sun' },
        { value: 'dark', label: 'Dark', icon: 'moon' },
        { value: 'auto', label: 'Auto', icon: 'monitor' },
      ],
      get: (s) => s.mode,
      set: (v) => ({ mode: v }),
    })),
    groupTitle('Light theme', schemeNote(store, 'light')),
    themePicker(store, 'light'),
    groupTitle('Dark theme', schemeNote(store, 'dark')),
    themePicker(store, 'dark'),
    groupTitle('Details'),
    row('Accent colour', 'Links, highlights, switches and the Dumbify mark.', null, { stacked: true }),
    accentPicker(store),
    row('Corners', 'How rounded buttons, cards and panels are.', segmented(store, {
      label: 'Corners',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'soft', label: 'Soft' },
        { value: 'round', label: 'Round' },
      ],
      get: (s) => s.corners,
      set: (v) => ({ corners: v }),
    })),
    row('Density', 'Space between rows in your feeds.', segmented(store, {
      label: 'Density',
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'spacious', label: 'Spacious' },
      ],
      get: (s) => s.density,
      set: (v) => ({ density: v }),
    })),
  )
}

// ---- Typography ----

function fontList(store: SettingsStore): HTMLElement {
  const list = h('div', { class: 'font-list', role: 'radiogroup', 'aria-label': 'More fonts' })
  const inputs: HTMLInputElement[] = []
  for (const f of FONTS.filter((x) => !x.featured)) {
    const input = h('input', { type: 'radio', name: 'font', value: f.id, class: 'sr-only' })
    input.addEventListener('change', () => { if (input.checked) void store.commit({ font: f.id }) })
    const nameEl = h('span', { class: 'font-option-name', text: f.name })
    nameEl.style.fontFamily = f.stack
    list.appendChild(h('label', { class: 'font-option' }, input,
      h('span', { class: 'font-option-face' }, nameEl, h('span', { class: 'font-option-note', text: f.note }))))
    inputs.push(input)
  }
  store.subscribe((s) => inputs.forEach((i) => { i.checked = i.value === s.font }))
  return list
}

function textColorRow(store: SettingsStore, scheme: 'light' | 'dark'): HTMLElement {
  const key = scheme === 'light' ? 'textColorLight' : 'textColorDark'
  const theme = (s: S) => getTheme(scheme === 'light' ? s.lightTheme : s.darkTheme, scheme)
  const control = colorChoice(store, {
    label: `Text colour in ${scheme} mode`,
    get: (s) => s[key],
    set: (v) => ({ [key]: v }) as Partial<S>,
    fallback: (s) => theme(s).text,
  })
  const warning = h('div', { class: 'contrast-warning', role: 'status' })
  const r = row(`Text colour · ${scheme}`, `Used with the ${scheme} theme. Theme keeps its own.`, control)
  r.querySelector('.row-text')!.appendChild(warning)
  store.subscribe((s) => {
    const msg = s[key] ? textColorWarning(s[key], theme(s)) : null
    warning.replaceChildren(...(msg ? [icon('info'), msg] : []))
    warning.hidden = !msg
  })
  return r
}

export function typographySection(store: SettingsStore): HTMLElement {
  const featured = cardGroup(store, {
    label: 'Font',
    className: 'font-featured',
    items: FONTS.filter((f) => f.featured).map((f) => {
      const art = h('span', { class: 'art', 'aria-hidden': 'true', text: 'Ag' })
      art.style.fontFamily = f.stack
      return { value: f.id, label: f.name, sub: f.note.split(' · ')[0], art }
    }),
    get: (s) => s.font,
    set: (v) => ({ font: v }),
  })
  return section('typography', 'type', 'Typography', 'The face and size of everything you read.',
    groupTitle('Font'),
    featured,
    groupTitle('More fonts'),
    fontList(store),
    groupTitle('Reading'),
    row('Text size', 'Titles, descriptions and comments. Navigation scales gently along with it.', slider(store, {
      label: 'Text size', min: FONT_SIZE_MIN, max: FONT_SIZE_MAX, step: 1,
      get: (s) => s.fontSize, set: (v) => ({ fontSize: v }), format: (v) => `${v}px`,
    })),
    row('Line spacing', '', segmented(store, {
      label: 'Line spacing',
      options: [
        { value: 'tight', label: 'Tight' },
        { value: 'normal', label: 'Normal' },
        { value: 'relaxed', label: 'Relaxed' },
      ],
      get: (s) => s.lineSpacing,
      set: (v) => ({ lineSpacing: v }),
    })),
    textColorRow(store, 'light'),
    textColorRow(store, 'dark'),
  )
}

// ---- Layout ----

function layoutArt(kind: 'list' | 'cards' | 'table'): HTMLElement {
  const art = h('span', { class: `art layout-art la-${kind}`, 'aria-hidden': 'true' })
  const n = kind === 'cards' ? 6 : kind === 'table' ? 6 : 3
  for (let i = 0; i < n; i++) {
    art.appendChild(h('i'))
    if (kind === 'list') art.appendChild(h('b'))
  }
  return art
}

export function layoutSection(store: SettingsStore): HTMLElement {
  return section('layout', 'layout', 'Layout', 'How feeds are laid out and what they show.',
    groupTitle('Feed style'),
    cardGroup(store, {
      label: 'Feed style',
      className: 'layout-cards',
      items: [
        { value: 'list' as const, label: 'List', sub: 'Classic', art: layoutArt('list') },
        { value: 'cards' as const, label: 'Cards', sub: 'Gallery', art: layoutArt('cards') },
        { value: 'table' as const, label: 'Table', sub: 'Dense', art: layoutArt('table') },
      ],
      get: (s) => s.layout,
      set: (v) => ({ layout: v }),
    }),
    groupTitle('Page'),
    row('Page width', 'Full uses the whole window.', segmented(store, {
      label: 'Page width',
      options: [
        { value: 'narrow', label: 'Narrow' },
        { value: 'standard', label: 'Standard' },
        { value: 'full', label: 'Full' },
      ],
      get: (s) => s.pageWidth,
      set: (v) => ({ pageWidth: v }),
    })),
    row('Sidebar', `Hidden opens from the menu button, or ${shortcutLabel('\\')}.`, segmented(store, {
      label: 'Sidebar',
      options: [
        { value: 'expanded', label: 'Full' },
        { value: 'rail', label: 'Icons' },
        { value: 'hidden', label: 'Hidden' },
      ],
      get: (s) => s.sidebar,
      set: (v) => ({ sidebar: v }),
    })),
    row('Row numbers', 'Number the videos in each list.', toggle(store, {
      label: 'Row numbers', get: (s) => s.showNumbers, set: (v) => ({ showNumbers: v }),
    })),
    row('Show in feeds', 'Details listed with each video.', checkboxChips(store, {
      label: 'Show in feeds',
      items: [
        { label: 'Channel', get: (s) => s.showChannel, set: (v) => ({ showChannel: v }) },
        { label: 'Views', get: (s) => s.showViews, set: (v) => ({ showViews: v }) },
        { label: 'Date', get: (s) => s.showDate, set: (v) => ({ showDate: v }) },
        { label: 'Length', get: (s) => s.showDuration, set: (v) => ({ showDuration: v }) },
      ],
    })),
  )
}

// ---- Watch page ----

function watchArt(kind: 'classic' | 'theater' | 'split'): HTMLElement {
  return h('span', { class: `art watch-art wa-${kind}`, 'aria-hidden': 'true' },
    h('span', { class: 'wa-player' }), h('span', { class: 'wa-line' }), h('span', { class: 'wa-line wa-line-short' }),
    kind === 'split' ? h('span', { class: 'wa-side' }) : null,
  )
}

export function watchSection(store: SettingsStore): HTMLElement {
  return section('watch', 'film', 'Watch page', 'Where the video, details and comments go.',
    groupTitle('Layout'),
    cardGroup(store, {
      label: 'Watch page layout',
      className: 'layout-cards',
      items: [
        { value: 'classic' as const, label: 'Classic', sub: 'Centred', art: watchArt('classic') },
        { value: 'theater' as const, label: 'Theater', sub: 'Wide video', art: watchArt('theater') },
        { value: 'split' as const, label: 'Split', sub: 'Side panel', art: watchArt('split') },
      ],
      get: (s) => s.watchLayout,
      set: (v) => ({ watchLayout: v }),
    }),
    groupTitle('Behaviour'),
    row('Open the description', 'Show the full description without a click.', toggle(store, {
      label: 'Open the description automatically', get: (s) => s.autoDescription, set: (v) => ({ autoDescription: v }),
    })),
    row('Open comments', 'Load comments with the video. Split always shows them.', toggle(store, {
      label: 'Open comments automatically', get: (s) => s.autoComments, set: (v) => ({ autoComments: v }),
    })),
  )
}

// ---- Shortcuts ----

function keys(...parts: string[]): HTMLElement {
  return h('span', { class: 'keys' }, ...parts.map((p) => h('kbd', { text: p })))
}

export function shortcutsSection(): HTMLElement {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  const mod = mac ? '⌘' : 'Ctrl'
  const shift = mac ? '⇧' : 'Shift'
  return section('shortcuts', 'keyboard', 'Shortcuts', 'Get around without the mouse.',
    row('Search', '', keys(mod, 'K')),
    row('Show or hide the sidebar', '', keys(mod, '\\')),
    row('Switch light and dark', '', keys(mod, shift, 'L')),
    row('Full-screen video', 'On a watch page.', keys('F')),
    row('Close a menu', '', keys('Esc')),
  )
}

// ---- Backup and reset ----

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = h('a', { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function backupSection(store: SettingsStore): HTMLElement {
  const exportBtn = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Export…')
  exportBtn.addEventListener('click', async () => {
    const s = store.value
    const wall = await getWallpaper(s.wallpaper)
    download(backupFileName(), serializeBackup(s, wall))
    toast('Settings exported')
  })

  const file = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Import settings file' })
  const importBtn = h('label', { class: 'btn upload-btn' }, icon('upload'), 'Import…', file)
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f) return
    try {
      const backup = parseBackup(await f.text())
      const ok = await confirmDialog({
        title: 'Replace your settings?',
        body: `Your settings will be replaced with the ones in “${f.name}”${backup.wallpaper ? ', and its wallpaper added to your uploads' : ''}. Dumbify stays switched ${store.value.enabled ? 'on' : 'off'}.`,
        confirm: 'Import',
      })
      if (!ok) return
      store.replace(await replaceSettings(backup.settings, backup.wallpaper))
      toast('Settings imported')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t import that file', 'error')
    }
  })

  const resetBtn = h('button', { class: 'btn btn-danger', type: 'button' }, icon('reset'), 'Reset…')
  resetBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset all settings?',
      body: 'Themes, fonts, layout and wallpaper go back to their defaults. Your uploads stay in the wallpaper gallery. This can’t be undone.',
      confirm: 'Reset',
      danger: true,
    })
    if (!ok) return
    try {
      store.replace(await resetSettings())
      toast('Settings reset')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t reset', 'error')
    }
  })

  return section('backup', 'download', 'Backup & reset', 'Move your setup to another browser, or start over.',
    row('Export settings', 'Saves your settings to a file, with the wallpaper you’re using.', exportBtn),
    row('Import settings', 'Loads a file you exported earlier.', importBtn),
    row('Reset everything', 'Back to the defaults. Your On/Off switch is kept.', resetBtn),
  )
}

// ---- About ----

export function aboutSection(): HTMLElement {
  const version = chrome.runtime.getManifest?.().version ?? ''
  const link = (href: string, iconName: 'star' | 'code' | 'shield', text: string) =>
    h('a', { class: 'btn', href, target: '_blank', rel: 'noopener noreferrer' }, icon(iconName), text)
  const credits = [...new Set(THEMES.map((t) => t.credit).filter(Boolean))].join(', ')
  return section('about', 'info', 'About', `Dumbify ${version} - a calm, text-first YouTube.`,
    h('div', { class: 'links about-links' },
      link(`${STORE_URL}/reviews`, 'star', 'Rate Dumbify'),
      link(REPO_URL, 'code', 'Source code'),
      link(`${REPO_URL}/blob/main/PRIVACY.md`, 'shield', 'Privacy'),
    ),
    h('p', { class: 'credits', text: `Dumbify stores its settings on this device only and never sends them anywhere. Theme palettes adapted from ${credits}. Fonts: Inter Tight, Newsreader and IBM Plex Mono, under the SIL Open Font License.` }),
  )
}
