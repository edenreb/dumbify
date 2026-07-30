import '../styles/main.css'
import { getSettings, onSettingsChange } from './storage'
import type { DumbifySettings } from '../types'

export let root: HTMLElement
export let content: HTMLElement
export let overlay: HTMLElement

function createEl(tag: string, id: string): HTMLElement {
  const el = document.createElement(tag)
  el.id = id
  return el
}

function applyFont(s: DumbifySettings) {
  if (!root) return
  root.style.font = `${s.fontSize}px/1.6 ${s.fontFamily}`
  root.style.setProperty('--df-font-family', s.fontFamily)
  root.style.setProperty('--df-font-size', s.fontSize + 'px')
}

export function mountUI() {
  root = createEl('div', 'dumbify-root')
  root.style.cssText = `
    all: initial;
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: #202020;
    color: #fff;
  `
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  document.body.appendChild(root)

  content = createEl('div', 'dumbify-content')
  root.appendChild(content)

  overlay = createEl('div', 'dumbify-overlay')
  overlay.style.display = 'none'
  root.appendChild(overlay)

  getSettings().then((s) => applyFont(s))
  onSettingsChange((s) => applyFont(s))
}

export function unmountUI() {
  root?.remove()
}

export function showOverlay(html: string, onClose: () => void) {
  overlay.innerHTML = html
  overlay.style.display = ''
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose()
  })
}

export function hideOverlay() {
  overlay.style.display = 'none'
  overlay.innerHTML = ''
}

export function clearContent() {
  content.innerHTML = ''
}
