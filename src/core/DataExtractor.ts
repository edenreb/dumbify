import type { Video, WatchData } from '../types'

export const diag: string[] = []
function log(...args: any[]) {
  diag.push(args.join(' '))
  console.log('[Dumbify]', ...args)
}

function parseJSONBlock(text: string, start: number): any {
  let depth = 0, inStr = false, strChar = '', esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (!inStr && (c === '"' || c === "'")) { inStr = true; strChar = c; continue }
    if (inStr && c === strChar) { inStr = false; strChar = ''; continue }
    if (inStr) continue
    if (c === '}') depth--
    if (c === '{') depth++
    if (depth < 0) return null
    if (c === '}' && depth === 0) return JSON.parse(text.slice(start, i + 1))
  }
  return null
}

function tryFindInText(text: string, name: string): any {
  const idx = text.indexOf(name)
  if (idx === -1) return null
  for (const m of [`${name}=`, `${name} = `, `window.${name}=`, `window.${name} = `, `var ${name}=`, `var ${name} = `]) {
    const from = text.indexOf(m, idx)
    if (from === -1) continue
    try { const d = parseJSONBlock(text, from + m.length); if (d) return d } catch {}
  }
  return null
}

function extractFromScripts(name: string): any {
  for (const s of document.querySelectorAll('script')) {
    if (s.src) continue
    const d = tryFindInText(s.textContent ?? '', name)
    if (d) return d
  }
  return null
}

function tryFindYTCfg(): any {
  for (const s of document.querySelectorAll('script')) {
    if (s.src) continue
    const t = s.textContent ?? ''
    if (t.length < 50) continue

    let idx = 0
    while (true) {
      idx = t.indexOf('ytcfg.set(', idx)
      if (idx === -1) break
      const after = idx + 'ytcfg.set('.length
      const ch = t[after]

      if (ch === '{') {
        try { const d = parseJSONBlock(t, after); if (d?.INNERTUBE_API_KEY) return d } catch {}
      } else if (ch === '"' || ch === "'") {
        const quoteEnd = t.indexOf(ch, after + 1)
        if (quoteEnd !== -1) {
          const comma = t.indexOf(',', quoteEnd + 1)
          if (comma !== -1) {
            for (let k = comma + 1; k < t.length; k++) {
              if (t[k] === '{') {
                try { const d = parseJSONBlock(t, k); if (d?.INNERTUBE_API_KEY) return d } catch {}
                break
              }
              if (t[k] !== ' ' && t[k] !== '\t' && t[k] !== '\n') break
            }
          }
        }
      }
      idx++
    }

    const cfg: any = {}
    let found = 0
    const pairRx = /ytcfg\.set\s*\(\s*["']([^"']+)["']\s*,\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\{[^}]*\}|true|false|null|-?\d+(?:\.\d+)?))\s*\)\s*;?/g
    let m
    while ((m = pairRx.exec(t)) !== null) {
      try { cfg[m[1]] = JSON.parse(m[2]); found++ } catch { cfg[m[1]] = m[2] }
    }
    if (found > 0 && cfg.INNERTUBE_API_KEY) return cfg
  }

  const data = tryFindInText(document.documentElement.innerHTML || '', 'ytcfg')
  if (data?.INNERTUBE_API_KEY) return data
  return null
}

