import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contrast, ensureContrast, fromHsl, isHex, mix, normalizeHex, paletteFromPixels,
  parseHex, readableOn, rgba, toHsl,
} from '../src/core/color.ts'

test('parseHex reads both short and long forms', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(parseHex('#1D1d1d'), { r: 29, g: 29, b: 29 })
  assert.throws(() => parseHex('red'))
})

test('isHex accepts only #rgb and #rrggbb', () => {
  assert.equal(isHex('#abc'), true)
  assert.equal(isHex('#aabbcc'), true)
  assert.equal(isHex('#aabbccdd'), false)
  assert.equal(isHex('aabbcc'), false)
  assert.equal(isHex(42), false)
})

test('normalizeHex lower-cases and expands', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc')
})

test('mix interpolates and clamps t', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080')
  assert.equal(mix('#000000', '#ffffff', -1), '#000000')
  assert.equal(mix('#000000', '#ffffff', 2), '#ffffff')
})

test('rgba formats with clamped alpha', () => {
  assert.equal(rgba('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)')
  assert.equal(rgba('#ff0000', 3), 'rgba(255, 0, 0, 1)')
})

test('contrast matches the WCAG reference values', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21)
  assert.equal(contrast('#777777', '#777777'), 1)
  // Symmetric.
  assert.equal(contrast('#123456', '#fedcba'), contrast('#fedcba', '#123456'))
})

test('ensureContrast leaves a legible colour alone', () => {
  assert.equal(ensureContrast('#000000', '#ffffff', 4.5), '#000000')
})

test('ensureContrast lifts a dim accent until it clears the bar', () => {
  // GNOME purple on Notion-dark reads at ~3:1 as text.
  const fixed = ensureContrast('#9141ac', '#191919', 4.5)
  assert.ok(contrast(fixed, '#191919') >= 4.5, `${fixed} is still too dim`)
  // ...and only as far as needed: it stays recognisably purple rather than going white.
  const { s } = toHsl(fixed)
  assert.ok(s > 0.2, `${fixed} lost its hue`)
})

test('ensureContrast darkens on light backgrounds', () => {
  const fixed = ensureContrast('#c88800', '#ffffff', 4.5)
  assert.ok(contrast(fixed, '#ffffff') >= 4.5)
})

test('readableOn picks the legible text colour for a fill', () => {
  assert.equal(readableOn('#ffffff'), '#111111')
  assert.equal(readableOn('#1d1d1d'), '#ffffff')
  assert.equal(readableOn('#fabd2f'), '#111111')
})

test('HSL round-trips', () => {
  for (const hex of ['#3584e4', '#e62d42', '#3a944a', '#808080', '#000000', '#ffffff']) {
    assert.equal(fromHsl(toHsl(hex)), hex)
  }
})

function pixels(...colors: [number, number, number, number][]): number[] {
  return colors.flat()
}

test('paletteFromPixels averages opaque pixels only', () => {
  const data = pixels([255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 0])
  assert.equal(paletteFromPixels(data).average, '#800080')
})

test('paletteFromPixels picks the dominant vivid hue, not the muddy mean', () => {
  const red = [220, 40, 40, 255] as [number, number, number, number]
  const grey = [120, 120, 120, 255] as [number, number, number, number]
  const blue = [40, 60, 210, 255] as [number, number, number, number]
  const data = pixels(red, red, red, grey, grey, grey, grey, blue)
  const { vibrant } = paletteFromPixels(data)
  const { h } = toHsl(vibrant)
  assert.ok(h < 20 || h > 340, `expected a red, got ${vibrant}`)
})

test('paletteFromPixels falls back to the average for greyscale images', () => {
  const data = pixels([30, 30, 30, 255], [200, 200, 200, 255])
  const { average, vibrant } = paletteFromPixels(data)
  assert.equal(vibrant, average)
})

test('paletteFromPixels survives an empty or fully transparent image', () => {
  assert.deepEqual(paletteFromPixels([]), { average: '#808080', vibrant: '#808080' })
  assert.deepEqual(paletteFromPixels([0, 0, 0, 0]), { average: '#808080', vibrant: '#808080' })
})
