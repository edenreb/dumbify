import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fmtSec, parseCountText, channelHandlePath, extractText, parseJSONBlock,
  vidFromLockup,
} from '../src/core/DataExtractor.ts'

// These assert what the code SHOULD do on hostile/degenerate input.
// A failure here is a real defect, not a broken test.

test('BUG PROBE fmtSec: NaN must not render as "NaN:NaN"', () => {
  // extractWatchData calls fmtSec(parseInt(d.lengthSeconds ?? '0')). A non-numeric
  // lengthSeconds makes parseInt return NaN and this reaches the UI verbatim.
  const out = fmtSec(NaN)
  assert.ok(!out.includes('NaN'), `duration rendered as "${out}"`)
})

test('BUG PROBE fmtSec: negative seconds render as nothing, not "-1:-1:-1"', () => {
  const out = fmtSec(-1)
  assert.ok(out === '' || /^\d+:\d{2}(:\d{2})?$/.test(out), `duration rendered as "${out}"`)
})

test('BUG PROBE fmtSec: fractional seconds must not leak decimals', () => {
  const out = fmtSec(90.7)
  assert.ok(/^\d+:\d{2}$/.test(out), `duration rendered as "${out}"`)
})

test('BUG PROBE extractText: a multi-run title must not be truncated', () => {
  // YouTube splits text across runs when any part carries formatting or a link.
  // extractChannelHeader passes runs-shaped values straight into extractText.
  const out = extractText({ runs: [{ text: 'Part One ' }, { text: 'Part Two' }] })
  assert.equal(out, 'Part One Part Two')
})

test('BUG PROBE channelHandlePath: a look-alike host must not be silently stripped', () => {
  // Consumers do `https://www.youtube.com` + handle. If the prefix is stripped from a
  // look-alike host the result is a link to www.youtube.comevil.com.
  const out = channelHandlePath('https://www.youtube.comevil.com/@x')
  assert.ok(
    out === '' || out.startsWith('/'),
    `produced ${JSON.stringify(out)}, which concatenates into https://www.youtube.com${out}`
  )
})

test('BUG PROBE parseCountText: a plain zero should survive', () => {
  assert.equal(parseCountText('0'), '0')
})

test('BUG PROBE parseCountText: sub-thousand values keep their exact value', () => {
  assert.equal(parseCountText('999'), '999')
  assert.equal(parseCountText('42 comments'), '42')
})

test('BUG PROBE parseJSONBlock: a unicode-escaped quote must not end the string', () => {
  assert.deepEqual(parseJSONBlock('{"a":"\\u0022inner\\u0022"}', 0), { a: '"inner"' })
})

test('BUG PROBE vidFromLockup: "1,234 views" is a view count', () => {
  const v = vidFromLockup({
    contentId: 'v',
    metadata: { lockupMetadataViewModel: {
      title: { content: 'T' },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: 'Creator' } }] },
        { metadataParts: [{ text: { content: '1,234 views' } }] },
      ] } },
    } },
  })
  assert.equal(v?.views, '1,234 views')
})

test('BUG PROBE vidFromLockup: a title that is only whitespace is not a valid video', () => {
  const v = vidFromLockup({
    contentId: 'v',
    metadata: { lockupMetadataViewModel: { title: { content: '   ' } } },
  })
  assert.equal(v, null, 'a whitespace-only title should not produce a video row')
})
