import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseJSONBlock, tryFindInText, parseInitialData, extractText, nodeText,
  channelHandlePath, fmtSec, parseCountText, continuationTokenOf,
  selectedTabContent, vidFromRenderer, vidFromLockup, commentsDisabledIn,
} from '../src/core/DataExtractor.ts'

// ---- parseJSONBlock: the hand-rolled brace matcher every feed depends on ----

test('parseJSONBlock: plain object', () => {
  assert.deepEqual(parseJSONBlock('{"a":1}', 0), { a: 1 })
})

test('parseJSONBlock: nested braces', () => {
  assert.deepEqual(parseJSONBlock('{"a":{"b":{"c":2}}}', 0), { a: { b: { c: 2 } } })
})

test('parseJSONBlock: braces inside a string are not counted', () => {
  assert.deepEqual(parseJSONBlock('{"a":"}{}{"}', 0), { a: '}{}{' })
})

test('parseJSONBlock: escaped quote inside a string', () => {
  assert.deepEqual(parseJSONBlock('{"a":"say \\"hi\\""}', 0), { a: 'say "hi"' })
})

test('parseJSONBlock: literal backslash right before the closing quote', () => {
  // The bug that was fixed: a naive `text[i-1] !== "\\"` check misreads this as an
  // escaped quote, never closes the string, and returns null.
  assert.deepEqual(parseJSONBlock('{"a":"C:\\\\"}', 0), { a: 'C:\\' })
})

test('parseJSONBlock: trailing content after the object is ignored', () => {
  assert.deepEqual(parseJSONBlock('{"a":1};window.x=2', 0), { a: 1 })
})

test('parseJSONBlock: unterminated object returns null', () => {
  assert.equal(parseJSONBlock('{"a":1', 0), null)
})

test('parseJSONBlock: apostrophe inside a double-quoted string', () => {
  assert.deepEqual(parseJSONBlock('{"t":"Don\'t stop"}', 0), { t: "Don't stop" })
})

// ---- tryFindInText / parseInitialData ----

test('tryFindInText: finds window.X = {...}', () => {
  assert.deepEqual(tryFindInText('window.ytInitialData = {"a":1};', 'ytInitialData'), { a: 1 })
})

test('tryFindInText: finds var X = {...}', () => {
  assert.deepEqual(tryFindInText('var ytInitialData = {"a":2};', 'ytInitialData'), { a: 2 })
})

test('tryFindInText: absent name returns null', () => {
  assert.equal(tryFindInText('nothing here', 'ytInitialData'), null)
})

test('parseInitialData: real-world shape with a title containing braces', () => {
  const html = '<script>window.ytInitialData = {"t":"a } b { c"};</script>'
  assert.deepEqual(parseInitialData(html), { t: 'a } b { c' })
})

// ---- channelHandlePath: the fix for the broken channel link ----

test('channelHandlePath: absolute vanity URL becomes a path', () => {
  assert.equal(channelHandlePath('http://www.youtube.com/@Name'), '/@Name')
})

test('channelHandlePath: https and no www', () => {
  assert.equal(channelHandlePath('https://youtube.com/@Name'), '/@Name')
})

test('channelHandlePath: already a path is unchanged', () => {
  assert.equal(channelHandlePath('/@Name'), '/@Name')
})

test('channelHandlePath: non-strings are empty', () => {
  assert.equal(channelHandlePath(undefined), '')
  assert.equal(channelHandlePath(null), '')
  assert.equal(channelHandlePath(''), '')
  assert.equal(channelHandlePath(42), '')
})

// ---- fmtSec ----

test('fmtSec: under a minute', () => {
  assert.equal(fmtSec(0), '0:00')
  assert.equal(fmtSec(9), '0:09')
  assert.equal(fmtSec(59), '0:59')
})

test('fmtSec: minutes and hours', () => {
  assert.equal(fmtSec(60), '1:00')
  assert.equal(fmtSec(3599), '59:59')
  assert.equal(fmtSec(3600), '1:00:00')
  assert.equal(fmtSec(3661), '1:01:01')
})

// ---- parseCountText ----

test('parseCountText: plain integers', () => {
  assert.equal(parseCountText('42'), '42')
  assert.equal(parseCountText('1,234'), '1.2K')
})

test('parseCountText: abbreviations round-trip', () => {
  assert.equal(parseCountText('1.2K'), '1.2K')
  assert.equal(parseCountText('3M'), '3M')
})

test('parseCountText: junk is empty', () => {
  assert.equal(parseCountText(''), '')
  assert.equal(parseCountText('no digits'), '')
})

// ---- continuationTokenOf: both shapes, the playlist paging fix ----

test('continuationTokenOf: classic renderer shape', () => {
  const node = { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'AAA' } } } }
  assert.equal(continuationTokenOf(node), 'AAA')
})

test('continuationTokenOf: modern viewModel shape (double-nested)', () => {
  const node = { continuationItemViewModel: { continuationCommand: { innertubeCommand: { continuationCommand: { token: 'BBB' } } } } }
  assert.equal(continuationTokenOf(node), 'BBB')
})

