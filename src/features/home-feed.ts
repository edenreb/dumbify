import type { NavigationState, Video, Channel, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, renderNotFound, makeClickable, scroller, onAppearance, emptyState } from '../core/UIEngine'
import { extractPageError, extractPageVideosWithContinuation, fetchContinuation, fetchSearchResults, fetchChannelPage, fetchChannelPlaylists, fetchUserPlaylists, fetchLikedPlaylist, fetchPlaylistPage, setChannelSubscription } from '../core/DataExtractor'
import type { SearchItem, PlaylistItem } from '../core/DataExtractor'
import { navigateTo, linkTo } from '../core/PageManager'
import { wantsNewTab } from '../core/links'
import { h, avatar } from '../ui/dom'
import { UI_LOCALE } from '../ui/routes'
import { icon, type IconName } from '../ui/icons'
import { setCrumbs } from './shell'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseRelativeDate(text: string): number {
  if (!text) return 0
  const lower = text.toLowerCase()
  const numMatch = lower.match(/(\d+)\s*(?:second|minute|hour|day|week|month|year)/)
  const num = numMatch ? parseInt(numMatch[1], 10) : 0
  if (/second|minute/.test(lower)) return 0
  if (/hour/.test(lower)) return 0
  if (/day/.test(lower)) return num <= 1 ? 1 : num
  if (/week/.test(lower)) return num * 7
  if (/month/.test(lower)) return num * 30
  if (/year/.test(lower)) return num * 365
  // Absolute date like "Jan 1, 2026"
  const parsed = new Date(text)
  if (!isNaN(parsed.getTime())) {
    const diff = (Date.now() - parsed.getTime()) / 86400000
    return Math.max(0, Math.round(diff))
  }
  return 0
}

function dateBucket(published: string): string {
  if (!published) return 'Unknown'
  const days = parseRelativeDate(published)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Past week'
  if (days <= 30) return 'Past month'
  // Try to extract a month name from the published string
  for (const m of MONTH_NAMES) {
    if (published.toLowerCase().includes(m.toLowerCase())) return m
  }
  // Fallback: more than 30 days ago
  const match = published.match(/(\w+)\s+\d{1,2},\s*\d{4}/)
  if (match) return match[1]
  return 'Older'
}

function groupVideosByDate(videos: Video[]): Map<string, Video[]> {
  const groups = new Map<string, Video[]>()
  const age = new Map<string, number>()
  const order = ['Today', 'Yesterday', 'Past week', 'Past month']
  for (const v of videos) {
    const bucket = dateBucket(v.published)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket)!.push(v)
    const days = parseRelativeDate(v.published)
    age.set(bucket, Math.min(age.get(bucket) ?? Infinity, days))
  }
  // Named buckets first, then the older ones newest-first. They used to sort
  // alphabetically, which put April ahead of March whatever the year.
  const sorted = new Map<string, Video[]>()
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!)
  }
  const remaining = [...groups.keys()]
    .filter((k) => !order.includes(k) && k !== 'Unknown' && k !== 'Older')
    .sort((a, b) => (age.get(a) ?? 0) - (age.get(b) ?? 0))
  for (const key of remaining) sorted.set(key, groups.get(key)!)
  if (groups.has('Older')) sorted.set('Older', groups.get('Older')!)
  if (groups.has('Unknown')) sorted.set('Unknown', groups.get('Unknown')!)
  return sorted
}

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

interface PageInfo {
  icon: IconName
  title: string
  sub: string
}

// Worked out per render, not at module load: the home page's date used to be frozen at
// whenever the content script first ran, so a tab left open overnight showed yesterday.
function pageInfo(nav: NavigationState): PageInfo | null {
  switch (nav.route) {
    case 'home':
      return {
        icon: 'home',
        title: greeting(),
        sub: `${new Date().toLocaleDateString(UI_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })} · Recommended for you`,
      }
    case 'subscriptions':
      return { icon: 'subscriptions', title: 'Subscriptions', sub: 'The latest from channels you follow' }
    case 'history':
      return { icon: 'history', title: 'History', sub: 'Everything you’ve watched, most recent first' }
    case 'watch-later':
      return { icon: 'clock', title: 'Watch later', sub: 'Videos you saved for later' }
    case 'liked':
      return { icon: 'thumb', title: 'Liked videos', sub: 'Everything you’ve given a thumbs up' }
    case 'playlists':
      return { icon: 'playlists', title: 'Playlists', sub: 'Playlists you made or saved' }
    case 'playlist':
      return { icon: 'playlists', title: 'Playlist', sub: '' }
    case 'search':
      return {
        icon: 'search',
        title: nav.searchQuery ? `“${nav.searchQuery}”` : 'Search',
        sub: 'Search results',
      }
    default:
      return null
  }
}

