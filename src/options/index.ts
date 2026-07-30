import { getSettings, setSettings, resetSettings } from '../core/storage'
import type { DumbifySettings } from '../types'

const SECTIONS: { title: string; items: { key: keyof DumbifySettings; label: string; desc: string }[] }[] = [
  {
    title: 'Appearance',
    items: [
      { key: 'hideThumbnails', label: 'Hide Thumbnails', desc: 'Display videos as text-only entries.' },
      { key: 'centerLayout', label: 'Center Layout', desc: 'Center all content for a focused reading experience.' },
      { key: 'compactMode', label: 'Compact Mode', desc: 'Reduce spacing between items.' },
    ],
  },
  {
    title: 'Content',
    items: [
      { key: 'hideShorts', label: 'Hide Shorts', desc: 'Remove Shorts sections from all pages.' },
      { key: 'hideRecommendations', label: 'Hide Recommendations', desc: 'Remove recommended videos.' },
      { key: 'hideComments', label: 'Hide Comments', desc: 'Remove comment sections from watch pages.' },
      { key: 'hideNotifications', label: 'Hide Notifications', desc: 'Hide notification badges.' },
    ],
  },
  {
    title: 'Behavior',
    items: [
      { key: 'autoFocusMode', label: 'Auto Focus Mode', desc: 'Automatically enter focus mode on watch pages.' },
      { key: 'readingModeDefault', label: 'Reading Mode Default', desc: 'Start in reading mode when opening a video.' },
    ],
  },
]

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

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.innerHTML = `
      <h1>Dumbify Settings</h1>
      <div class="sub">Customize your YouTube experience</div>
      ${SECTIONS.map((sec) => `
        <h2>${sec.title}</h2>
        ${sec.items.map((item) => `
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
      `).join('')}
      <h2>Font</h2>
      <div class="setting-row">
        <div class="setting-row-lbl">Font Size</div>
        <select id="df-font-size" class="df-select">
          ${FONT_SIZES.map((sz) => `<option value="${sz}" ${s.fontSize === sz ? 'selected' : ''}>${sz}px</option>`).join('')}
        </select>
      </div>
      <div class="setting-row">
        <div class="setting-row-lbl">Font Family</div>
        <select id="df-font-family" class="df-select">
          ${FONT_FAMILIES.map((f) => `<option value="${f.value}" ${s.fontFamily === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="footer">
        <button id="reset">Reset All Settings</button>
        <span class="status" id="status">Changes save automatically</span>
      </div>
    `

    app.querySelectorAll('.setting').forEach((el) => {
      el.addEventListener('click', async () => {
        const key = (el as HTMLElement).dataset.key as keyof DumbifySettings
        const current = await getSettings()
        await setSettings({ [key]: !current[key] })
        showSaved()
        render()
      })
    })

    document.getElementById('df-font-size')?.addEventListener('change', async (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value)
      await setSettings({ fontSize: val })
      showSaved()
    })

    document.getElementById('df-font-family')?.addEventListener('change', async (e) => {
      const val = (e.target as HTMLSelectElement).value
      await setSettings({ fontFamily: val })
      showSaved()
    })

    document.getElementById('reset')?.addEventListener('click', async () => {
      await resetSettings()
      const status = document.getElementById('status')!
      status.textContent = 'Reset to defaults'
      setTimeout(() => { status.textContent = 'Changes save automatically' }, 2000)
      render()
    })
  })
}

function showSaved() {
  const status = document.getElementById('status')!
  status.textContent = 'Saved'
  setTimeout(() => { status.textContent = 'Changes save automatically' }, 2000)
}

render()
