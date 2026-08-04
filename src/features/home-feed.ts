import type { NavigationState, Video, Channel, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, root } from '../core/UIEngine'
import { extractPageVideosWithContinuation, fetchContinuation, fetchSearchResults, fetchChannelPage, diag } from '../core/DataExtractor'
import type { SearchItem } from '../core/DataExtractor'

const ROUTE_TITLES: Partial<Record<Route, { eyebrow: string; title: string; note: string; aside?: string }>> = {
  home: {
    eyebrow: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    title: "Today's reading list",
    note: 'Recommendations, chosen once and held still for the day. Nothing refreshes while you read.',
  },
  history: {
    eyebrow: 'Logbook',
    title: 'History',
    note: 'Kept locally, plainly listed, easy to clear. A record, not a feed.',
    aside: 'Clear all',
  },
  subscriptions: {
    eyebrow: 'Subscriptions',
    title: 'Subscriptions',
    note: 'No badges, no bells. New titles simply appear at the top of the list.',
  },
  'watch-later': {
    eyebrow: 'Queue',
    title: 'Watch Later',
    note: 'Saved for when you have time.',
    aside: 'Sort by length',
  },
  search: {
    eyebrow: 'Search',
    title: 'Search results',
    note: '',
  },
  playlist: {
    eyebrow: 'Playlist',
    title: 'Playlist',
    note: '',
  },
  channel: {
    eyebrow: 'Channel',
    title: 'Channel',
    note: '',
  },
}

const TOOLBAR_OPTIONS: Partial<Record<Route, string[]>> = {
  home: ['Recommended', 'Newest', 'Shortest first'],
  history: ['All time', 'This week', 'Unfinished only'],
  'watch-later': ['Added order', 'Shortest first', 'Longest first'],
}

