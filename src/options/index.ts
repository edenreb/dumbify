import { getSettings, setSettings, resetSettings } from '../core/storage'
import type { DumbifySettings } from '../types'

const FONT_SIZES = [14, 16, 18, 20, 22, 24, 28, 32]
const FONT_FAMILIES = [
  { value: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', label: 'System (default)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia / Serif' },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: 'Helvetica / Sans' },
  { value: 'Garamond, "Times New Roman", serif', label: 'Garamond / Serif' },
  { value: 'Courier, "Courier New", monospace', label: 'Courier / Mono' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Lucida Grande", "Lucida Sans Unicode", sans-serif', label: 'Lucida Grande' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
]

const THEMES: { value: DumbifySettings['theme']; label: string }[] = [
  { value: 'light', label: 'Day' },
  { value: 'dark', label: 'Night' },
]

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// Built with createElement rather than interpolated into an HTML string: six of the
// eight font stacks contain double quotes (including the default), which terminate a
// value="..." attribute early and silently persist a truncated stack.
function selectRow<T extends string | number>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onChange: (value: T) => void
): HTMLElement {
  const row = el('div', 'setting-row')
  row.appendChild(el('div', 'setting-row-lbl', label))

  const select = el('select', 'df-select')
  options.forEach((o) => {
    const opt = document.createElement('option')
    opt.value = String(o.value)
    opt.textContent = o.label
    opt.selected = o.value === current
    select.appendChild(opt)
  })
  select.addEventListener('change', () => {
    const picked = options.find((o) => String(o.value) === select.value)
    if (picked) onChange(picked.value)
  })

  row.appendChild(select)
  return row
}

let statusEl: HTMLElement | null = null

function showStatus(message: string) {
  if (!statusEl) return
  statusEl.textContent = message
  setTimeout(() => {
    if (statusEl) statusEl.textContent = 'Changes save automatically'
  }, 2000)
}

async function save(partial: Partial<DumbifySettings>, message = 'Saved') {
  await setSettings(partial)
  showStatus(message)
}

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.replaceChildren()

    app.appendChild(el('h1', undefined, 'Dumbify Settings'))
    app.appendChild(el('div', 'sub', 'Typography and theme for the reading view'))

    app.appendChild(el('h2', undefined, 'Appearance'))
    app.appendChild(
      selectRow('Theme', THEMES, s.theme, (v) => save({ theme: v }))
    )

    app.appendChild(el('h2', undefined, 'Font'))
    app.appendChild(
      selectRow(
        'Font Size',
        FONT_SIZES.map((sz) => ({ value: sz, label: `${sz}px` })),
        s.fontSize,
        (v) => save({ fontSize: v })
      )
    )
    app.appendChild(
      selectRow('Font Family', FONT_FAMILIES, s.fontFamily, (v) => save({ fontFamily: v }))
    )

    const footer = el('div', 'footer')
    const reset = el('button', undefined, 'Reset All Settings')
    reset.id = 'reset'
    reset.addEventListener('click', async () => {
      await resetSettings()
      render()
      showStatus('Reset to defaults')
    })
    footer.appendChild(reset)

    statusEl = el('span', 'status', 'Changes save automatically')
    statusEl.id = 'status'
    footer.appendChild(statusEl)
    app.appendChild(footer)
  })
}

render()