const EMPTY_COPY: Partial<Record<Route, [IconName, string, string]>> = {
  home: ['home', 'No recommendations right now', 'YouTube didn’t send any. Try reloading the page.'],
  subscriptions: ['subscriptions', 'No new videos', 'Nothing new from the channels you follow.'],
  history: ['history', 'No watch history yet', 'Videos you watch will show up here.'],
  'watch-later': ['clock', 'Nothing saved for later', 'Use Save on any video to add it here.'],
  liked: ['thumb', 'No liked videos', 'Videos you like will show up here.'],
  playlists: ['playlists', 'No playlists yet', ''],
  playlist: ['playlists', 'This playlist is empty', ''],
  search: ['search', 'No results', 'Try different words.'],
  channel: ['film', 'No videos', 'This channel hasn’t posted anything here.'],
}

// Subscriptions is the only feed with a working toolbar - its options are wired to a
// real filter. History and Watch Later had one too, but nothing ever read the selected
// value, so they were labels that looked like controls.
const TOOLBAR_OPTIONS: Partial<Record<Route, string[]>> = {
  subscriptions: ['All', 'Today', 'Yesterday', 'Past week', 'Past month', 'By creator'],
}

function renderPageHead(nav: NavigationState) {
  const info = pageInfo(nav)
  if (!info) return
  content!.appendChild(h('header', { class: 'df-page-head', id: 'df-page-head' },
    h('div', { class: 'df-page-head-body' },
      h('div', { class: 'df-page-icon', 'aria-hidden': 'true' }, icon(info.icon)),
      h('h1', { class: 'df-page-title', text: info.title }),
      info.sub ? h('p', { class: 'df-page-sub', text: info.sub }) : h('p', { class: 'df-page-sub', hidden: true }),
    ),
  ))
}

function updatePageHead(overrides: { title?: string; sub?: string }) {
  const head = document.getElementById('df-page-head')
  if (!head) return
  const title = head.querySelector('.df-page-title')
  if (title && overrides.title) title.textContent = overrides.title
  const sub = head.querySelector<HTMLElement>('.df-page-sub')
  if (sub && overrides.sub !== undefined) {
    sub.textContent = overrides.sub
    sub.hidden = !overrides.sub
  }
}

function renderToolbar(route: Route, onOption?: (option: string) => void): HTMLElement | null {
  const options = TOOLBAR_OPTIONS[route]
  if (!options) return null

  const bar = h('div', { class: 'df-toolbar', role: 'toolbar', 'aria-label': 'Filter' })
  options.forEach((o, i) => {
    const chip = h('span', { class: i === 0 ? 'df-chip df-active' : 'df-chip', text: o, 'aria-pressed': String(i === 0) })
    if (onOption) {
      makeClickable(chip, () => {
        bar.querySelectorAll('.df-chip').forEach((el) => {
          el.classList.remove('df-active')
          el.setAttribute('aria-pressed', 'false')
        })
        chip.classList.add('df-active')
        chip.setAttribute('aria-pressed', 'true')
        onOption(o)
      })
    }
    bar.appendChild(chip)
  })

  content!.appendChild(bar)
  return bar
}

// Channel names inside a row are a second link inside the row's own <a>. A plain
// left click goes to the channel; the same gestures that open the row in a new tab open
// the channel in one.
function channelLabel(v: Video): HTMLElement {
  if (!v.channelId) return h('span', { class: 'df-item-channel', text: v.channel })
  const path = `/channel/${v.channelId}`
  const el = h('span', { class: 'df-item-channel df-item-channel-link', role: 'link', tabindex: '0', text: v.channel })
  // Absolute on purpose: a content script's window.open resolves a bare path against
  // the extension's own origin, which opened an error page.
  const openInTab = () => window.open(new URL(path, location.origin).href, '_blank', 'noopener')
  el.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (wantsNewTab(e)) openInTab()
    else navigateTo(path)
  })
  el.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return
    e.preventDefault()
    e.stopPropagation()
    openInTab()
  })
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    navigateTo(path)
  })
  return el
}

function renderVideo(v: Video): HTMLElement {
  const row = h('a', { class: 'df-item-row' })
  linkTo(row, v.url)

  const title = h('span', { class: 'df-item-title', text: v.title })

  // Fixed order - channel, views, date - and absent fields simply not rendered, so the
  // separators (drawn in CSS) never leave a gap or a stray dot.
  const meta = h('span', { class: 'df-item-meta' })
  if (v.channel) meta.appendChild(channelLabel(v))
  if (v.views) meta.appendChild(h('span', { class: 'df-item-views', text: v.views }))
  if (v.published) meta.appendChild(h('span', { class: 'df-item-date', text: v.published }))

  row.append(
    h('span', { class: 'df-item-number', 'aria-hidden': 'true' }),
    h('span', { class: 'df-item-body' }, title, meta),
    // Live streams have no length, and a badge inside the title was cut off by the
    // table layout's ellipsis - the length slot carries it instead.
    v.live
      ? h('span', { class: 'df-item-duration df-item-live', text: 'Live' })
      : h('span', { class: 'df-item-duration', text: v.duration }),
  )
  return row
}

function renderPlaylistRow(p: PlaylistItem): HTMLElement {
  const row = h('a', { class: 'df-item-row' })
  linkTo(row, p.url)
  const meta = h('span', { class: 'df-item-meta' })
  if (p.videoCount) meta.appendChild(h('span', { class: 'df-item-count', text: p.videoCount }))
  row.append(
    h('span', { class: 'df-item-number', 'aria-hidden': 'true' }),
    h('span', { class: 'df-item-body' }, h('span', { class: 'df-item-title', text: p.title }), meta),
    h('span', { class: 'df-item-duration' }),
  )
  return row
}

