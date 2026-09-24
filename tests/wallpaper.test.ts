import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ANIMATED_BYTES, MAX_VIDEO_BYTES, MIN_EDGE, classifyUpload, dataUrlBytes, dimensionProblem,
  fitScale, formatBytes, gifFrameCount, isAnimatedGif, isAnimatedPng, isAnimatedWebp,
  isWallpaperRecord, mimeOfDataUrl, sniffMime,
} from '../src/core/wallpaper.ts'

const enc = (s: string) => [...s].map((c) => c.charCodeAt(0))
const bytes = (...parts: (number | number[])[]) => new Uint8Array(parts.flat())

// A structurally valid GIF with `frames` image descriptors (pixel data is nonsense,
// which is fine: nothing here decodes pixels).
function gif(frames: number, withGlobalTable = true): Uint8Array {
  const out: number[] = [...enc('GIF89a'), 2, 0, 2, 0, withGlobalTable ? 0x80 : 0, 0, 0]
  if (withGlobalTable) out.push(0, 0, 0, 255, 255, 255)
  // NETSCAPE looping extension, as every animated GIF carries.
  out.push(0x21, 0xff, 11, ...enc('NETSCAPE2.0'), 3, 1, 0, 0, 0)
  for (let i = 0; i < frames; i++) {
    out.push(0x21, 0xf9, 4, 0, 10, 0, 0, 0) // graphic control
    out.push(0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0) // image descriptor, no local table
    out.push(2, 2, 0x4c, 0x01, 0) // LZW size, one sub-block, terminator
  }
  out.push(0x3b)
  return new Uint8Array(out)
}

function le32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
}

function webp(animated: boolean): Uint8Array {
  const vp8x = [...enc('VP8X'), ...le32(10), animated ? 0x02 : 0x00, 0, 0, 0, 1, 0, 0, 1, 0, 0]
  const body = [...enc('WEBP'), ...vp8x]
  return bytes(enc('RIFF'), le32(body.length), body)
}

function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function png(animated: boolean): Uint8Array {
  const sig = [0x89, ...enc('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]
  const chunk = (type: string, data: number[]) => [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0]
  const ihdr = chunk('IHDR', new Array(13).fill(0))
  const actl = animated ? chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]) : []
  const idat = chunk('IDAT', [1, 2, 3])
  return bytes(sig, ihdr, actl, idat, chunk('IEND', []))
}

test('sniffMime recognises every supported format by its magic bytes', () => {
  assert.equal(sniffMime(gif(1)), 'image/gif')
  assert.equal(sniffMime(png(false)), 'image/png')
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0, new Array(10).fill(0))), 'image/jpeg')
  assert.equal(sniffMime(webp(false)), 'image/webp')
  assert.equal(sniffMime(bytes(0x1a, 0x45, 0xdf, 0xa3, new Array(10).fill(0))), 'video/webm')
  assert.equal(sniffMime(bytes(0, 0, 0, 24, enc('ftypisom'), new Array(8).fill(0))), 'video/mp4')
  assert.equal(sniffMime(bytes(0, 0, 0, 24, enc('ftypavif'), new Array(8).fill(0))), 'image/avif')
  assert.equal(sniffMime(bytes(enc('hello world, not an image'))), null)
})

test('gifFrameCount walks the block structure', () => {
  assert.equal(gifFrameCount(gif(1)), 1)
  assert.equal(gifFrameCount(gif(3), 99), 3)
  assert.equal(gifFrameCount(gif(2, false)), 2)
  assert.equal(gifFrameCount(bytes(enc('not a gif at all'))), 0)
})

test('isAnimatedGif: one frame is a still, two is an animation', () => {
  assert.equal(isAnimatedGif(gif(1)), false)
  assert.equal(isAnimatedGif(gif(2)), true)
})

test('isAnimatedGif tolerates a truncated file', () => {
  const full = gif(3)
  assert.doesNotThrow(() => isAnimatedGif(full.slice(0, full.length - 20)))
})

test('isAnimatedWebp reads the VP8X animation flag', () => {
  assert.equal(isAnimatedWebp(webp(true)), true)
  assert.equal(isAnimatedWebp(webp(false)), false)
})

test('isAnimatedPng finds acTL before the image data', () => {
  assert.equal(isAnimatedPng(png(true)), true)
  assert.equal(isAnimatedPng(png(false)), false)
})

