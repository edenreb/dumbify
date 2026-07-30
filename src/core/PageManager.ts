import type { Route, NavigationState } from '../types'

type NavCallback = (state: NavigationState) => void

let callbacks: NavCallback[] = []
let lastHref = location.href

function getRoute(): Route {
  const p = location.pathname
  const s = new URLSearchParams(location.search)
  if (p === '/watch') return 'watch'
  if (p === '/results') return 'search'
  if (p === '/feed/subscriptions') return 'subscriptions'
  if (p === '/feed/history') return 'history'
  if (p === '/playlist' && s.get('list') === 'WL') return 'watch-later'
  if (p === '/playlist') return 'playlist'
  if (p.startsWith('/channel/') || p.startsWith('/@')) return 'channel'
  if (p.startsWith('/shorts/')) return 'shorts'
  return 'home'
}

function buildState(): NavigationState {
  return {
    route: getRoute(),
    href: location.href,
    pathname: location.pathname,
    searchParams: new URLSearchParams(location.search),
    videoId: new URLSearchParams(location.search).get('v'),
    searchQuery: new URLSearchParams(location.search).get('search_query'),
    channelId: location.pathname.match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null,
    playlistId: new URLSearchParams(location.search).get('list'),
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

export function stopPageManager() {
  window.removeEventListener('popstate', fire)
  window.removeEventListener('yt-navigate-finish', fire)
}

export function getNavigationState(): NavigationState {
  return buildState()
}

export function navigateTo(path: string) {
  location.href = path.startsWith('/') ? `https://www.youtube.com${path}` : path
}
