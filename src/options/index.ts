import { getSettings, setSettings, resetSettings, LIGHT_BG, DARK_BG } from '../core/storage'
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

// Applies the change to the in-memory copy only once the write actually landed -
// setSettings now rejects rather than resolving regardless, and this used to announce
// "Saved" for a background image that had blown the storage quota. Returns whether it
// stuck, so callers that paint something afterwards can skip it.
async function save(s: DumbifySettings, partial: Partial<DumbifySettings>, message = 'Saved'): Promise<boolean> {
  try {
    await setSettings(partial)
    Object.assign(s, partial)
    showStatus(message)
    return true
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Could not save')
    return false
  }
}

function applyPageTheme(s: DumbifySettings) {
  document.body.classList.toggle('light', s.theme === 'light')
  document.body.classList.toggle('dark', s.theme === 'dark')
  document.body.classList.toggle('has-bg', !!s.backgroundImage)
  document.documentElement.style.setProperty('--bg-opacity', String(s.bgOpacity))
  const bg = s.theme === 'dark' ? DARK_BG : LIGHT_BG
  if (s.backgroundImage) {
    document.body.style.background = `url("${s.backgroundImage}") center/cover fixed, ${bg}`
  } else {
    document.body.style.background = ''
  }
}

// chrome.storage.local caps at 10 MB, base64 inflates by a third, and whatever is stored
// here is read into every YouTube tab on load - so a phone photo straight from the picker
// both failed to save and, when it fit, made every page load drag it along. Downscale to
// something a full-screen background actually needs.
const MAX_BG_EDGE = 2560
const MAX_BG_FILE = 25 * 1024 * 1024

function toStoredImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("That file isn't an image"))
      img.onload = () => {
        const scale = Math.min(1, MAX_BG_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Could not process that image')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
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
      selectRow('Theme', THEMES, s.theme, async (v) => {
        // save() only mutates `s` once the write actually lands (setSettings can
        // reject, e.g. over the storage quota), so everything reading `s` afterwards
        // has to wait on it too - firing this off and reading `s` on the next line
        // read the *previous* value, which is why only the color swatch (which
        // patches `s` itself, bypassing save()) ever appeared to update live.
        if (!(await save(s, { theme: v }))) return
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
        async (v) => { if (!(await save(s, { fontSize: v }))) return; updatePreview(s) }
      )
    )
    app.appendChild(
      selectRow('Font Family', FONT_FAMILIES, s.fontFamily, async (v) => {
        if (!(await save(s, { fontFamily: v }))) return
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
    fileInput.id = 'bg-file-input'
    const uploadLabel = el('label', 'bg-upload-label', 'Choose image')
    uploadLabel.setAttribute('for', 'bg-file-input')
    bgUpload.appendChild(fileInput)
    bgUpload.appendChild(uploadLabel)
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
      removeBtn.addEventListener('click', async () => {
        if (!(await save(s, { backgroundImage: '' }, 'Removed'))) return
        applyPageTheme(s)
        if (previewImg) { previewImg.remove(); previewImg = null }
        if (removeBtn) { removeBtn.remove(); removeBtn = null }
      })
      previewWrap.appendChild(previewImg)
      previewWrap.appendChild(removeBtn)
    }

    if (s.backgroundImage) showBgPreview(s.backgroundImage)

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (!file) return
      if (file.size > MAX_BG_FILE) {
        showStatus('That image is too large to read')
        return
      }
      showStatus('Processing image…')
      let dataUrl: string
      try {
        dataUrl = await toStoredImage(file)
      } catch (err) {
        showStatus(err instanceof Error ? err.message : 'Could not use that image')
        return
      }
      if (!(await save(s, { backgroundImage: dataUrl }))) return
      applyPageTheme(s)
      showBgPreview(dataUrl)
    })

    bgSection.appendChild(previewWrap)
    app.appendChild(bgSection)

    // Background opacity slider
    const opacityRow = el('div', 'opacity-row')
    opacityRow.appendChild(el('div', 'opacity-row-lbl', 'Overlay opacity'))
    const opacityWrap = el('div', 'opacity-input-wrap')
    const opacitySlider = document.createElement('input')
    opacitySlider.type = 'range'
    opacitySlider.min = '0.3'
    opacitySlider.max = '1'
    opacitySlider.step = '0.05'
    opacitySlider.value = String(s.bgOpacity)
    const opacityVal = el('span', 'opacity-val', Math.round(s.bgOpacity * 100) + '%')
    opacitySlider.addEventListener('input', () => {
      const v = parseFloat(opacitySlider.value)
      opacityVal.textContent = Math.round(v * 100) + '%'
      s.bgOpacity = v
      document.documentElement.style.setProperty('--bg-opacity', String(v))
    })
    opacitySlider.addEventListener('change', () => {
      save(s, { bgOpacity: parseFloat(opacitySlider.value) })
    })
    opacityWrap.appendChild(opacitySlider)
    opacityWrap.appendChild(opacityVal)
    opacityRow.appendChild(opacityWrap)
    app.appendChild(opacityRow)

    const footer = el('div', 'footer')
    const reset = el('button', undefined, 'Reset All Settings')
    reset.id = 'reset'
    reset.addEventListener('click', async () => {
      try {
        await resetSettings()
      } catch (err) {
        showStatus(err instanceof Error ? err.message : 'Could not reset')
        return
      }
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
