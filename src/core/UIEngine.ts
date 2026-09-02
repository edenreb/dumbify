import '../styles/main.css'
import { getSettings, onSettingsChange, LIGHT_BG, DARK_BG } from './storage'
import type { DumbifySettings } from '../types'

export let root: HTMLElement
export let content: HTMLElement
export let sidebar: HTMLElement | null = null
export let main: HTMLElement | null = null

function applyFont(s: DumbifySettings) {
  if (!root) return
  root.style.setProperty('--df-font-family', s.fontFamily)
  root.style.setProperty('--df-font-size', s.fontSize + 'px')
  root.style.setProperty('--df-font-color', s.theme === 'dark' ? s.fontColorDark : s.fontColor)
}

function panelBg(s: DumbifySettings, el: HTMLElement) {
  if (!s.backgroundImage) {
    el.style.removeProperty('background')
    return
  }
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  const hex = bg.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  el.style.setProperty('background', `rgba(${r},${g},${b},${s.bgOpacity})`, 'important')
}

function applyTheme(s: DumbifySettings) {
  if (!root) return
  root.classList.toggle('dark', s.theme === 'dark')
  root.classList.toggle('has-bg', !!s.backgroundImage)
  root.style.setProperty('--bg-opacity', String(s.bgOpacity))
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  const bgImage = s.backgroundImage ? `url("${s.backgroundImage}")` : ''
  document.documentElement.style.backgroundColor = bg
  document.body.style.backgroundColor = bg
  // NOT `fixed`. background-attachment: fixed hands the background to its own
  // compositing layer, sized to the viewport - and `cover` on a very wide/short source
  // makes that layer enormous (a 118x12 image needs a ~10,000px-wide texture to cover a
  // 764px viewport, vs ~1,850px for a normal photo). Chrome fails to rasterize a layer
  // that oversized and paints it incomplete, so the root turns partly transparent and
  // YouTube's own GPU-composited surfaces (the Shorts player, video) show through - live,
  // refreshing, and invisible to elementsFromPoint, because the DOM was never the problem.
  // The root is already position:fixed covering the viewport, so dropping `fixed` here
  // looks identical and avoids that layer entirely.
  root.style.setProperty('background', bgImage ? `${bgImage} center/cover` : bg, 'important')
  if (bgImage) {
    root.style.setProperty('background-color', bg, 'important')
  } else {
    root.style.removeProperty('background-color')
  }
  if (sidebar) panelBg(s, sidebar)
  if (main) panelBg(s, main)
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
  document.documentElement.style.overscrollBehaviorY = 'none'
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehaviorY = 'none'

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

// Full teardown, used as the failure path in content.ts: mountUI locks scrolling and
// repaints the page background, so removing the root alone would leave YouTube
// unscrollable underneath.
export function unmountUI() {
  root?.remove()
  for (const node of [document.documentElement, document.body]) {
    node.style.overflow = ''
    node.style.overscrollBehaviorY = ''
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

// Non-<button> controls (toolbar filters, channel tabs, playlist rows) were click-only:
// no role, no tab stop, no key handler, so none of them were reachable by keyboard. The
// video and channel rows already did this by hand; this is the same thing, once.
export function makeClickable(el: HTMLElement, onActivate: () => void) {
  el.setAttribute('role', 'button')
  el.tabIndex = 0
  el.onclick = (e) => { e.stopPropagation(); onActivate() }
  el.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    onActivate()
  }
}

// Signed-out gate: replaces the whole layout, since none of the features can
// render anything useful without a session.
export function renderSignedOut() {
  if (!root) return
  root.innerHTML = ''
  sidebar = null
  main = null

  const wrap = document.createElement('div')
  wrap.className = 'df-signin'

  const msg = document.createElement('p')
  msg.className = 'df-signin-msg'
  msg.textContent = 'Dumbify requires you to be signed into YouTube in order to function.'
  wrap.appendChild(msg)

  const btn = document.createElement('a')
  btn.className = 'df-signin-btn'
  btn.textContent = 'Sign In'
  btn.href = `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(location.href)}`
  wrap.appendChild(btn)

  root.appendChild(wrap)
}
