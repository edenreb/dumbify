import '../styles/main.css'
import { getSettings, onSettingsChange } from './storage'
import type { DumbifySettings } from '../types'

export let root: HTMLElement
export let content: HTMLElement
export let sidebar: HTMLElement | null = null
export let main: HTMLElement | null = null

const LIGHT_BG = '#f7f5ee'
const DARK_BG = '#1d1d1d'

function applyFont(s: DumbifySettings) {
  if (!root) return
  root.style.setProperty('--df-font-family', s.fontFamily)
  root.style.setProperty('--df-font-size', s.fontSize + 'px')
}

function applyTheme(s: DumbifySettings) {
  if (!root) return
  root.classList.toggle('dark', s.theme === 'dark')
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  document.documentElement.style.backgroundColor = bg
  document.body.style.backgroundColor = bg
  root.style.setProperty('background', bg, 'important')
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

  const layout = document.createElement('div')
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

export function unmountUI() {
  root?.remove()
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
