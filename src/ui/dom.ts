// A few DOM helpers shared by the reading view, the settings page and the popup.

type Child = Node | string | number | null | undefined | false
type Props = {
  class?: string
  text?: string
  /** Everything else is set as an attribute; `on*` functions become listeners. */
  [key: string]: unknown
}

/**
 * createElement with the attributes and children inline:
 *   h('button', { class: 'df-btn', type: 'button', onclick: go }, icon('play'), 'Play')
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue
      if (key === 'class') el.className = String(value)
      else if (key === 'text') el.textContent = String(value)
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value as EventListener)
      } else if (value === true) el.setAttribute(key, '')
      else el.setAttribute(key, String(value))
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    el.append(typeof c === 'number' ? String(c) : c)
  }
  return el
}

// Avatar colours: mid-tone and saturated enough for white initials on any theme.
const AVATAR_COLORS = [
  '#c2410c', '#b45309', '#4d7c0f', '#047857', '#0e7490', '#1d4ed8',
  '#6d28d9', '#a21caf', '#be123c', '#475569', '#9a3412', '#0f766e',
]

/** A stable colour per name, so a channel keeps its colour everywhere. */
export function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/** The first letter or digit of a name, skipping emoji, "@" and punctuation. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name)
  return m ? m[0].toLocaleUpperCase() : '?'
}

/** A letter avatar. Dumbify shows no channel pictures - this is the text-first stand-in. */
export function avatar(name: string, className = 'df-avatar'): HTMLElement {
  const el = h('span', { class: className, 'aria-hidden': 'true', text: initialOf(name) })
  el.style.setProperty('--df-avatar', avatarColor(name))
  return el
}

/** A role="switch" button, since a checkbox cannot carry the reading view's styling. */
export function switchButton(label: string, checked: boolean, onToggle: (next: boolean) => void, className = 'df-toggle'): HTMLButtonElement {
  const btn = h('button', { class: className, type: 'button', role: 'switch', 'aria-label': label })
  btn.append(h('span', { class: 'df-switch' }))
  const paint = (on: boolean) => btn.setAttribute('aria-checked', String(on))
  paint(checked)
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true'
    paint(next)
    onToggle(next)
  })
  return btn
}

export function setSwitch(btn: Element | null | undefined, on: boolean) {
  btn?.setAttribute('aria-checked', String(on))
}
