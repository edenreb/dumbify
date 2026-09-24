// The "•••" menu in the top bar: the handful of choices worth changing mid-page, the way
// Notion's page menu offers Style, Small text and Full width. Everything else is one
// click away in Settings.

import { setSettings } from '../core/storage'
import { onAppearance, showToast } from '../core/UIEngine'
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type DumbifySettings } from '../core/settings'
import { FONTS } from '../core/themes'
import { wallpaperShowing } from '../core/appearance'
import { h, setSwitch, switchButton } from '../ui/dom'
import { icon, type IconName } from '../ui/icons'
import { shortcutLabel } from '../ui/routes'

let open: { menu: HTMLElement; button: HTMLElement; close: () => void } | null = null

export function closeViewMenu() {
  open?.close()
}

export function isViewMenuOpen(): boolean {
  return !!open
}

function save(patch: Partial<DumbifySettings>) {
  setSettings(patch).catch((err) => showToast(err instanceof Error ? err.message : 'Couldn’t save that change'))
}

export function openOptions(section?: string) {
  try {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', section })
  } catch {
    showToast('Reload the page to open Settings')
  }
}

interface Choice<T extends string> {
  value: T
  label: string
  icon?: IconName
}

/** A radiogroup of small buttons. Returns a painter for external changes. */
function segmented<T extends string>(label: string, choices: Choice<T>[], onPick: (v: T) => void) {
  const group = h('div', { class: 'df-seg', role: 'radiogroup', 'aria-label': label })
  const buttons = choices.map((c) => {
    const b = h('button', {
      type: 'button', role: 'radio', 'aria-checked': 'false',
      'aria-label': c.label, title: c.label,
    }, c.icon ? icon(c.icon) : c.label)
    b.addEventListener('click', () => {
      paint(c.value)
      onPick(c.value)
    })
    group.appendChild(b)
    return b
  })
  const paint = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(choices[i].value === v)))
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i === -1 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]
    next.focus()
    next.click()
  })
  return { el: group, paint }
}

function row(labelIcon: IconName, label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'df-menu-row' }, h('span', null, icon(labelIcon), label), control)
}