function fetchDataViaBackground<T>(name: string): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000)
    try {
      chrome.runtime.sendMessage({ type: 'GET_YT_DATA', name }, (data) => {
        clearTimeout(timer)
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(data ?? null)
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
}

async function callInnerTube(endpoint: string, body: any): Promise<any> {
  try {
    let cfg = tryFindYTCfg()
    if (!cfg) {
      cfg = await new Promise<any>((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000)
        try {
          chrome.runtime.sendMessage({ type: 'GET_YT_CFG' }, (data) => {
            clearTimeout(timer)
            if (chrome.runtime.lastError) { resolve(null); return }
            resolve(data ?? null)
          })
        } catch { clearTimeout(timer); resolve(null) }
      })
    }
    if (!cfg?.INNERTUBE_API_KEY) return null

    // Use full context from ytcfg if available, otherwise build minimal context
    const context = cfg.INNERTUBE_CONTEXT || {
      client: {
        clientName: cfg.INNERTUBE_CLIENT_NAME || 'WEB',
        clientVersion: cfg.INNERTUBE_CLIENT_VERSION || '2.20250101',
        hl: 'en', gl: 'US',
      },
    }

    const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${cfg.INNERTUBE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, ...body }),
      credentials: 'include',
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

function vidFromRenderer(r: any): Video | null {
  if (!r?.videoId) return null
  return {
    id: r.videoId,
    title: r.title?.runs?.[0]?.text ?? '',
    channel: r.ownerText?.runs?.[0]?.text ?? r.shortBylineText?.runs?.[0]?.text ?? '',
    channelId: r.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      ?? r.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
    url: `/watch?v=${r.videoId}`,
    views: r.viewCountText?.simpleText ?? r.viewCountText?.runs?.map((x: any) => x.text).join('') ?? '',
    published: r.publishedTimeText?.simpleText ?? '',
    duration: r.lengthText?.simpleText ?? '',
    verified: !!r.ownerBadges?.some((b: any) => b?.metadataBadgeRenderer?.tooltip === 'Verified'),
    live: !!r.badges?.some((b: any) => b?.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW'),
  }
}

function extractText(v: any): string {
  if (typeof v === 'string') return v
  if (!v || typeof v !== 'object') return ''
  if (typeof v.content === 'string') return v.content
  if (v.runs?.[0]?.text) return v.runs[0].text
  if (v.simpleText) return v.simpleText
  return ''
}

function vidFromLockup(lockup: any): Video | null {
  if (!lockup?.contentId || !lockup?.metadata?.lockupMetadataViewModel) return null

  const lmv = lockup.metadata.lockupMetadataViewModel
  const title = extractText(lmv.title?.content)
  if (!title) return null

  const rows = lmv.metadata?.contentMetadataViewModel?.metadataRows
  let channel = '', views = '', published = ''

  if (Array.isArray(rows)) {
    if (rows[0]?.metadataParts?.[0]) channel = extractText(rows[0].metadataParts[0].text)
    if (rows[1]?.metadataParts) {
      const parts = rows[1].metadataParts
      if (parts[0]) views = extractText(parts[0].text)
      if (parts[1]) published = extractText(parts[1].text)
    }
  }

  let duration = ''
  try {
    const ov = lockup.contentImage?.thumbnailViewModel?.overlays
    const badge = ov?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel
    if (typeof badge === 'string') duration = badge
    else duration = extractText(badge)
  } catch {}

  return {
    id: lockup.contentId,
    title,
    channel,
    channelId: lmv.metadata?.contentMetadataViewModel?.ownerName ?? '',
    url: `/watch?v=${lockup.contentId}`,
    views,
    published,
    duration,
    verified: false,
    live: lockup.contentType === 'LOCKUP_CONTENT_TYPE_LIVE_STREAM',
  }
}

function vidFromDOM(el: Element): Video | null {
  const link = el.querySelector<HTMLAnchorElement>('a#video-title, #video-title a, a#video-title-link')
  const title = link?.title?.trim() ?? link?.textContent?.trim() ?? ''
  const href = link?.getAttribute('href') ?? ''
  const idMatch = href.match(/(?:v=|\/)([\w-]{11})(?:\?|&|$)/)
  if (!idMatch) return null
  const channelEl = el.querySelector('ytd-channel-name a, ytd-channel-name yt-formatted-string')
  const channel = channelEl?.textContent?.trim() ?? ''
  const meta = el.querySelector('#metadata-line, ytd-video-meta-block')
  const spans = meta ? Array.from(meta.querySelectorAll('span')) : []
  const durEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer')
  const dur = durEl?.textContent?.trim() ?? ''
  return {
    id: idMatch[1], title, channel, channelId: '',
    url: href.startsWith('/') ? href : `/watch?v=${idMatch[1]}`,
    views: spans[0]?.textContent?.trim() ?? '',
    published: spans[1]?.textContent?.trim() ?? '',
    duration: dur, verified: false, live: false,
  }
}

function extractLockupVideos(data: any): Video[] {
  const c = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
  const items = c?.richGridRenderer?.contents ?? []
  const out: Video[] = []
  for (const item of items) {
    const lockup = item?.richItemRenderer?.content?.lockupViewModel
    if (lockup) { const v = vidFromLockup(lockup); if (v) out.push(v) }
  }
  return out
}

function extractFromData(data: any): Video[] {
  const attempts: ((d: any) => Video[])[] = [
    (d) => {
      const c = d?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      const items = c?.richGridRenderer?.contents ?? []
      const out: Video[] = []
      for (const item of items) {
        const vr = item?.richItemRenderer?.content?.videoRenderer
        if (vr?.videoId) { const v = vidFromRenderer(vr); if (v) out.push(v) }
      }
      return out
    },
    (d) => {
      const c = d?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      const sections = c?.sectionListRenderer?.contents ?? []
      const out: Video[] = []
      for (const sec of sections) {
        for (const item of (sec?.itemSectionRenderer?.contents ?? [])) {
          const vr = item?.videoRenderer
          if (vr?.videoId) { const v = vidFromRenderer(vr); if (v) out.push(v) }
        }
      }
      return out
    },
    (d) => {
      const sections = d?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents ?? []
      const out: Video[] = []
      for (const sec of sections) {
        for (const item of (sec?.itemSectionRenderer?.contents ?? [])) {
          const vr = item?.videoRenderer
          if (vr?.videoId) { const v = vidFromRenderer(vr); if (v) out.push(v) }
        }
      }
      return out
    },
    (d) => {
      const tabs = d?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? []
      const out: Video[] = []
      for (const tab of tabs) {
        const c = tab?.tabRenderer?.content
        if (!c) continue
        if (c.sectionListRenderer) {
          for (const sec of (c.sectionListRenderer.contents ?? [])) {
            for (const item of (sec?.itemSectionRenderer?.contents ?? [])) {
              const vr = item?.videoRenderer
              if (vr?.videoId && !out.find((x) => x.id === vr.videoId)) {
                const v = vidFromRenderer(vr)
                if (v) out.push(v)
              }
            }
          }
        }
        if (c.richGridRenderer) {
          for (const item of (c.richGridRenderer.contents ?? [])) {
            const lockup = item?.richItemRenderer?.content?.lockupViewModel
            if (lockup) { const v = vidFromLockup(lockup); if (v && !out.find((x) => x.id === v.id)) out.push(v) }
          }
        }
      }
      return out
    },
  ]

  for (const fn of attempts) {
    try {
      const result = fn(data)
      if (result.length) return result
    } catch {}
  }

  const lockupVids = extractLockupVideos(data)
  if (lockupVids.length) return lockupVids

  const recurse = findVideoRenderers(data)
  if (recurse.length) return recurse

  return []
}

function findVideoRenderers(obj: any, depth = 0, maxDepth = 20): any[] {
  if (depth > maxDepth || typeof obj !== 'object' || obj === null) return []
  if (Array.isArray(obj)) {
    const results: any[] = []
    for (const item of obj) {
      const found = findVideoRenderers(item, depth + 1, maxDepth)
      results.push(...found)
    }
    return results
  }
  const rendererKeys = ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer',
    'reelItemRenderer', 'playlistVideoRenderer', 'movieRenderer', 'showRenderer',
    'cardVideoRenderer', 'shortVideoRenderer']
  for (const key of rendererKeys) {
    const renderer = obj[key]
    if (renderer?.videoId) {
      const v = vidFromRenderer(renderer)
      if (v) return [v]
    }
  }
  if (obj.lockupViewModel?.contentId) {
    const v = vidFromLockup(obj.lockupViewModel)
    if (v) return [v]
  }
  if (obj.videoId && typeof obj.videoId === 'string' && obj.title && (obj.lengthText || obj.viewCountText || obj.publishedTimeText)) {
    const v = vidFromRenderer(obj)
    if (v) return [v]
  }
  for (const key of Object.keys(obj)) {
    const found = findVideoRenderers(obj[key], depth + 1, maxDepth)
    if (found.length) return found
  }
  return []
}

function extractFromDOM(): Video[] {
  const selectors = ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-compact-video-renderer', 'ytd-playlist-video-renderer']
  const videos: Video[] = []
  const seen = new Set<string>()
  for (const sel of selectors) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const v = vidFromDOM(el)
      if (v && !seen.has(v.id)) { seen.add(v.id); videos.push(v) }
    })
  }
  return videos
}

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'text/html,application/xhtml+xml' } })
    return res.ok ? await res.text() : null
  } catch { return null }
}

