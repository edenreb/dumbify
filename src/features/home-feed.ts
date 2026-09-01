import type { NavigationState, Video, Channel, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, root, renderNotFound, makeClickable } from '../core/UIEngine'
import { extractPageError, extractPageVideosWithContinuation, fetchContinuation, fetchSearchResults, fetchChannelPage, fetchChannelPlaylists, fetchUserPlaylists, fetchLikedPlaylist, fetchPlaylistPage, setChannelSubscription, diag } from '../core/DataExtractor'
import type { SearchItem, PlaylistItem } from '../core/DataExtractor'
import { navigateTo } from '../core/PageManager'

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
  const order = ['Today', 'Yesterday', 'Past week', 'Past month']
  for (const v of videos) {
    const bucket = dateBucket(v.published)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket)!.push(v)
  }
  // Sort groups: named buckets first in order, then month names alphabetically, then Unknown/Older
  const sorted = new Map<string, Video[]>()
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!)
  }
  const remaining = [...groups.keys()]
    .filter((k) => !order.includes(k) && k !== 'Unknown')
    .sort()
  for (const key of remaining) sorted.set(key, groups.get(key)!)
  if (groups.has('Unknown')) sorted.set('Unknown', groups.get('Unknown')!)
  return sorted
}

const ROUTE_TITLES: Partial<Record<Route, { eyebrow: string; title: string; note: string; aside?: string }>> = {
  home: {
    eyebrow: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    title: 'Recommended for you',
    note: '',
  },
  history: {
    eyebrow: '',
    title: 'History',
    note: '',
    aside: '',
  },
  subscriptions: {
    eyebrow: '',
    title: 'Subscriptions',
    note: '',
  },
  'watch-later': {
    eyebrow: '',
    title: 'Watch Later',
    note: '',
  },
  liked: {
    eyebrow: '',
    title: 'Liked',
    note: '',
  },
  playlists: {
    eyebrow: '',
    title: 'Playlists',
    note: '',
  },
  playlist: {
    eyebrow: 'Playlist',
    title: 'Playlist',
    note: '',
  },
  search: {
    eyebrow: 'Search',
    title: 'Search results',
    note: '',
  },
  channel: {
    eyebrow: 'Channel',
    title: 'Channel',
    note: '',
  },
}

// Subscriptions is the only feed with a working toolbar - its options are wired to a
// real filter. History and Watch Later had one too, but nothing ever read the selected
// value, so they were labels that looked like controls.
const TOOLBAR_OPTIONS: Partial<Record<Route, string[]>> = {
  subscriptions: ['All', 'Today', 'Yesterday', 'Past week', 'Past month', 'By creator'],
}

function renderPageHead(nav: NavigationState) {
  const info = ROUTE_TITLES[nav.route]
  if (!info || nav.route === 'channel') return

  const head = document.createElement('header')
  head.className = 'df-page-head'
  head.id = 'df-page-head'

  const body = document.createElement('div')
  body.className = 'df-page-head-body'

  const eyebrow = document.createElement('p')
  eyebrow.className = 'df-page-eyebrow'
  eyebrow.textContent = info.eyebrow
  body.appendChild(eyebrow)

  const title = document.createElement('h1')
  title.className = 'df-page-title'
  title.textContent = info.title
  body.appendChild(title)

  if (info.note) {
    const note = document.createElement('p')
    note.className = 'df-page-note'
    note.textContent = nav.route === 'search' && nav.searchQuery
      ? `Results for “${nav.searchQuery}”`
      : info.note
    body.appendChild(note)
  }

  head.appendChild(body)

  if (info.aside) {
    const aside = document.createElement('div')
    aside.className = 'df-page-aside'
    const span = document.createElement('span')
    span.className = 'df-page-eyebrow'
    span.textContent = info.aside
    aside.appendChild(span)
    head.appendChild(aside)
  }

  content!.appendChild(head)
}