test('classifyUpload: an animated GIF is kept as an animation', () => {
  assert.deepEqual(classifyUpload(gif(2), 'image/gif', 1000), { mime: 'image/gif', kind: 'animated' })
})

test('classifyUpload: a single-frame GIF is treated as a still image', () => {
  assert.deepEqual(classifyUpload(gif(1), 'image/gif', 1000), { mime: 'image/gif', kind: 'image' })
})

test('classifyUpload: animated WebP and APNG are animations too', () => {
  assert.equal((classifyUpload(webp(true), 'image/webp', 1000) as any).kind, 'animated')
  assert.equal((classifyUpload(png(true), 'image/png', 1000) as any).kind, 'animated')
})

test('classifyUpload trusts the bytes over the file name', () => {
  // Most "GIF" downloads are really MP4s with a .gif name.
  const mp4 = bytes(0, 0, 0, 24, enc('ftypisom'), new Array(8).fill(0))
  assert.deepEqual(classifyUpload(mp4, 'image/gif', 1000), { mime: 'video/mp4', kind: 'video' })
})

test('classifyUpload rejects oversize animations and videos with a useful message', () => {
  const tooBig = classifyUpload(gif(2), 'image/gif', MAX_ANIMATED_BYTES + 1) as { error: string }
  assert.match(tooBig.error, /MP4 or WebM/)
  const webm = bytes(0x1a, 0x45, 0xdf, 0xa3, new Array(10).fill(0))
  assert.match((classifyUpload(webm, 'video/webm', MAX_VIDEO_BYTES + 1) as { error: string }).error, /up to/)
})

test('classifyUpload rejects what cannot be a wallpaper', () => {
  assert.ok('error' in classifyUpload(bytes(enc('just some text here')), 'text/plain', 20))
  assert.ok('error' in classifyUpload(bytes(enc('<svg xmlns="x"></svg>')), 'image/svg+xml', 20))
})

test('dimensionProblem: small images only work tiled', () => {
  assert.equal(dimensionProblem(1920, 1080, false), null)
  assert.match(dimensionProblem(118, 12, false) ?? '', /Tile/)
  assert.equal(dimensionProblem(118, 12, true), null)
  assert.ok(dimensionProblem(0, 0, true))
  assert.equal(dimensionProblem(MIN_EDGE, MIN_EDGE, false), null)
})

test('fitScale only ever scales down', () => {
  assert.equal(fitScale(5120, 2880), 0.5)
  assert.equal(fitScale(800, 600), 1)
})

test('formatBytes reads like a person wrote it', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(formatBytes(12 * 1024 * 1024), '12 MB')
})

test('dataUrlBytes and mimeOfDataUrl read a data URL without decoding it', () => {
  const url = 'data:image/png;base64,' + Buffer.from('hello!!').toString('base64')
  assert.equal(dataUrlBytes(url), 7)
  assert.equal(mimeOfDataUrl(url), 'image/png')
  assert.equal(dataUrlBytes('nonsense'), 0)
})

test('isWallpaperRecord rejects anything that is not a stored upload', () => {
  const good = { id: 'up-1', dataUrl: 'data:image/gif;base64,AA', kind: 'animated', mime: 'image/gif' }
  assert.equal(isWallpaperRecord(good), true)
  assert.equal(isWallpaperRecord({ ...good, dataUrl: 'https://evil.example/x.gif' }), false)
  assert.equal(isWallpaperRecord({ ...good, kind: 'exe' }), false)
  assert.equal(isWallpaperRecord(null), false)
})

test('dataUrlToBlob decodes base64 and keeps the type', async () => {
  const { dataUrlToBlob } = await import('../src/core/wallpaper.ts')
  const blob = dataUrlToBlob('data:image/gif;base64,' + Buffer.from('GIF89a!').toString('base64'))
  assert.equal(blob?.type, 'image/gif')
  assert.equal(await blob?.text(), 'GIF89a!')
  assert.equal(dataUrlToBlob('https://example.com/x.gif'), null)
  assert.equal(dataUrlToBlob('data:image/png;base64,***not base64***'), null)
})

// ---- The gallery of uploads ----

const summaryOf = (id: string, fields: Record<string, unknown> = {}) => ({
  id, name: `${id}.gif`, kind: 'animated', mime: 'image/gif', width: 800, height: 600,
  bytes: 1000, addedAt: 1, thumbUrl: 'data:image/webp;base64,UklGRg==', average: '#112233', vibrant: '#AA3344',
  ...fields,
})