test('continuationTokenOf: button fallback shape', () => {
  const node = { continuationItemRenderer: { button: { buttonRenderer: { command: { continuationCommand: { token: 'CCC' } } } } } }
  assert.equal(continuationTokenOf(node), 'CCC')
})

test('continuationTokenOf: nothing there', () => {
  assert.equal(continuationTokenOf(null), null)
  assert.equal(continuationTokenOf({}), null)
  assert.equal(continuationTokenOf({ continuationItemRenderer: {} }), null)
})

// ---- selectedTabContent: the channel-page pagination fix ----

test('selectedTabContent: prefers the selected tab, not tabs[0]', () => {
  const data = { contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { selected: false, content: { home: true } } },
    { tabRenderer: { selected: true, content: { videos: true } } },
  ] } } }
  assert.deepEqual(selectedTabContent(data), { videos: true })
})

test('selectedTabContent: falls back to tabs[0] when none marked selected', () => {
  const data = { contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { content: { first: true } } },
  ] } } }
  assert.deepEqual(selectedTabContent(data), { first: true })
})

test('selectedTabContent: missing structure is null, not a throw', () => {
  assert.equal(selectedTabContent({}), null)
  assert.equal(selectedTabContent(null), null)
})

// ---- extractText / nodeText ----

test('extractText: handles the shapes YouTube actually uses', () => {
  assert.equal(extractText('plain'), 'plain')
  assert.equal(extractText({ simpleText: 'simple' }), 'simple')
  assert.equal(extractText({ content: 'content' }), 'content')
  assert.equal(extractText({ runs: [{ text: 'run' }] }), 'run')
  assert.equal(extractText(null), '')
  assert.equal(extractText(undefined), '')
})

test('nodeText: joins all runs, not just the first', () => {
  assert.equal(nodeText({ runs: [{ text: 'a' }, { text: 'b' }] }), 'ab')
})

test('extractText: joins every run, matching nodeText', () => {
  // Was runs[0] only, which truncated any text YouTube split at a formatting boundary.
  assert.equal(extractText({ runs: [{ text: 'a' }, { text: 'b' }] }), 'ab')
})

// ---- vidFromRenderer ----

test('vidFromRenderer: maps a normal videoRenderer', () => {
  const v = vidFromRenderer({
    videoId: 'abc12345678',
    title: { runs: [{ text: 'Title' }] },
    ownerText: { runs: [{ text: 'Chan', navigationEndpoint: { browseEndpoint: { browseId: 'UC1' } } }] },
    viewCountText: { simpleText: '1.2M views' },
    publishedTimeText: { simpleText: '2 days ago' },
    lengthText: { simpleText: '10:30' },
  })
  assert.equal(v?.id, 'abc12345678')
  assert.equal(v?.title, 'Title')
  assert.equal(v?.channel, 'Chan')
  assert.equal(v?.channelId, 'UC1')
  assert.equal(v?.url, '/watch?v=abc12345678')
  assert.equal(v?.duration, '10:30')
})

test('vidFromRenderer: no videoId is null', () => {
  assert.equal(vidFromRenderer({}), null)
  assert.equal(vidFromRenderer(null), null)
})

test('vidFromRenderer: live badge detected', () => {
  const v = vidFromRenderer({
    videoId: 'x', title: { runs: [{ text: 'T' }] },
    badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW' } }],
  })
  assert.equal(v?.live, true)
})

// ---- vidFromLockup ----

test('vidFromLockup: requires contentId and metadata', () => {
  assert.equal(vidFromLockup({}), null)
  assert.equal(vidFromLockup({ contentId: 'x' }), null)
})

test('vidFromLockup: pulls title, channel, views, published', () => {
  const v = vidFromLockup({
    contentId: 'vid1',
    metadata: { lockupMetadataViewModel: {
      title: { content: 'Lockup Title' },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: 'Creator' } }] },
        { metadataParts: [{ text: { content: '379K views • 3 days ago' } }] },
      ] } },
    } },
  })
  assert.equal(v?.title, 'Lockup Title')
  assert.equal(v?.channel, 'Creator')
  assert.equal(v?.views, '379K views')
  assert.equal(v?.published, '3 days ago')
})

// ---- comments off vs. nobody commented yet ----

test('commentsDisabledIn: messageRenderer in the comment item section', () => {
  assert.equal(commentsDisabledIn({
    contents: { itemSectionRenderer: { sectionIdentifier: 'comment-item-section', contents: [{ messageRenderer: {} }] } },
  }), true)
})

test('commentsDisabledIn: messageRenderer as the whole continuation payload', () => {
  assert.equal(commentsDisabledIn({
    onResponseReceivedEndpoints: [{ reloadContinuationItemsCommand: { continuationItems: [{ messageRenderer: {} }] } }],
  }), true)
})

test('commentsDisabledIn: real threads are not "off"', () => {
  assert.equal(commentsDisabledIn({
    onResponseReceivedEndpoints: [{ reloadContinuationItemsCommand: { continuationItems: [{ commentThreadRenderer: {} }, { messageRenderer: {} }] } }],
  }), false)
  assert.equal(commentsDisabledIn({
    contents: { itemSectionRenderer: { sectionIdentifier: 'comment-item-section', contents: [{ commentThreadRenderer: {} }] } },
  }), false)
})
