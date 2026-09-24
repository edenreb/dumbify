// The live preview: the real reading-view stylesheet, rendered in a frame at desktop size
// and scaled down to fit. Settings reach it by message on every change - including a
// slider mid-drag, before anything is saved.

import type { SettingsStore } from '../ui/store'
import { h } from '../ui/dom'
import { icon } from '../ui/icons'
import type { DumbifySettings } from '../core/settings'

export type PreviewPage = 'feed' | 'watch'

const FRAME_W = 1280
const FRAME_H = 800

export interface PreviewFrame {
  el: HTMLElement
  showPage(page: PreviewPage): void
}

export function createPreview(store: SettingsStore): PreviewFrame {
  const iframe = h('iframe', {
    src: '../preview/index.html',
    title: 'Live preview of the reading view',
    tabindex: '-1',
    'aria-hidden': 'true',
  })
  const viewport = h('div', { class: 'preview-viewport' }, iframe)
  // In a narrow window the preview floats in a corner, over the settings - so it can be
  // tucked away. The choice is remembered.
  const toggle = h('button', { class: 'preview-toggle', type: 'button', 'aria-expanded': 'true' },
    h('span', { class: 'preview-toggle-label', text: 'Preview' }), icon('chevronDown'))
  const card = h('div', { class: 'preview-card' },
    h('div', { class: 'preview-chrome' },
      h('span', { class: 'preview-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'preview-url', 'aria-hidden': 'true' }, icon('shield'), 'youtube.com'),
      toggle),
    viewport,
  )

  let page: PreviewPage = 'feed'
  let ready = false

  const send = (s: DumbifySettings) => {
    if (!ready) return
    iframe.contentWindow?.postMessage({
      type: 'dumbify:preview',
      settings: s,
      page,
      systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    }, location.origin)
  }

  iframe.addEventListener('load', () => {
    ready = true
    send(store.value)
  })
  store.subscribe((s) => send(s))

  // Scale the desktop-sized frame to whatever width the column has.
  const fit = () => {
    const scale = viewport.clientWidth / FRAME_W
    iframe.style.transform = `scale(${scale})`
    viewport.style.height = `${Math.round(FRAME_H * scale)}px`
  }
  new ResizeObserver(fit).observe(viewport)

  const tabs = h('div', { class: 'seg preview-tabs', role: 'radiogroup', 'aria-label': 'Preview page' })
  const pages: [PreviewPage, string][] = [['feed', 'Feed'], ['watch', 'Watch page']]
  const inputs = pages.map(([value, label]) => {
    const input = h('input', { type: 'radio', name: 'preview-page', value, class: 'sr-only' })
    input.checked = value === page
    input.addEventListener('change', () => { if (input.checked) setPage(value) })
    tabs.appendChild(h('label', { class: 'seg-opt' }, input, h('span', { class: 'seg-face', text: label })))
    return input
  })

  function setPage(next: PreviewPage) {
    if (next === page) return
    page = next
    inputs.forEach((i) => { i.checked = i.value === next })
    send(store.value)
  }

  const el = h('aside', { class: 'app-preview', 'aria-label': 'Live preview' },
    card,
    h('div', { class: 'preview-caption' },
      h('span', { class: 'preview-note', text: 'Live preview · open YouTube tabs update instantly' }),
      tabs,
    ),
  )

  const COLLAPSED = 'dumbify:preview-collapsed'
  const setCollapsed = (collapsed: boolean) => {
    el.classList.toggle('is-collapsed', collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.setAttribute('aria-label', collapsed ? 'Show the live preview' : 'Hide the live preview')
    if (!collapsed) requestAnimationFrame(fit)
  }
  toggle.addEventListener('click', () => {
    const collapsed = !el.classList.contains('is-collapsed')
    setCollapsed(collapsed)
    try { localStorage.setItem(COLLAPSED, collapsed ? '1' : '0') } catch { /* private window */ }
  })
  let remembered: string | null = null
  try { remembered = localStorage.getItem(COLLAPSED) } catch { /* private window */ }
  // Unless told otherwise, a phone-sized window keeps it tucked away.
  const phone = window.matchMedia('(max-width: 560px)')
  setCollapsed(remembered === null ? phone.matches : remembered === '1')
  phone.addEventListener('change', (e) => {
    let chosen: string | null = null
    try { chosen = localStorage.getItem(COLLAPSED) } catch { /* private window */ }
    if (chosen === null) setCollapsed(e.matches)
  })

  return { el, showPage: setPage }
}
