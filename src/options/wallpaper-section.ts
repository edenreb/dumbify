import { WALLPAPER_PRESETS, getPreset, type WallpaperPreset } from '../core/themes'
import { NO_WALLPAPER, type DumbifySettings, type WallpaperRef } from '../core/settings'
import { clearStoredWallpaper, getWallpaper, onWallpaperChange, saveWallpaper } from '../core/storage'
import { wallpaperMoves, wallpaperShowing, prefersReducedMotion } from '../core/appearance'
import { dataUrlToBlob, formatBytes, type WallpaperRecord } from '../core/wallpaper'
import type { SettingsStore } from '../ui/store'
import { h } from '../ui/dom'
import { icon } from '../ui/icons'
import { cardGroup, colorChoice, row, segmented, showWhen, slider, toggle } from '../ui/controls'
import { groupTitle, section, toast } from './feedback'
import { fileFromTransfer, processUpload } from './wallpaper-upload'

type S = DumbifySettings

const KIND_LABEL: Record<string, string> = {
  image: 'Image',
  animated: 'Animated',
  video: 'Video loop',
  gradient: 'Gradient',
  pattern: 'Pattern',
  live: 'Live',
}

/** The big preview: the wallpaper itself, where you click to choose what stays in view. */
class Stage {
  readonly el: HTMLElement
  private media: HTMLElement | null = null
  private mediaKey = ''
  private readonly focusDot = h('span', { class: 'wall-focus', 'aria-hidden': 'true' })
  private readonly badges = h('div', { class: 'wall-badges' })
  private readonly empty = h('div', { class: 'wall-empty' }, icon('image'),
    h('strong', { text: 'No wallpaper' }),
    h('span', { text: 'Drop an image, GIF or video here, pick one below, or paste with Ctrl V.' }))
  private readonly busy = h('div', { class: 'wall-busy', hidden: true }, h('span', { class: 'spinner' }), h('span', { class: 'wall-busy-text', text: 'Preparing your wallpaper…' }))
  private record: WallpaperRecord | null = null
  private urls: string[] = []
  private token = 0

  constructor(private readonly store: SettingsStore) {
    this.el = h('div', { class: 'wall-stage', tabindex: '0', 'aria-label': 'Wallpaper preview. Click, or use the arrow keys, to choose the focal point.' },
      this.focusDot, this.badges, this.empty, this.busy,
      h('div', { class: 'wall-drop', 'aria-hidden': 'true' }, icon('upload'), 'Drop to use as your wallpaper'))
    this.el.addEventListener('click', (e) => this.pick(e))
    this.el.addEventListener('keydown', (e) => this.nudge(e))
  }

  setBusy(text: string | null) {
    this.busy.hidden = text === null
    if (text) this.busy.querySelector('.wall-busy-text')!.textContent = text
  }

  private canFocus(s: S): boolean {
    return s.wallpaper.source === 'upload' && s.wallpaperFit !== 'tile'
  }

