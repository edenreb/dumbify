import { getSettings, setSettings, resetSettings } from '../core/storage'
import type { DumbifySettings } from '../types'

const SETTINGS: { key: keyof DumbifySettings; label: string; desc: string }[] = [
  { key: 'hideThumbnails', label: 'Hide Thumbnails', desc: 'Text-only video entries' },
  { key: 'hideComments', label: 'Hide Comments', desc: 'Remove comment sections' },
  { key: 'hideRecommendations', label: 'Hide Recommendations', desc: 'Remove suggested videos' },
  { key: 'hideShorts', label: 'Hide Shorts', desc: 'Remove Shorts everywhere' },
  { key: 'hideNotifications', label: 'Hide Notifications', desc: 'Remove notification badges' },
  { key: 'centerLayout', label: 'Center Layout', desc: 'Center everything on screen' },
  { key: 'compactMode', label: 'Compact Mode', desc: 'Reduce spacing between items' },
  { key: 'autoFocusMode', label: 'Auto Focus Mode', desc: 'Enter focus mode on watch page' },
]

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.innerHTML = `
      <h1>Dumbify</h1>
      ${SETTINGS.map((item) => `
        <div class="setting ${s[item.key] ? 'on' : ''}" data-key="${item.key}">
          <div>
            <div class="lbl ${s[item.key] ? 'lbl-on' : 'lbl-off'}">${item.label}</div>
            <div class="desc">${item.desc}</div>
          </div>
          <div class="toggle ${s[item.key] ? 'on' : 'off'}">
            <div class="toggle-knob"></div>
          </div>
        </div>
      `).join('')}
      <div class="actions">
        <button id="reset">Reset</button>
        <button id="options">Full Settings</button>
      </div>
      <div class="status">Changes save automatically</div>
    `

    app.querySelectorAll('.setting').forEach((el) => {
      el.addEventListener('click', async () => {
        const key = (el as HTMLElement).dataset.key as keyof DumbifySettings
        const current = await getSettings()
        await setSettings({ [key]: !current[key] })
        render()
      })
    })

    document.getElementById('reset')?.addEventListener('click', async () => {
      await resetSettings()
      render()
    })

    document.getElementById('options')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage()
    })
  })
}

render()