async function extractFromFetchedHTML(name: string): Promise<any> {
  const html = await fetchHTML(location.href)
  if (!html) return null
  for (const m of [`${name}=`, `${name} = `, `window.${name}=`, `window.${name} = `, `var ${name}=`, `var ${name} = `]) {
    const p = html.indexOf(m)
    if (p !== -1) { try { const d = parseJSONBlock(html, p + m.length); if (d) return d } catch {} }
  }
  return null
}

function getYTDataSync(name: string): any {
  const fromScripts = extractFromScripts(name)
  if (fromScripts) { log(`  found ${name} in script tags`); return fromScripts }
  return null
}

async function getYTDataAsync(name: string): Promise<any> {
  const fromBackground = await fetchDataViaBackground(name)
  if (fromBackground) { log(`  ${name} from background bridge`); return fromBackground }
  const fromFetch = await extractFromFetchedHTML(name)
  if (fromFetch) { log(`  ${name} from fetch HTML`); return fromFetch }
  return null
}

function extractContinuationToken(data: any): string | null {
  try {
    const c = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
    if (!c) { log('  extractContinuationToken: no content'); return null }
    const items = c?.richGridRenderer?.contents ?? []
    const last = items[items.length - 1]
    if (!last) { log('  extractContinuationToken: no last item'); return null }
    const token = last?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null
    log(`  extractContinuationToken => ${token ? token.slice(0,30)+'...' : 'null'}`)
    return token
  } catch (e: any) { log(`  extractContinuationToken ERROR: ${e.message}`); return null }
}

