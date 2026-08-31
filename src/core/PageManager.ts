import type { Route, NavigationState } from '../types'

type NavCallback = (state: NavigationState) => void

let callbacks: NavCallback[] = []
let lastHref = location.href

function getRoute(pathname: string, searchParams: URLSearchParams): Route {
  if (pathname === '/watch') return 'watch'
  if (pathname === '/results') return 'search'
  if (pathname === '/feed/subscriptions') return 'subscriptions'
  if (pathname === '/feed/history') return 'history'
  if (pathname === '/playlist' && searchParams.get('list') === 'WL') return 'watch-later'
  if (pathname === '/playlist' && searchParams.get('list') === 'LL') return 'liked'
  if (pathname === '/feed/playlists') return 'playlists'
  if (pathname === '/playlist') return 'playlist'
  if (pathname.startsWith('/channel/') || pathname.startsWith('/@')) return 'channel'
  if (pathname.startsWith('/shorts/')) return 'shorts'
  return 'home'
}

function buildState(): NavigationState {
  const p = location.pathname
  const s = new URLSearchParams(location.search)
  return {
    route: getRoute(p, s),
    href: location.href,
    pathname: p,
    searchParams: s,
    videoId: s.get('v'),
    searchQuery: s.get('search_query'),
    channelId: p.match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null,
    playlistId: s.get('list'),
  }
}

function buildStateFromPath(path: string): NavigationState {
  const url = new URL(path.startsWith('/') ? `https://www.youtube.com${path}` : path)
  const p = url.pathname
  const s = url.searchParams
  return {
    route: getRoute(p, s),
    href: url.href,
    pathname: p,
    searchParams: s,
    videoId: s.get('v'),
    searchQuery: s.get('search_query'),
    channelId: p.match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null,
    playlistId: s.get('list'),
  }
}

function fire() {
  const href = location.href
  if (href === lastHref) return
  lastHref = href
  const state = buildState()
  callbacks.forEach((cb) => cb(state))
}

export function onNavigate(cb: NavCallback): () => void {
  callbacks.push(cb)
  return () => {
    callbacks = callbacks.filter((c) => c !== cb)
  }
}

export function startPageManager() {
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...args) => { origPush(...args); fire() }
  history.replaceState = (...args) => { origReplace(...args); fire() }
  window.addEventListener('popstate', fire)
  window.addEventListener('yt-navigate-finish', fire)
  lastHref = location.href
}

export function getNavigationState(): NavigationState {
  return buildState()
}

export function navigateTo(path: string) {
  // Same-origin paths only. buildStateFromPath treats anything not starting with "/"
  // as an absolute URL, which would make this an open-redirect sink the moment a
  // caller passed through data from the page.
  if (!path.startsWith('/')) return
  const state = buildStateFromPath(path)
  const href = state.href
  if (href === location.href) return
  window.location.href = href
}
