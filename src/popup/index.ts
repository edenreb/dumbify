import { getSettings, setSettings, resetSettings } from '../core/storage'

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

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.replaceChildren()

    const h1 = document.createElement('h1')
    h1.textContent = 'Dumbify'
    app.appendChild(h1)

    // Theme is the one setting worth a one-click toggle here; everything else lives
    // on the options page.
    const isDark = s.theme === 'dark'
    const row = document.createElement('div')
    row.className = `setting ${isDark ? 'on' : ''}`

    const labels = document.createElement('div')
    const lbl = document.createElement('div')
    lbl.className = `lbl ${isDark ? 'lbl-on' : 'lbl-off'}`
    lbl.textContent = 'Night Mode'
    const desc = document.createElement('div')
    desc.className = 'desc'
    desc.textContent = isDark ? 'Dark paper, light ink' : 'Light paper, dark ink'
    labels.appendChild(lbl)
    labels.appendChild(desc)
    row.appendChild(labels)

    const toggle = document.createElement('div')
    toggle.className = `toggle ${isDark ? 'on' : 'off'}`
    const knob = document.createElement('div')
    knob.className = 'toggle-knob'
    toggle.appendChild(knob)
    row.appendChild(toggle)

    row.addEventListener('click', () => saving(setSettings({ theme: isDark ? 'light' : 'dark' })))
    app.appendChild(row)

    const actions = document.createElement('div')
    actions.className = 'actions'

    const reset = document.createElement('button')
    reset.textContent = 'Reset'
    reset.addEventListener('click', () => saving(resetSettings()))
    actions.appendChild(reset)

    const options = document.createElement('button')
    options.textContent = 'Full Settings'
    options.addEventListener('click', () => chrome.runtime.openOptionsPage())
    actions.appendChild(options)

    app.appendChild(actions)

    const status = document.createElement('div')
    status.className = 'status'
    status.textContent = statusText
    app.appendChild(status)
  })
}

render()
