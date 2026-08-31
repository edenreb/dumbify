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

async function save(s: DumbifySettings, partial: Partial<DumbifySettings>, message = 'Saved') {
  Object.assign(s, partial)
  await setSettings(partial)
  showStatus(message)
}

const LIGHT_BG = '#f7f5ee'
const DARK_BG = '#1d1d1d'

function applyPageTheme(s: DumbifySettings) {
  document.body.classList.toggle('light', s.theme === 'light')
  document.body.classList.toggle('dark', s.theme === 'dark')
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  if (s.backgroundImage) {
    document.body.style.background = `url(${s.backgroundImage}) center/cover fixed, ${bg}`
  } else {
    document.body.style.background = ''
  }
}

function updatePreview(s: DumbifySettings) {
  const text = document.getElementById('preview-text') as HTMLElement | null
  if (!text) return
  text.style.fontFamily = s.fontFamily
  text.style.fontSize = s.fontSize + 'px'
  text.style.color = s.theme === 'dark' ? s.fontColorDark : s.fontColor
}

function render() {
  const app = document.getElementById('app')!
  getSettings().then((s) => {
    app.replaceChildren()
    applyPageTheme(s)

    app.appendChild(el('h1', undefined, 'Dumbify Settings'))
    app.appendChild(el('div', 'sub', 'Typography and theme for the reading view'))

    app.appendChild(el('h2', undefined, 'Appearance'))
    app.appendChild(
      selectRow('Theme', THEMES, s.theme, (v) => {
        save(s, { theme: v })
        applyPageTheme(s)
        const colorKey = v === 'dark' ? 'fontColorDark' : 'fontColor'
        colorInput.value = s[colorKey]
        hexLabel.textContent = s[colorKey]
        updatePreview(s)
      })
    )

    app.appendChild(el('h2', undefined, 'Font'))
    app.appendChild(
      selectRow(
        'Font Size',
        FONT_SIZES.map((sz) => ({ value: sz, label: `${sz}px` })),
        s.fontSize,
        (v) => { save(s, { fontSize: v }); updatePreview(s) }
      )
    )
    app.appendChild(
      selectRow('Font Family', FONT_FAMILIES, s.fontFamily, (v) => {
        save(s, { fontFamily: v })
        updatePreview(s)
      })
    )

    // Font color picker
    const colorRow = el('div', 'color-row')
    colorRow.appendChild(el('div', 'color-row-lbl', 'Font Color'))
    const colorWrap = el('div', 'color-input-wrap')
    const colorInput = document.createElement('input')
    colorInput.type = 'color'
    const colorKey = s.theme === 'dark' ? 'fontColorDark' : 'fontColor'
    colorInput.value = s[colorKey]
    colorInput.addEventListener('input', () => {
      const key = s.theme === 'dark' ? 'fontColorDark' : 'fontColor'
      s[key] = colorInput.value
      hexLabel.textContent = colorInput.value
      updatePreview(s)
    })
    colorInput.addEventListener('change', () => {
      const key = s.theme === 'dark' ? 'fontColorDark' : 'fontColor'
      save(s, { [key]: colorInput.value })
    })
    const hexLabel = el('span', 'color-hex', s[colorKey])
    colorWrap.appendChild(colorInput)
    colorWrap.appendChild(hexLabel)
    colorRow.appendChild(colorWrap)
    app.appendChild(colorRow)

    // Live preview
    const previewBox = el('div', 'preview-box')
    previewBox.appendChild(el('div', 'preview-label', 'Preview'))
    const previewText = el('div', 'preview-text', 'This is what it looks like')
    previewText.id = 'preview-text'
    previewText.style.fontFamily = s.fontFamily
    previewText.style.fontSize = s.fontSize + 'px'
    previewText.style.color = s.theme === 'dark' ? s.fontColorDark : s.fontColor
    previewBox.appendChild(previewText)
    app.appendChild(previewBox)

    // Background image
    app.appendChild(el('h2', undefined, 'Background'))
    const bgSection = el('div', 'bg-section')
    bgSection.appendChild(el('div', 'bg-section-lbl', 'Background Image'))

    const bgUpload = el('div', 'bg-upload')
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    const uploadLabel = el('label', 'bg-upload-label', 'Choose image')
    uploadLabel.setAttribute('for', 'bg-file-input')
    fileInput.id = 'bg-file-input'
    fileInput.appendChild(uploadLabel)
    bgUpload.appendChild(fileInput)
    bgUpload.appendChild(el('span', 'bg-upload-hint', 'Fits to screen behind content'))
    bgSection.appendChild(bgUpload)

    const previewWrap = el('div', 'bg-preview-wrap')
    let previewImg: HTMLImageElement | null = null
    let removeBtn: HTMLElement | null = null

    function showBgPreview(dataUrl: string) {
      if (previewImg) previewImg.remove()
      if (removeBtn) removeBtn.remove()
      previewImg = document.createElement('img')
      previewImg.className = 'bg-preview'
      previewImg.src = dataUrl
      removeBtn = el('button', 'bg-remove', 'Remove')
      removeBtn.addEventListener('click', () => {
        save(s, { backgroundImage: '' })
        applyPageTheme(s)
        if (previewImg) { previewImg.remove(); previewImg = null }
        if (removeBtn) { removeBtn.remove(); removeBtn = null }
      })
      previewWrap.appendChild(previewImg)
      previewWrap.appendChild(removeBtn)
    }

    if (s.backgroundImage) showBgPreview(s.backgroundImage)

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        save(s, { backgroundImage: dataUrl })
        applyPageTheme(s)
        showBgPreview(dataUrl)
      }
      reader.readAsDataURL(file)
    })

    bgSection.appendChild(previewWrap)
    app.appendChild(bgSection)

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