function skeletonRows(n = 8): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (let i = 0; i < n; i++) {
    frag.appendChild(h('div', { class: 'df-item-row df-skeleton', 'aria-hidden': 'true' },
      h('span', { class: 'df-item-number' }),
      h('span', { class: 'df-item-body' }, h('span', { class: 'df-skel df-skel-title' }), h('span', { class: 'df-skel df-skel-meta' })),
      h('span', { class: 'df-skel df-skel-dur' }),
    ))
  }
  return frag
}

/** Column labels for the table layout; only visible there. */
function tableHead(): HTMLElement {
  return h('div', { class: 'df-table-head', 'aria-hidden': 'true' },
    h('span'), h('span', { text: 'Title' }), h('span', { text: 'Channel' }),
    h('span', { text: 'Views' }), h('span', { text: 'Published' }), h('span', { text: 'Length' }),
  )
}

function dateGroup(label: string): { group: HTMLElement; count: HTMLElement } {
  const count = h('span', { class: 'df-group-count' })
  const group = h('div', { class: 'df-date-group' },
    h('div', { class: 'df-date-group-header', role: 'heading', 'aria-level': '2' }, h('span', { text: label }), count),
  )
  return { group, count }
}

function channelMeta(ch: Channel): string {
  return [ch.subscribers, ch.videoCount].filter(Boolean).join(' · ')
}

function channelName(ch: Channel, className: string): HTMLElement {
  const name = h('span', { class: className, text: ch.name })
  if (ch.verified) {
    name.append(icon('verified', 'df-icon df-verified'), h('span', { class: 'df-sr-only', text: 'Verified' }))
  }
  return name
}

function renderChannelCard(ch: Channel, banner = false): HTMLElement {
  const card = h('a', { class: banner ? 'df-channel-card df-channel-banner' : 'df-channel-card' })
  linkTo(card, `/channel/${ch.id}`)
  const body = h('span', { class: 'df-channel-card-body' },
    channelName(ch, 'df-channel-card-name'),
    h('span', { class: 'df-channel-card-meta', text: channelMeta(ch) || 'Channel' }),
  )
  if (ch.description) body.appendChild(h('span', { class: 'df-channel-card-desc', text: ch.description }))
  card.append(avatar(ch.name), body, icon('chevron'))
  return card
}

function renderChannelBanner(ch: Channel, before?: HTMLElement) {
  const banner = renderChannelCard(ch, true)
  if (before && before.parentNode) before.parentNode.insertBefore(banner, before)
  else content!.appendChild(banner)
}

// Clicking the real native subscribe control (directly, or via a fully-simulated
// pointerdown/pointerup/click sequence) reliably opens YouTube's own UI but never
// actually performs the subscribe/unsubscribe mutation - confirmed independently
// against real youtube.com in a separate, un-extended browser. That combination (a
// synthetic gesture can open menus, but not trigger the account mutation) points at
// something no amount of event simulation can satisfy: the browser's native
// user-activation state, which only real hardware input can set and which
// dispatchEvent()/.click() never do. So instead of clicking anything, call the same
// InnerTube endpoint the native button calls directly - the same authenticated-POST
// technique already used elsewhere in this codebase for posting comments - using
// subscribeEndpoint/unsubscribeEndpoint params extracted from the channel page's own
// data (DataExtractor.extractSubscriptionInfo). This is how Dumbify's subscribe
// feature originally worked before being replaced with DOM-clicking; that replacement
// was because param extraction was unreliable, not because the API call failed, so the
// path forward is fixing extraction (already done - see extractSubscriptionInfo's
// comment) rather than continuing to chase click simulation.
function setSubUi(btn: HTMLButtonElement, subscribed: boolean, name: string) {
  btn.classList.toggle('df-on', subscribed)
  btn.classList.toggle('df-btn-primary', !subscribed)
  btn.replaceChildren(subscribed ? icon('check') : icon('plus'), subscribed ? 'Subscribed' : 'Subscribe')
  btn.setAttribute('aria-label', subscribed ? `Unsubscribe from ${name}` : `Subscribe to ${name}`)
  btn.title = subscribed ? 'Click to unsubscribe' : ''
}

interface SubUiState {
  subscribed: boolean
  subParams: string
  unsubParams: string
}

// The channel JSON's subscribeState.subscribed flags aren't reliable live-state
// signals (see DataExtractor.extractSubscriptionInfo's comment - confirmed live that
// both button-content variants carry the same state key but disagree on the boolean,
// meaning they're static per-variant template defaults). The one place that DOES
// reflect real current state is the actual rendered header control: it wraps a
// <yt-subscribe-button-view-model> only when subscribed (confirmed live), and a bare
// button with aria-label "Subscribe" when not. This is read-only - never clicked - so
// none of the user-activation concerns that sank the click-based approach apply here.
const SUBSCRIBED_HEADER_SELECTOR = [
  'yt-page-header-view-model yt-subscribe-button-view-model',
  'ytd-c4-tabbed-header-renderer yt-subscribe-button-view-model',
  '#channel-header yt-subscribe-button-view-model',
].join(', ')

