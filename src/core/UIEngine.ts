import '../styles/main.css'
import { getSettings, onSettingsChange } from './storage'
import type { DumbifySettings } from '../types'

export let root: HTMLElement
export let content: HTMLElement
export let sidebar: HTMLElement | null = null
export let main: HTMLElement | null = null
let layout: HTMLElement | null = null

const LIGHT_BG = '#f7f5ee'
const DARK_BG = '#1d1d1d'

function applyFont(s: DumbifySettings) {
  if (!root) return
  root.style.setProperty('--df-font-family', s.fontFamily)
  root.style.setProperty('--df-font-size', s.fontSize + 'px')
  root.style.setProperty('--df-font-color', s.theme === 'dark' ? s.fontColorDark : s.fontColor)
}

function applyTheme(s: DumbifySettings) {
  if (!root) return
  root.classList.toggle('dark', s.theme === 'dark')
  root.classList.toggle('has-bg', !!s.backgroundImage)
  root.style.setProperty('--bg-opacity', String(s.bgOpacity))
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  const bgImage = s.backgroundImage
    ? `url(${s.backgroundImage})`
    : ''
  const bgStyles = bgImage
    ? `${bgImage} center/cover fixed`
    : bg
  document.documentElement.style.backgroundColor = bg
  document.body.style.backgroundColor = bg
  root.style.setProperty('background', bgStyles, 'important')
  if (bgImage) {
    root.style.setProperty('background-color', bg, 'important')
  } else {
    root.style.removeProperty('background-color')
  }
  if (layout) {
    if (bgImage) {
      const alpha = s.bgOpacity
      const hex = bg.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      layout.style.backgroundColor = `rgba(${r},${g},${b},${alpha})`
      layout.style.borderRadius = '16px'
      layout.style.marginTop = '16px'
      layout.style.marginBottom = '16px'
      layout.style.minHeight = 'calc(100vh - 32px)'
    } else {
      layout.style.backgroundColor = ''
      layout.style.borderRadius = ''
      layout.style.marginTop = ''
      layout.style.marginBottom = ''
      layout.style.minHeight = ''
    }
  }
}

export function mountUI() {
  document.documentElement.style.backgroundColor = LIGHT_BG
  document.body.style.backgroundColor = LIGHT_BG

  root = document.createElement('div')
  root.id = 'dumbify-root'
  root.style.setProperty('position', 'fixed', 'important')
  root.style.setProperty('inset', '0', 'important')
  root.style.setProperty('z-index', '2147483647', 'important')
  root.style.setProperty('background', LIGHT_BG, 'important')
  root.style.setProperty('visibility', 'visible', 'important')

  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.overscrollBehavior = 'none'
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehavior = 'none'

  document.body.appendChild(root)

  layout = document.createElement('div')
  layout.className = 'df-layout'
  root.appendChild(layout)

  sidebar = document.createElement('aside')
  sidebar.className = 'df-sidebar'
  layout.appendChild(sidebar)

  main = document.createElement('main')
  main.className = 'df-main'
  layout.appendChild(main)

  content = document.createElement('div')
  content.id = 'dumbify-content'
  main.appendChild(content)

  getSettings().then((s) => {
    applyTheme(s)
    applyFont(s)
  })
  onSettingsChange((s) => {
    applyTheme(s)
    applyFont(s)
  })
}

// Full teardown, used as the failure path in content.ts: mountUI locks scrolling and
// repaints the page background, so removing the root alone would leave YouTube
// unscrollable underneath.
export function unmountUI() {
  root?.remove()
  for (const node of [document.documentElement, document.body]) {
    node.style.overflow = ''
    node.style.overscrollBehavior = ''
    node.style.backgroundColor = ''
    node.style.backgroundImage = ''
  }
}

export function renderNotFound(detail?: string) {
  if (!content) return
  const wrap = document.createElement('div')
  wrap.className = 'df-404'

  const msg = document.createElement('p')
  msg.className = 'df-404-msg'
  msg.textContent = "404 Oops, the page you were looking for doesn't exist."
  wrap.appendChild(msg)

  if (detail) {
    const note = document.createElement('p')
    note.className = 'df-404-detail'
    note.textContent = detail
    wrap.appendChild(note)
  }

  const back = document.createElement('a')
  back.className = 'df-404-back'
  back.href = '/'
  back.textContent = 'Back to home \u2192'
  wrap.appendChild(back)

  content.appendChild(wrap)
}

export function clearContent() {
  if (content) content.innerHTML = ''
}
