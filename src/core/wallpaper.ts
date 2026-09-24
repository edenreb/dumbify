// Wallpaper file handling that needs no DOM: recognising what a file really is, whether
// an image is animated, the size rules, and the gallery of uploads. The canvas work
// (resizing, posters) lives with the settings page, which is the only place files are
// ever read; thumbnails and colours are made in analyze.ts.

import type { WallpaperRef } from './settings.ts'

/** An uploaded wallpaper, stored under its own key - see storage.ts for why. */
export interface WallpaperRecord {
  id: string
  name: string
  mime: string
  kind: 'image' | 'animated' | 'video'
  /** The wallpaper itself. A static image is re-encoded; animation and video are kept byte for byte. */
  dataUrl: string
  /** A still first frame, shown when animation is paused. '' for static images. */
  posterUrl: string
  width: number
  height: number
  /** Size of the file as picked, before any re-encoding. */
  bytes: number
  addedAt: number
}

export type UploadKind = WallpaperRecord['kind']

// A still image is re-encoded down to MAX_EDGE, so its source can be large. Animation and
// video cannot be re-encoded here without dropping frames - they are stored exactly as
// picked, and every page load reads them back out of storage, so they get tighter caps.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024
export const MAX_ANIMATED_BYTES = 12 * 1024 * 1024
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024
export const MAX_EDGE = 2560
// `cover` stretches a wallpaper over the whole window, so a tiny source is upscaled into
// mush - and at extreme ratios (a 118x12 banner) into a texture larger than the
// compositor will rasterise. Tiling is the exception: small patterns are the point.
export const MIN_EDGE = 200

const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const IMAGE_MIMES = new Set([
  'image/gif', 'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/bmp', 'image/apng',
])

function ascii(bytes: Uint8Array, at: number, len: number): string {
  let s = ''
  for (let i = at; i < at + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

function u32be(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]
}

function u32le(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
}

/**
 * The real format from the file's magic bytes. The browser's File.type comes from the
 * extension alone, so a renamed file - or a .gif that is secretly an mp4, which is what
 * "GIF" downloads from most sites actually are - would otherwise take the wrong path.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  const head6 = ascii(bytes, 0, 6)
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif'
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 0, 2) === 'BM') return 'image/bmp'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm'
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (brand === 'qt  ') return 'video/quicktime'
    return 'video/mp4'
  }
  return null
}

/** Counts image descriptors by walking the GIF block structure. */
export function gifFrameCount(bytes: Uint8Array, stopAt = 2): number {
  if (bytes.length < 13 || !ascii(bytes, 0, 3).startsWith('GIF')) return 0
  let p = 13
  const flags = bytes[10]
  if (flags & 0x80) p += 3 * (1 << ((flags & 0x07) + 1))
  let frames = 0
  const skipSubBlocks = () => {
    while (p < bytes.length) {
      const size = bytes[p++]
      if (size === 0) return
      p += size
    }
  }
  while (p < bytes.length) {
    const block = bytes[p++]
    if (block === 0x3b) break // trailer
    if (block === 0x21) { // extension: label, then sub-blocks
      p++
      skipSubBlocks()
    } else if (block === 0x2c) { // image descriptor
      frames++
      if (frames >= stopAt) return frames
      const local = bytes[p + 8]
      p += 9
      if (local & 0x80) p += 3 * (1 << ((local & 0x07) + 1))
      p++ // LZW minimum code size
      skipSubBlocks()
    } else {
      break // corrupt - count what we have
    }
  }
  return frames
}

export function isAnimatedGif(bytes: Uint8Array): boolean {
  return gifFrameCount(bytes, 2) > 1
}

/** An animated WebP carries a VP8X header with the animation flag set, then ANIM/ANMF chunks. */
export function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return false
  let p = 12
  while (p + 8 <= bytes.length) {
    const id = ascii(bytes, p, 4)
    const size = u32le(bytes, p + 4)
    if (id === 'VP8X') return (bytes[p + 8] & 0x02) !== 0
    if (id === 'ANIM' || id === 'ANMF') return true
    p += 8 + size + (size & 1)
  }
  return false
}

