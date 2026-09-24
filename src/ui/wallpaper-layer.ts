// Puts the wallpaper on screen: a built-in preset, a still image, an animated GIF/WebP/
// APNG, or a video loop - behind the whole window, or as a page cover. Shared by the
// reading view and the settings page's live preview.

import { getPreset } from '../core/themes.ts'
import type { DumbifySettings, WallpaperRef } from '../core/settings.ts'
import { dataUrlToBlob, type WallpaperRecord } from '../core/wallpaper.ts'

export type Placement = 'none' | 'window' | 'cover'
export type WallpaperLoader = (ref: WallpaperRef) => Promise<WallpaperRecord | null>

const FADE_MS = 450
/** However the incoming wallpaper fares, the outgoing one is gone by then. */
const RETIRE_AFTER_MS = 8000

/**
 * What a sync should put on screen, as a string. Two syncs with the same key want the
 * same picture, so the second has at most to move it.
 */
export function wallpaperKey(ref: WallpaperRef, still: boolean): string {
  if (ref.source === 'preset') return ref.presetId ? `preset:${ref.presetId}` : ''
  if (ref.source === 'upload' && ref.uploadId) {
    return `upload:${ref.uploadId}:${still && ref.kind !== 'image' ? 'still' : 'live'}`
  }
  return ''
}

async function decodes(url: string): Promise<boolean> {
  const img = new Image()
  img.src = url
  try {
    await img.decode()
    return true
  } catch {
    return false
  }
}

export class WallpaperLayer {
  private readonly hosts: { window: HTMLElement; cover: HTMLElement }
  private readonly load: WallpaperLoader
  private el: HTMLElement | null = null
  /** Wallpapers on their way out, kept until the newest has faded in over them. */
  private readonly outgoing = new Set<HTMLElement>()
  /** The key on screen or on its way - set when a load starts, not when it lands. */
  private key = ''
  /** Bumped whenever what belongs on screen changes; a load holding an older one gives up. */
  private token = 0
  private last: { s: DumbifySettings; placement: Placement; still: boolean } | null = null
  /** blob: URLs by the element showing them, revoked when that element goes. */
  private readonly urls = new Map<Element, string>()
  /**
   * The page's Content-Security-Policy refused a blob: wallpaper. Only the page's own
   * loads say so: the decode check runs in the content script's world, which that policy
   * does not bind, so it passes while the CSS background is refused.
   */
  private blobBlocked = false
  private onScreen = true
  private io: IntersectionObserver | null = null
  private readonly onVisibility = () => this.syncPlayback()
  private readonly onViolation = (e: SecurityPolicyViolationEvent) => this.violation(e)