function updatePageHead(overrides: { eyebrow?: string; title?: string; note?: string }) {
  const head = document.getElementById('df-page-head')
  if (!head) return
  const eyebrow = head.querySelector('.df-page-eyebrow')
  if (eyebrow && overrides.eyebrow) eyebrow.textContent = overrides.eyebrow
  const title = head.querySelector('.df-page-title')
  if (title && overrides.title) title.textContent = overrides.title
  const note = head.querySelector('.df-page-note')
  if (note && overrides.note !== undefined) note.textContent = overrides.note
}

function renderToolbar(route: Route, onOption?: (option: string) => void): HTMLElement | null {
  const options = TOOLBAR_OPTIONS[route]
  if (!options) return null

  const bar = document.createElement('div')
  bar.className = 'df-toolbar'

  options.forEach((o, i) => {
    const span = document.createElement('span')
    span.className = i === 0 ? 'df-toolbar-item df-active' : 'df-toolbar-item'
    span.textContent = o
    if (onOption) {
      makeClickable(span, () => {
        bar.querySelectorAll('.df-toolbar-item').forEach((el) => el.classList.remove('df-active'))
        span.classList.add('df-active')
        onOption(o)
      })
    }
    bar.appendChild(span)
  })

  content!.appendChild(bar)
  return bar
}

