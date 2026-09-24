// Thumbnails and colours for an uploaded wallpaper, made from its bytes with no DOM: the
// service worker makes them for an image carried over from v1, and any extension page
// can make them for an upload that arrived without them (a restored backup).

import { paletteFromPixels } from './color.ts'
import { MIN_EDGE, dataUrlToBlob, type StillInfo, type WallpaperRecord } from './wallpaper.ts'

/** Twice the size a gallery tile shows it at. */
export const THUMB_WIDTH = 240
export const THUMB_HEIGHT = 150

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

async function encode(canvas: OffscreenCanvas): Promise<string> {
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
  if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
  return `data:${blob.type};base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`
}

/**
 * A thumbnail cropped the way the wallpaper fills a window, the image's colours and its
 * size - or null where this context cannot decode it.
 */
export async function analyzeStill(dataUrl: string): Promise<StillInfo | null> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  try {
    const { width, height } = bitmap
    if (!width || !height) return null
    const thumb = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT)
    const ctx = thumb.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    if (Math.min(width, height) < MIN_EDGE) {
      // Too small to fill a window, so it tiles - and the thumbnail shows it tiled.
      const pattern = ctx.createPattern(bitmap, 'repeat')
      if (pattern) {
        pattern.setTransform(new DOMMatrix().scale(0.5))
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT)
      }
    } else {
      const scale = Math.max(THUMB_WIDTH / width, THUMB_HEIGHT / height)
      const w = width * scale
      const h = height * scale
      ctx.drawImage(bitmap, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h)
    }
    const swatch = new OffscreenCanvas(48, 48)
    const sctx = swatch.getContext('2d', { willReadFrequently: true })
    if (!sctx) return null
    sctx.drawImage(bitmap, 0, 0, 48, 48)
    const palette = paletteFromPixels(sctx.getImageData(0, 0, 48, 48).data)
    return { thumbUrl: await encode(thumb), average: palette.average, vibrant: palette.vibrant, width, height }
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}

/** An upload's still: its poster if it moves, else the image itself. */
export function analyzeUpload(record: WallpaperRecord): Promise<StillInfo | null> {
  const still = record.posterUrl || (record.kind === 'video' ? '' : record.dataUrl)
  return still ? analyzeStill(still) : Promise.resolve(null)
}