const UNSUBSCRIBED_HEADER_SELECTOR = [
  'yt-page-header-view-model button[aria-label^="Subscribe" i]',
  'ytd-c4-tabbed-header-renderer button[aria-label^="Subscribe" i]',
  '#channel-header button[aria-label^="Subscribe" i]',
].join(', ')

function detectRealSubscribedState(): boolean | null {
  if (document.querySelector(SUBSCRIBED_HEADER_SELECTOR)) return true
  if (document.querySelector(UNSUBSCRIBED_HEADER_SELECTOR)) return false
  return null
}

// Polls briefly for the real header to render (it's the underlying YouTube page,
// which loads independently of Dumbify's own fetch), then applies whichever state it
// finds. Never clicks anything - purely a one-time read to correct the initial label.
function applyRealSubscribedState(btn: HTMLButtonElement, state: SubUiState, name: string) {
  let tries = 0
  const poll = window.setInterval(() => {
    tries++
    const real = detectRealSubscribedState()
    if (real !== null) {
      window.clearInterval(poll)
      state.subscribed = real
      setSubUi(btn, real, name)
    } else if (tries >= 15) {
      window.clearInterval(poll)
      console.warn('[Dumbify] could not detect real subscribed state from header; leaving initial guess')
    }
  }, 200)
}

async function handleSubscribeClick(btn: HTMLButtonElement, ch: Channel, state: SubUiState) {
  const wantSubscribe = !state.subscribed
  const params = wantSubscribe ? state.subParams : state.unsubParams
  if (!params) {
    console.warn(
      `[Dumbify] no ${wantSubscribe ? 'subscribe' : 'unsubscribe'} params extracted for channel ${ch.id}; cannot ${wantSubscribe ? 'subscribe' : 'unsubscribe'} (not signed in, or YouTube's data shape changed)`
    )
    btn.replaceChildren('Sign in to subscribe')
    window.setTimeout(() => setSubUi(btn, state.subscribed, ch.name), 1500)
    return
  }
  btn.disabled = true
  setSubUi(btn, wantSubscribe, ch.name)
  const ok = await setChannelSubscription(ch.id, wantSubscribe, params)
  btn.disabled = false
  if (ok) {
    state.subscribed = wantSubscribe
  } else {
    console.warn(`[Dumbify] ${wantSubscribe ? 'subscribe' : 'unsubscribe'} request failed for channel ${ch.id}`)
    setSubUi(btn, state.subscribed, ch.name)
  }
}

function renderChannelHead(ch: Channel, videos: Video[], before?: HTMLElement) {
  const head = h('header', { class: 'df-channel-head' })
  head.appendChild(avatar(ch.name))

  // handle is a path: "/@Name" for a channel with a handle, "/channel/UC..." without one.
  // Only the handle form is worth showing.
  const handleName = ch.handle.match(/@([^/]+)/)?.[1]
  const count = ch.videoCount || (videos.length ? `${videos.length}+ videos` : '')
  const meta = [handleName ? `@${handleName}` : '', ch.subscribers, count].filter(Boolean).join(' · ')

  const title = h('h1', { class: 'df-page-title' }, ch.name)
  if (ch.verified) title.append(icon('verified', 'df-icon df-verified'), h('span', { class: 'df-sr-only', text: 'Verified' }))

  const body = h('div', { class: 'df-channel-head-body' }, title)
  if (meta) body.appendChild(h('div', { class: 'df-channel-meta', text: meta }))
  if (ch.description) body.appendChild(h('p', { class: 'df-channel-desc', text: ch.description }))
  head.appendChild(body)

  if (ch.id) {
    const subBtn = h('button', { class: 'df-btn', type: 'button' })
    const subState: SubUiState = {
      subscribed: ch.subscribed === true,
      subParams: ch.subParams ?? '',
      unsubParams: ch.unsubParams ?? '',
    }
    setSubUi(subBtn, subState.subscribed, ch.name)
    subBtn.onclick = () => handleSubscribeClick(subBtn, ch, subState)
    head.appendChild(h('div', { class: 'df-page-aside' }, subBtn))
    applyRealSubscribedState(subBtn, subState, ch.name)
  }

  if (before && before.parentNode) before.parentNode.insertBefore(head, before)
  else content!.appendChild(head)
}

function parseViews(v: string): number {
  const m = v.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?\s*(?:views?)?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return 0
  const mult = m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1
  return n * mult
}

