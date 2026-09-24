// Form controls for the settings page and the popup, each bound to the settings store:
// it paints itself from the store and writes its changes back through it.
//
// Choices are real radio inputs and checkboxes under the styling, so arrow keys, Tab,
// screen readers and form semantics all work without being rebuilt by hand.

import type { DumbifySettings } from '../core/settings'
import type { SettingsStore } from './store'
import { h } from './dom'
import { icon, type IconName } from './icons'

type S = DumbifySettings
type Patch = Partial<S>

let uid = 0
const nextId = (prefix: string) => `${prefix}-${++uid}`

export interface Option<T extends string> {
  value: T
  label: string
  icon?: IconName
  hint?: string
}

/** A settings row: what it is on the left, the control on the right. */
export function row(title: string, desc: string, control: HTMLElement | null, opts: { id?: string; stacked?: boolean } = {}): HTMLElement {
  const titleId = opts.id ?? nextId('row')
  const text = h('div', { class: 'row-text' },
    h('div', { class: 'row-title', id: titleId, text: title }),
    desc ? h('div', { class: 'row-desc', text: desc }) : null,
  )
  const el = h('div', { class: opts.stacked ? 'row row-stacked' : 'row' }, text)
  if (control) {
    if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
      control.setAttribute('aria-labelledby', titleId)
    }
    el.appendChild(h('div', { class: 'row-control' }, control))
  }
  return el
}

/** Hides an element whenever `when` is false. */
export function showWhen(el: HTMLElement, store: SettingsStore, when: (s: S) => boolean) {
  store.subscribe((s) => { el.hidden = !when(s) })
}

export function segmented<T extends string>(
  store: SettingsStore,
  opts: { label: string; options: Option<T>[]; get: (s: S) => T; set: (v: T) => Patch; compact?: boolean },
): HTMLElement {
  const name = nextId('seg')
  const group = h('div', { class: opts.compact ? 'seg seg-compact' : 'seg', role: 'radiogroup', 'aria-label': opts.label })
  const inputs = opts.options.map((o) => {
    const input = h('input', { type: 'radio', name, value: o.value, class: 'sr-only' })
    input.addEventListener('change', () => { if (input.checked) void store.commit(opts.set(o.value)) })
    const face = h('span', { class: 'seg-face' }, o.icon ? icon(o.icon) : null, o.label ? h('span', { class: 'seg-label', text: o.label }) : null)
    group.appendChild(h('label', { class: 'seg-opt', title: o.hint ?? o.label }, input, face))
    return input
  })
  store.subscribe((s) => {
    const v = opts.get(s)
    inputs.forEach((input) => { input.checked = input.value === v })
  })
  return group
}

export function toggle(store: SettingsStore, opts: { label: string; get: (s: S) => boolean; set: (v: boolean) => Patch }): HTMLButtonElement {
  const btn = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': opts.label, 'aria-checked': 'false' },
    h('span', { class: 'switch-knob' }))
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true'
    btn.setAttribute('aria-checked', String(next))
    void store.commit(opts.set(next))
  })
  store.subscribe((s) => btn.setAttribute('aria-checked', String(opts.get(s))))
  return btn
}

export function slider(
  store: SettingsStore,
  opts: {
    label: string
    min: number
    max: number
    step: number
    get: (s: S) => number
    set: (v: number) => Patch
    format: (v: number) => string
    disabled?: (s: S) => boolean
  },
): HTMLElement {
  const input = h('input', {
    class: 'range', type: 'range', min: String(opts.min), max: String(opts.max), step: String(opts.step),
    'aria-label': opts.label,
  })
  const out = h('output', { class: 'range-value' })
  const paintFill = () => {
    const pct = ((Number(input.value) - opts.min) / (opts.max - opts.min)) * 100
    input.style.setProperty('--fill', `${pct}%`)
  }
  input.addEventListener('input', () => {
    const v = Number(input.value)
    out.textContent = opts.format(v)
    paintFill()
    store.preview(opts.set(v))
  })
  input.addEventListener('change', () => void store.commit(opts.set(Number(input.value))))
  store.subscribe((s) => {
    const v = opts.get(s)
    if (document.activeElement !== input || Number(input.value) !== v) input.value = String(v)
    out.textContent = opts.format(v)
    input.disabled = opts.disabled?.(s) ?? false
    paintFill()
  })
  return h('div', { class: 'range-wrap' }, input, out)
}

