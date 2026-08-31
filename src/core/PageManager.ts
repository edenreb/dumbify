import type { Route, NavigationState } from '../types'
import { extractPageChannelId } from './DataExtractor'

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
  if (pathname.startsWith('/channel/') || pathname.startsWith('/@') ||
      pathname.startsWith('/c/') || pathname.startsWith('/user/')) return 'channel'
  if (pathname.startsWith('/shorts/')) return 'shorts'
  if (pathname === '/' || pathname === '') return 'home'
  // Legacy vanity URLs (/Couriway) look like nothing in particular from the path
  // alone. The loaded page is what says whether it is a channel.
  if (channelIdFor(pathname)) return 'channel'
  return 'unknown'
}

// Only /channel/<id> spells the channel id out. For handle URLs (/@name, /c/x,
// /user/x) it lives in the page itself, so read it there - but only when the path
// asked about is the one actually loaded, since that is the only page we can read.
let pageChannelId: { href: string; id: string | null } | null = null

function channelIdFor(pathname: string): string | null {
  const fromPath = pathname.match(/\/channel\/(UC[\w-]{22})/)?.[1]
  if (fromPath) return fromPath
  if (pathname !== location.pathname) return null
  // Parsing ytInitialData is not free and this runs on every state build, but the
  // answer only changes when the document does.
  if (pageChannelId?.href !== location.href) {
    pageChannelId = { href: location.href, id: extractPageChannelId() }
  }
  return pageChannelId.id
}

// buildState and buildStateFromPath were the same eight fields written out twice; the
// only difference was where the URL came from.
function stateFromURL(url: URL | Location): NavigationState {
  const p = url.pathname
  const s = new URLSearchParams(url.search)
  return {
    route: getRoute(p, s),
    href: url.href,
    pathname: p,
    searchParams: s,
    videoId: s.get('v'),
    searchQuery: s.get('search_query'),
    channelId: channelIdFor(p),
    playlistId: s.get('list'),
  }
}

function buildState(): NavigationState {
  return stateFromURL(location)
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
  // Same-origin paths only. new URL() ignores the base for anything that is already
  // absolute, so without this guard a caller passing data through from the page would
  // turn this into an open-redirect sink.
  if (!path.startsWith('/')) return
  const href = new URL(path, 'https://www.youtube.com').href
  if (href === location.href) return
  window.location.href = href
}