  private pick(e: MouseEvent) {
    const s = this.store.value
    if (!this.canFocus(s)) return
    const r = this.el.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 100)
    const y = Math.round(((e.clientY - r.top) / r.height) * 100)
    void this.store.commit({ wallpaperFocusX: x, wallpaperFocusY: y })
  }

  private nudge(e: KeyboardEvent) {
    const s = this.store.value
    if (!this.canFocus(s)) return
    const step = e.shiftKey ? 10 : 5
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = d[e.key]
    if (!move) return
    e.preventDefault()
    void this.store.commit({
      wallpaperFocusX: Math.max(0, Math.min(100, s.wallpaperFocusX + move[0])),
      wallpaperFocusY: Math.max(0, Math.min(100, s.wallpaperFocusY + move[1])),
    })
  }

  async render(s: S) {
    const token = ++this.token
    const ref = s.wallpaper
    this.empty.hidden = ref.source !== 'none'
    this.el.classList.toggle('can-focus', this.canFocus(s))
    this.focusDot.hidden = !this.canFocus(s)
    this.focusDot.style.left = `${s.wallpaperFocusX}%`
    this.focusDot.style.top = `${s.wallpaperFocusY}%`

    if (ref.source === 'none') {
      this.setMedia(null, '')
      this.badges.replaceChildren()
      return
    }
    if (ref.source === 'preset') {
      const preset = getPreset(ref.presetId)
      if (!preset) return
      const key = `preset:${preset.id}`
      if (key !== this.mediaKey) {
        const el = h('div', { class: 'wall-media' })
        el.style.background = preset.css
        if (preset.size) el.style.backgroundSize = preset.size
        if (preset.kind === 'animated') el.classList.add('preset-art', 'is-live')
        this.setMedia(el, key)
      }
      this.badges.replaceChildren(h('span', { class: preset.kind === 'animated' ? 'badge badge-live' : 'badge', text: KIND_LABEL[ref.kind] ?? 'Built-in' }),
        h('span', { class: 'badge', text: preset.name }))
      return
    }

    if (this.record?.id !== ref.uploadId) this.record = await getWallpaper(ref)
    if (token !== this.token) return
    const rec = this.record
    if (!rec) {
      this.setMedia(null, '')
      this.badges.replaceChildren(h('span', { class: 'badge', text: 'Wallpaper file missing - upload it again' }))
      return
    }
    const still = !s.wallpaperAnimate && !!rec.posterUrl
    const key = `upload:${rec.id}:${still ? 'still' : 'live'}`
    if (key !== this.mediaKey) {
      if (rec.kind === 'video' && !still) {
        const v = h('video', { class: 'wall-media', muted: true, loop: true, autoplay: true, playsinline: true, 'aria-hidden': 'true' })
        v.muted = true
        v.src = this.url(rec.dataUrl)
        void v.play().catch(() => {})
        this.setMedia(v, key)
      } else {
        const el = h('div', { class: 'wall-media' })
        el.style.backgroundImage = `url("${this.url(still ? rec.posterUrl : rec.dataUrl)}")`
        this.setMedia(el, key)
      }
    }
    // Geometry follows the settings live, without reloading the media.
    if (this.media) {
      const fit = s.wallpaperFit
      const pos = `${s.wallpaperFocusX}% ${s.wallpaperFocusY}%`
      if (this.media instanceof HTMLVideoElement) {
        this.media.style.objectFit = fit === 'fit' ? 'contain' : 'cover'
        this.media.style.objectPosition = pos
      } else {
        this.media.style.backgroundSize = fit === 'fill' ? 'cover' : fit === 'fit' ? 'contain' : 'auto'
        this.media.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat'
        this.media.style.backgroundPosition = pos
      }
    }
    const dims = rec.width && rec.height ? `${rec.width}×${rec.height}` : ''
    this.badges.replaceChildren(
      h('span', { class: rec.kind === 'image' ? 'badge' : 'badge badge-live', text: rec.kind === 'animated' && rec.mime === 'image/gif' ? 'GIF' : (KIND_LABEL[rec.kind] ?? 'Image') }),
      ...[rec.name, dims, rec.bytes ? formatBytes(rec.bytes) : ''].filter(Boolean).map((t) => h('span', { class: 'badge', text: t })),
    )
  }

  private url(dataUrl: string): string {
    const blob = dataUrlToBlob(dataUrl)
    if (!blob) return dataUrl
    const u = URL.createObjectURL(blob)
    this.urls.push(u)
    return u
  }

  private setMedia(el: HTMLElement | null, key: string) {
    this.media?.remove()
    for (const u of this.urls.splice(0, this.urls.length - (el ? 1 : 0))) URL.revokeObjectURL(u)
    this.media = el
    this.mediaKey = key
    if (el) this.el.prepend(el)
  }
}

function presetArt(p: WallpaperPreset): HTMLElement {
  const art = h('span', { class: 'art preset-art', 'aria-hidden': 'true' })
  art.style.background = p.css
  if (p.size) art.style.backgroundSize = p.size
  if (p.kind === 'animated') art.classList.add('is-live')
  return art
}

function presetGallery(store: SettingsStore): HTMLElement {
  const items = [
    { value: 'none', label: 'None', art: h('span', { class: 'art preset-none', 'aria-hidden': 'true' }, icon('close')) },
    ...WALLPAPER_PRESETS.map((p) => ({ value: p.id, label: p.name, art: presetArt(p), title: p.kind === 'animated' ? `${p.name} (moves slowly)` : p.name })),
  ]
  const group = cardGroup(store, {
    label: 'Built-in wallpapers',
    className: 'preset-grid',
    items,
    get: (s) => (s.wallpaper.source === 'preset' ? s.wallpaper.presetId : s.wallpaper.source === 'none' ? 'none' : ''),
    set: (v): Partial<S> => (v === 'none'
      ? { wallpaper: { ...NO_WALLPAPER } }
      : { wallpaper: { ...NO_WALLPAPER, source: 'preset', presetId: v } as WallpaperRef, wallpaperEnabled: true }),
  })
  // Mark the live ones.
  group.querySelectorAll('.pick-card').forEach((card, i) => {
    const preset = WALLPAPER_PRESETS[i - 1]
    if (preset?.kind === 'animated') card.prepend(h('span', { class: 'live-dot', text: 'LIVE' }))
  })
  return group
}

