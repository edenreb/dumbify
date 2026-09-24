import '../ui/controls.css'
import './options.css'
import '../styles/fonts.css'
import { SettingsStore } from '../ui/store'
import { followSystem, paintFromCache, themePage } from '../ui/page-theme'
import { h } from '../ui/dom'
import { brandMark, icon, type IconName } from '../ui/icons'
import { toggle } from '../ui/controls'
import { runToastAction, saveStatus } from './feedback'
import { isModKey } from '../ui/routes'
import {
  aboutSection, appearanceSection, backupSection, layoutSection, shortcutsSection,
  typographySection, watchSection,
} from './sections'
import { wallpaperSection } from './wallpaper-section'
import { createPreview } from './preview-frame'

paintFromCache()

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'typography', label: 'Typography', icon: 'type' },
  { id: 'wallpaper', label: 'Wallpaper', icon: 'image' },
  { id: 'layout', label: 'Layout', icon: 'layout' },
  { id: 'watch', label: 'Watch page', icon: 'film' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'backup', label: 'Backup & reset', icon: 'download' },
  { id: 'about', label: 'About', icon: 'info' },
]

async function main() {
  const app = document.getElementById('app')!
  const status = saveStatus()
  const store = new SettingsStore({ saved: status.saved, failed: status.failed })
  await store.load()
  store.subscribe((s) => themePage(s))
  followSystem(() => store.value)

  // Header: the page, whether everything saved, and the master switch.
  const powerLabel = h('span', { class: 'power-label' })
  const power = h('div', { class: 'power' }, powerLabel, toggle(store, {
    label: 'Dumbify on YouTube', get: (s) => s.enabled, set: (v) => ({ enabled: v }),
  }))
  store.subscribe((s) => { powerLabel.textContent = s.enabled ? 'Dumbify is on' : 'Dumbify is off' })

  const header = h('header', { class: 'app-header' },
    h('div', { class: 'brand' }, brandMark(), 'Dumbify', h('span', { class: 'brand-sep', text: '/' }), h('span', { class: 'brand-page', text: 'Settings' })),
    h('div', { class: 'header-spacer' }),
    status.el,
    power,
  )

  // Section list, with the one in view highlighted.
  const navLinks = new Map<string, HTMLAnchorElement>()
  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Settings sections' })
  for (const s of SECTIONS) {
    const a = h('a', { class: 'nav-item', href: `#${s.id}`, title: s.label }, icon(s.icon), h('span', { class: 'nav-label', text: s.label }))
    navLinks.set(s.id, a)
    nav.appendChild(a)
  }
  nav.appendChild(h('div', { class: 'nav-foot' },
    h('a', { class: 'nav-item', href: 'https://chromewebstore.google.com/detail/dumbify-customizable-text/lhnjjldhbllcdfdldeacdgalkkofhicf/reviews', target: '_blank', rel: 'noopener noreferrer', title: 'Rate Dumbify' }, icon('star'), h('span', { class: 'nav-label', text: 'Rate Dumbify' })),
  ))

  const preview = createPreview(store)

  const offBanner = h('div', { class: 'off-banner', role: 'status' }, icon('power'),
    h('span', { text: 'Dumbify is off, so YouTube looks like normal YouTube. Your settings are kept for when you turn it back on.' }),
    h('button', { class: 'btn btn-primary', type: 'button', text: 'Turn on', onclick: () => void store.commit({ enabled: true }) }))
  store.subscribe((s) => { offBanner.hidden = s.enabled })

  const main = h('main', { class: 'app-main' },
    offBanner,
    appearanceSection(store),
    typographySection(store),
    wallpaperSection(store),
    layoutSection(store),
    watchSection(store),
    shortcutsSection(),
    backupSection(store),
    aboutSection(),
  )

  app.replaceChildren(header, h('div', { class: 'app-body' }, nav, preview.el, main))
  app.removeAttribute('aria-busy')

  const setActive = (id: string) => {
    for (const [key, link] of navLinks) {
      link.classList.toggle('is-active', key === id)
      if (key === id) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
    preview.showPage(id === 'watch' ? 'watch' : 'feed')
  }
  // The section being read is the last one whose top has passed just under the header.
  // (An IntersectionObserver band lit up the section above whenever its last few pixels
  // were still inside the band.)
  let spyQueued = false
  const spy = () => {
    spyQueued = false
    let current = SECTIONS[0].id
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el && el.getBoundingClientRect().top <= 140) current = s.id
    }
    setActive(current)
  }
  window.addEventListener('scroll', () => {
    if (spyQueued) return
    spyQueued = true
    requestAnimationFrame(spy)
  }, { passive: true })
  spy()

  // Ctrl/Cmd+Z takes what a toast offers - undoing a deleted upload or a look - from
  // anywhere on the page but a text field, which keeps its own undo.
  document.addEventListener('keydown', (e) => {
    if (!isModKey(e) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
    const target = e.target as HTMLElement | null
    if (target?.closest('textarea, [contenteditable], input:not([type]), input[type="text"], input[type="search"]')) return
    if (runToastAction()) e.preventDefault()
  })

  // Deep links from the reading view ("Settings" on the wallpaper menu and so on).
  const goToHash = () => {
    const id = location.hash.slice(1)
    const target = id && document.getElementById(id)
    if (target) {
      target.scrollIntoView({ block: 'start' })
      setActive(id)
    }
  }
  window.addEventListener('hashchange', goToHash)
  goToHash()
}

main().catch((err) => {
  console.error('[Dumbify] settings failed to load:', err)
  document.getElementById('app')!.textContent = 'Settings couldn’t load. Try reopening this page.'
})