/** An APNG is a PNG with an acTL chunk ahead of its first IDAT. */
export function isAnimatedPng(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x89 || ascii(bytes, 1, 3) !== 'PNG') return false
  let p = 8
  while (p + 8 <= bytes.length) {
    const len = u32be(bytes, p)
    const type = ascii(bytes, p + 4, 4)
    if (type === 'acTL') return true
    if (type === 'IDAT' || type === 'IEND') return false
    p += 12 + len
  }
  return false
}

export interface Classified {
  mime: string
  kind: UploadKind
}

/**
 * What a picked file is and how it will be stored - or a sentence saying why it can't be
 * used, written to be shown to the reader as-is.
 */
export function classifyUpload(bytes: Uint8Array, declaredType: string, size: number): Classified | { error: string } {
  const mime = sniffMime(bytes) ?? declaredType.toLowerCase()
  if (VIDEO_MIMES.has(mime)) {
    if (size > MAX_VIDEO_BYTES) {
      return { error: `That video is ${formatBytes(size)}. Live wallpapers can be up to ${formatBytes(MAX_VIDEO_BYTES)} - try a shorter or smaller clip.` }
    }
    return { mime, kind: 'video' }
  }
  if (!IMAGE_MIMES.has(mime) && !mime.startsWith('image/')) {
    return { error: 'That file isn’t an image or a video Dumbify can use. Try a JPG, PNG, WebP, GIF, MP4 or WebM.' }
  }
  if (mime === 'image/svg+xml') {
    return { error: 'SVG files can’t be used as wallpapers. Try a PNG or JPG instead.' }
  }
  const animated =
    (mime === 'image/gif' && isAnimatedGif(bytes)) ||
    (mime === 'image/webp' && isAnimatedWebp(bytes)) ||
    ((mime === 'image/png' || mime === 'image/apng') && isAnimatedPng(bytes))
  if (animated) {
    if (size > MAX_ANIMATED_BYTES) {
      return { error: `That animation is ${formatBytes(size)}. Animated wallpapers can be up to ${formatBytes(MAX_ANIMATED_BYTES)}. An MP4 or WebM version of the same clip is usually far smaller.` }
    }
    return { mime: mime === 'image/apng' ? 'image/png' : mime, kind: 'animated' }
  }
  if (size > MAX_SOURCE_BYTES) {
    return { error: `That image is ${formatBytes(size)} - too large to read. Try one under ${formatBytes(MAX_SOURCE_BYTES)}.` }
  }
  return { mime, kind: 'image' }
}

/** Why a decoded wallpaper of these dimensions can't be used, or null if it can. */
export function dimensionProblem(width: number, height: number, tiled: boolean): string | null {
  if (!width || !height) return 'Couldn’t read that file’s dimensions.'
  if (tiled) return null
  if (Math.min(width, height) < MIN_EDGE) {
    return `That’s only ${width}×${height}. Wallpapers need to be at least ${MIN_EDGE}×${MIN_EDGE} to fill the window - or switch Fit to Tile for small patterns.`
  }
  return null
}

/** Scale that brings the longest edge down to `maxEdge`, never up. */
export function fitScale(width: number, height: number, maxEdge = MAX_EDGE): number {
  const longest = Math.max(width, height)
  return longest > maxEdge ? maxEdge / longest : 1
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  const mb = n / (1024 * 1024)
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
}

export function mimeOfDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? ''
}

/** Decoded size of a base64 data: URL, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return 0
  const b64 = dataUrl.length - comma - 1
  const pad = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64 * 3) / 4) - pad)
}

export function newUploadId(now = Date.now()): string {
  return `up-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Validates a record read back from storage or a backup file. */
export function isWallpaperRecord(v: unknown): v is WallpaperRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.dataUrl === 'string' && r.dataUrl.startsWith('data:') &&
    (r.kind === 'image' || r.kind === 'animated' || r.kind === 'video') &&
    typeof r.mime === 'string'
}

/**
 * Decodes a data: URL into a Blob without fetch(), which a page's connect-src policy
 * can refuse. A blob: URL is a short string to hand to CSS or <video>, where the data:
 * URL itself would be megabytes written into a style attribute that every one of
 * YouTube's own MutationObservers then gets to read.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith('data:')) return null
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  const header = dataUrl.slice(5, comma)
  const mime = header.split(';')[0] || 'application/octet-stream'
  const payload = dataUrl.slice(comma + 1)
  try {
    let bytes: Uint8Array
    if (/;base64$/i.test(header)) {
      const fromBase64 = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64
      if (typeof fromBase64 === 'function') {
        bytes = fromBase64(payload)
      } else {
        const bin = atob(payload)
        bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      }
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    }
    return new Blob([bytes as BlobPart], { type: mime })
  } catch {
    return null
  }
}

// ---- The gallery of uploads ----

/** Uploads kept at once. A new one past this makes room by dropping the oldest. */
export const MAX_UPLOADS = 6
/** A thumbnail is a few KB; anything this big is not one. */
const MAX_THUMB_CHARS = 150_000
const THUMB_URL = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/
const HEX = /^#[0-9a-f]{6}$/i

