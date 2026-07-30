import { mountUI } from './core/UIEngine'
import { startPageManager, onNavigate, getNavigationState } from './core/PageManager'
import { registerFeature, activateFeatures } from './core/FeatureManager'
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
    case 'playlist':     return [...base, 'home-feed']
    case 'channel':      return [...base, 'home-feed']
    case 'search':       return [...base, 'home-feed']
    default:             return [...base, 'home-feed']
  }
}

function syncFeatures() {
  const nav = getNavigationState()
  const ids = getFeatureIdsForRoute(nav.route)
  activateFeatures(ids, nav)
}

function init() {
  mountUI()
  startPageManager()
  syncFeatures()

  onNavigate((nav) => {
    const ids = getFeatureIdsForRoute(nav.route)
    activateFeatures(ids, nav)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
