import '../ui/controls.css'
import './popup.css'
import '../styles/fonts.css'
import { ACCENTS, ACCENT_THEME, getPreset, getTheme, themesFor } from '../core/themes'
import { resolveScheme, systemPrefersDark, wallpaperShowing } from '../core/appearance'
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../core/settings'
import { getWallpaper } from '../core/storage'
import { SettingsStore } from '../ui/store'
import { followSystem, paintFromCache, themePage } from '../ui/page-theme'
import { h } from '../ui/dom'
import { brandMark, icon } from '../ui/icons'
import { segmented, toggle } from '../ui/controls'

// The Chrome Web Store listing. "Rate" is the review tab of that same page.
const STORE_URL =
  'https://chromewebstore.google.com/detail/dumbify-customizable-text/lhnjjldhbllcdfdldeacdgalkkofhicf'

paintFromCache()

function openSettings(section?: string) {
  chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', section })
  window.close()
}

function label(iconName: Parameters<typeof icon>[0], text: string, extra?: HTMLElement): HTMLElement {
  return h('span', { class: 'pop-label' }, icon(iconName), text, extra ?? null)
}

function themeDots(store: SettingsStore): HTMLElement {
  const wrap = h('div', { class: 'theme-dots', role: 'radiogroup', 'aria-label': 'Theme' })
  let scheme: 'light' | 'dark' | null = null
  const draw = () => {
    const s = store.value
    const next = resolveScheme(s, systemPrefersDark())
    if (next === scheme) {
      wrap.querySelectorAll<HTMLInputElement>('input').forEach((i) => { i.checked = i.value === (next === 'dark' ? s.darkTheme : s.lightTheme) })
      return
    }
    scheme = next
    wrap.replaceChildren()
    for (const t of themesFor(next)) {
      const input = h('input', { type: 'radio', name: 'theme', value: t.id, class: 'sr-only', 'aria-label': t.name })
      input.checked = t.id === (next === 'dark' ? s.darkTheme : s.lightTheme)
      input.addEventListener('change', () => {
        if (input.checked) void store.commit(next === 'dark' ? { darkTheme: t.id } : { lightTheme: t.id })
      })
      const face = h('span', { class: 'theme-dot-face', title: t.name })
      const el = h('label', { class: 'theme-dot' }, input, face)
      el.style.setProperty('--t-bg', t.bg)
      el.style.setProperty('--t-text', t.text)
      el.style.setProperty('--t-accent', t.accent)
      wrap.appendChild(el)
    }
  }
  store.subscribe(draw)
  return wrap
}

function accentDots(store: SettingsStore): HTMLElement {
  const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent colour' })
  const inputs: HTMLInputElement[] = []
  const add = (value: string, name: string, color: string, className = '') => {
    const input = h('input', { type: 'radio', name: 'accent', value, class: 'sr-only', 'aria-label': name })
    input.addEventListener('change', () => { if (input.checked) void store.commit({ accent: value }) })
    const el = h('label', { class: `swatch ${className}` }, input, h('span', { class: 'swatch-face', title: name }, icon('check')))
    el.style.setProperty('--swatch', color)
    inputs.push(input)
    wrap.appendChild(el)
    return el
  }
  const themeSwatch = add(ACCENT_THEME, 'Theme accent', '#888', 'swatch-theme')
  for (const a of ACCENTS) add(a.id, a.name, a.color)
  store.subscribe((s) => {
    const scheme = resolveScheme(s, systemPrefersDark())
    const theme = getTheme(scheme === 'dark' ? s.darkTheme : s.lightTheme, scheme)
    themeSwatch.style.setProperty('--swatch', theme.accent)
    themeSwatch.style.setProperty('--swatch-2', theme.bg)
    inputs.forEach((i) => { i.checked = i.value === s.accent })
  })
  return wrap
}

function sizeStepper(store: SettingsStore): HTMLElement {
  const out = h('output', { 'aria-live': 'polite' })
  const down = h('button', { type: 'button', 'aria-label': 'Smaller text' }, icon('minus'))
  const up = h('button', { type: 'button', 'aria-label': 'Larger text' }, icon('plus'))
  down.addEventListener('click', () => void store.commit({ fontSize: Math.max(FONT_SIZE_MIN, store.value.fontSize - 1) }))
  up.addEventListener('click', () => void store.commit({ fontSize: Math.min(FONT_SIZE_MAX, store.value.fontSize + 1) }))
  store.subscribe((s) => {
    out.textContent = `${s.fontSize}px`
    down.disabled = s.fontSize <= FONT_SIZE_MIN
    up.disabled = s.fontSize >= FONT_SIZE_MAX
  })
  return h('div', { class: 'stepper', role: 'group', 'aria-label': 'Text size' }, down, out, up)
}