// History interleaves whole Shorts shelves with regular videos, and YouTube collapses
// each shelf into one row. We listed every Short individually, so an afternoon of them
// buried the video you actually wanted. Each run of consecutive Shorts becomes one
// <details> that reads as an ordinary row - native disclosure, no JS state to keep,
// collapsed by default.
// The Shorts glyph, drawn rather than fetched: an <img> cannot take the reading
// colour, and this has to be whatever ink the page is set to.
//
// Two identical capsules, both tilted 30 degrees and stacked with an overlap, are what
// make this read as Shorts. A single rounded rectangle - the first attempt - just read
// as a play button in a box.
//
// The arrow is a mask rather than an evenodd hole in the same path, because the two
// capsules overlap: an evenodd hole cancels itself out exactly where they cross, which
// is where the arrow sits.
const SHORTS_CAPSULE =
  'M-3.55 -4.7L3.55 -4.7A4.7 4.7 0 0 1 3.55 4.7L-3.55 4.7A4.7 4.7 0 0 1 -3.55 -4.7Z'

// Cropped to the glyph, so the mark needs no centring of its own inside the box.
const SHORTS_VIEWBOX = { x: 1.73, y: 0.93, w: 16.55, h: 22.15 }

// A page can hold several bundles and every mask needs its own id.
let shortsIconSeq = 0

function shortsIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const { x, y, w, h: height } = SHORTS_VIEWBOX
  const maskId = `df-shorts-mask-${++shortsIconSeq}`

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'df-shorts-icon')
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${height}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const mask = document.createElementNS(NS, 'mask')
  mask.setAttribute('id', maskId)
  const lit = document.createElementNS(NS, 'rect')
  lit.setAttribute('x', String(x))
  lit.setAttribute('y', String(y))
  lit.setAttribute('width', String(w))
  lit.setAttribute('height', String(height))
  lit.setAttribute('fill', '#fff')
  const arrow = document.createElementNS(NS, 'path')
  arrow.setAttribute('d', 'M6.9 7.7L6.9 16.3L13.7 12Z')
  arrow.setAttribute('fill', '#000')
  mask.appendChild(lit)
  mask.appendChild(arrow)
  svg.appendChild(mask)

  const body = document.createElementNS(NS, 'g')
  body.setAttribute('mask', `url(#${maskId})`)
  body.setAttribute('fill', 'currentColor')
  for (const at of ['translate(10.5,7.4) rotate(-30)', 'translate(9.5,16.6) rotate(-30)']) {
    const cap = document.createElementNS(NS, 'path')
    cap.setAttribute('transform', at)
    cap.setAttribute('d', SHORTS_CAPSULE)
    body.appendChild(cap)
  }
  svg.appendChild(body)
  return svg
}

function shortsBundle(): HTMLElement {
  const summary = h('summary', { class: 'df-item-row df-shorts-summary' },
    h('span', { class: 'df-item-number' }, shortsIcon()),
    h('span', { class: 'df-item-body' },
      h('span', { class: 'df-item-title', text: 'Shorts' }),
      h('span', { class: 'df-item-meta' }, h('span', { class: 'df-item-count df-shorts-count' })),
    ),
    h('span', { class: 'df-shorts-arrow', 'aria-hidden': 'true' }, icon('chevron')),
  )
  return h('details', { class: 'df-shorts-bundle' }, summary, h('div', { class: 'df-shorts-items' }))
}

function updateShortsCount(box: HTMLElement) {
  const n = box.querySelectorAll('.df-shorts-items > .df-item-row').length
  box.querySelector('.df-shorts-count')!.textContent = n === 1 ? '1 short' : `${n} shorts`
}

let feedCancelled = false
let scrollBinding: { el: HTMLElement; fn: () => void } | null = null
let unsubAppearance: (() => void) | null = null