function extractContinuationVideos(data: any): { videos: Video[]; token: string | null } {
  const videos: Video[] = []
  let token: string | null = null
  try {
    const eps = data?.onResponseReceivedEndpoints ?? data?.onResponseReceivedActions ?? []
    log(`extractContinuationVideos: ${eps.length} endpoints`)
    for (const ep of eps) {
      log(`  endpoint keys=${Object.keys(ep).join(',')}`)
      const appendAction = ep?.appendContinuationItemsAction
      if (appendAction) {
        log(`  appendContinuationItemsAction keys=${Object.keys(appendAction).join(',')}`)
        const items = appendAction?.continuationItems ?? []
        log(`  ${items.length} continuationItems`)
        for (let i = 0; i < Math.min(items.length, 3); i++) {
          const item = items[i]
          log(`  item[${i}] keys=${Object.keys(item).join(',')}`)
          const rsr = item?.richSectionRenderer
          if (rsr) {
            log(`    richSectionRenderer keys=${Object.keys(rsr).join(',')}`)
            if (rsr.content) {
              const ck = Object.keys(rsr.content)
              log(`    rsr.content keys=${ck.join(',')}`)
              // Dump backgroundPromoRenderer structure
              if (rsr.content.backgroundPromoRenderer) {
                const bpr = rsr.content.backgroundPromoRenderer
                log(`    backgroundPromoRenderer keys=${Object.keys(bpr).join(',')}`)
                // Dump all nested keys recursively (shallow)
                for (const k of Object.keys(bpr)) {
                  const v = bpr[k]
                  if (v && typeof v === 'object') {
                    log(`      ${k} type=object keys=${Object.keys(v).join(',')}`)
                  } else {
                    log(`      ${k}=${String(v).slice(0,60)}`)
                  }
                }
              }
            }
          }
        }
        for (const item of items) {
          const ri = item?.richItemRenderer ?? item?.richSectionRenderer?.content?.richItemRenderer
          const lockup = ri?.content?.lockupViewModel
          if (lockup) { const v = vidFromLockup(lockup); if (v) videos.push(v) }
          if (item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
            token = item.continuationItemRenderer.continuationEndpoint.continuationCommand.token
          }
        }
      } else {
        log(`  no appendContinuationItemsAction found`)
      }
    }
  } catch (e: any) { log(`extractContinuationVideos ERROR: ${e.message}`) }
  log(`extractContinuationVideos result: ${videos.length} videos, token=${token ? token.slice(0,20)+'...' : 'null'}`)
  return { videos, token }
}