/** "GIF", "Video" and so on: what a gallery tile says an upload is. */
export function uploadBadge(u: { kind: UploadKind; mime: string }): string {
  if (u.kind === 'video') return 'Video'
  if (u.kind === 'animated') return u.mime === 'image/gif' ? 'GIF' : 'Animated'
  return ''
}

/**
 * What the gallery, the popup and a page's first paint need to know about an upload,
 * without its bytes. All of them live in one small list, so reading it is cheap anywhere.
 */
export interface UploadSummary {
  id: string
  name: string
  kind: UploadKind
  mime: string
  width: number
  height: number
  /** Size of the file as picked. */
  bytes: number
  addedAt: number
  /** A small still for galleries and the popup. '' until one has been made. */
  thumbUrl: string
  average: string
  vibrant: string
}

/** What analysing an upload's still frame gives: see analyze.ts. */
export interface StillInfo {
  thumbUrl: string
  average: string
  vibrant: string
  width: number
  height: number
}

export function summarize(record: WallpaperRecord, info: Partial<StillInfo> | null = null): UploadSummary {
  return normalizeUploads([{
    id: record.id,
    name: record.name,
    kind: record.kind,
    mime: record.mime,
    width: record.width || info?.width || 0,
    height: record.height || info?.height || 0,
    bytes: record.bytes,
    addedAt: record.addedAt,
    thumbUrl: info?.thumbUrl ?? '',
    average: info?.average ?? '',
    vibrant: info?.vibrant ?? '',
  }])[0]
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0
}

function color(v: unknown): string {
  return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : ''
}

/** The stored list, validated: every entry well formed, no id twice. */
export function normalizeUploads(value: unknown): UploadSummary[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: UploadSummary[] = []
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().slice(0, 80) : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const thumb = typeof r.thumbUrl === 'string' && r.thumbUrl.length <= MAX_THUMB_CHARS && THUMB_URL.test(r.thumbUrl) ? r.thumbUrl : ''
    out.push({
      id,
      name: typeof r.name === 'string' ? r.name.slice(0, 120) : '',
      kind: r.kind === 'animated' || r.kind === 'video' ? r.kind : 'image',
      mime: typeof r.mime === 'string' && /^[a-z]+\/[a-z0-9.+-]{1,40}$/.test(r.mime) ? r.mime : '',
      width: count(r.width),
      height: count(r.height),
      bytes: count(r.bytes),
      addedAt: count(r.addedAt),
      thumbUrl: thumb,
      average: color(r.average),
      vibrant: color(r.vibrant),
    })
  }
  return out
}

/** Adds an upload at the front of the list (newest first), replacing any older entry for it. */
export function withUpload(list: UploadSummary[], upload: UploadSummary): UploadSummary[] {
  return [upload, ...list.filter((u) => u.id !== upload.id)]
}

/**
 * Trims a list to MAX_UPLOADS by dropping the oldest entries - never one in `keep`, such
 * as the wallpaper in use.
 */
export function pruneUploads(list: UploadSummary[], keep: ReadonlySet<string>): { kept: UploadSummary[]; removed: UploadSummary[] } {
  const kept = [...list]
  const removed: UploadSummary[] = []
  for (let i = kept.length - 1; i >= 0 && kept.length > MAX_UPLOADS; i--) {
    if (keep.has(kept[i].id)) continue
    removed.push(...kept.splice(i, 1))
  }
  return { kept, removed }
}

/** The settings' reference to an upload in the gallery. */
export function refFromUpload(u: UploadSummary): WallpaperRef {
  return {
    source: 'upload',
    presetId: '',
    uploadId: u.id,
    kind: u.kind,
    name: u.name,
    width: u.width,
    height: u.height,
    average: u.average,
    vibrant: u.vibrant,
  }
}
