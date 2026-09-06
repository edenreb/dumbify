import {
  getSettings, setSettings, resetSettings, FONT_SIZES, FONT_FAMILIES,
} from '../core/storage'

// The Chrome Web Store listing. "Rate" is the review tab of that same page.
const STORE_URL =
  'https://chromewebstore.google.com/detail/dumbify-customizable-text/lhnjjldhbllcdfdldeacdgalkkofhicf'

let statusText = 'Changes save automatically'

async function saving(work: Promise<unknown>) {
  try {
    await work
    statusText = 'Changes save automatically'
  } catch (err) {
    statusText = err instanceof Error ? err.message : 'Could not save'
  }
  render()
}

function toggleRow(label: string, on: boolean, onClick: () => void): HTMLElement {
  const row = document.createElement('div')
  row.className = `setting ${on ? 'on' : ''}`

  const lbl = document.createElement('div')
  lbl.className = `lbl ${on ? 'lbl-on' : 'lbl-off'}`
  lbl.textContent = label
  row.appendChild(lbl)

  const toggle = document.createElement('div')
  toggle.className = `toggle ${on ? 'on' : 'off'}`
  const knob = document.createElement('div')
  knob.className = 'toggle-knob'
  toggle.appendChild(knob)
  row.appendChild(toggle)

  row.addEventListener('click', onClick)
  return row
}

function selectRow<T extends string | number>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onChange: (value: T) => void,
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'setting'

  const lbl = document.createElement('div')
  lbl.className = 'lbl lbl-on'
  lbl.textContent = label
  row.appendChild(lbl)

  const select = document.createElement('select')
  select.className = 'select'
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = String(o.value)
    opt.textContent = o.label
    opt.selected = o.value === current
    select.appendChild(opt)
  }
  select.addEventListener('change', () => {
    const picked = options.find((o) => String(o.value) === select.value)
    if (picked) onChange(picked.value)
  })
  row.appendChild(select)
  return row
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.replaceChildren()

    const h1 = document.createElement('h1')
    h1.textContent = 'Dumbify'
    app.appendChild(h1)

    app.appendChild(toggleRow('On/Off', s.enabled, () => saving(setSettings({ enabled: !s.enabled }))))

    // Everything below only means something while the reading view is actually on.
    if (s.enabled) {
      const isDark = s.theme === 'dark'
      app.appendChild(toggleRow('Night Mode', isDark, () =>
        saving(setSettings({ theme: isDark ? 'light' : 'dark' }))))

      app.appendChild(selectRow(
        'Text Size',
        FONT_SIZES.map((sz) => ({ value: sz, label: `${sz}px` })),
        s.fontSize,
        (v) => saving(setSettings({ fontSize: v })),
      ))

      app.appendChild(selectRow(
        'Font',
        FONT_FAMILIES,
        s.fontFamily,
        (v) => saving(setSettings({ fontFamily: v })),
      ))
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.appendChild(button('Reset', () => saving(resetSettings())))
    actions.appendChild(button('Full Settings', () => chrome.runtime.openOptionsPage()))
    app.appendChild(actions)

    const rate = document.createElement('div')
    rate.className = 'actions rate'
    rate.appendChild(button('★  Rate Dumbify', () => {
      chrome.tabs.create({ url: `${STORE_URL}/reviews` })
    }))
    app.appendChild(rate)

    const status = document.createElement('div')
    status.className = 'status'
    status.textContent = statusText
    app.appendChild(status)
  })
}

render()
