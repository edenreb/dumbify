// Puts the wallpaper on screen: a built-in preset, a still image, an animated GIF/WebP/
// APNG, or a video loop - behind the whole window, or as a page cover. Shared by the
// reading view and the settings page's live preview.

import { getPreset } from '../core/themes.ts'
import type { DumbifySettings, WallpaperRef } from '../core/settings.ts'
import { dataUrlToBlob, type WallpaperRecord } from '../core/wallpaper.ts'

export type Placement = 'none' | 'window' | 'cover'
type Loader = (ref: WallpaperRef) => Promise<WallpaperRecord | null>

const FADE_MS = 450

export class WallpaperLayer {
  private el: HTMLElement | null = null
  private key = ''
  private token = 0
  private urls = new Set<string>()
  private readonly onVisibility = () => this.syncPlayback()

  constructor(
    /** Where the wallpaper goes for each placement. */
    private readonly hosts: { window: HTMLElement; cover: HTMLElement },
    private readonly load: Loader,
  ) {
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** Current element, for tests and the preview. */
  get element(): HTMLElement | null {
    return this.el
  }

  /**
   * Shows what the settings ask for. `still` pauses motion: the reader switched
   * animation off, or the system asks for reduced motion.
   */
  async sync(s: DumbifySettings, placement: Placement, still: boolean): Promise<void> {
    const token = ++this.token
    if (placement === 'none') {
      this.clear()
      return
    }
    const host = this.hosts[placement]
    const ref = s.wallpaper

    if (ref.source === 'preset') {
      const preset = getPreset(ref.presetId)
      if (!preset) { this.clear(); return }
      const key = `preset:${preset.id}`
      if (key === this.key && this.el) {
        this.place(this.el, host)
        return
      }
      const el = document.createElement('div')
      el.className = 'df-wall'
      el.dataset.preset = preset.id
      el.style.background = preset.css
      if (preset.kind === 'animated') {
        el.classList.add('df-live')
        if (preset.size) el.style.backgroundSize = preset.size
      }
      this.swap(el, host, key)
      requestAnimationFrame(() => el.classList.add('df-ready'))
      return
    }

    // Decide from the reference whether anything changed before touching storage: an
    // upload can be megabytes, and every settings change - a font size, a theme - comes
    // through here.
    const wantStill = still && ref.kind !== 'image'
    const key = `upload:${ref.uploadId}:${wantStill ? 'still' : 'live'}`
    if (key === this.key && this.el) {
      this.place(this.el, host)
      this.syncPlayback()
      return
    }

    const record = await this.load(ref)
    if (token !== this.token) return
    if (!record) { this.clear(); return }
    const useStill = wantStill && !!record.posterUrl

    if (record.kind === 'video' && !useStill) {
      const video = document.createElement('video')
      video.className = 'df-wall'
      video.muted = true
      video.loop = true
      video.autoplay = true
      video.playsInline = true
      video.disablePictureInPicture = true
      video.setAttribute('aria-hidden', 'true')
      video.setAttribute('tabindex', '-1')
      const blobUrl = this.objectUrl(record.dataUrl)
      let triedData = !blobUrl
      video.addEventListener('error', () => {
        // A page policy that refuses blob: media still allows the data: URL itself.
        if (triedData) return
        triedData = true
        video.src = record.dataUrl
      })
      video.addEventListener('loadeddata', () => {
        video.classList.add('df-ready')
        this.syncPlayback()
      }, { once: true })
      video.src = blobUrl ?? record.dataUrl
      this.swap(video, host, key)
      return
    }

    const source = useStill ? record.posterUrl : record.dataUrl
    const el = document.createElement('div')
    el.className = 'df-wall df-upload'
    this.swap(el, host, key)
    const url = await this.firstThatLoads([this.objectUrl(source), source])
    if (token !== this.token || this.el !== el) return
    if (!url) return
    el.style.backgroundImage = `url("${url}")`
    el.classList.add('df-ready')
  }

  clear() {
    this.token++
    if (this.el) this.retire(this.el)
    this.el = null
    this.key = ''
  }

  destroy() {
    this.clear()
    document.removeEventListener('visibilitychange', this.onVisibility)
    for (const u of this.urls) URL.revokeObjectURL(u)
    this.urls.clear()
  }

  // A hidden tab has no use for a playing video; GIFs the browser already throttles.
  private syncPlayback() {
    const v = this.el instanceof HTMLVideoElement ? this.el : null
    if (!v) return
    if (document.hidden) v.pause()
    else void v.play().catch(() => {})
  }

  private place(el: HTMLElement, host: HTMLElement) {
    if (el.parentElement !== host) host.prepend(el)
  }

  private swap(next: HTMLElement, host: HTMLElement, key: string) {
    const prev = this.el
    this.el = next
    this.key = key
    host.prepend(next)
    if (prev) this.retire(prev, next)
  }

  // The outgoing wallpaper stays until the incoming one has faded in, so a change is a
  // crossfade rather than a flash of the bare page.
  private retire(el: HTMLElement, successor?: HTMLElement) {
    const remove = () => {
      if (el instanceof HTMLVideoElement) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      const bg = el.style.backgroundImage
      el.remove()
      const m = /url\("(blob:[^"]+)"\)/.exec(bg)
      if (m && this.urls.has(m[1])) {
        URL.revokeObjectURL(m[1])
        this.urls.delete(m[1])
      }
    }
    if (!successor) { remove(); return }
    const done = () => window.setTimeout(remove, FADE_MS)
    if (successor.classList.contains('df-ready')) { done(); return }
    const obs = new MutationObserver(() => {
      if (!successor.classList.contains('df-ready') && successor.isConnected) return
      obs.disconnect()
      done()
    })
    obs.observe(successor, { attributes: true, attributeFilter: ['class'] })
    // Never leave an old wallpaper behind forever if the new one fails to load.
    window.setTimeout(() => { obs.disconnect(); remove() }, 8000)
  }

  private objectUrl(dataUrl: string): string | null {
    const blob = dataUrlToBlob(dataUrl)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  private async firstThatLoads(candidates: (string | null)[]): Promise<string | null> {
    for (const url of candidates) {
      if (!url) continue
      try {
        const img = new Image()
        img.src = url
        await img.decode()
        return url
      } catch {
        // Refused by policy or undecodable - try the next form.
        if (this.urls.delete(url)) URL.revokeObjectURL(url)
      }
    }
    return null
  }
}