export function wallpaperSection(store: SettingsStore): HTMLElement {
  const stage = new Stage(store)
  const errorBox = h('div', { class: 'wall-error', role: 'alert', hidden: true })
  const showError = (msg: string | null) => {
    errorBox.hidden = !msg
    errorBox.replaceChildren(...(msg ? [icon('info'), h('span', { text: msg })] : []))
  }

  let busy = false
  const useFile = async (file: File) => {
    if (busy) return
    busy = true
    showError(null)
    stage.setBusy(/video/.test(file.type) ? 'Preparing your video…' : 'Preparing your wallpaper…')
    try {
      const { record, ref, tiled } = await processUpload(file)
      const s = store.value
      const saved = await saveWallpaper(record, ref, {
        wallpaperEnabled: true,
        wallpaperFocusX: 50,
        wallpaperFocusY: 50,
        wallpaperFit: tiled ? 'tile' : s.wallpaperFit === 'tile' ? 'fill' : s.wallpaperFit,
      })
      store.replace(saved)
      toast(tiled ? 'Small image - set to tile so it fills the window' : `Wallpaper set${record.kind !== 'image' ? ' - it’s animated' : ''}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'That file couldn’t be used.')
    } finally {
      busy = false
      stage.setBusy(null)
    }
  }

  const file = h('input', { type: 'file', accept: 'image/*,video/mp4,video/webm,video/quicktime', 'aria-label': 'Upload a wallpaper' })
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    file.value = ''
    if (f) void useFile(f)
  })
  const uploadBtn = h('label', { class: 'btn btn-primary upload-btn' }, icon('upload'), 'Upload…', file)
  const removeBtn = h('button', { class: 'btn', type: 'button' }, icon('trash'), 'Remove')
  removeBtn.addEventListener('click', async () => {
    const hadUpload = store.value.wallpaper.source === 'upload'
    if (await store.commit({ wallpaper: { ...NO_WALLPAPER } })) {
      if (hadUpload) await clearStoredWallpaper().catch(() => {})
      toast('Wallpaper removed')
    }
  })
  store.subscribe((s) => { removeBtn.hidden = s.wallpaper.source === 'none' })

  // Drop anywhere on the page, paste anywhere on the page.
  let depth = 0
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return
    depth++
    document.body.classList.add('is-dragging')
  })
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) document.body.classList.remove('is-dragging')
  })
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault() })
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    document.body.classList.remove('is-dragging')
    const f = fileFromTransfer(e.dataTransfer)
    if (f) {
      document.getElementById('wallpaper')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      void useFile(f)
    }
  })
  window.addEventListener('paste', (e) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable]')) return
    const f = fileFromTransfer(e.clipboardData)
    if (!f) return
    e.preventDefault()
    document.getElementById('wallpaper')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    void useFile(f)
  })

  store.subscribe((s) => void stage.render(s))
  // Another tab replacing the upload keeps the same kind of reference; redraw anyway.
  onWallpaperChange(() => void stage.render(store.value))

  const moving = (s: S) => wallpaperMoves(s)
  const windowed = (s: S) => s.wallpaper.source !== 'none' && s.wallpaperPlacement === 'window'
  const hasWall = (s: S) => s.wallpaper.source !== 'none'

  const animateRow = row('Play animation', prefersReducedMotion()
    ? 'Your system asks for reduced motion, so animation stays paused on YouTube.'
    : 'Off shows a still frame. Also pauses when your system asks for reduced motion.',
  toggle(store, { label: 'Play animation', get: (s) => s.wallpaperAnimate, set: (v) => ({ wallpaperAnimate: v }) }))
  showWhen(animateRow, store, moving)

  const fitSeg = segmented(store, {
    label: 'Fit',
    options: [
      { value: 'fill', label: 'Fill', hint: 'Cover the whole window' },
      { value: 'fit', label: 'Fit', hint: 'Show the whole image' },
      { value: 'tile', label: 'Tile', hint: 'Repeat it like a pattern' },
    ],
    get: (s) => s.wallpaperFit,
    set: (v) => ({ wallpaperFit: v }),
  })
  const fitRow = row('Fit', 'Click the preview to choose what stays in view.', fitSeg)
  showWhen(fitRow, store, (s) => s.wallpaper.source === 'upload')
  // Tiling needs an image: a video can't repeat.
  store.subscribe((s) => {
    const tile = fitSeg.querySelector<HTMLInputElement>('input[value="tile"]')
    if (tile) tile.disabled = s.wallpaper.kind === 'video'
  })

  const panels = h('div', null,
    groupTitle('Panels over the wallpaper'),
    row('Style', 'Clear lets the wallpaper show straight through behind the text.', segmented(store, {
      label: 'Panel style',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'glass', label: 'Frosted glass' },
        { value: 'clear', label: 'Clear' },
      ],
      get: (s) => s.surface,
      set: (v) => ({ surface: v }),
    })),
    (() => {
      const r = row('Opacity', 'How much of the wallpaper shows through.', slider(store, {
        label: 'Panel opacity', min: 0, max: 1, step: 0.05,
        get: (s) => s.surfaceOpacity, set: (v) => ({ surfaceOpacity: v }),
        format: (v) => `${Math.round(v * 100)}%`,
      }))
      showWhen(r, store, (s) => s.surface !== 'clear')
      return r
    })(),
    (() => {
      const r = row('Glass blur', 'Frosted glass over an animated wallpaper uses more battery.', slider(store, {
        label: 'Glass blur', min: 2, max: 40, step: 1,
        get: (s) => s.surfaceBlur, set: (v) => ({ surfaceBlur: v }),
        format: (v) => `${v}px`,
      }))
      showWhen(r, store, (s) => s.surface === 'glass')
      return r
    })(),
    (() => {
      const r = row('Tint', 'Colour the panels. Theme uses the page colour.', colorChoice(store, {
        label: 'Panel tint',
        get: (s) => s.surfaceTint,
        set: (v) => ({ surfaceTint: v }),
        fallback: () => getComputedStyle(document.documentElement).getPropertyValue('--df-bg').trim() || '#ffffff',
      }))
      showWhen(r, store, (s) => s.surface !== 'clear')
      return r
    })(),
  )
  showWhen(panels, store, windowed)

  const adjust = h('div', null,
    groupTitle('Adjust'),
    row('Show wallpaper', 'Keeps your wallpaper saved while it’s off.', toggle(store, {
      label: 'Show wallpaper', get: (s) => s.wallpaperEnabled, set: (v) => ({ wallpaperEnabled: v }),
    })),
    animateRow,
    row('Display as', 'Page cover puts it in a banner at the top of each page, like a notebook cover.', segmented(store, {
      label: 'Display as',
      options: [
        { value: 'window', label: 'Full window' },
        { value: 'cover', label: 'Page cover' },
      ],
      get: (s) => s.wallpaperPlacement,
      set: (v) => ({ wallpaperPlacement: v }),
    })),
    fitRow,
    row('Blur', '', slider(store, {
      label: 'Wallpaper blur', min: 0, max: 40, step: 1,
      get: (s) => s.wallpaperBlur, set: (v) => ({ wallpaperBlur: v }), format: (v) => `${v}px`,
    })),
    row('Fade', 'Blends the wallpaper toward your theme so text stays easy to read.', slider(store, {
      label: 'Wallpaper fade', min: 0, max: 0.9, step: 0.05,
      get: (s) => s.wallpaperFade, set: (v) => ({ wallpaperFade: v }), format: (v) => `${Math.round(v * 100)}%`,
    })),
    panels,
  )
  showWhen(adjust, store, hasWall)

  const status = h('span', { class: 'hint' })
  store.subscribe((s) => {
    status.textContent = s.wallpaper.source !== 'none' && !wallpaperShowing(s) ? 'Hidden - switch Show wallpaper back on below.' : 'JPG, PNG, WebP, GIF, MP4 or WebM'
  })

  return section('wallpaper', 'image', 'Wallpaper', 'A picture, an animated GIF or a video loop behind your reading.',
    stage.el,
    errorBox,
    h('div', { class: 'wall-actions' }, uploadBtn, removeBtn, status),
    groupTitle('Built-in'),
    presetGallery(store),
    adjust,
  )
}
