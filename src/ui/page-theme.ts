// Dresses an extension page - settings, popup - in the reader's own theme and accent.

import {
  applyAppearance, computeAppearance, onSystemSchemeChange, systemPrefersDark, type Appearance,
} from '../core/appearance'
import type { DumbifySettings } from '../core/settings'

// Extension pages have their own localStorage, readable synchronously before the async
// settings read returns - which is what stops the popup flashing the default theme open.
const CACHE = 'dumbify:page-appearance'

export function paintFromCache() {
  try {
    const raw = localStorage.getItem(CACHE)
    if (!raw) return
    const { vars, attrs } = JSON.parse(raw) as { vars: Record<string, string>; attrs: Record<string, string> }
    const el = document.documentElement
    for (const [k, v] of Object.entries(vars ?? {})) if (k.startsWith('--df-')) el.style.setProperty(k, String(v))
    for (const [k, v] of Object.entries(attrs ?? {})) if (/^[a-z]+$/.test(k)) el.setAttribute(`data-${k}`, String(v))
  } catch {
    // First run, or storage blocked: the stylesheet's defaults stand.
  }
}

export function themePage(s: DumbifySettings): Appearance {
  const a = computeAppearance(s, systemPrefersDark())
  applyAppearance(document.documentElement, a)
  try {
    localStorage.setItem(CACHE, JSON.stringify({ vars: a.vars, attrs: a.attrs }))
  } catch { /* ignore */ }
  return a
}

/** Re-themes when the system flips between light and dark while in auto mode. */
export function followSystem(get: () => DumbifySettings) {
  onSystemSchemeChange(() => {
    if (get().mode === 'auto') themePage(get())
  })
}
