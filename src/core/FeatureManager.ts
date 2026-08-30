import type { NavigationState } from '../types'

export interface Feature {
  id: string
  mount(nav: NavigationState): void
  update?(nav: NavigationState): void
  unmount(): void
}

const registry = new Map<string, Feature>()
const activeIds: string[] = []

export function registerFeature(feature: Feature) {
  registry.set(feature.id, feature)
}

export function activateFeatures(ids: string[], nav: NavigationState) {
  const toUnmount = activeIds.filter((id) => !ids.includes(id))
  const toMount = ids.filter((id) => !activeIds.includes(id))
  const toUpdate = ids.filter((id) => activeIds.includes(id))

  for (const id of toUnmount) {
    registry.get(id)?.unmount()
  }

  for (const id of toMount) {
    registry.get(id)?.mount(nav)
  }

  for (const id of toUpdate) {
    const feature = registry.get(id)
    if (feature?.update) feature.update(nav)
  }

  activeIds.length = 0
  activeIds.push(...ids)
}