function renderChannelBanner(ch: Channel, before?: HTMLElement) {
  const banner = document.createElement('a')
  banner.className = 'df-channel-banner'
  banner.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navigateTo(`/channel/${ch.id}`) }
  banner.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); navigateTo(`/channel/${ch.id}`) } }
  banner.setAttribute('role', 'link')
  banner.tabIndex = 0

  const label = document.createElement('span')
  label.className = 'df-channel-banner-label'
  label.textContent = ch.verified ? 'Channel · Verified' : 'Channel'
  banner.appendChild(label)

  const row = document.createElement('div')
  row.className = 'df-channel-banner-row'

  const title = document.createElement('span')
  title.className = 'df-channel-banner-name'
  title.textContent = ch.name
  row.appendChild(title)

  const meta = document.createElement('span')
  meta.className = 'df-channel-banner-meta'
  const parts: string[] = []
  if (ch.subscribers) parts.push(ch.subscribers)
  if (ch.videoCount) parts.push(ch.videoCount)
  meta.textContent = parts.join(' · ')
  row.appendChild(meta)

  banner.appendChild(row)

  if (ch.description) {
    const desc = document.createElement('p')
    desc.className = 'df-channel-banner-desc'
    desc.textContent = ch.description
    banner.appendChild(desc)
  }

  const cta = document.createElement('span')
  cta.className = 'df-channel-banner-cta'
  cta.textContent = 'View channel'
  banner.appendChild(cta)

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
function setSubUi(btn: HTMLButtonElement, subscribed: boolean) {
  btn.classList.toggle('df-sub-btn--on', subscribed)
  btn.textContent = subscribed ? 'Unsubscribe' : 'Subscribe'
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
function applyRealSubscribedState(btn: HTMLButtonElement, state: SubUiState) {
  let tries = 0
  const poll = window.setInterval(() => {
    tries++
    const real = detectRealSubscribedState()
    if (real !== null) {
      window.clearInterval(poll)
      state.subscribed = real
      setSubUi(btn, real)
    } else if (tries >= 15) {
      window.clearInterval(poll)
      console.warn('[Dumbify] could not detect real subscribed state from header; leaving initial guess')
    }
  }, 200)
}

async function handleSubscribeClick(btn: HTMLButtonElement, channelId: string, state: SubUiState) {
  const wantSubscribe = !state.subscribed
  const params = wantSubscribe ? state.subParams : state.unsubParams
  if (!params) {
    console.warn(
      `[Dumbify] no ${wantSubscribe ? 'subscribe' : 'unsubscribe'} params extracted for channel ${channelId}; cannot ${wantSubscribe ? 'subscribe' : 'unsubscribe'} (not signed in, or YouTube's data shape changed)`
    )
    const original = btn.textContent
    btn.textContent = 'Sign in to subscribe'
    window.setTimeout(() => { btn.textContent = original }, 1500)
    return
  }
  btn.disabled = true
  setSubUi(btn, wantSubscribe)
  const ok = await setChannelSubscription(channelId, wantSubscribe, params)
  btn.disabled = false
  if (ok) {
    state.subscribed = wantSubscribe
  } else {
    console.warn(`[Dumbify] ${wantSubscribe ? 'subscribe' : 'unsubscribe'} request failed for channel ${channelId}`)
    setSubUi(btn, state.subscribed)
  }
}

function renderChannelHead(ch: Channel, before?: HTMLElement) {
  const head = document.createElement('header')
  head.className = 'df-page-head'

  const body = document.createElement('div')
  body.className = 'df-page-head-body'

  const eyebrow = document.createElement('p')
  eyebrow.className = 'df-page-eyebrow'
  // handle is a path: "/@Name" for a channel with a handle, "/channel/UC..." without one.
  // Only the handle form is worth showing; stripping just "@" left the whole path behind.
  const handleName = ch.handle.match(/@([^/]+)/)?.[1]
  eyebrow.textContent = handleName ? `Channel · ${handleName}` : 'Channel'
  body.appendChild(eyebrow)

  const title = document.createElement('h1')
  title.className = 'df-page-title df-channel-page-title'
  title.textContent = ch.name
  body.appendChild(title)

  head.appendChild(body)

  const aside = document.createElement('div')
  aside.className = 'df-page-aside'

  if (ch.verified) {
    const verified = document.createElement('span')
    verified.className = 'df-sub-badge'
    verified.textContent = 'Verified'
    aside.appendChild(verified)
  }

  if (ch.id) {
    const subBtn = document.createElement('button')
    subBtn.className = 'df-sub-btn'
    const subState: SubUiState = {
      subscribed: ch.subscribed === true,
      subParams: ch.subParams ?? '',
      unsubParams: ch.unsubParams ?? '',
    }
    setSubUi(subBtn, subState.subscribed)
    subBtn.onclick = () => handleSubscribeClick(subBtn, ch.id, subState)
    aside.appendChild(subBtn)
    applyRealSubscribedState(subBtn, subState)
  }

  head.appendChild(aside)

  if (before && before.parentNode) before.parentNode.insertBefore(head, before)
  else content!.appendChild(head)
}

function renderChannelStats(ch: Channel, videos: Video[], before?: HTMLElement) {
  const stats = document.createElement('dl')
  stats.className = 'df-channel-stats'

  const entries: { k: string; v: string }[] = [
    { k: 'Subscribers', v: (ch.subscribers || '—').replace(/\s*subscribers?\s*/i, '').trim() },
    { k: 'Videos', v: (ch.videoCount || String(videos.length)).replace(/\s*videos?\s*/i, '').trim() },
  ]

  entries.forEach((entry) => {
    const cell = document.createElement('div')
    const dt = document.createElement('dt')
    dt.className = 'df-stat-label'
    dt.textContent = entry.k
    const dd = document.createElement('dd')
    dd.className = 'df-stat-value'
    dd.textContent = entry.v
    cell.appendChild(dt)
    cell.appendChild(dd)
    stats.appendChild(cell)
  })

  if (before && before.parentNode) before.parentNode.insertBefore(stats, before)
  else content!.appendChild(stats)
}

function renderChannelCard(ch: Channel): HTMLElement {
  const card = document.createElement('a')
  card.className = 'df-channel-card'
  card.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navigateTo(`/channel/${ch.id}`) }
  card.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); navigateTo(`/channel/${ch.id}`) } }
  card.setAttribute('role', 'link')
  card.tabIndex = 0

  const label = document.createElement('span')
  label.className = 'df-channel-card-label'
  label.textContent = ch.verified ? 'Channel · Verified' : 'Channel'
  card.appendChild(label)

  const name = document.createElement('span')
  name.className = 'df-channel-card-name'
  name.textContent = ch.name
  card.appendChild(name)

  const meta = document.createElement('span')
  meta.className = 'df-channel-card-meta'
  const parts: string[] = []
  if (ch.subscribers) parts.push(ch.subscribers)
  if (ch.videoCount) parts.push(ch.videoCount)
  meta.textContent = parts.join(' · ')
  card.appendChild(meta)

  if (ch.description) {
    const desc = document.createElement('p')
    desc.className = 'df-channel-card-desc'
    desc.textContent = ch.description
    card.appendChild(desc)
  }

  const cta = document.createElement('span')
  cta.className = 'df-channel-card-cta'
  cta.textContent = 'View channel'
  card.appendChild(cta)

  return card
}

