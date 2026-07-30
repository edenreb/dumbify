import type { NavigationState, Video, Route } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, root } from '../core/UIEngine'
import { extractPageVideos, extractHistoryVideos, extractPageVideosWithContinuation, fetchContinuation, diag } from '../core/DataExtractor'
import { navigateTo } from '../core/PageManager'

const ROUTE_TITLES: Partial<Record<Route, string>> = {
  home: 'Home', history: 'History', subscriptions: 'Subscriptions',
  'watch-later': 'Watch Later', playlist: 'Playlist', channel: 'Channel', search: 'Search',
}

function renderVideo(v: Video): HTMLElement {
  const article = document.createElement('article')
  article.className = 'df-video'
  article.tabIndex = 0
  article.setAttribute('role', 'link')
  article.setAttribute('aria-label', `Watch ${v.title} by ${v.channel}`)
  const title = document.createElement('h2')
  title.className = 'df-video-title'
  title.textContent = v.title
  article.appendChild(title)
  const row = document.createElement('div')
  row.className = 'df-video-meta'
  const ch = document.createElement('span')
  ch.className = 'df-video-channel'
  ch.textContent = v.channel
  row.appendChild(ch)
  if (v.views) { row.appendChild(document.createTextNode(' · ')); const s = document.createElement('span'); s.textContent = v.views; row.appendChild(s) }
  if (v.published) { row.appendChild(document.createTextNode(' · ')); const s = document.createElement('span'); s.textContent = v.published; row.appendChild(s) }
  if (v.duration) { row.appendChild(document.createTextNode(' · ')); const s = document.createElement('span'); s.textContent = v.duration; row.appendChild(s) }
  article.appendChild(row)
  article.onclick = () => navigateTo(v.url)
  article.onkeydown = (e) => { if (e.key === 'Enter') navigateTo(v.url) }
  return article
}

let feedCancelled = false
let styleInjected = false
function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.id = 'df-feed-style'
  style.textContent = `
    .df-video { padding: 1.5em 0; cursor: pointer; text-align: center; }
    .df-video:hover { opacity: 0.7; }
    .df-diag { margin: 0.5rem 0; padding: 0.5rem; font: 11px/1.4 monospace; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; color: #333; text-align: left; }
    .df-diag-ok { color: #090; }
    .df-diag-fail { color: #c00; }
  `
  document.head.appendChild(style)
}

export const homeFeedFeature: Feature = {
  id: 'home-feed',

  mount(nav: NavigationState) {
    feedCancelled = false
    injectStyles()
    content.innerHTML = ''

    const title = ROUTE_TITLES[nav.route]
    if (title) {
      const h = document.createElement('h1')
      h.className = 'df-page-title'
      h.textContent = title
      content.appendChild(h)
    }

    const list = document.createElement('div')
    list.id = 'df-feed'

    const loading = document.createElement('div')
    loading.className = 'df-loading'
    loading.textContent = 'Loading...'
    list.appendChild(loading)
    content.appendChild(list)

    const diagEl = document.createElement('div')
    diagEl.className = 'df-diag'
    diagEl.textContent = 'Waiting...'
    content.appendChild(diagEl)

    let continuationToken: string | null = null
    let loadingMore = false
    let loadCount = 0
    let initialLoadDone = false
    const videoIds = new Set<string>()

    const onScroll = () => {
      if (loadingMore || !initialLoadDone) return
      if (root.scrollHeight - root.scrollTop - root.clientHeight < 600) {
        loadMore()
      }
    }

    function appendVideos(videos: Video[]) {
      if (feedCancelled) return
      if (list.querySelector('.df-loading, .df-empty')) list.innerHTML = ''
      const newVids = videos.filter((v) => !videoIds.has(v.id))
      newVids.forEach((v) => { videoIds.add(v.id); list.appendChild(renderVideo(v)) })
      diag.push(`appendVideos: ${videos.length} received, ${newVids.length} new, ${videoIds.size} total`)
    }

    function showEmpty() {
      if (feedCancelled) return
      list.innerHTML = ''
      const empty = document.createElement('div')
      empty.className = 'df-empty'
      empty.textContent = 'No videos to display'
      list.appendChild(empty)
    }

    function updateDiag() {
      const hasToken = continuationToken ? `Has token (${continuationToken.slice(0, 20)}...)` : 'No token'
      diag.push(`updateDiag: computed ${hasToken}, typeof ct=${typeof continuationToken}, len=${(continuationToken||'').length}`)
      const lines = [`${hasToken} | Loads: ${loadCount} | Scroll: ${root.scrollTop.toFixed(0)}/${root.scrollHeight.toFixed(0)}`, ...diag]
      diagEl.innerHTML = lines.map((line) => escapeHTML(line)).join('\n')
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
        updateDiag()
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
        diag.push(`doLoad: continuationToken=${typeof continuationToken} ${continuationToken ? continuationToken.slice(0,30)+'...' : 'null'}`)
      } else if (nav.route === 'history') {
        videos = await extractHistoryVideos()
      } else {
        videos = await extractPageVideos()
      }

      if (feedCancelled) return

      if (videos.length) {
        appendVideos(videos)
      } else {
        showEmpty()
      }

      updateDiag()
      initialLoadDone = true
    }

    const loadBtn = document.createElement('button')
    loadBtn.textContent = 'Load More'
    loadBtn.style.cssText = 'display:block;margin:16px auto;padding:8px 20px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:14px;cursor:pointer;'
    loadBtn.onclick = () => loadMore()
    content.appendChild(loadBtn)

    root.addEventListener('scroll', onScroll, { passive: true })
    ;(root as any).__dfScrollHandler = onScroll

    doLoad()
  },

  unmount() {
    feedCancelled = true
    const h = (root as any).__dfScrollHandler
    if (h) root.removeEventListener('scroll', h)
    delete (root as any).__dfScrollHandler
    content.innerHTML = ''
  },
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