test('normalizeUploads keeps well-formed entries and drops the rest', async () => {
  const { normalizeUploads } = await import('../src/core/wallpaper.ts')
  const list = normalizeUploads([
    summaryOf('up-a'),
    summaryOf('up-a', { name: 'duplicate' }),
    null,
    { name: 'no id' },
    summaryOf('up-b', { kind: 'exe', mime: 'text/html<script>', width: -5, average: 'red' }),
  ])
  assert.deepEqual(list.map((u) => u.id), ['up-a', 'up-b'])
  assert.equal(list[0].name, 'up-a.gif', 'the first entry for an id wins')
  assert.equal(list[0].vibrant, '#aa3344')
  assert.equal(list[1].kind, 'image')
  assert.equal(list[1].mime, '')
  assert.equal(list[1].width, 0)
  assert.equal(list[1].average, '')
  assert.deepEqual(normalizeUploads('nope'), [])
})

test('normalizeUploads only accepts thumbnails that are safe to put in CSS', async () => {
  const { normalizeUploads } = await import('../src/core/wallpaper.ts')
  const thumb = (thumbUrl: string) => normalizeUploads([summaryOf('up-a', { thumbUrl })])[0].thumbUrl
  assert.equal(thumb('data:image/webp;base64,UklGRg=='), 'data:image/webp;base64,UklGRg==')
  assert.equal(thumb('data:image/jpeg;base64,/9j/4A=='), 'data:image/jpeg;base64,/9j/4A==')
  assert.equal(thumb('https://example.com/t.webp'), '')
  assert.equal(thumb('data:image/webp;base64,AAAA") ; background: url("https://x'), '')
  assert.equal(thumb('data:image/svg+xml;base64,PHN2Zz4='), '')
  assert.equal(thumb(`data:image/webp;base64,${'A'.repeat(200_000)}`), '', 'nothing that big is a thumbnail')
})

test('withUpload puts an upload first, once', async () => {
  const { normalizeUploads, withUpload } = await import('../src/core/wallpaper.ts')
  const list = normalizeUploads([summaryOf('up-a'), summaryOf('up-b')])
  assert.deepEqual(withUpload(list, list[1]).map((u) => u.id), ['up-b', 'up-a'])
  assert.deepEqual(withUpload(list, normalizeUploads([summaryOf('up-c')])[0]).map((u) => u.id), ['up-c', 'up-a', 'up-b'])
})

test('pruneUploads drops the oldest, sparing the ones to keep', async () => {
  const { MAX_UPLOADS, normalizeUploads, pruneUploads } = await import('../src/core/wallpaper.ts')
  const list = normalizeUploads(Array.from({ length: MAX_UPLOADS + 2 }, (_, i) => summaryOf(`up-${i}`)))
  const last = `up-${MAX_UPLOADS + 1}`
  const { kept, removed } = pruneUploads(list, new Set([last]))
  assert.equal(kept.length, MAX_UPLOADS)
  assert.ok(kept.some((u) => u.id === last), 'kept although oldest')
  assert.deepEqual(removed.map((u) => u.id), [`up-${MAX_UPLOADS}`, `up-${MAX_UPLOADS - 1}`])
  assert.deepEqual(pruneUploads(list.slice(0, 2), new Set()).removed, [])
})

test('uploadBadge names what moves', async () => {
  const { uploadBadge } = await import('../src/core/wallpaper.ts')
  assert.equal(uploadBadge({ kind: 'animated', mime: 'image/gif' }), 'GIF')
  assert.equal(uploadBadge({ kind: 'animated', mime: 'image/webp' }), 'Animated')
  assert.equal(uploadBadge({ kind: 'video', mime: 'video/mp4' }), 'Video')
  assert.equal(uploadBadge({ kind: 'image', mime: 'image/webp' }), '')
})

test('refFromUpload points the settings at an upload, colours and all', async () => {
  const { normalizeUploads, refFromUpload } = await import('../src/core/wallpaper.ts')
  const { normalizeWallpaper } = await import('../src/core/settings.ts')
  const ref = refFromUpload(normalizeUploads([summaryOf('up-a')])[0])
  assert.deepEqual(normalizeWallpaper(ref), ref, 'already valid as settings')
  assert.equal(ref.source, 'upload')
  assert.equal(ref.uploadId, 'up-a')
  assert.equal(ref.average, '#112233')
})