function parseViews(v: string): number {
  const m = v.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?\s*(?:views?)?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return 0
  const mult = m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1
  return n * mult
}

function renderVideo(v: Video): HTMLElement {
  const article = document.createElement('a')
  article.className = 'df-item-row'
  article.href = v.url
  article.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navigateTo(v.url) }
  article.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); navigateTo(v.url) } }

  const number = document.createElement('span')
  number.className = 'df-item-number'
  article.appendChild(number)

  const body = document.createElement('span')

  const title = document.createElement('span')
  title.className = 'df-item-title'
  title.textContent = v.title
  if (v.live) {
    const liveBadge = document.createElement('span')
    liveBadge.className = 'df-live-badge'
    liveBadge.textContent = 'LIVE'
    title.appendChild(liveBadge)
  }
  body.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'df-item-meta'


    // Deterministic order: channel / views / release date. Missing fields are
  // simply omitted rather than leaving a gap or a stray separator.
  const metaParts: string[] = []
  if (v.channel) metaParts.push(v.channel)
  if (v.views) metaParts.push(v.views)
  if (v.published) metaParts.push(v.published)

  metaParts.forEach((text, i) => {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.className = 'df-item-meta-sep'
      sep.textContent = '/'
      meta.appendChild(sep)
    }
    const el = document.createElement('span')
    el.textContent = text
    if (text === v.channel && v.channelId) {
      el.className = 'df-item-channel-link'
      el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navigateTo(`/channel/${v.channelId}`) }
    }
    meta.appendChild(el)
  })

  body.appendChild(meta)
  article.appendChild(body)

  const dur = document.createElement('span')
  dur.className = 'df-item-duration'
  dur.textContent = v.duration
  article.appendChild(dur)

  return article
}

function renderPlaylistRow(p: PlaylistItem): HTMLElement {
  const article = document.createElement('a')
  article.className = 'df-item-row'
  article.href = p.url
  article.onclick = (e) => { e.preventDefault(); e.stopPropagation(); navigateTo(p.url) }
  article.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); navigateTo(p.url) } }

  const number = document.createElement('span')
  number.className = 'df-item-number'
  article.appendChild(number)

  const body = document.createElement('span')

  const title = document.createElement('span')
  title.className = 'df-item-title'
  title.textContent = p.title
  body.appendChild(title)

  if (p.videoCount) {
    const meta = document.createElement('div')
    meta.className = 'df-item-meta'
    const count = document.createElement('span')
    count.textContent = p.videoCount
    meta.appendChild(count)
    body.appendChild(meta)
  }

  article.appendChild(body)
  return article
}

let feedCancelled = false