function renderPageHead(nav: NavigationState) {
  const info = ROUTE_TITLES[nav.route]
  if (!info || nav.route === 'channel') return

  const head = document.createElement('header')
  head.className = 'df-page-head'

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

function renderToolbar(route: Route) {
  const options = TOOLBAR_OPTIONS[route]
  if (!options) return

  const bar = document.createElement('div')
  bar.className = 'df-toolbar'

  options.forEach((o, i) => {
    const span = document.createElement('span')
    span.className = i === 0 ? 'df-toolbar-item df-active' : 'df-toolbar-item'
    span.textContent = o
    bar.appendChild(span)
  })

  content!.appendChild(bar)
}

function renderChannelBanner(ch: Channel, before?: HTMLElement) {
  const banner = document.createElement('a')
  banner.className = 'df-channel-banner'
  banner.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/channel/${ch.id}` }
  banner.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); window.location.href = `/channel/${ch.id}` } }
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

// Dumbify overlays the real YouTube page rather than replacing it, so the
// native Subscribe control is still live in the document underneath our UI.
// Clicking it directly (like the watch page does for Like/Watch Later) is
// far more reliable than reconstructing InnerTube subscribe params from
// fetched channel JSON, which YouTube's button/endpoint shapes break often.
// NOTE: '#subscribe-button' looks like an obvious selector but is a trap - YouTube
// reuses that id on an unrelated empty placeholder <div> inside shelf renderers
// (e.g. "featured channels" recommendation cards), so it matches before the real
// button and silently no-ops on click. Confirmed live; do not add it back.
const SUBSCRIBE_SELECTORS = [
  'ytd-subscribe-button-renderer button',
  'ytd-subscribe-button-renderer',
  'yt-page-header-view-model yt-flexible-actions-view-model button[aria-label^="Subscribe" i]',
  'yt-page-header-view-model yt-flexible-actions-view-model button[aria-label^="Unsubscribe" i]',
  'yt-flexible-actions-view-model button[aria-label^="Subscribe" i]',
  'yt-flexible-actions-view-model button[aria-label^="Unsubscribe" i]',
  'button[aria-label^="Subscribe" i]',
  'button[aria-label^="Unsubscribe" i]',
]

let subObserver: MutationObserver | null = null

function nativeSubscribeEl(): HTMLElement | null {
  for (const sel of SUBSCRIBE_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function nativeSubscribedState(el: HTMLElement): boolean {
  const btn = el.querySelector<HTMLElement>('button[aria-label], button[aria-pressed]') ?? el
  if (btn.getAttribute('aria-pressed') === 'true') return true
  const label = (btn.getAttribute('aria-label') ?? '').trim()
  if (/^unsubscribe/i.test(label)) return true
  if (/^subscribe(?! to)/i.test(label)) return false
  return /^subscribed$/i.test((btn.textContent ?? '').trim())
}

function setSubUi(btn: HTMLButtonElement, subscribed: boolean) {
  btn.classList.toggle('df-sub-btn--on', subscribed)
  btn.textContent = subscribed ? 'Subscribed' : 'Subscribe'
}

function syncSubState(btn: HTMLButtonElement) {
  const el = nativeSubscribeEl()
  if (el) setSubUi(btn, nativeSubscribedState(el))
}

function watchSubState(btn: HTMLButtonElement) {
  subObserver?.disconnect()
  const target = nativeSubscribeEl()
  if (target) {
    subObserver = new MutationObserver(() => syncSubState(btn))
    subObserver.observe(target.closest('yt-flexible-actions-view-model, ytd-subscribe-button-renderer') ?? target, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ['aria-label', 'aria-pressed', 'class'],
    })
    syncSubState(btn)
    return
  }
  const wait = new MutationObserver(() => {
    if (!nativeSubscribeEl()) return
    wait.disconnect()
    watchSubState(btn)
  })
  wait.observe(document.body, { childList: true, subtree: true })
}

function clickNativeSubscribe(btn: HTMLButtonElement) {
  const el = nativeSubscribeEl()
  if (!el) {
    console.warn('[dumbify] native subscribe button not found')
    return
  }
  const target = el.tagName === 'BUTTON' ? el : (el.querySelector<HTMLElement>('button') ?? el)
  const wasSubscribed = nativeSubscribedState(el)
  setSubUi(btn, !wasSubscribed)
  target.click()
  console.log('[dumbify] clicked subscribe target:', target)
  window.setTimeout(() => syncSubState(btn), 600)
}

function renderChannelHead(ch: Channel, before?: HTMLElement) {
  const head = document.createElement('header')
  head.className = 'df-page-head'

  const body = document.createElement('div')
  body.className = 'df-page-head-body'

  const eyebrow = document.createElement('p')
  eyebrow.className = 'df-page-eyebrow'
  eyebrow.textContent = ch.handle ? `Channel · ${ch.handle.replace('@', '')}` : 'Channel'
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
    subBtn.textContent = 'Subscribe'
    subBtn.onclick = () => clickNativeSubscribe(subBtn)
    aside.appendChild(subBtn)
    watchSubState(subBtn)
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
  card.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/channel/${ch.id}` }
  card.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); window.location.href = `/channel/${ch.id}` } }
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
  article.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.location.href = v.url }
  article.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); window.location.href = v.url } }

  const number = document.createElement('span')
  number.className = 'df-item-number'
  article.appendChild(number)

  const body = document.createElement('span')
  body.className = 'min-w-0'

  const title = document.createElement('span')
  title.className = 'df-item-title'
  title.textContent = v.title
  body.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'df-item-meta'

  const ch = document.createElement('span')
  ch.textContent = v.channel
  meta.appendChild(ch)

  if (v.meta) {
    const sep = document.createElement('span')
    sep.className = 'df-item-meta-sep'
    sep.textContent = '/'
    meta.appendChild(sep)
    const mt = document.createElement('span')
    mt.textContent = v.meta
    meta.appendChild(mt)
  } else {
    const fields: { text: string; cls?: string }[] = []
    if (v.views) fields.push({ text: v.views })
    if (v.published) fields.push({ text: v.published })
    if (dateFirst) fields.reverse()
    fields.forEach((f) => {
      const sep = document.createElement('span')
      sep.className = 'df-item-meta-sep'
      sep.textContent = '/'
      meta.appendChild(sep)
      const el = document.createElement('span')
      if (f.cls) el.className = f.cls
      el.textContent = f.text
      meta.appendChild(el)
    })
  }

  if (v.words) {
    const sep = document.createElement('span')
    sep.className = 'df-item-meta-sep'
    sep.textContent = '/'
    meta.appendChild(sep)
    const tag = document.createElement('span')
    tag.className = 'df-item-tag'
    tag.textContent = v.words
    meta.appendChild(tag)
  }

  body.appendChild(meta)
  article.appendChild(body)

  const dur = document.createElement('span')
  dur.className = 'df-item-duration'
  dur.textContent = v.duration
  article.appendChild(dur)

  return article
}

