// Turns a picked, dropped or pasted file into a stored wallpaper.
//
// Still images are decoded and re-encoded (downscaled, WebP) so storage and every page
// load stay light. Animated GIF/WebP/APNG and video are stored exactly as picked -
// a canvas only ever sees one frame, so re-encoding would freeze them - and get a still
// poster for when animation is paused.

import {
  MAX_EDGE, classifyUpload, dimensionProblem, fitScale, mimeOfDataUrl, newUploadId,
  type StillInfo, type WallpaperRecord,
} from '../core/wallpaper'
import { analyzeUpload } from '../core/analyze'

export interface ProcessedUpload {
  record: WallpaperRecord
  /** Its thumbnail and colours, or null if they could not be made. */
  info: StillInfo | null
  /** The image is too small to fill the window; it has been set up to tile instead. */
  tiled: boolean
}

const POSTER_EDGE = 1600

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Couldn’t read that file.'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('That image couldn’t be opened. It may be damaged or in a format Chrome can’t show.')
  } finally {
    // decode() has the pixels; the URL can go.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function canvasFrom(source: CanvasImageSource, width: number, height: number, maxEdge: number): HTMLCanvasElement {
  const scale = fitScale(width, height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Couldn’t process that image.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 255) return true
  }
  return false
}

// WebP keeps alpha and is far smaller than PNG; where a browser can't encode it,
// PNG for images with transparency (JPEG would turn it black) and JPEG for the rest.
function encodeStill(canvas: HTMLCanvasElement, quality = 0.88): string {
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  return hasTransparency(canvas) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality)
}

function once(target: EventTarget, ok: string, fail: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, ms)
    const onOk = () => { cleanup(); resolve() }
    const onFail = () => { cleanup(); reject(new Error(fail)) }
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(ok, onOk)
      target.removeEventListener('error', onFail)
    }
    target.addEventListener(ok, onOk)
    target.addEventListener('error', onFail)
  })
}

function baseRecord(file: File, fields: Partial<WallpaperRecord>): WallpaperRecord {
  return {
    id: newUploadId(),
    name: file.name || 'Pasted image',
    mime: '',
    kind: 'image',
    dataUrl: '',
    posterUrl: '',
    width: 0,
    height: 0,
    bytes: file.size,
    addedAt: Date.now(),
    ...fields,
  }
}

async function processStill(file: File, blob: Blob): Promise<ProcessedUpload> {
  const img = await decodeImage(blob)
  const width = img.naturalWidth
  const height = img.naturalHeight
  const problem = dimensionProblem(width, height, true)
  if (problem) throw new Error(problem)
  const tiled = !!dimensionProblem(width, height, false)
  const canvas = canvasFrom(img, width, height, MAX_EDGE)
  const dataUrl = encodeStill(canvas)
  const record = baseRecord(file, {
    kind: 'image', mime: mimeOfDataUrl(dataUrl), dataUrl, width: canvas.width, height: canvas.height,
  })
  return { record, info: await analyzeUpload(record), tiled }
}

async function processAnimated(file: File, blob: Blob, mime: string): Promise<ProcessedUpload> {
  // Decoding hands back the first frame, which becomes the poster.
  const img = await decodeImage(blob)
  const width = img.naturalWidth
  const height = img.naturalHeight
  const problem = dimensionProblem(width, height, true)
  if (problem) throw new Error(problem)
  const tiled = !!dimensionProblem(width, height, false)
  const poster = canvasFrom(img, width, height, POSTER_EDGE)
  const record = baseRecord(file, {
    kind: 'animated',
    mime,
    dataUrl: await readAsDataUrl(blob),
    posterUrl: encodeStill(poster, 0.84),
    width,
    height,
  })
  return { record, info: await analyzeUpload(record), tiled }
}

async function processVideo(file: File, blob: Blob, mime: string): Promise<ProcessedUpload> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    video.src = url
    try {
      await once(video, 'loadeddata', 'error', 20000)
    } catch {
      throw new Error('Chrome couldn’t play that video. Try an MP4 (H.264) or WebM file.')
    }
    const width = video.videoWidth
    const height = video.videoHeight
    // Videos can't tile, so a small one is simply too small.
    const problem = dimensionProblem(width, height, false)
    if (problem) throw new Error(problem.replace(/ - or switch.*$/, '.'))
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      video.currentTime = Math.min(0.1, video.duration / 2)
      await once(video, 'seeked', 'error', 8000).catch(() => {})
    }
    const poster = canvasFrom(video, width, height, POSTER_EDGE)
    const record = baseRecord(file, {
      kind: 'video',
      mime,
      dataUrl: await readAsDataUrl(blob),
      posterUrl: encodeStill(poster, 0.84),
      width,
      height,
    })
    return { record, info: await analyzeUpload(record), tiled: false }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Reads a file into a wallpaper, or throws an Error whose message can be shown as-is. */
export async function processUpload(file: File): Promise<ProcessedUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = classifyUpload(bytes, file.type || '', file.size)
  if ('error' in kind) throw new Error(kind.error)
  const blob = new Blob([bytes], { type: kind.mime })
  if (kind.kind === 'video') return processVideo(file, blob, kind.mime)
  if (kind.kind === 'animated') return processAnimated(file, blob, kind.mime)
  return processStill(file, blob)
}

/** The first image or video in a drop or paste, if there is one. */
export function fileFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const f of Array.from(data.files ?? [])) {
    if (f.type.startsWith('image/') || f.type.startsWith('video/') || f.type === '') return f
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}
