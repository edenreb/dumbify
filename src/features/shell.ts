import type { NavigationState, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { root } from '../core/UIEngine'
import { onNavigate, navigateTo } from '../core/PageManager'

const ROUTE_NAMES: Record<Route, string> = {
  home: 'Home',
  watch: 'Watch',
  search: 'Search',
  subscriptions: 'Subscriptions',
  history: 'History',
  'watch-later': 'Watch Later',
  playlist: 'Playlist',
  channel: 'Channel',
  shorts: 'Shorts',
  unknown: 'YouTube',
}

const NAV: { label: string; route: Route; path: string }[] = [
  { label: 'Home', route: 'home', path: '/' },
  { label: 'Subscriptions', route: 'subscriptions', path: '/feed/subscriptions' },
  { label: 'History', route: 'history', path: '/feed/history' },
  { label: 'Watch Later', route: 'watch-later', path: '/playlist?list=WL' },
]

let navEl: HTMLElement | null = null
let linkEls: HTMLElement[] = []
let currentRoute: Route = 'home'
let unsubNav: (() => void) | null = null

function updateActiveLink() {
  linkEls.forEach((el, i) => {
    el.classList.toggle('df-active', NAV[i]?.route === currentRoute)
  })
}

function showSearchPrompt() {
  const q = prompt('Search YouTube:')
  if (q?.trim()) navigateTo(`/results?search_query=${encodeURIComponent(q.trim())}`)
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showSearchPrompt()
  }
}

function buildNavbar() {
  navEl = document.createElement('nav')
  navEl.id = 'df-nav'

  const brand = document.createElement('span')
  brand.id = 'df-brand'
  brand.textContent = 'Dumbify'
  brand.onclick = () => navigateTo('/')
  navEl.appendChild(brand)

  const links = document.createElement('div')
  links.id = 'df-links'

  NAV.forEach((item) => {
    const btn = document.createElement('button')
    btn.className = 'df-nav-link'
    btn.textContent = item.label
    btn.onclick = () => navigateTo(item.path)
    linkEls.push(btn)
    links.appendChild(btn)
  })

  navEl.appendChild(links)

  const cmd = document.createElement('button')
  cmd.id = 'df-cmd'
  cmd.textContent = '\u2318K'
  cmd.title = 'Search (Cmd+K)'
  cmd.onclick = showSearchPrompt
  navEl.appendChild(cmd)

  updateActiveLink()
  root.prepend(navEl)
  document.addEventListener('keydown', onKeyDown)
}

function removeNavbar() {
  navEl?.remove()
  navEl = null
  linkEls = []
  document.removeEventListener('keydown', onKeyDown)
}

export const shellFeature: Feature = {
  id: 'shell',

  mount(nav: NavigationState) {
    currentRoute = nav.route
    buildNavbar()

    const pageName = ROUTE_NAMES[nav.route] ?? 'YouTube'
    document.title = `${pageName} \u00B7 Dumbify`

    unsubNav = onNavigate((s) => {
      currentRoute = s.route
      updateActiveLink()
      const name = ROUTE_NAMES[s.route] ?? 'YouTube'
      document.title = `${name} \u00B7 Dumbify`
    })
  },

  unmount() {
    removeNavbar()
    if (unsubNav) {
      unsubNav()
      unsubNav = null
    }
  },
}