function updateItemNumbers() {
  const items = content!.querySelectorAll('.df-item-row')
  items.forEach((item, i) => {
    const num = item.querySelector('.df-item-number')
    if (num) num.textContent = String(i + 1).padStart(2, '0')
  })
}

let feedCancelled = false
let dateFirst = false

export const homeFeedFeature: Feature = {
  id: 'home-feed',

  mount(nav: NavigationState) {
    feedCancelled = false
    dateFirst = nav.route === 'channel'
    content!.innerHTML = ''

    renderPageHead(nav)
    renderToolbar(nav.route)

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
    let loadCount = 0
    let initialLoadDone = false
    const videoIds = new Set<string>()
    const channelIds = new Set<string>()
    let featuredChannelId: string | null = null
    let channelVideos: Video[] = []
    let aboutEl: HTMLElement | null = null
    let tabsEl: HTMLElement | null = null

    const onScroll = () => {
      if (loadingMore || !initialLoadDone) return
      if (root!.scrollHeight - root!.scrollTop - root!.clientHeight < 600) {
        loadMore()
      }
    }

    function appendVideos(videos: Video[]) {
      if (feedCancelled) return
      if (list.querySelector('.df-loading, .df-empty')) list.innerHTML = ''
      const newVids = videos.filter((v) => !videoIds.has(v.id))
      newVids.forEach((v) => { videoIds.add(v.id); list.appendChild(renderVideo(v)) })
      updateItemNumbers()
    }

    function appendSearchItems(items: SearchItem[]) {
      if (feedCancelled) return
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
      updateItemNumbers()
    }

    function rerenderChannelList(sorted: Video[]) {
      if (feedCancelled) return
      list.innerHTML = ''
      videoIds.clear()
      const newVids = sorted.filter((v) => !videoIds.has(v.id))
      newVids.forEach((v) => { videoIds.add(v.id); list.appendChild(renderVideo(v)) })
      updateItemNumbers()
    }

    function setTab(tab: string) {
      if (tabsEl) {
        const spans = tabsEl.querySelectorAll('.df-toolbar-item')
        spans.forEach((s, i) => s.classList.toggle('df-active', i === (tab === 'videos' ? 0 : tab === 'popular' ? 1 : tab === 'playlists' ? 2 : 3)))
      }
      if (aboutEl) aboutEl.style.display = tab === 'about' ? '' : 'none'
      if (list) list.style.display = tab === 'about' ? 'none' : ''
      if (tab === 'popular') rerenderChannelList([...channelVideos].sort((a, b) => parseViews(b.views) - parseViews(a.views)))
      if (tab === 'videos') rerenderChannelList(channelVideos)
      if (tab === 'playlists') { list.innerHTML = ''; const e = document.createElement('div'); e.className = 'df-empty'; e.textContent = 'No playlists to display'; list.appendChild(e) }
    }

    function renderChannelTabs(before: HTMLElement) {
      tabsEl = document.createElement('div')
      tabsEl.className = 'df-toolbar df-channel-tabs'
      const labels = ['Videos', 'Popular', 'Playlists', 'About']
      labels.forEach((o, i) => {
        const span = document.createElement('span')
        span.className = i === 0 ? 'df-toolbar-item df-active' : 'df-toolbar-item'
        span.textContent = o
        span.onclick = () => setTab(i === 0 ? 'videos' : i === 1 ? 'popular' : i === 2 ? 'playlists' : 'about')
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
      if (loadingMore || feedCancelled) return
      loadingMore = true
      try {
        const result = await fetchContinuation(continuationToken || '', nav.route, nav.searchQuery ?? '', nav.channelId ?? '')
        if (feedCancelled) return
        continuationToken = result.token
        if (nav.route === 'search' && result.items?.length) {
          loadCount++
          appendSearchItems(result.items)
        } else if (result.videos.length) {
          loadCount++
          appendVideos(result.videos)
        }
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
        channelVideos = result.videos
        videos = result.videos
        continuationToken = result.continuation
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
    subObserver?.disconnect()
    subObserver = null
    content!.innerHTML = ''
  },

  update(nav: NavigationState) {
    this.mount(nav)
  },
}
