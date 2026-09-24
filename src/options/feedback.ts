import { h } from '../ui/dom'
import { icon, type IconName } from '../ui/icons'

let toastTimer: number | null = null

export interface ToastAction {
  label: string
  run: () => void
}

/**
 * A short message at the bottom of the page. Errors, and messages that offer an action
 * such as Undo, stay longer.
 */
export function toast(message: string, kind: 'ok' | 'error' = 'ok', action?: ToastAction) {
  document.querySelector('.toast')?.remove()
  const el = h('div', { class: kind === 'error' ? 'toast is-error' : 'toast', role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'error' ? 'info' : 'check'), h('span', { class: 'toast-text', text: message }))
  if (action) {
    const btn = h('button', { class: 'toast-action', type: 'button', text: action.label })
    btn.addEventListener('click', () => {
      el.remove()
      action.run()
    })
    el.appendChild(btn)
  }
  document.body.appendChild(el)
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.remove(), kind === 'error' || action ? 6000 : 2400)
}

/** The "Saved" indicator in the header. */
export function saveStatus(): { el: HTMLElement; saved: () => void; failed: (message: string) => void } {
  const label = h('span', { text: 'Changes save automatically' })
  const el = h('div', { class: 'save-status', role: 'status', 'aria-live': 'polite' }, icon('check'), label)
  let timer: number | null = null
  return {
    el,
    saved() {
      el.classList.remove('is-error')
      el.classList.add('is-fresh')
      label.textContent = 'Saved'
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        el.classList.remove('is-fresh')
        label.textContent = 'Changes save automatically'
      }, 1600)
    },
    failed(message: string) {
      el.classList.remove('is-fresh')
      el.classList.add('is-error')
      label.textContent = 'Not saved'
      toast(message, 'error')
    },
  }
}

export function section(id: string, iconName: IconName, title: string, desc: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'section', id, 'aria-labelledby': `${id}-title` },
    h('div', { class: 'section-head' },
      h('div', { class: 'section-icon', 'aria-hidden': 'true' }, icon(iconName)),
      h('div', null, h('h2', { id: `${id}-title`, text: title }), h('p', { text: desc })),
    ),
    ...children,
  )
}

export function groupTitle(text: string, extra?: HTMLElement): HTMLElement {
  return h('div', { class: 'group-title' }, text, extra ?? null)
}

/** A modal yes/no, as a real <dialog> so focus and Escape behave. */
export function confirmDialog(opts: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancel', value: 'cancel' })
    const ok = h('button', { class: opts.danger ? 'btn btn-danger-solid' : 'btn btn-primary', type: 'button', text: opts.confirm })
    const dialog = h('dialog', { class: 'confirm', 'aria-labelledby': 'confirm-title' },
      h('h3', { id: 'confirm-title', text: opts.title }),
      h('p', { text: opts.body }),
      h('div', { class: 'confirm-actions' }, cancel, ok),
    )
    const finish = (answer: boolean) => {
      dialog.close()
      dialog.remove()
      resolve(answer)
    }
    cancel.addEventListener('click', () => finish(false))
    ok.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false) })
    document.body.appendChild(dialog)
    dialog.showModal()
    cancel.focus()
  })
}
