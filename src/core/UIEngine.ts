import '../styles/main.css'
import { getSettings, getWallpaper, onSettingsChange, onWallpaperChange } from './storage'
import {
  applyAppearance, computeAppearance, onSystemSchemeChange, prefersReducedMotion,
  systemPrefersDark, type Appearance,
} from './appearance'
import { DEFAULT_SETTINGS, type DumbifySettings } from './settings'
import { WallpaperLayer } from '../ui/wallpaper-layer'
import { h } from '../ui/dom'
import { icon, type IconName } from '../ui/icons'

export let root: HTMLElement
export let content: HTMLElement
export let sidebar: HTMLElement | null = null
export let main: HTMLElement | null = null
/** The page panel - and the element that scrolls. */
export let sheet: HTMLElement | null = null
export let topbar: HTMLElement | null = null

let layout: HTMLElement | null = null
let cover: HTMLElement | null = null
let backdrop: HTMLElement | null = null
let wallpaper: WallpaperLayer | null = null

let settings: DumbifySettings = DEFAULT_SETTINGS
let appearance: Appearance = computeAppearance(DEFAULT_SETTINGS)
let loaded = false
const listeners = new Set<(s: DumbifySettings, a: Appearance) => void>()

/** The settings as last applied. Features read layout choices from here. */
export function currentSettings(): DumbifySettings {
  return settings
}

/**
 * Called with the settings on every change - and immediately, if they have already
 * loaded, so a feature mounted late still paints correctly the first time.
 */
export function onAppearance(cb: (s: DumbifySettings, a: Appearance) => void): () => void {
  listeners.add(cb)
  if (loaded) cb(settings, appearance)
  return () => listeners.delete(cb)
}

export function scroller(): HTMLElement {
  return sheet ?? root
}

// ---- First paint ----

// The last appearance this browser applied, kept in youtube.com's own localStorage
// because it is the only storage a content script can read synchronously. Reading
// chrome.storage is async, so without this every page load painted the default light
// theme for a frame before switching - a white flash in the face of a dark-theme reader.
// It holds colours and layout names only.
const APPEARANCE_CACHE = 'dumbify:appearance'

interface CachedAppearance {
  vars: Record<string, string>
  attrs: Record<string, string>
  paint: string
}

function readCache(): CachedAppearance | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_CACHE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedAppearance
    const clean = (obj: unknown, keyOk: (k: string) => boolean): Record<string, string> | null => {
      if (typeof obj !== 'object' || obj === null) return null
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) {
        // This is the page's origin: anything in here could have been written by the
        // page itself, so take only plain values under our own names.
        if (!keyOk(k) || typeof v !== 'string' || v.length > 400 || /url\s*\(|expression|javascript:/i.test(v)) continue
        out[k] = v
      }
      return out
    }
    const vars = clean(parsed.vars, (k) => k.startsWith('--df-'))
    const attrs = clean(parsed.attrs, (k) => /^[a-z]+$/.test(k))
    if (!vars || !attrs || typeof parsed.paint !== 'string' || !/^#[0-9a-f]{6}$/i.test(parsed.paint)) return null
    return { vars, attrs, paint: parsed.paint }
  } catch {
    return null
  }
}

function writeCache(a: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_CACHE, JSON.stringify({ vars: a.vars, attrs: a.attrs, paint: a.paint }))
  } catch {
    // Storage full or blocked - the next load just flashes once.
  }
}

/** Runs at document_start, before YouTube has painted anything. */
export function paintEarly() {
  const cached = readCache()
  if (cached) document.documentElement.style.setProperty('--df-paint', cached.paint)
}

// ---- Applying settings ----

function apply() {
  appearance = computeAppearance(settings, systemPrefersDark())
  if (root) applyAppearance(root, appearance)
  document.documentElement.style.setProperty('--df-paint', appearance.paint)
  writeCache(appearance)
  void wallpaper?.sync(settings, appearance.wallpaper, !settings.wallpaperAnimate || prefersReducedMotion())
  for (const cb of listeners) cb(settings, appearance)
}

// ---- Mount ----