async function tryBrowseAPI(browseId: string): Promise<Video[]> {
  const data = await callInnerTube('browse', { browseId })
  if (!data) return []
  return extractFromData(data)
}

const ROUTE_URLS: Record<string, string> = {
  home: '/',
  subscriptions: '/feed/subscriptions',
  history: '/feed/history',
  'watch-later': '/playlist?list=WL',
  trending: '/feed/trending',
}

async function fetchFreshData(route = 'home'): Promise<{ videos: Video[]; token: string | null } | null> {
  const url = (ROUTE_URLS[route] || '/') + '?df=' + Date.now()
  try {
    const res = await fetch(location.origin + url, {
      credentials: 'include',
      headers: { 'Accept': 'text/html', 'Range': 'bytes=0-400000' },
    })
    if (!res.ok && res.status !== 206) return null
    const text = await res.text()
    for (const p of ['window.ytInitialData = ', 'ytInitialData = ']) {
      const idx = text.indexOf(p)
      if (idx === -1) continue
      const start = text.indexOf('{', idx + p.length)
      if (start === -1) continue
      let depth = 0, inStr = false, strChar = ''
      for (let i = start; i < text.length; i++) {
        const c = text[i]
        if (inStr) { if (c === strChar && text[i-1] !== '\\') inStr = false; continue }
        if (c === '"' || c === "'") { inStr = true; strChar = c; continue }
        if (c === '{') depth++
        if (c === '}') { depth--; if (depth === 0) { try { const d = JSON.parse(text.slice(start, i + 1)); return { videos: extractFromData(d), token: extractContinuationToken(d) } } catch { return null } } }
      }
    }
    return null
  } catch { return null }
}

export async function fetchContinuation(token: string, route = 'home'): Promise<{ videos: Video[]; token: string | null }> {
  const result = await fetchFreshData(route)
  if (!result) return { videos: [], token: null }
  log(`fetchContinuation: got ${result.videos.length} videos for ${route}, token=${result.token ? 'yes' : 'no'}`)
  return result
}

export interface PageResult {
  videos: Video[]
  continuation: string | null
}

export async function extractPageVideosWithContinuation(): Promise<PageResult> {
  diag.length = 0

  const syncData = getYTDataSync('ytInitialData')
  if (syncData) {
    const videos = extractFromData(syncData)
    const token = extractContinuationToken(syncData)
    // Log background promo details
    try {
      const items = syncData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.richGridRenderer?.contents ?? []
      const types = items.map((item: any) => Object.keys(item)[0])
      log(`richGrid items (${items.length}): ${types.join(', ')}`)
      const firstRi = items[0]?.richItemRenderer
      if (firstRi) {
        const ck = firstRi.content ? Object.keys(firstRi.content).join(',') : 'no content'
        log(`  first richItemRenderer content keys=${ck}`)
      }
      const last = items[items.length - 1]
      if (last?.continuationItemRenderer?.continuationEndpoint?.continuationCommand) {
        const cmd = last.continuationItemRenderer.continuationEndpoint.continuationCommand
        log(`  continuation token prefix=${cmd.token.slice(0,40)} request=${cmd.request ? cmd.request.slice(0,40) : 'none'}`)
      }
    } catch {}
    if (videos.length) return { videos, continuation: token }
  }

  const data = await callInnerTube('browse', { browseId: 'FEwhat_to_watch' })
  if (data) {
    const videos = extractFromData(data)
    const token = extractContinuationToken(data)
    if (videos.length) return { videos, continuation: token }
  }

  const asyncData = await getYTDataAsync('ytInitialData')
  if (asyncData) {
    const videos = extractFromData(asyncData)
    const token = extractContinuationToken(asyncData)
    if (videos.length) return { videos, continuation: token }
  }

  const domVideos = extractFromDOM()
  return { videos: domVideos, continuation: null }
}