export const homeFeedFeature: Feature = {
  id: 'home-feed',

  mount(nav: NavigationState) {
    feedCancelled = false
    content!.innerHTML = ''

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

    const list = document.createElement('div')
    list.id = 'df-feed'
    list.className = 'df-item-list'

    const loading = document.createElement('div')
    loading.className = 'df-loading'
    loading.textContent = 'Loading...'
    list.appendChild(loading)
    content!.appendChild(list)

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
    let subscriptionsFilter: string = 'All'
    let allSubscriptions: Video[] = []
    let creatorSelect: HTMLSelectElement | null = null

    const onScroll = () => {
      if (loadingMore || feedExhausted || !initialLoadDone) return
      if (currentTab === 'about' || currentTab === 'playlists') return
      if (root!.scrollHeight - root!.scrollTop - root!.clientHeight < 600) {
        loadMore()
      }
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
        creatorSelect = document.createElement('select')
        creatorSelect.className = 'df-creator-select'
        creatorSelect.setAttribute('aria-label', 'Go to creator')
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
      creatorSelect.innerHTML = ''
      for (const [id, name] of [['', 'Go to creator...'] as [string, string], ...creators]) {
        const opt = document.createElement('option')
        opt.value = id
        opt.textContent = name
        creatorSelect.appendChild(opt)
      }
      creatorSelect.value = ''
    }

    function renderSubscriptionGroup(into: ParentNode, header: string, videos: Video[]) {
      const group = document.createElement('div')
      group.className = 'df-date-group'
      const h = document.createElement('p')
      h.className = 'df-date-group-header'
      h.textContent = header
      group.appendChild(h)
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
          const e = document.createElement('div')
          e.className = 'df-empty'
          e.textContent = `No videos from ${subscriptionsFilter}`
          frag.appendChild(e)
        }
      }
      list.replaceChildren(frag)
    }

    // Returns how many items were actually new, so loadMore can tell real progress
    // from a page that only repeated what we already have.
    function appendVideos(videos: Video[]): number {
      if (feedCancelled) return 0
      if (list.querySelector('.df-loading, .df-empty')) list.innerHTML = ''
      const playlistContext = (nav.route === 'playlist' || nav.route === 'liked' || nav.route === 'watch-later')
        ? nav.searchParams.get('list') : null
      const newVids = videos.filter((v) => !videoIds.has(v.id))
      if (nav.route === 'subscriptions') {
        allSubscriptions = allSubscriptions.concat(newVids)
        renderSubscriptionList()
      } else {
        newVids.forEach((v) => {
          videoIds.add(v.id)
          if (playlistContext && !v.url.includes('list=')) {
            v = { ...v, url: `${v.url}&list=${playlistContext}` }
          }
          list.appendChild(renderVideo(v))
        })
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
      if (list.querySelector('.df-loading, .df-empty')) list.innerHTML = ''
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
    }

    function renderPlaylists(items: PlaylistItem[]) {
      if (feedCancelled) return
      list.innerHTML = ''
      if (!items.length) {
        const e = document.createElement('div')
        e.className = 'df-empty'
        e.textContent = 'No playlists to display'
        list.appendChild(e)
        return
      }
      items.forEach((p) => list.appendChild(renderPlaylistRow(p)))
    }

    function loadPlaylists() {
      if (playlists) { renderPlaylists(playlists); return }
      if (playlistsLoading) return
      playlistsLoading = true
      list.innerHTML = ''
      const loadingEl = document.createElement('div')
      loadingEl.className = 'df-loading'
      loadingEl.textContent = 'Loading...'
      list.appendChild(loadingEl)
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
      if (tabsEl) {
        const spans = tabsEl.querySelectorAll('.df-toolbar-item')
        spans.forEach((s, i) => s.classList.toggle('df-active', i === (tab === 'videos' ? 0 : tab === 'popular' ? 1 : tab === 'playlists' ? 2 : 3)))
      }
      if (aboutEl) aboutEl.style.display = tab === 'about' ? '' : 'none'
      if (list) list.style.display = tab === 'about' ? 'none' : ''
      if (tab === 'popular') rerenderChannelList([...channelVideos].sort((a, b) => parseViews(b.views) - parseViews(a.views)))
      if (tab === 'videos') rerenderChannelList(channelVideos)
      if (tab === 'playlists') loadPlaylists()
    }

    function renderChannelTabs(before: HTMLElement) {
      tabsEl = document.createElement('div')
      tabsEl.className = 'df-toolbar df-channel-tabs'
      const labels = ['Videos', 'Popular', 'Playlists', 'About']
      labels.forEach((o, i) => {
        const span = document.createElement('span')
        span.className = i === 0 ? 'df-toolbar-item df-active' : 'df-toolbar-item'
        span.textContent = o
        makeClickable(span, () => setTab(i === 0 ? 'videos' : i === 1 ? 'popular' : i === 2 ? 'playlists' : 'about'))
        tabsEl!.appendChild(span)
      })
      if (before && before.parentNode) before.parentNode.insertBefore(tabsEl, before)
      else content!.appendChild(tabsEl)
    }

    function renderChannelAbout(ch: Channel, before: HTMLElement) {
      aboutEl = document.createElement('div')
      aboutEl.className = 'df-channel-about'
      aboutEl.style.display = 'none'

      const desc = document.createElement('p')
      desc.className = 'df-channel-about-desc'
      desc.textContent = ch.description || 'No description yet.'
      aboutEl.appendChild(desc)

      if (ch.handle) {
        const links = document.createElement('div')
        links.className = 'df-channel-about-links'
        const link = document.createElement('a')
        link.href = `https://www.youtube.com${ch.handle}`
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.textContent = `youtube.com${ch.handle}`
        links.appendChild(link)
        aboutEl.appendChild(links)
      }

      if (before && before.parentNode) before.parentNode.insertBefore(aboutEl, before)
      else content!.appendChild(aboutEl)
    }

    function showEmpty() {
      if (feedCancelled) return
      list.innerHTML = ''
      const empty = document.createElement('div')
      empty.className = 'df-empty'
      empty.textContent = 'No videos to display'
      list.appendChild(empty)
    }

    async function loadMore() {
      if (loadingMore || feedCancelled || feedExhausted) return
      loadingMore = true
      try {
        const result = await fetchContinuation(continuationToken || '', nav.route, nav.searchQuery ?? '', nav.channelId ?? '')
        if (feedCancelled) return
        continuationToken = result.token
        let added = 0
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
        if (featuredChannelId) renderChannelBanner(result.channels[0], list)
        if (result.items?.length) {
          appendSearchItems(result.items)
          initialLoadDone = true
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
          videoCount: String(result.videos.length),
          description: '',
          verified: false,
        }
        renderChannelHead(channel, list)
        renderChannelStats(channel, result.videos, list)
        renderChannelTabs(list)
        renderChannelAbout(channel, list)
        videos = result.videos
        continuationToken = result.continuation
      } else if (nav.route === 'liked') {
        const result = await fetchLikedPlaylist()
        if (feedCancelled) return
        videos = result.videos
        continuationToken = result.token
      } else if (nav.route === 'playlists') {
        const playlists = await fetchUserPlaylists()
        if (feedCancelled) return
        list.innerHTML = ''
        if (playlists.length) {
          playlists.forEach((p) => list.appendChild(renderPlaylistRow(p)))
            } else {
          const empty = document.createElement('div')
          empty.className = 'df-empty'
          empty.textContent = 'No playlists to display'
          list.appendChild(empty)
        }
        initialLoadDone = true
        feedExhausted = true
        return
      } else if (nav.route === 'playlist') {
        const playlistId = nav.searchParams.get('list') ?? ''
        const result = await fetchPlaylistPage(playlistId)
        if (feedCancelled) return
        if (result.title) {
          updatePageHead({ title: result.title, note: '' })
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
    }

    root!.addEventListener('scroll', onScroll, { passive: true })
    ;(root as any).__dfScrollHandler = onScroll

    doLoad()
  },

  unmount() {
    feedCancelled = true
    const h = (root as any).__dfScrollHandler
    if (h) root!.removeEventListener('scroll', h)
    delete (root as any).__dfScrollHandler
    content!.innerHTML = ''
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
