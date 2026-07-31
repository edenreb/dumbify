import type { NavigationState, Video, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, root } from '../core/UIEngine'
import { extractPageVideosWithContinuation, fetchContinuation, diag } from '../core/DataExtractor'
import { navigateTo } from '../core/PageManager'

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
  if (!info) return

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
    note.textContent = info.note
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

function renderVideo(v: Video): HTMLElement {
  const article = document.createElement('a')
  article.className = 'df-item-row'
  article.href = v.url
  article.onclick = (e) => {
    e.preventDefault()
    if (v.url.startsWith('/watch')) {
      window.location.href = v.url
    } else {
      navigateTo(v.url)
    }
  }
  article.onkeydown = (e) => {
    if (e.key === 'Enter') {
      if (v.url.startsWith('/watch')) {
        window.location.href = v.url
      } else {
        navigateTo(v.url)
      }
    }
  }

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
    if (v.views) {
      const sep = document.createElement('span')
      sep.className = 'df-item-meta-sep'
      sep.textContent = '/'
      meta.appendChild(sep)
      const vw = document.createElement('span')
      vw.textContent = v.views
      meta.appendChild(vw)
    }
    if (v.published) {
      const sep = document.createElement('span')
      sep.className = 'df-item-meta-sep'
      sep.textContent = '/'
      meta.appendChild(sep)
      const pub = document.createElement('span')
      pub.textContent = v.published
      meta.appendChild(pub)
    }
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

export const homeFeedFeature: Feature = {
  id: 'home-feed',

  mount(nav: NavigationState) {
    feedCancelled = false
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
        const result = await fetchContinuation(continuationToken || '', nav.route)
        if (feedCancelled) return
        continuationToken = result.token
        if (result.videos.length) {
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
    this.mount(nav)
  },
}