/**
 * A hex colour that can also be "follow the theme" (''): a Theme chip, then a swatch
 * that opens the system picker.
 */
export function colorChoice(
  store: SettingsStore,
  opts: { label: string; get: (s: S) => string; set: (v: string) => Patch; fallback: (s: S) => string },
): HTMLElement {
  const themeBtn = h('button', { class: 'chip-btn', type: 'button', text: 'Theme' })
  const picker = h('input', { type: 'color', class: 'color-input', 'aria-label': `${opts.label}: custom colour` })
  const swatch = h('label', { class: 'color-swatch', title: 'Choose a colour' }, picker)
  const hex = h('span', { class: 'color-hex' })
  themeBtn.addEventListener('click', () => void store.commit(opts.set('')))
  picker.addEventListener('input', () => store.preview(opts.set(picker.value)))
  picker.addEventListener('change', () => void store.commit(opts.set(picker.value)))
  store.subscribe((s) => {
    const v = opts.get(s)
    const shown = v || opts.fallback(s)
    picker.value = shown
    swatch.style.setProperty('--swatch', shown)
    hex.textContent = v ? v.toUpperCase() : ''
    themeBtn.setAttribute('aria-pressed', String(!v))
    swatch.classList.toggle('is-custom', !!v)
  })
  return h('div', { class: 'color-choice', role: 'group', 'aria-label': opts.label }, themeBtn, swatch, hex)
}

/** A group of big selectable cards (themes, layouts), as radios underneath. */
export function cardGroup<T extends string>(
  store: SettingsStore,
  opts: {
    label: string
    className: string
    items: { value: T; label: string; sub?: string; art: HTMLElement; title?: string }[]
    get: (s: S) => T
    set: (v: T) => Patch
  },
): HTMLElement {
  const name = nextId('cards')
  const group = h('div', { class: `card-group ${opts.className}`, role: 'radiogroup', 'aria-label': opts.label })
  const inputs = opts.items.map((item) => {
    const input = h('input', { type: 'radio', name, value: item.value, class: 'sr-only' })
    input.addEventListener('change', () => { if (input.checked) void store.commit(opts.set(item.value)) })
    group.appendChild(h('label', { class: 'pick-card', title: item.title ?? item.label },
      input,
      item.art,
      h('span', { class: 'pick-card-label' },
        h('span', { class: 'pick-card-name', text: item.label }),
        item.sub ? h('span', { class: 'pick-card-sub', text: item.sub }) : null,
        h('span', { class: 'pick-card-check', 'aria-hidden': 'true' }, icon('check')),
      ),
    ))
    return input
  })
  store.subscribe((s) => {
    const v = opts.get(s)
    inputs.forEach((input) => { input.checked = input.value === v })
  })
  return group
}

export function checkboxChips(
  store: SettingsStore,
  opts: { label: string; items: { label: string; get: (s: S) => boolean; set: (v: boolean) => Patch }[] },
): HTMLElement {
  const group = h('div', { class: 'check-chips', role: 'group', 'aria-label': opts.label })
  for (const item of opts.items) {
    const input = h('input', { type: 'checkbox', class: 'sr-only' })
    input.addEventListener('change', () => void store.commit(item.set(input.checked)))
    group.appendChild(h('label', { class: 'check-chip' }, input, h('span', { class: 'check-chip-face' }, icon('check'), item.label)))
    store.subscribe((s) => { input.checked = item.get(s) })
  }
  return group
}