export const homeFeedFeature: Feature = {
  id: 'home-feed',

  mount(nav: NavigationState) {
    feedCancelled = false
    content!.replaceChildren()

    // A page that genuinely doesn't exist gets the 404. A real YouTube page this
    // extension simply has no view for (trending, gaming, account) goes home.
    const pageError = extractPageError()
    if (pageError) {
      renderNotFound(pageError)
      return
    }
    if (nav.route === 'unknown') {
      location.replace('/')
      return
    }

    renderPageHead(nav)
    const toolbar = renderToolbar(nav.route, nav.route === 'subscriptions' ? (option) => {
      subscriptionsFilter = option
      updateCreatorSelect()
      if (allSubscriptions.length) renderSubscriptionList()
    } : undefined)

    const showsVideos = nav.route !== 'playlists'
    const head = tableHead()
    head.hidden = !showsVideos
    const list = h('div', { id: 'df-feed', class: 'df-item-list', 'aria-busy': 'true' })
    list.appendChild(skeletonRows())
    content!.append(head, list)

    let continuationToken: string | null = null
    let loadingMore = false
    let feedExhausted = false
    let initialLoadDone = false
    const videoIds = new Set<string>()
    const channelIds = new Set<string>()
    // Separate from videoIds, which rerenderChannelList() clears on every tab switch -
    // this one must stay stable so scroll-loaded videos aren't re-added to channelVideos twice.
    const channelVideoIds = new Set<string>()
    let featuredChannelId: string | null = null
    let channelVideos: Video[] = []
    let aboutEl: HTMLElement | null = null
    let tabsEl: HTMLElement | null = null
    let currentTab = 'videos'
    let playlists: PlaylistItem[] | null = null
    let playlistsLoading = false
    let historyBucket: string | null = null
    let historyGroup: HTMLElement | null = null
    let historyCount: HTMLElement | null = null
    let historyGroupSize = 0
    let subscriptionsFilter: string = 'All'
    let allSubscriptions: Video[] = []
    let creatorSelect: HTMLSelectElement | null = null

    const sc = scroller()
    const nearEnd = () => sc.scrollHeight - sc.scrollTop - sc.clientHeight < 800

    const onScroll = () => {
      if (loadingMore || feedExhausted || !initialLoadDone) return
      if (currentTab === 'about' || currentTab === 'playlists') return
      if (nearEnd()) loadMore()
    }

    // Scrolling is what asks for more, so a first page too short to scroll never asked:
    // on a tall window, or in the card layout, the feed simply stopped. Keep loading
    // until the page is taller than the window or the feed runs out.
    const fillWindow = () => {
      if (feedCancelled) return
      requestAnimationFrame(onScroll)
    }

    function finishLoading() {
      list.removeAttribute('aria-busy')
      list.querySelectorAll('.df-skeleton').forEach((el) => el.remove())
    }

    // A subscription list of any size makes "By creator" a wall of headings to scroll
    // through. The picker is the browser's own select - type-ahead and long-list
    // handling for free - and picking a creator goes straight to their channel.
    function updateCreatorSelect() {
      if (subscriptionsFilter !== 'By creator') {
        creatorSelect?.remove()
        creatorSelect = null
        return
      }
      if (!creatorSelect) {
        creatorSelect = h('select', { class: 'df-select', 'aria-label': 'Go to creator' })
        creatorSelect.onchange = () => {
          const id = creatorSelect!.value
          // Leave the picker on its placeholder: navigation is a full page load, and
          // if it never happens a stuck name would claim a filter that isn't applied.
          creatorSelect!.value = ''
          if (id) navigateTo(`/channel/${id}`)
        }
        toolbar?.appendChild(creatorSelect)
      }
      // Only creators we have a channel id for - the rest are nowhere to route to.
      const byId = new Map<string, string>()
      for (const v of allSubscriptions) {
        if (v.channelId && v.channel) byId.set(v.channelId, v.channel)
      }
      const creators = [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
      creatorSelect.replaceChildren()
      for (const [id, name] of [['', 'Go to creator…'] as [string, string], ...creators]) {
        creatorSelect.appendChild(h('option', { value: id, text: name }))
      }
      creatorSelect.value = ''
    }

    function renderSubscriptionGroup(into: ParentNode, header: string, videos: Video[]) {
      const { group, count } = dateGroup(header)
      count.textContent = String(videos.length)
      videos.forEach((v) => {
        videoIds.add(v.id)
        group.appendChild(renderVideo(v))
      })
      into.appendChild(group)
    }

    // Every scroll page regroups the whole feed, since a new video can land in an
    // existing bucket. Building into a fragment keeps that one insertion rather than
    // N appends against a live list.
    function renderSubscriptionList() {
      if (feedCancelled) return
      const frag = document.createDocumentFragment()
      videoIds.clear()
      updateCreatorSelect()
      if (subscriptionsFilter === 'By creator') {
        const byCreator = new Map<string, Video[]>()
        for (const v of allSubscriptions) {
          const key = v.channel || 'Unknown'
          if (!byCreator.has(key)) byCreator.set(key, [])
          byCreator.get(key)!.push(v)
        }
        const sorted = [...byCreator.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        for (const [channel, videos] of sorted) {
          renderSubscriptionGroup(frag, channel, videos)
        }
      } else if (subscriptionsFilter === 'All') {
        const groups = groupVideosByDate(allSubscriptions)
        for (const [bucket, videos] of groups) {
          renderSubscriptionGroup(frag, bucket, videos)
        }
      } else {
        const filtered = allSubscriptions.filter((v) => dateBucket(v.published) === subscriptionsFilter)
        if (filtered.length) {
          renderSubscriptionGroup(frag, subscriptionsFilter, filtered)
        } else {
          frag.appendChild(emptyState('clock', `Nothing from ${subscriptionsFilter.toLowerCase()}`, 'Try a wider range.'))
        }
      }
      list.replaceChildren(frag)
    }

    // History arrives already in watched order, grouped by the section label the
    // extractor stamped on ("Today", "Yesterday", "Mar 5, 2026"). Appending keeps that
    // order, so a group only ever ends when the label changes - no regrouping pass, and
    // an expanded Shorts bundle survives the next scroll page.
    function appendHistoryVideo(v: Video) {
      const bucket = v.watchedOn ?? ''
      if (bucket && bucket !== historyBucket) {
        historyBucket = bucket
        const made = dateGroup(bucket)
        historyGroup = made.group
        historyCount = made.count
        historyGroupSize = 0
        list.appendChild(historyGroup)
      }
      historyGroupSize++
      if (historyCount) historyCount.textContent = String(historyGroupSize)
      const target: HTMLElement = historyGroup ?? list
      if (!v.short) { target.appendChild(renderVideo(v)); return }
      // Reuse the trailing bundle so a run split across two scroll pages stays one row.
      const last = target.lastElementChild
      const box = last?.classList.contains('df-shorts-bundle')
        ? (last as HTMLElement)
        : target.appendChild(shortsBundle())
      box.querySelector('.df-shorts-items')!.appendChild(renderVideo(v))
      updateShortsCount(box)
    }

    // Returns how many items were actually new, so loadMore can tell real progress
    // from a page that only repeated what we already have.
    function appendVideos(videos: Video[]): number {
      if (feedCancelled) return 0
      finishLoading()
      if (list.querySelector('.df-empty')) list.replaceChildren()
      const playlistContext = (nav.route === 'playlist' || nav.route === 'liked' || nav.route === 'watch-later')
        ? nav.searchParams.get('list') : null
      const newVids = videos.filter((v) => !videoIds.has(v.id))
      if (nav.route === 'subscriptions') {
        allSubscriptions = allSubscriptions.concat(newVids)
        renderSubscriptionList()
      } else {
        const frag = document.createDocumentFragment()
        newVids.forEach((v) => {
          videoIds.add(v.id)
          if (playlistContext && !v.url.includes('list=')) {
            v = { ...v, url: `${v.url}&list=${playlistContext}` }
          }
          if (nav.route === 'history') { appendHistoryVideo(v); return }
          frag.appendChild(renderVideo(v))
        })
        list.appendChild(frag)
      }
      if (nav.route === 'channel') {
        const newForChannel = videos.filter((v) => !channelVideoIds.has(v.id))
        newForChannel.forEach((v) => channelVideoIds.add(v.id))
        channelVideos = channelVideos.concat(newForChannel)
      }
      return newVids.length
    }

    function appendSearchItems(items: SearchItem[]): number {
      if (feedCancelled) return 0
      finishLoading()
      if (list.querySelector('.df-empty')) list.replaceChildren()
      const channels: Channel[] = []
      const videos: Video[] = []
      for (const item of items) {
        if (item.kind === 'channel') {
          if (item.channel.id === featuredChannelId) continue
          if (channelIds.has(item.channel.id)) continue
          channelIds.add(item.channel.id)
          channels.push(item.channel)
        } else {
          if (videoIds.has(item.video.id)) continue
          videoIds.add(item.video.id)
          videos.push(item.video)
        }
      }
      channels.forEach((c) => list.appendChild(renderChannelCard(c)))
      videos.forEach((v) => list.appendChild(renderVideo(v)))
      return channels.length + videos.length
    }

    function rerenderChannelList(sorted: Video[]) {
      if (feedCancelled) return
      videoIds.clear()
      const frag = document.createDocumentFragment()
      for (const v of sorted) {
        if (videoIds.has(v.id)) continue
        videoIds.add(v.id)
        frag.appendChild(renderVideo(v))
      }
      list.replaceChildren(frag)
      if (!sorted.length && initialLoadDone) showEmpty()
    }

    function renderPlaylists(items: PlaylistItem[]) {
      if (feedCancelled) return
      finishLoading()
      list.replaceChildren()
      if (!items.length) {
        list.appendChild(emptyState('playlists', 'No playlists to show', ''))
        return
      }
      items.forEach((p) => list.appendChild(renderPlaylistRow(p)))
    }

    function loadPlaylists() {
      if (playlists) { renderPlaylists(playlists); return }
      if (playlistsLoading) return
      playlistsLoading = true
      list.replaceChildren(skeletonRows(5))
      fetchChannelPlaylists(nav.channelId ?? '')
        .then((result) => {
          playlistsLoading = false
          if (feedCancelled || currentTab !== 'playlists') return
          playlists = result
          renderPlaylists(result)
        })
        .catch(() => {
          playlistsLoading = false
          if (feedCancelled || currentTab !== 'playlists') return
          renderPlaylists([])
        })
    }

    function setTab(tab: string) {
      currentTab = tab
      tabsEl?.querySelectorAll<HTMLElement>('.df-tab').forEach((el) => {
        const on = el.dataset.tab === tab
        el.classList.toggle('df-active', on)
        el.setAttribute('aria-selected', String(on))
      })
      if (aboutEl) aboutEl.hidden = tab !== 'about'
      list.hidden = tab === 'about'
      head.hidden = tab === 'about' || tab === 'playlists'
      if (tab === 'popular') rerenderChannelList([...channelVideos].sort((a, b) => parseViews(b.views) - parseViews(a.views)))
      if (tab === 'videos') rerenderChannelList(channelVideos)
      if (tab === 'playlists') loadPlaylists()
    }

    function renderChannelTabs(before: HTMLElement) {
      tabsEl = h('div', { class: 'df-tabs', role: 'tablist', 'aria-label': 'Channel sections' })
      const tabs: [string, string][] = [['videos', 'Videos'], ['popular', 'Popular'], ['playlists', 'Playlists'], ['about', 'About']]
      tabs.forEach(([id, label], i) => {
        const tab = h('span', { class: i === 0 ? 'df-tab df-active' : 'df-tab', 'data-tab': id, text: label })
        makeClickable(tab, () => setTab(id))
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-selected', String(i === 0))
        tabsEl!.appendChild(tab)
      })
      before.parentNode?.insertBefore(tabsEl, before)
    }

    function renderChannelAbout(ch: Channel, before: HTMLElement) {
      aboutEl = h('div', { class: 'df-channel-about', hidden: true },
        h('p', { class: 'df-channel-about-desc', text: ch.description || 'No description yet.' }),
      )
      if (ch.handle) {
        const link = h('a', {
          href: `https://www.youtube.com${ch.handle}`, target: '_blank', rel: 'noopener noreferrer',
          text: `youtube.com${ch.handle}`,
        })
        aboutEl.appendChild(h('div', { class: 'df-channel-about-links' }, link))
      }
      before.parentNode?.insertBefore(aboutEl, before)
    }

    function showEmpty() {
      if (feedCancelled) return
      finishLoading()
      const [iconName, title, detail] = EMPTY_COPY[nav.route] ?? ['film', 'No videos to show', '']
      const text = nav.route === 'search' && nav.searchQuery ? `Nothing matched “${nav.searchQuery}”. Try different words.` : detail
      list.replaceChildren(emptyState(iconName, title, text))
    }

    async function loadMore() {
      if (loadingMore || feedCancelled || feedExhausted) return
      loadingMore = true
      let added = 0
      try {
        const result = await fetchContinuation(continuationToken || '', nav.route, nav.searchQuery ?? '', nav.channelId ?? '')
        if (feedCancelled) return
        continuationToken = result.token
        if (nav.route === 'search' && result.items?.length) {
          added = appendSearchItems(result.items)
        } else if (result.videos.length) {
          added = appendVideos(result.videos)
        }
        // A fetch that yields nothing new means we are at the end of what this route
        // can page through. Stop, rather than letting the unchanged page height keep
        // the bottom-of-feed check true and refetch on every further scroll event.
        if (added === 0 || !continuationToken) feedExhausted = true
      } finally {
        loadingMore = false
      }
      if (added > 0) fillWindow()
    }

    async function doLoad() {
      let videos: Video[] = []
      if (nav.route === 'home') {
        const result = await extractPageVideosWithContinuation()
        videos = result.videos
        continuationToken = result.continuation
      } else if (nav.route === 'search') {
        const result = await fetchSearchResults(nav.searchQuery ?? '')
        videos = result.videos
        continuationToken = result.continuation
        if (feedCancelled) return
        featuredChannelId = result.channels[0]?.id ?? null
        if (featuredChannelId) renderChannelBanner(result.channels[0], head)
        if (result.items?.length) {
          appendSearchItems(result.items)
          initialLoadDone = true
          fillWindow()
          return
        }
      } else if (nav.route === 'channel') {
        const result = await fetchChannelPage(nav.channelId ?? '')
        if (feedCancelled) return
        const channelName = result.channel?.name || result.videos[0]?.channel || 'Channel'
        const channel = result.channel ?? {
          id: nav.channelId ?? '',
          name: channelName,
          handle: '',
          subscribers: '',
          videoCount: '',
          description: '',
          verified: false,
        }
        setCrumbs(channel.name)
        document.title = `${channel.name} · Dumbify`
        renderChannelHead(channel, result.videos, head)
        renderChannelTabs(head)
        renderChannelAbout(channel, head)
        videos = result.videos
        continuationToken = result.continuation
      } else if (nav.route === 'liked') {
        const result = await fetchLikedPlaylist()
        if (feedCancelled) return
        videos = result.videos
        continuationToken = result.token
      } else if (nav.route === 'playlists') {
        const items = await fetchUserPlaylists()
        if (feedCancelled) return
        renderPlaylists(items)
        initialLoadDone = true
        feedExhausted = true
        return
      } else if (nav.route === 'playlist') {
        const playlistId = nav.searchParams.get('list') ?? ''
        const result = await fetchPlaylistPage(playlistId)
        if (feedCancelled) return
        if (result.title) {
          updatePageHead({ title: result.title, sub: '' })
          setCrumbs(result.title)
          document.title = `${result.title} · Dumbify`
        }
        videos = result.videos
        continuationToken = result.token
      } else {
        const result = await fetchContinuation('', nav.route)
        videos = result.videos
        continuationToken = result.token
      }

      if (feedCancelled) return

      if (videos.length) {
        appendVideos(videos)
      } else {
        showEmpty()
      }

      initialLoadDone = true
      fillWindow()
    }

    sc.addEventListener('scroll', onScroll, { passive: true })
    scrollBinding = { el: sc, fn: onScroll }
    // A layout switch (list to cards, say) changes how tall the page is.
    unsubAppearance = onAppearance(() => fillWindow())

    doLoad()
  },

  unmount() {
    feedCancelled = true
    if (scrollBinding) scrollBinding.el.removeEventListener('scroll', scrollBinding.fn)
    scrollBinding = null
    unsubAppearance?.()
    unsubAppearance = null
    content!.replaceChildren()
  },

  update(nav: NavigationState) {
    // Tear down first. mount() registers a fresh scroll listener and overwrites the
    // handler ref used to remove it, so re-mounting without this left every previous
    // page's listener attached - each one still holding its own list/token state and
    // still firing loadMore on scroll.
    this.unmount()
    this.mount(nav)
  },
}
