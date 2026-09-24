import type { Route } from '../types'
import type { IconName } from './icons'

/**
 * Every word Dumbify shows is English, so dates and numbers are written the English way
 * too - rather than in the browser's locale, which put "Donnerstag, 24. September" under
 * "Good evening".
 */
export const UI_LOCALE = 'en-US'

export const ROUTE_NAMES: Record<Route, string> = {
  home: 'Home',
  watch: 'Watch',
  search: 'Search',
  subscriptions: 'Subscriptions',
  history: 'History',
  'watch-later': 'Watch later',
  liked: 'Liked videos',
  playlists: 'Playlists',
  playlist: 'Playlist',
  channel: 'Channel',
  shorts: 'Shorts',
  unknown: 'Not found',
}

export const ROUTE_ICONS: Record<Route, IconName> = {
  home: 'home',
  watch: 'play',
  search: 'search',
  subscriptions: 'subscriptions',
  history: 'history',
  'watch-later': 'clock',
  liked: 'thumb',
  playlists: 'playlists',
  playlist: 'playlists',
  channel: 'user',
  shorts: 'play',
  unknown: 'info',
}

export interface NavItem {
  route: Route
  path: string
}

export const NAV_MAIN: NavItem[] = [
  { route: 'home', path: '/' },
  { route: 'subscriptions', path: '/feed/subscriptions' },
]

export const NAV_LIBRARY: NavItem[] = [
  { route: 'history', path: '/feed/history' },
  { route: 'watch-later', path: '/playlist?list=WL' },
  { route: 'liked', path: '/playlist?list=LL' },
  { route: 'playlists', path: '/feed/playlists' },
]

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export function shortcutLabel(key: string, shift = false): string {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  if (mac) return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl ${shift ? 'Shift ' : ''}${key}`
}

export function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}
