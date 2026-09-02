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

// The shell is always on. Only /watch gets its own feature; every other route - including
// 'unknown', which home-feed turns into a 404 or a redirect - is the feed.
function getFeatureIdsForRoute(route: string): string[] {
  return route === 'watch' ? ['shell', 'watch-page'] : ['shell', 'home-feed']
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

// main.css hides <body> so the real page never flashes, which means any throw that gets
// past us leaves a permanently blank youtube.com. This is the way back.
function bailToYouTube(err: unknown) {
  console.error('[Dumbify] failed, falling back to YouTube:', err)
  document.documentElement.classList.add('df-failed')
  unmountUI()
}

// Every sync needs this, not just the first: sync also runs from onNavigate, which was
// outside init()'s try/catch - so a throw on any later navigation (an invalidated
// extension context after a reload is the realistic one) had no escape hatch.
function safeSync(nav: NavigationState) {
  try {
    sync(nav)
  } catch (err) {
    bailToYouTube(err)
  }
}

// A rejected promise never reaches safeSync's try/catch - by the time it settles, the
// synchronous call has long since returned. That matters because main.css hides <body>,
// so an async failure during startup can leave a permanently blank youtube.com with the
// df-failed escape hatch never triggered.
//
// Only bail when the extension context is actually gone (chrome.runtime.id disappears
// when the extension reloads or auto-updates while this tab stays open) - at that point
// nothing will work again and plain YouTube beats a blank page. Any other rejection is
// somebody's failed fetch, which is not worth tearing the whole UI down for.
function watchForLostContext() {
  window.addEventListener('unhandledrejection', (e) => {
    let alive = true
    try {
      alive = !!chrome.runtime?.id
    } catch {
      alive = false
    }
    if (alive) return
    bailToYouTube(e.reason)
  })
}

function init() {
  try {
    watchForLostContext()
    mountUI()
    if (!isSignedIn()) { renderSignedOut(); return }
    startPageManager()
    onNavigate(safeSync)
  } catch (err) {
    bailToYouTube(err)
    return
  }
  safeSync(getNavigationState())
}

if (!redirectShorts(location.pathname)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
}
