import fontFaces from '../styles/fonts.css?raw'
import type { NavigationState, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import {
  closeDrawer, isDrawerOpen, onAppearance, openDrawer, root, showToast, sidebar, topbar,
} from '../core/UIEngine'
import { linkTo, navigateTo } from '../core/PageManager'
import { getSettings, setSettings } from '../core/storage'
import type { DumbifySettings } from '../core/settings'
import { h, setSwitch } from '../ui/dom'
import { brandMark, icon } from '../ui/icons'
import { NAV_LIBRARY, NAV_MAIN, ROUTE_ICONS, ROUTE_NAMES, isModKey, shortcutLabel, type NavItem } from '../ui/routes'
import { closeViewMenu, openOptions, toggleViewMenu } from './view-menu'

// The @font-face rules live in styles/fonts.css; only the src URLs have to be built
// here, because chrome.runtime.getURL is the sole way to get a path that resolves
// against the extension rather than youtube.com.
function injectFonts() {
  if (document.getElementById('df-fonts')) return
  const style = document.createElement('style')
  style.id = 'df-fonts'
  style.textContent = fontFaces.replace(/url\("\/fonts\//g, `url("${chrome.runtime.getURL('fonts/')}`)
  document.head.appendChild(style)
}

let linkEls: { route: Route; el: HTMLAnchorElement }[] = []
let currentRoute: Route = 'home'
let unsubAppearance: (() => void) | null = null
let searchInput: HTMLInputElement | null = null
let crumbLabel: HTMLElement | null = null
let crumbIcon: HTMLElement | null = null
let darkSwitch: HTMLButtonElement | null = null
let sidebarToggle: HTMLButtonElement | null = null
let scheme: 'light' | 'dark' = 'light'
let sidebarMode: DumbifySettings['sidebar'] = 'expanded'

function save(patch: Partial<DumbifySettings>) {
  setSettings(patch).catch((err) => showToast(err instanceof Error ? err.message : 'Couldn’t save that change'))
}

function updateActiveLink() {
  for (const { route, el } of linkEls) {
    const active = route === currentRoute
    el.classList.toggle('df-active', active)
    if (active) el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  }
}

/** Names the page in the top bar - a channel's name, a playlist's title, a search. */
export function setCrumbs(label: string) {
  if (crumbLabel) crumbLabel.textContent = label
}

function paintRoute(nav: NavigationState) {
  currentRoute = nav.route
  root.dataset.route = nav.route
  updateActiveLink()
  const name = ROUTE_NAMES[nav.route] ?? 'YouTube'
  document.title = `${name} · Dumbify`
  if (crumbLabel) crumbLabel.textContent = nav.route === 'search' && nav.searchQuery ? nav.searchQuery : name
  if (crumbIcon) crumbIcon.replaceChildren(icon(ROUTE_ICONS[nav.route] ?? 'home'))
  if (searchInput) searchInput.value = nav.route === 'search' ? (nav.searchQuery ?? '') : ''
  closeDrawer()
}

function submitSearch() {
  const q = searchInput?.value.trim()
  if (q) navigateTo(`/results?search_query=${encodeURIComponent(q)}`)
}

function focusSearch() {
  closeDrawer()
  searchInput?.focus()
  searchInput?.select()
}

function narrow(): boolean {
  return window.matchMedia('(max-width: 860px)').matches
}

// Ctrl/Cmd+\ works both ways, as in Notion: a wide window flips between the full
// sidebar and hidden; a narrow one, which only has the drawer, opens and closes that.
function toggleSidebar() {
  if (narrow()) {
    if (isDrawerOpen()) closeDrawer()
    else openDrawer()
    return
  }
  if (sidebarMode === 'hidden') {
    closeDrawer()
    save({ sidebar: 'expanded' })
    return
  }
  save({ sidebar: 'hidden' })
}

function toggleDarkMode() {
  save({ mode: scheme === 'dark' ? 'light' : 'dark' })
}

function onKeyDown(e: KeyboardEvent) {
  if (!isModKey(e) || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'k' && !e.shiftKey) {
    e.preventDefault()
    focusSearch()
  } else if (e.key === '\\' || e.code === 'Backslash') {
    e.preventDefault()
    toggleSidebar()
  } else if (key === 'l' && e.shiftKey) {
    e.preventDefault()
    toggleDarkMode()
  }
}

function navLink(item: NavItem): HTMLAnchorElement {
  const label = ROUTE_NAMES[item.route]
  const link = h('a', { class: 'df-nav-link', title: label }, icon(ROUTE_ICONS[item.route]), h('span', { class: 'df-nav-label', text: label }))
  linkTo(link, item.path)
  linkEls.push({ route: item.route, el: link })
  return link
}

function paintSidebarToggle() {
  if (!sidebarToggle) return
  const hidden = sidebarMode === 'hidden'
  const rail = sidebarMode === 'rail'
  const label = hidden ? 'Keep sidebar open' : rail ? 'Expand sidebar' : 'Hide sidebar'
  sidebarToggle.replaceChildren(icon(hidden || rail ? 'expand' : 'collapse'))
  sidebarToggle.setAttribute('aria-label', label)
  sidebarToggle.title = `${label} (${shortcutLabel('\\')})`
}

function buildSidebar() {
  if (!sidebar) return
  linkEls = []

  const brand = h('a', { class: 'df-brand', 'aria-label': 'Dumbify home' }, brandMark(), h('span', { class: 'df-brand-name', text: 'dumbify' }))
  linkTo(brand, '/')
  sidebarToggle = h('button', { class: 'df-icon-btn df-sidebar-toggle', type: 'button' })
  sidebarToggle.addEventListener('click', () => {
    if (sidebarMode === 'expanded') save({ sidebar: 'hidden' })
    else {
      save({ sidebar: 'expanded' })
      closeDrawer()
    }
  })
  paintSidebarToggle()

  const search = h('button', { class: 'df-nav-link', type: 'button', title: 'Search', onclick: focusSearch },
    icon('search'), h('span', { class: 'df-nav-label', text: 'Search' }), h('span', { class: 'df-kbd', text: shortcutLabel('K') }))

  const mainNav = h('nav', { class: 'df-nav', 'aria-label': 'Main' }, search, ...NAV_MAIN.map(navLink))
  const library = h('nav', { class: 'df-nav', 'aria-label': 'Library' },
    h('div', { class: 'df-nav-heading', text: 'Library' }), ...NAV_LIBRARY.map(navLink))

  darkSwitch = h('button', {
    class: 'df-nav-link', type: 'button', role: 'switch', 'aria-checked': 'false',
    title: `Dark mode (${shortcutLabel('L', true)})`, onclick: toggleDarkMode,
  }, icon('moon'), h('span', { class: 'df-nav-label', text: 'Dark mode' }), h('span', { class: 'df-switch' }))

  const settingsBtn = h('button', { class: 'df-nav-link', type: 'button', title: 'Settings', onclick: () => openOptions() },
    icon('sliders'), h('span', { class: 'df-nav-label', text: 'Settings' }))

  const foot = h('div', { class: 'df-sidebar-foot' }, darkSwitch, settingsBtn,
    h('p', { class: 'df-tagline', text: 'No thumbnails. No distractions.' }))

  sidebar.replaceChildren(h('div', { class: 'df-sidebar-head' }, brand, sidebarToggle), mainNav, library, foot)
  updateActiveLink()
}

function buildTopbar() {
  if (!topbar) return
  const drawerBtn = h('button', {
    class: 'df-icon-btn df-drawer-btn', type: 'button', 'aria-label': 'Open navigation',
    'aria-expanded': 'false', onclick: () => openDrawer(),
  }, icon('menu'))

  crumbIcon = h('span', null, icon('home'))
  crumbLabel = h('span', { class: 'df-crumbs-label' })
  const crumbs = h('div', { class: 'df-crumbs' }, crumbIcon, crumbLabel)

  const input = h('input', {
    class: 'df-search-input', type: 'search', placeholder: 'Search YouTube',
    'aria-label': 'Search YouTube', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
  })
  searchInput = input
  const form = h('form', { class: 'df-search', role: 'search' }, icon('search'), input, h('span', { class: 'df-kbd', text: shortcutLabel('K') }))
  form.addEventListener('submit', (e) => { e.preventDefault(); submitSearch() })

  const viewBtn = h('button', {
    class: 'df-icon-btn', type: 'button', 'aria-label': 'View options', title: 'View options',
    'aria-haspopup': 'dialog', 'aria-expanded': 'false',
  }, icon('more'))
  viewBtn.addEventListener('click', () => toggleViewMenu(viewBtn))

  topbar.replaceChildren(drawerBtn, crumbs, form, h('div', { class: 'df-popover-anchor' }, viewBtn))
}

export const shellFeature: Feature = {
  id: 'shell',

  mount(nav: NavigationState) {
    injectFonts()
    buildSidebar()
    buildTopbar()
    paintRoute(nav)
    document.addEventListener('keydown', onKeyDown)

    unsubAppearance = onAppearance((s, a) => {
      scheme = a.scheme
      setSwitch(darkSwitch, a.scheme === 'dark')
      if (s.sidebar !== sidebarMode) {
        sidebarMode = s.sidebar
        paintSidebarToggle()
      }
    })
    // The first paint before settings arrive reads the stored mode directly.
    getSettings().then((s) => { sidebarMode = s.sidebar; paintSidebarToggle() })
  },

  unmount() {
    closeViewMenu()
    document.removeEventListener('keydown', onKeyDown)
    sidebar?.replaceChildren()
    topbar?.replaceChildren()
    linkEls = []
    searchInput = null
    unsubAppearance?.()
    unsubAppearance = null
  },

  update(nav: NavigationState) {
    closeViewMenu()
    paintRoute(nav)
  },
}
