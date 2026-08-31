import type { NavigationState, Route } from '../types'
import type { DumbifySettings } from '../types'
import type { Feature } from '../core/FeatureManager'
import { sidebar, main } from '../core/UIEngine'
import { onNavigate, navigateTo } from '../core/PageManager'
import { getSettings, setSettings } from '../core/storage'

function injectFonts() {
  if (document.getElementById('df-fonts')) return
  const link = document.createElement('link')
  link.id = 'df-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500&family=Inter+Tight:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap'
  document.head.appendChild(link)
}

const ROUTE_NAMES: Record<Route, string> = {
  home: 'Home',
  watch: 'Watch',
  search: 'Search',
  subscriptions: 'Subscriptions',
  history: 'History',
  'watch-later': 'Watch Later',
  liked: 'Liked',
  playlists: 'Playlists',
  playlist: 'Playlist',
  channel: 'Channel',
  shorts: 'Shorts',
  unknown: 'Not Found',
}

const NAV: { label: string; route: Route; path: string }[] = [
  { label: 'Home', route: 'home', path: '/' },
  { label: 'Subscriptions', route: 'subscriptions', path: '/feed/subscriptions' },
  { label: 'History', route: 'history', path: '/feed/history' },
  { label: 'Watch Later', route: 'watch-later', path: '/playlist?list=WL' },
  { label: 'Liked', route: 'liked', path: '/playlist?list=LL' },
  { label: 'Playlists', route: 'playlists', path: '/feed/playlists' },
]

let linkEls: HTMLElement[] = []
let currentRoute: Route = 'home'
let unsubNav: (() => void) | null = null
let sidebarEl: HTMLElement | null = null
let searchInput: HTMLInputElement | null = null

function updateActiveLink() {
  linkEls.forEach((el, i) => {
    el.classList.toggle('df-active', NAV[i]?.route === currentRoute)
  })
}

function submitSearch() {
  const q = searchInput?.value.trim()
  if (q) navigateTo(`/results?search_query=${encodeURIComponent(q)}`)
}

function buildTopbar() {
  if (!main || main.querySelector('.df-topbar')) return

  const topbar = document.createElement('header')
  topbar.className = 'df-topbar'

  const form = document.createElement('form')
  form.className = 'df-search'
  form.onsubmit = (e) => { e.preventDefault(); submitSearch() }

  const input = document.createElement('input')
  input.className = 'df-search-input'
  input.type = 'text'
  input.placeholder = 'Search YouTube'
  input.setAttribute('aria-label', 'Search YouTube')
  input.autocomplete = 'off'
  searchInput = input

  const btn = document.createElement('button')
  btn.className = 'df-search-btn'
  btn.type = 'submit'
  btn.textContent = 'Search'

  form.appendChild(input)
  form.appendChild(btn)
  topbar.appendChild(form)

  main.insertBefore(topbar, main.firstChild)
}

function removeTopbar() {
  main?.querySelector('.df-topbar')?.remove()
  searchInput = null
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInput?.focus()
    searchInput?.select()
  }
}