export function mountUI() {
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.overscrollBehaviorY = 'none'
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehaviorY = 'none'

  root = h('div', { id: 'dumbify-root' })
  // Inline and !important: the stylesheet hides <body> with !important, and nothing
  // YouTube ships may pull the reading view out of its place over the page.
  root.style.setProperty('position', 'fixed', 'important')
  root.style.setProperty('inset', '0', 'important')
  root.style.setProperty('z-index', '2147483647', 'important')
  root.style.setProperty('visibility', 'visible', 'important')

  const cached = readCache()
  if (cached) {
    for (const [k, v] of Object.entries(cached.vars)) root.style.setProperty(k, v)
    for (const [k, v] of Object.entries(cached.attrs)) root.setAttribute(`data-${k}`, v)
  }

  backdrop = h('div', { class: 'df-backdrop', 'aria-hidden': 'true' }, h('div', { class: 'df-wall-fade' }))
  layout = h('div', { class: 'df-layout' })
  sidebar = h('aside', { class: 'df-sidebar', 'aria-label': 'Dumbify navigation' })
  main = h('main', { class: 'df-main' })
  sheet = h('div', { class: 'df-sheet' })
  topbar = h('header', { class: 'df-topbar' })
  cover = h('div', { class: 'df-cover', 'aria-hidden': 'true' })
  content = h('div', { id: 'dumbify-content' })
  const scrim = h('div', { class: 'df-scrim', onclick: () => closeDrawer() })

  sheet.append(topbar, cover, content)
  main.append(sheet)
  layout.append(sidebar, main)
  root.append(backdrop, layout, scrim)
  document.body.appendChild(root)

  sheet.addEventListener('scroll', () => {
    root.classList.toggle('df-scrolled', (sheet?.scrollTop ?? 0) > 2)
  }, { passive: true })

  wallpaper = new WallpaperLayer({ window: backdrop, cover }, getWallpaper)

  getSettings().then((s) => {
    settings = s
    loaded = true
    apply()
  })
  onSettingsChange((s) => {
    settings = s
    loaded = true
    apply()
  })
  // A replaced upload keeps its settings reference shape but not its bytes.
  onWallpaperChange(() => {
    wallpaper?.clear()
    apply()
  })
  onSystemSchemeChange(() => { if (settings.mode === 'auto') apply() })
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => apply())
  } catch { /* old engine */ }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('df-drawer-open')) closeDrawer()
  })
}

// Full teardown, used as the failure path in content.ts: mountUI locks scrolling and
// repaints the page background, so removing the root alone would leave YouTube
// unscrollable underneath.
export function unmountUI() {
  wallpaper?.destroy()
  wallpaper = null
  root?.remove()
  for (const node of [document.documentElement, document.body]) {
    node.style.overflow = ''
    node.style.overscrollBehaviorY = ''
    node.style.backgroundColor = ''
    node.style.backgroundImage = ''
  }
  document.documentElement.style.removeProperty('--df-paint')
}

// ---- Drawer ----

export function openDrawer() {
  root?.classList.add('df-drawer-open')
  sidebar?.querySelector<HTMLElement>('.df-nav-link')?.focus()
}

export function closeDrawer() {
  root?.classList.remove('df-drawer-open')
}

export function isDrawerOpen(): boolean {
  return !!root?.classList.contains('df-drawer-open')
}

// ---- Shared bits of page ----

let toastTimer: number | null = null

/** A brief message at the bottom of the window. */
export function showToast(message: string) {
  if (!root) return
  root.querySelector('.df-toast')?.remove()
  const t = h('div', { class: 'df-toast', role: 'status', text: message })
  root.appendChild(t)
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => t.remove(), 2600)
}

/** A centred state with an icon: nothing found, nothing here, and so on. */
export function emptyState(iconName: IconName, title: string, detail = ''): HTMLElement {
  return h('div', { class: 'df-empty' },
    icon(iconName),
    h('div', { class: 'df-empty-title', text: title }),
    detail ? h('div', { text: detail }) : null,
  )
}

export function renderNotFound(detail?: string) {
  if (!content) return
  content.appendChild(h('div', { class: 'df-404' },
    h('div', { class: 'df-page-icon' }, icon('search')),
    h('p', { class: 'df-404-msg', text: 'This page doesn’t exist.' }),
    detail ? h('p', { class: 'df-404-detail', text: detail }) : null,
    h('a', { class: 'df-btn', href: '/' }, icon('home'), 'Back to home'),
  ))
}

export function clearContent() {
  if (content) content.replaceChildren()
}

// Non-<button> controls (toolbar filters, channel tabs, playlist rows) were click-only:
// no role, no tab stop, no key handler, so none of them were reachable by keyboard. The
// video and channel rows already did this by hand; this is the same thing, once.
export function makeClickable(el: HTMLElement, onActivate: () => void) {
  el.setAttribute('role', 'button')
  el.tabIndex = 0
  el.onclick = (e) => { e.stopPropagation(); onActivate() }
  el.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    onActivate()
  }
}

// Signed-out gate: replaces the layout, since none of the features can render anything
// useful without a session. The wallpaper stays - it is the reader's, not YouTube's.
export function renderSignedOut() {
  if (!root) return
  layout?.remove()
  layout = null
  sidebar = null
  main = null
  sheet = null
  topbar = null
  root.appendChild(h('div', { class: 'df-signin' },
    h('div', { class: 'df-page-icon' }, icon('user')),
    h('p', { class: 'df-signin-msg', text: 'Sign in to YouTube to use Dumbify.' }),
    h('p', { class: 'df-404-detail', text: 'Dumbify shows your own subscriptions, history and playlists, so it needs your YouTube session.' }),
    h('a', {
      class: 'df-btn df-btn-primary',
      href: `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(location.href)}`,
    }, 'Sign in'),
  ))
}