export async function extractPageVideos(): Promise<Video[]> {
  diag.length = 0
  log('=== extractPageVideos ===')

  const syncData = getYTDataSync('ytInitialData')
  if (syncData) { const v = extractFromData(syncData); if (v.length) { log(`OK: ${v.length} videos`); return v } }

  const apiVideos = await tryBrowseAPI('FEwhat_to_watch')
  if (apiVideos.length) { log(`OK: ${apiVideos.length} videos from API`); return apiVideos }

  const asyncData = await getYTDataAsync('ytInitialData')
  if (asyncData) { const v = extractFromData(asyncData); if (v.length) { log(`OK: ${v.length} videos`); return v } }

  const domVideos = extractFromDOM()
  if (domVideos.length) { log(`OK: ${domVideos.length} videos from DOM`); return domVideos }

  log('ALL methods FAILED')
  return []
}

export async function extractHistoryVideos(): Promise<Video[]> {
  diag.length = 0
  log('=== extractHistoryVideos ===')

  const syncData = getYTDataSync('ytInitialData')
  if (syncData) { const v = extractFromData(syncData); if (v.length) { log(`OK: ${v.length} videos`); return v } }

  const domVideos = extractFromDOM()
  if (domVideos.length) { log(`OK: ${domVideos.length} videos from DOM`); return domVideos }

  const apiVideos = await tryBrowseAPI('FEhistory')
  if (apiVideos.length) { log(`OK: ${apiVideos.length} videos from API`); return apiVideos }

  const asyncData = await getYTDataAsync('ytInitialData')
  if (asyncData) { const v = extractFromData(asyncData); if (v.length) { log(`OK: ${v.length} videos`); return v } }

  log('ALL methods FAILED')
  return []
}

export function extractWatchData(): WatchData {
  const pr = extractFromScripts('ytInitialPlayerResponse')
  if (pr?.videoDetails) {
    const d = pr.videoDetails
    const mf = pr.microformat?.playerMicroformatRenderer
    return {
      video: {
        id: d.videoId ?? '', title: d.title ?? '', channel: d.author ?? '',
        channelId: d.channelId ?? '', url: `/watch?v=${d.videoId ?? ''}`,
        views: d.viewCount ?? '', published: mf?.publishDate ?? '',
        duration: fmtSec(parseInt(d.lengthSeconds ?? '0')), verified: true,
        live: d.isLive ?? false, description: d.shortDescription ?? '',
      },
      playerReady: true,
    }
  }
  const titleEl = document.querySelector('h1 yt-formatted-string')
  const channelEl = document.querySelector('ytd-channel-name yt-formatted-string a')
  const viewEl = document.querySelector('ytd-video-view-count-renderer span, span[itemprop="interactionStatistic"] span')
  return {
    video: {
      id: new URLSearchParams(location.search).get('v') ?? '',
      title: titleEl?.textContent?.trim() ?? '',
      channel: channelEl?.textContent?.trim() ?? '',
      channelId: '', url: location.href,
      views: viewEl?.textContent?.trim() ?? '',
      published: '', duration: '', verified: false, live: false,
    },
    playerReady: !!document.querySelector('#movie_player, #player-container, #player'),
  }
}

function fmtSec(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}