function buildSidebar() {
  if (!sidebar) return

  sidebarEl = sidebar
  sidebarEl.innerHTML = ''

  const brand = document.createElement('a')
  brand.className = 'df-brand'
  brand.onclick = (e) => { e.stopPropagation(); navigateTo('/') }
  const logo = document.createElement('img')
  logo.className = 'df-brand-logo'
  logo.src = chrome.runtime.getURL('icons/logo.png')
  logo.alt = 'Dumbify'
  brand.appendChild(logo)
  const tagline = document.createElement('span')
  tagline.className = 'df-brand-tagline'
  tagline.textContent = 'youtube, quieted'
  brand.appendChild(tagline)
  sidebarEl.appendChild(brand)

  const nav = document.createElement('nav')
  nav.className = 'df-nav'

  NAV.forEach((item) => {
    const btn = document.createElement('button')
    btn.className = 'df-nav-link'
    const span = document.createElement('span')
    span.textContent = item.label
    btn.appendChild(span)
    btn.onclick = (e) => { e.stopPropagation(); navigateTo(item.path) }
    linkEls.push(btn)
    nav.appendChild(btn)
  })

  sidebarEl.appendChild(nav)

  const footer = document.createElement('div')
  footer.className = 'df-sidebar-footer'

  const toggle = document.createElement('button')
  toggle.className = 'df-theme-toggle'
  toggle.setAttribute('aria-label', 'Toggle dark mode')

  const track = document.createElement('span')
  track.className = 'df-theme-track'

  const knob = document.createElement('span')
  knob.className = 'df-theme-knob'

  const label = document.createElement('span')
  label.className = 'df-theme-label'

  toggle.appendChild(track)
  track.appendChild(knob)
  toggle.appendChild(label)

  getSettings().then((s) => {
    const isDark = s.theme === 'dark'
    knob.className = `df-theme-knob ${isDark ? 'dark' : 'light'}`
    label.textContent = isDark ? 'Night' : 'Day'
  })

  toggle.onclick = () => {
    getSettings().then((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark'
      setSettings({ theme: next })
      knob.className = `df-theme-knob ${next === 'dark' ? 'dark' : 'light'}`
      label.textContent = next === 'dark' ? 'Night' : 'Day'
    })
  }

  footer.appendChild(toggle)

  const settingsBtn = document.createElement('a')
  settingsBtn.className = 'df-settings-btn'
  settingsBtn.setAttribute('aria-label', 'Settings')
  settingsBtn.href = chrome.runtime.getURL('src/options/index.html')
  settingsBtn.target = '_blank'
  settingsBtn.rel = 'noopener'
  const settingsIcon = document.createElement('span')
  settingsIcon.className = 'df-settings-icon'
  settingsIcon.textContent = '\u2699'
  const settingsLabel = document.createElement('span')
  settingsLabel.className = 'df-settings-label'
  settingsLabel.textContent = 'Settings'
  settingsBtn.appendChild(settingsIcon)
  settingsBtn.appendChild(settingsLabel)
  footer.appendChild(settingsBtn)

  const bottomTagline = document.createElement('p')
  bottomTagline.className = 'df-sidebar-tagline'
  bottomTagline.textContent = 'no thumbnails · no autoplay'
  footer.appendChild(bottomTagline)

  sidebarEl.appendChild(footer)

  updateActiveLink()
  document.addEventListener('keydown', onKeyDown)
}

function removeSidebar() {
  if (sidebarEl) sidebarEl.innerHTML = ''
  linkEls = []
  document.removeEventListener('keydown', onKeyDown)
}

export const shellFeature: Feature = {
  id: 'shell',

  mount(nav: NavigationState) {
    injectFonts()
    currentRoute = nav.route
    buildSidebar()
    buildTopbar()

    if (searchInput) {
      searchInput.value = nav.route === 'search' ? (nav.searchQuery ?? '') : ''
    }

    const pageName = ROUTE_NAMES[nav.route] ?? 'YouTube'
    document.title = `${pageName} · Dumbify`

    unsubNav = onNavigate((s) => {
      currentRoute = s.route
      updateActiveLink()
      const name = ROUTE_NAMES[s.route] ?? 'YouTube'
      document.title = `${name} · Dumbify`
    })
  },

  unmount() {
    removeSidebar()
    removeTopbar()
    if (unsubNav) {
      unsubNav()
      unsubNav = null
    }
  },

  update(nav: NavigationState) {
    currentRoute = nav.route
    updateActiveLink()
    if (searchInput) {
      searchInput.value = nav.route === 'search' ? (nav.searchQuery ?? '') : ''
    }
    const name = ROUTE_NAMES[nav.route] ?? 'YouTube'
    document.title = `${name} · Dumbify`
  },
}