  constructor(hosts: { window: HTMLElement; cover: HTMLElement }, load: WallpaperLoader) {
    this.hosts = hosts
    this.load = load
    document.addEventListener('visibilitychange', this.onVisibility)
    document.addEventListener('securitypolicyviolation', this.onViolation, true)
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
    this.last = { s, placement, still }
    const key = placement === 'none' ? '' : wallpaperKey(s.wallpaper, still)
    if (!key) {
      this.clear()
      return
    }
    // The same picture, on screen or on its way, so at most it moves. This path must
    // leave the token alone: bumping it cancelled the load in flight for this very key,
    // and a setting changed while a wallpaper was decoding left the page with none.
    if (key === this.key) {
      if (this.el) this.place(this.el)
      this.syncPlayback()
      return
    }
    const token = ++this.token
    this.key = key
    const ref = s.wallpaper

    if (ref.source === 'preset') {
      const preset = getPreset(ref.presetId)
      if (!preset) {
        this.clear()
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
      this.swap(el)
      this.reveal(el)
      return
    }

    const record = await this.load(ref)
    if (token !== this.token) return
    if (!record) {
      this.clear()
      return
    }
    // A still of something that moves is its poster; a video without one stays paused.
    const wantStill = key.endsWith(':still')
    if (wantStill && record.posterUrl) await this.showImage(record.posterUrl, token)
    else if (record.kind === 'video') this.showVideo(record, token, wantStill)
    else await this.showImage(record.dataUrl, token)
  }

  /** The bytes behind the current upload changed under the same id: show them again. */
  reload() {
    this.key = ''
    if (this.last) void this.sync(this.last.s, this.last.placement, this.last.still)
  }

  clear() {
    this.token++
    this.key = ''
    this.watch(null)
    for (const el of [...this.outgoing]) this.drop(el)
    if (this.el) this.drop(this.el)
    this.el = null
  }

  destroy() {
    this.clear()
    document.removeEventListener('visibilitychange', this.onVisibility)
    document.removeEventListener('securitypolicyviolation', this.onViolation, true)
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
  }

  private async showImage(source: string, token: number) {
    let url = this.blobBlocked ? null : this.objectUrl(source)
    // Decoded before it goes up, so what fades in is the picture and not an empty box.
    if (url && !(await decodes(url))) {
      URL.revokeObjectURL(url)
      url = null
    }
    const ok = url !== null || (await decodes(source))
    if (token !== this.token) {
      if (url) URL.revokeObjectURL(url)
      return
    }
    if (!ok) {
      this.clear()
      return
    }
    const el = document.createElement('div')
    el.className = 'df-wall df-upload'
    if (url) this.urls.set(el, url)
    el.style.backgroundImage = `url("${url ?? source}")`
    this.swap(el)
    this.reveal(el)
  }

  private showVideo(record: WallpaperRecord, token: number, still: boolean) {
    const video = document.createElement('video')
    video.className = 'df-wall'
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.disablePictureInPicture = true
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1
    if (still) video.dataset.still = ''
    const url = this.blobBlocked ? null : this.objectUrl(record.dataUrl)
    if (url) this.urls.set(video, url)
    // Neither listener holds the record: a video playing from a blob: URL must not also
    // keep megabytes of base64 alive for the life of the tab. The poster is small.
    const poster = record.posterUrl
    video.addEventListener('loadeddata', () => {
      this.reveal(video)
      this.syncPlayback()
    })
    video.addEventListener('error', () => void this.videoFailed(video, token, poster))
    video.src = url ?? record.dataUrl
    this.swap(video)
  }

  private async videoFailed(video: HTMLVideoElement, token: number, poster: string) {
    if (token !== this.token || video !== this.el) return
    if (this.urls.has(video)) {
      // Refused as a blob: URL - try it as data:, read afresh from storage.
      this.revoke(video)
      const record = this.last ? await this.load(this.last.s.wallpaper) : null
      if (token !== this.token || video !== this.el) return
      if (record) {
        video.src = record.dataUrl
        return
      }
    }
    // It will not play here at all: show its still rather than nothing.
    if (poster) await this.showImage(poster, token)
    else this.clear()
  }

  private violation(e: SecurityPolicyViolationEvent) {
    if (this.blobBlocked || this.urls.size === 0 || e.disposition !== 'enforce') return
    if (e.blockedURI !== 'blob' && !e.blockedURI.startsWith('blob:')) return
    if (!/^(img|media|default)-src/.test(e.effectiveDirective)) return
    // data: is what v1 always used, so it is what a page that allows images at all
    // most likely allows. Load the wallpaper again that way.
    this.blobBlocked = true
    this.reload()
  }

  // Nobody watches a video in a hidden tab, or in a cover scrolled away or hidden on a
  // watch page. (Animated images the browser already stops drawing when unseen.)
  private syncPlayback() {
    const v = this.el
    if (!(v instanceof HTMLVideoElement)) return
    if (document.hidden || !this.onScreen || 'still' in v.dataset) v.pause()
    else void v.play().catch(() => {})
  }

  private watch(el: HTMLElement | null) {
    this.io?.disconnect()
    this.io = null
    this.onScreen = true
    if (!(el instanceof HTMLVideoElement) || typeof IntersectionObserver === 'undefined') return
    this.io = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting
      this.syncPlayback()
    })
    this.io.observe(el)
  }

  // Above any wallpaper on its way out, so a change fades in over it - and beneath the
  // fade layer, which belongs on top.
  private place(el: HTMLElement) {
    const placement = this.last?.placement
    if (!placement || placement === 'none') return
    const host = this.hosts[placement]
    if (el.parentElement === host) return
    host.insertBefore(el, host.querySelector(':scope > .df-wall-fade'))
  }

  private swap(next: HTMLElement) {
    if (this.el) this.outgoing.add(this.el)
    this.el = next
    this.place(next)
    this.watch(next)
    // Should the newcomer never load, the old picture still has to go some time.
    const stale = [...this.outgoing]
    window.setTimeout(() => {
      for (const el of stale) if (el !== this.el) this.drop(el)
    }, RETIRE_AFTER_MS)
  }

  /** Fades an element in over whatever it replaces, then lets that go. */
  private reveal(el: HTMLElement) {
    if (el !== this.el) return
    // Resolve its style first, so the fade starts from transparent rather than being
    // skipped by an element that is born ready.
    void getComputedStyle(el).opacity
    el.classList.add('df-ready')
    const old = [...this.outgoing]
    this.outgoing.clear()
    window.setTimeout(() => {
      for (const o of old) this.drop(o)
    }, FADE_MS)
  }

  private drop(el: HTMLElement) {
    this.outgoing.delete(el)
    if (el instanceof HTMLVideoElement) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    el.remove()
    this.revoke(el)
  }

  private revoke(el: Element) {
    const url = this.urls.get(el)
    if (!url) return
    URL.revokeObjectURL(url)
    this.urls.delete(el)
  }

  private objectUrl(dataUrl: string): string | null {
    const blob = dataUrlToBlob(dataUrl)
    return blob ? URL.createObjectURL(blob) : null
  }
}
