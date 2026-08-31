import { mountUI, unmountUI, renderSignedOut } from './core/UIEngine'
import { startPageManager, onNavigate, getNavigationState } from './core/PageManager'
import { registerFeature, activateFeatures } from './core/FeatureManager'
import type { NavigationState } from './types'
import { isSignedIn } from './core/DataExtractor'
import { shellFeature } from './features/shell'
import { homeFeedFeature } from './features/home-feed'
import { watchPageFeature } from './features/watch-page'

registerFeature(shellFeature)
registerFeature(homeFeedFeature)
registerFeature(watchPageFeature)

function getFeatureIdsForRoute(route: string): string[] {
  const base = ['shell']
  switch (route) {
    case 'home':         return [...base, 'home-feed']
    case 'watch':        return [...base, 'watch-page']
    case 'history':      return [...base, 'home-feed']
    case 'subscriptions': return [...base, 'home-feed']
    case 'watch-later':  return [...base, 'home-feed']
    case 'liked':        return [...base, 'home-feed']
    case 'playlists':    return [...base, 'home-feed']
    case 'playlist':     return [...base, 'home-feed']
    case 'channel':      return [...base, 'home-feed']
    case 'search':       return [...base, 'home-feed']
    default:             return [...base, 'home-feed'] // includes 'unknown' (404)
  }
}

// Shorts have no dedicated view: a single short plays through the normal watch
// page, and the shorts feed itself has no equivalent here, so it falls back home.
function redirectShorts(pathname: string): boolean {
  if (!/^\/shorts(\/|$)/.test(pathname)) return false
  const id = pathname.match(/^\/shorts\/([\w-]{11})/)?.[1]
  location.replace(id ? `https://www.youtube.com/watch?v=${id}` : 'https://www.youtube.com/')
  return true
}

function sync(nav: NavigationState) {
  if (redirectShorts(nav.pathname)) return
  activateFeatures(getFeatureIdsForRoute(nav.route), nav)
}

function init() {
 try {
    mountUI()
    if (!isSignedIn()) { renderSignedOut(); return }
    startPageManager()
    sync(getNavigationState())
    onNavigate(sync)
  } catch (err) {
    console.error('[Dumbify] failed to start, falling back to YouTube:', err)
    document.documentElement.classList.add('df-failed')
    unmountUI()
  }
}

if (!redirectShorts(location.pathname)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
}