function wallpaperRow(store: SettingsStore): HTMLElement {
  const thumb = h('span', { class: 'wall-thumb', 'aria-hidden': 'true' })
  const name = h('span', { class: 'wall-name' })
  const choose = h('button', { class: 'link-btn', type: 'button', text: 'Choose…', onclick: () => openSettings('wallpaper') })
  const sw = toggle(store, { label: 'Show wallpaper', get: (s) => wallpaperShowing(s), set: (v) => ({ wallpaperEnabled: v }) })
  let shownKey = ''
  store.subscribe(async (s) => {
    const w = s.wallpaper
    const none = w.source === 'none'
    sw.hidden = none
    choose.hidden = !none
    name.textContent = none ? 'None' : w.name || 'Wallpaper'
    const key = `${w.source}:${w.presetId}:${w.uploadId}`
    if (key === shownKey) return
    shownKey = key
    thumb.style.background = ''
    if (w.source === 'preset') {
      const p = getPreset(w.presetId)
      if (p) thumb.style.background = p.css
    } else if (w.source === 'upload') {
      const rec = await getWallpaper(w)
      // The poster, not the animation itself: a 10 MB GIF has no business in a popup.
      const src = rec?.posterUrl || (rec?.kind === 'image' ? rec.dataUrl : '')
      if (src && shownKey === key) thumb.style.backgroundImage = `url("${src}")`
    }
  })
  return h('div', { class: 'pop-row' }, label('image', 'Wallpaper'),
    h('span', { class: 'wall-mini' }, thumb, name, choose, sw))
}

async function main() {
  const app = document.getElementById('app')!
  const status = h('div', { class: 'pop-status', role: 'alert' })
  const store = new SettingsStore({
    saved: () => { status.textContent = '' },
    failed: (msg) => { status.textContent = msg },
  })
  await store.load()
  store.subscribe((s) => themePage(s))
  followSystem(() => store.value)

  const stateText = h('span', { class: 'pop-state' })
  const header = h('header', { class: 'pop-header' },
    h('span', { class: 'pop-brand' }, brandMark(), 'Dumbify'),
    stateText,
    toggle(store, { label: 'Dumbify on YouTube', get: (s) => s.enabled, set: (v) => ({ enabled: v }) }),
  )

  const body = h('div', { class: 'pop-body' },
    h('div', { class: 'pop-row' }, label('palette', 'Appearance'), segmented(store, {
      label: 'Appearance',
      compact: true,
      options: [
        { value: 'light', label: '', icon: 'sun', hint: 'Light' },
        { value: 'dark', label: '', icon: 'moon', hint: 'Dark' },
        { value: 'auto', label: '', icon: 'monitor', hint: 'Match system' },
      ],
      get: (s) => s.mode,
      set: (v) => ({ mode: v }),
    })),
    h('div', { class: 'pop-row stacked' }, label('sparkles', 'Theme'), themeDots(store)),
    h('div', { class: 'pop-row stacked' }, label('drop', 'Accent'), accentDots(store)),
    h('div', { class: 'pop-row' }, label('type', 'Text size'), sizeStepper(store)),
    h('div', { class: 'pop-row' }, label('type', 'Font'), segmented(store, {
      label: 'Font',
      compact: true,
      options: [
        { value: 'sans', label: 'Sans' },
        { value: 'serif', label: 'Serif' },
        { value: 'mono', label: 'Mono' },
      ],
      get: (s) => (s.font === 'sans' || s.font === 'serif' || s.font === 'mono' ? s.font : ('' as 'sans')),
      set: (v) => ({ font: v }),
    })),
    h('div', { class: 'pop-row' }, label('layout', 'Layout'), segmented(store, {
      label: 'Layout',
      compact: true,
      options: [
        { value: 'list', label: '', icon: 'list', hint: 'List' },
        { value: 'cards', label: '', icon: 'cards', hint: 'Cards' },
        { value: 'table', label: '', icon: 'table', hint: 'Table' },
      ],
      get: (s) => s.layout,
      set: (v) => ({ layout: v }),
    })),
    wallpaperRow(store),
  )

  const off = h('div', { class: 'pop-off' }, icon('power'),
    h('strong', { text: 'Dumbify is off' }),
    h('span', { text: 'YouTube looks like normal YouTube. Switch it on to get the calm, text-first view back.' }))

  store.subscribe((s) => {
    body.hidden = !s.enabled
    off.hidden = s.enabled
    stateText.textContent = s.enabled ? 'On' : 'Off'
  })

  const footer = h('footer', { class: 'pop-footer' },
    h('button', { class: 'btn', type: 'button', onclick: () => openSettings() }, icon('sliders'), 'All settings'),
    h('button', {
      class: 'btn btn-quiet', type: 'button', title: 'Rate Dumbify on the Chrome Web Store',
      onclick: () => { chrome.tabs.create({ url: `${STORE_URL}/reviews` }); window.close() },
    }, icon('star'), 'Rate'),
  )

  app.replaceChildren(h('div', { class: 'pop' }, header, status, body, off, footer))
}

main().catch((err) => {
  console.error('[Dumbify] popup failed:', err)
  document.getElementById('app')!.textContent = 'Couldn’t load settings.'
})