function buildMenu(): { menu: HTMLElement; unsubscribe: () => void } {
  const menu = h('div', { class: 'df-menu', role: 'dialog', 'aria-label': 'View options' })

  // Style: the three bundled faces, as Notion's "Ag" tiles.
  menu.appendChild(h('div', { class: 'df-menu-label', text: 'Style' }))
  const tiles = h('div', { class: 'df-font-tiles', role: 'radiogroup', 'aria-label': 'Font' })
  const tileButtons = FONTS.filter((f) => f.featured).map((f) => {
    const ag = h('span', { class: 'df-font-tile-ag', text: 'Ag' })
    ag.style.fontFamily = f.stack
    const b = h('button', { class: 'df-font-tile', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-font': f.id }, ag, f.name)
    b.addEventListener('click', () => save({ font: f.id }))
    tiles.appendChild(b)
    return b
  })
  menu.appendChild(tiles)

  // Text size.
  const value = h('span', { class: 'df-stepper-value', 'aria-live': 'polite' })
  const smaller = h('button', { class: 'df-icon-btn', type: 'button', 'aria-label': 'Smaller text' }, icon('minus'))
  const larger = h('button', { class: 'df-icon-btn', type: 'button', 'aria-label': 'Larger text' }, icon('plus'))
  // Steps count from the size last asked for, not the last one stored: three quick
  // clicks are three steps, though the first save hasn't come back yet.
  let size = 20
  let pending: number | null = null
  const paintSize = (n: number) => {
    value.textContent = `${n}px`
    smaller.disabled = n <= FONT_SIZE_MIN
    larger.disabled = n >= FONT_SIZE_MAX
  }
  const step = (d: number) => {
    const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, (pending ?? size) + d))
    pending = next
    paintSize(next)
    setSettings({ fontSize: next }).catch((err) => {
      pending = null
      paintSize(size)
      showToast(err instanceof Error ? err.message : 'Couldn’t save that change')
    })
  }
  smaller.addEventListener('click', () => step(-1))
  larger.addEventListener('click', () => step(1))
  menu.appendChild(row('type', 'Text size', h('div', { class: 'df-stepper' }, smaller, value, larger)))

  const layout = segmented<DumbifySettings['layout']>('Layout', [
    { value: 'list', label: 'List', icon: 'list' },
    { value: 'cards', label: 'Cards', icon: 'cards' },
    { value: 'table', label: 'Table', icon: 'table' },
  ], (v) => save({ layout: v }))
  menu.appendChild(row('layout', 'Layout', layout.el))

  const width = switchButton('Full width', false, (on) => save({ pageWidth: on ? 'full' : 'standard' }))
  menu.appendChild(row('width', 'Full width', width))

  const sidebarSeg = segmented<DumbifySettings['sidebar']>('Sidebar', [
    { value: 'expanded', label: 'Full' },
    { value: 'rail', label: 'Icons' },
    { value: 'hidden', label: 'Off' },
  ], (v) => save({ sidebar: v }))
  menu.appendChild(row('menu', 'Sidebar', sidebarSeg.el))

  menu.appendChild(h('div', { class: 'df-menu-sep' }))

  const mode = segmented<DumbifySettings['mode']>('Appearance', [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'auto', label: 'Match system', icon: 'monitor' },
  ], (v) => save({ mode: v }))
  menu.appendChild(row('palette', 'Appearance', mode.el))

  const wallSwitch = switchButton('Wallpaper', true, (on) => save({ wallpaperEnabled: on }))
  const wallRow = row('image', 'Wallpaper', wallSwitch)
  menu.appendChild(wallRow)

  menu.appendChild(h('div', { class: 'df-menu-sep' }))
  menu.appendChild(h('button', {
    class: 'df-menu-item', type: 'button',
    onclick: () => { closeViewMenu(); openOptions() },
  }, icon('sliders'), 'All settings…'))
  menu.appendChild(h('div', { class: 'df-menu-foot' },
    h('span', { text: `${shortcutLabel('K')} Search` }),
    h('span', { text: `${shortcutLabel('\\')} Sidebar` }),
    h('span', { text: `${shortcutLabel('L', true)} Dark mode` }),
  ))

  const unsubscribe = onAppearance((s) => {
    size = s.fontSize
    // An echo of an earlier step is not news; the one that matches the last ask settles it.
    if (pending === s.fontSize) pending = null
    if (pending === null) paintSize(s.fontSize)
    for (const b of tileButtons) b.setAttribute('aria-checked', String(b.dataset.font === s.font))
    layout.paint(s.layout)
    setSwitch(width, s.pageWidth === 'full')
    sidebarSeg.paint(s.sidebar)
    mode.paint(s.mode)
    wallRow.hidden = s.wallpaper.source === 'none'
    setSwitch(wallSwitch, wallpaperShowing(s))
  })

  return { menu, unsubscribe }
}

export function toggleViewMenu(button: HTMLElement) {
  if (open) {
    const wasThis = open.button === button
    closeViewMenu()
    if (wasThis) return
  }
  const { menu, unsubscribe } = buildMenu()
  const anchor = button.parentElement!
  anchor.appendChild(menu)
  button.setAttribute('aria-expanded', 'true')

  const onDocPointer = (e: Event) => {
    const t = e.target as Node
    if (menu.contains(t) || button.contains(t)) return
    closeViewMenu()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    closeViewMenu()
    button.focus()
  }
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onKey, true)

  open = {
    menu,
    button,
    close: () => {
      unsubscribe()
      document.removeEventListener('pointerdown', onDocPointer, true)
      document.removeEventListener('keydown', onKey, true)
      menu.remove()
      button.setAttribute('aria-expanded', 'false')
      open = null
    },
  }
  menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
}
