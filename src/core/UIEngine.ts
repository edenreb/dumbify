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
  document.documentElement.style.backgroundColor = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  document.body.style.backgroundColor = s.theme === 'dark' ? DARK_BG : LIGHT_BG
}

export function mountUI() {
  root = document.createElement('div')
  root.id = 'dumbify-root'

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

export function clearContent() {
  if (content) content.innerHTML = ''
}
