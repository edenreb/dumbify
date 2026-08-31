import type { Video, Channel, WatchData } from '../types'

// Extraction tracing fires dozens of times per page load, so it stays off unless
// explicitly asked for: run `localStorage['dumbify:debug'] = '1'` on youtube.com and
// reload. `diag` keeps the last DIAG_LIMIT lines either way - it used to grow without
// bound, since only a handful of entry points ever reset it.
export const DEBUG = (() => {
  try { return localStorage.getItem('dumbify:debug') === '1' } catch { return false }
})()

const DIAG_LIMIT = 200
export const diag: string[] = []
function log(...args: any[]) {
  diag.push(args.join(' '))
  if (diag.length > DIAG_LIMIT) diag.shift()
  if (DEBUG) console.log('[Dumbify]', ...args)
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

// The page's inline scripts never change for a given document, but the same blob was
// being re-scanned and re-JSON.parsed 2-4x per load (extractPageError, extractWatchData
// and extractCommentsFromPage each pulled it fresh) - megabytes of parsing per repeat.
// Keyed on href so YouTube's own SPA navigation can't serve stale data, and only hits
// are cached: a miss may just mean the script hasn't landed yet.
const scriptCache = new Map<string, any>()
let scriptCacheHref = ''

function extractFromScripts(name: string): any {
  if (scriptCacheHref !== location.href) {
    scriptCache.clear()
    scriptCacheHref = location.href
  }
  const cached = scriptCache.get(name)
  if (cached) return cached
  for (const s of document.querySelectorAll('script')) {
    if (s.src) continue
    const d = tryFindInText(s.textContent ?? '', name)
    if (d) { scriptCache.set(name, d); return d }
  }
  return null
}

// Cached for the same reason as extractFromScripts, and more urgently: callInnerTube
// runs this on every API call (every comment page, like, subscribe, playlist edit) and
// each run regex-scans every inline script on the page.
let cfgCache: any = null
let cfgCacheHref = ''

function tryFindYTCfg(): any {
  if (cfgCacheHref === location.href && cfgCache) return cfgCache
  const cfg = findYTCfg()
  if (cfg) { cfgCache = cfg; cfgCacheHref = location.href }
  return cfg
}

function findYTCfg(): any {
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

  // Last resort: the plain-assignment forms, over the same inline scripts. This used to
  // run tryFindInText over document.documentElement.innerHTML - serializing all of
  // youtube.com's DOM to search text that only ever lives in these script tags.
  for (const s of document.querySelectorAll('script')) {
    if (s.src) continue
    const data = tryFindInText(s.textContent ?? '', 'ytcfg')
    if (data?.INNERTUBE_API_KEY) return data
  }
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

async function sapisidAuthHeader(): Promise<string | null> {
  try {
    const cookies = document.cookie.split(';')
    const get = (n: string) => {
      const c = cookies.find((x) => x.trim().startsWith(`${n}=`))
      return c ? c.trim().slice(n.length + 1) : null
    }
    const sid = get('SAPISID') ?? get('__Secure-3PAPISID')
    if (!sid) return null
    const ts = Math.floor(Date.now() / 1000)
    const msg = `${ts} ${sid} https://www.youtube.com`
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(msg))
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `SAPISIDHASH ${ts}_${hex}`
  } catch {
    return null
  }
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

    const auth = await sapisidAuthHeader()
    const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${cfg.INNERTUBE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': cfg.INNERTUBE_CLIENT_NAME === 'WEB' ? '1' : '2',
        'X-Youtube-Client-Version': cfg.INNERTUBE_CLIENT_VERSION || '2.20250101',
        'X-Goog-AuthUser': '0',
        ...(auth ? { Authorization: auth } : {}),
        ...(cfg.VISITOR_DATA ? { 'X-Goog-Visitor-Id': cfg.VISITOR_DATA } : {}),
        ...(cfg.ID_TOKEN ? { 'X-Youtube-Identity-Token': cfg.ID_TOKEN } : {}),
      },
      body: JSON.stringify({ context, ...body }),
      credentials: 'include',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      log(`callInnerTube ${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`)
      return null
    }
    return await res.json()
  } catch { return null }
}

function vidFromRenderer(r: any): Video | null {
  if (!r?.videoId) return null
  const overlayDur = r.thumbnailOverlays?.find(
    (o: any) => o?.thumbnailOverlayTimeStatusRenderer?.text
  )?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText
  return {
    id: r.videoId,
    title: r.title?.runs?.[0]?.text ?? '',
    channel: r.ownerText?.runs?.[0]?.text ?? r.shortBylineText?.runs?.[0]?.text ?? '',
    channelId: r.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      ?? r.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? '',
    url: `/watch?v=${r.videoId}`,
    views: r.viewCountText?.simpleText ?? r.viewCountText?.runs?.map((x: any) => x.text).join('') ?? '',
    published: r.publishedTimeText?.simpleText ?? '',
    duration: r.lengthText?.simpleText ?? overlayDur ?? '',
    verified: !!r.ownerBadges?.some((b: any) => b?.metadataBadgeRenderer?.tooltip === 'Verified'),
    live: !!r.badges?.some((b: any) => b?.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW'),
  }
}

function extractText(v: any): string {
  if (typeof v === 'string') return v
  if (!v || typeof v !== 'object') return ''
  if (typeof v.content === 'string') return v.content
  if (typeof v.text === 'string') return v.text
  if (v.runs?.[0]?.text) return v.runs[0].text
  if (v.simpleText) return v.simpleText
  return ''
}

// Channel.handle has two producers: channelRenderer's `canonicalBaseUrl` is a path
// ("/@Name"), channelMetadataRenderer's `vanityChannelUrl` is absolute
// ("http://www.youtube.com/@Name"). Consumers build links by appending to the origin,
// so the absolute form produced "https://www.youtube.comhttp://www.youtube.com/@Name".
// Normalize to the path form at every site that reads vanityChannelUrl.
function channelHandlePath(url: unknown): string {
  if (typeof url !== 'string' || !url) return ''
  return url.replace(/^https?:\/\/(www\.)?youtube\.com/i, '')
}

function channelFromRenderer(r: any): Channel | null {
  if (!r?.channelId) return null
  const name = extractText(r.title)
  if (!name) return null
  return {
    id: r.channelId,
    name,
    handle: r.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ?? '',
    subscribers: extractText(r.subscriberCountText),
    videoCount: extractText(r.videoCountText),
    description: extractText(r.descriptionSnippet),
    verified: !!r.ownerBadges?.some((b: any) => b?.metadataBadgeRenderer?.tooltip === 'Verified'),
  }
}

export type SearchItem =
  | { kind: 'video'; video: Video }
  | { kind: 'channel'; channel: Channel }

function scanChannelRenderers(obj: any, depth = 0, maxDepth = 20, out: Channel[] = []): Channel[] {
  if (depth > maxDepth || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) scanChannelRenderers(item, depth + 1, maxDepth, out)
    return out
  }
  const c = channelFromRenderer(obj.channelRenderer)
  if (c) out.push(c)
  for (const key of Object.keys(obj)) scanChannelRenderers(obj[key], depth + 1, maxDepth, out)
  return out
}

interface SearchItemSink {
  items: SearchItem[]
  seenVideos: Set<string>
  seenChannels: Set<string>
}

function newSearchItemSink(): SearchItemSink {
  return { items: [], seenVideos: new Set(), seenChannels: new Set() }
}

function collectSearchItem(item: any, sink: SearchItemSink) {
  if (item?.videoRenderer?.videoId) {
    const v = vidFromRenderer(item.videoRenderer)
    if (v && !sink.seenVideos.has(v.id)) { sink.seenVideos.add(v.id); sink.items.push({ kind: 'video', video: v }) }
  } else if (item?.channelRenderer?.channelId) {
    const c = channelFromRenderer(item.channelRenderer)
    if (c && !sink.seenChannels.has(c.id)) { sink.seenChannels.add(c.id); sink.items.push({ kind: 'channel', channel: c }) }
  } else if (item?.lockupViewModel?.contentId) {
    const v = vidFromLockup(item.lockupViewModel)
    if (v && !sink.seenVideos.has(v.id)) { sink.seenVideos.add(v.id); sink.items.push({ kind: 'video', video: v }) }
  }
}

function extractSearchItems(data: any): SearchItem[] {
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
    ?.sectionListRenderer?.contents ?? []
  const sink = newSearchItemSink()

  for (const sec of sections) {
    for (const item of (sec?.itemSectionRenderer?.contents ?? [])) collectSearchItem(item, sink)
  }

  for (const c of scanChannelRenderers(data)) {
    if (!sink.seenChannels.has(c.id)) { sink.seenChannels.add(c.id); sink.items.push({ kind: 'channel', channel: c }) }
  }
  return sink.items
}

function extractChannelHeader(data: any): Channel | null {
  const meta = data?.metadata?.channelMetadataRenderer

  // Try c4TabbedHeaderRenderer (legacy)
  const h = data?.header?.c4TabbedHeaderRenderer
  if (h?.channelId) {
    const sub = extractSubscriptionInfo(data, h.channelId) ?? undefined
    return {
      id: h.channelId,
      name: extractText(h.title) || (meta?.title ?? ''),
      handle: channelHandlePath(meta?.vanityChannelUrl),
      subscribers: extractText(h.subscriberCountText),
      videoCount: extractText(h.videosCountText),
      description: meta?.description ?? '',
      verified: !!h?.badges?.some((b: any) => b?.metadataBadgeRenderer?.tooltip === 'Verified'),
      subscribed: sub?.subscribed,
      subParams: sub?.subParams,
      unsubParams: sub?.unsubParams,
    }
  }

  // Try pageHeaderRenderer (modern YouTube)
  const ph = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel
  if (ph) {
    const rows = ph?.metadata?.contentMetadataViewModel?.metadataRows ?? []
    // channelMetadataRenderer's real UC-id field is `externalId`, not `channelId` (that
    // field doesn't exist on it) - confirmed live: with meta?.channelId always undefined,
    // this always fell through to the metadataRows scan below, which is order-dependent
    // and can grab a "@handle" text part before it ever reaches the "UC..." part on the
    // same row set, locking in the handle as the "channel id" used for the subscribe API
    // call (which then fails, since InnerTube needs the real UC id, not a handle).
    let channelId = meta?.externalId || ''
    let handleFromRow = ''
    let subs = ''
    let vids = ''
    for (const row of rows) {
      for (const part of row.metadataParts ?? []) {
        const t = part?.text?.content ?? ''
        if (!t) continue
        if (!channelId && t.startsWith('UC')) channelId = t
        else if (!handleFromRow && t.startsWith('@')) handleFromRow = t
        else if (/subscriber/i.test(t)) subs = t
        else if (/video/i.test(t)) vids = t
      }
    }
    // A real UC id always wins if found anywhere in the rows, even if scanned after the
    // handle; the handle is only used as an absolute last resort, never a channel id.
    if (!channelId) channelId = handleFromRow
    if (channelId) {
      const sub = extractSubscriptionInfo(data, channelId) ?? undefined
      return {
        id: channelId,
        name: extractText(ph.title) || meta?.title || '',
        handle: channelHandlePath(meta?.vanityChannelUrl),
        subscribers: subs,
        videoCount: vids,
        description: meta?.description ?? '',
        verified: false,
        subscribed: sub?.subscribed,
        subParams: sub?.subParams,
        unsubParams: sub?.unsubParams,
      }
    }
  }

  // Try metadata only
  if (meta?.externalId) {
    const sub = extractSubscriptionInfo(data, meta.externalId) ?? undefined
    return {
      id: meta.externalId,
      name: meta.title ?? '',
      handle: channelHandlePath(meta.vanityChannelUrl),
      subscribers: meta.subscriberCountText ?? '',
      videoCount: meta.videosCountText ?? '',
      description: meta.description ?? '',
      verified: false,
      subscribed: sub?.subscribed,
      subParams: sub?.subParams,
      unsubParams: sub?.unsubParams,
    }
  }

  return null
}

interface SubscriptionInfo {
  subscribed: boolean
  subParams: string
  unsubParams: string
  channelIds: string[]
}

// Confirmed live (2026-08-04) against a real, current channel header's ytInitialData:
// the not-yet-subscribed state is a `buttonViewModel` with a single-level-nested
// `onTap.innertubeCommand.subscribeEndpoint` (not double-nested) - matches the
// buttonViewModel branch below. The subscribeButtonViewModel/subscribeButtonRenderer
// branches (already-subscribed state, and the legacy renderer) were not independently
// re-verified this round (no signed-in/subscribed test session available), but match
// what was previously verified live before this code was extracted - see CLAUDE.md's
// documented subscribeButtonContent.subscribeState.subscribed / onTapCommand shape.
function extractSubscriptionInfo(data: any, channelId: string): SubscriptionInfo | null {
  const found: SubscriptionInfo[] = []
  const walk = (o: any, depth = 0): void => {
    if (depth > 20 || typeof o !== 'object' || o === null) return
    if (Array.isArray(o)) {
      for (const item of o) walk(item, depth + 1)
      return
    }
    let info: SubscriptionInfo | null = null
    const btn = o.subscribeButtonRenderer
    if (btn) {
      const subEp = btn.onSubscribeEndpoints?.[0]?.subscribeEndpoint ?? btn.subscribeEndpoint
      const unsubEp =
        btn.onUnsubscribeEndpoints?.[0]?.signalServiceEndpoint?.actions?.[0]?.unsubscribeEndpoint ??
        btn.onUnsubscribeEndpoints?.[0]?.unsubscribeEndpoint ??
        btn.unsubscribeEndpoint
      if (subEp?.params || unsubEp?.params) {
        info = {
          subscribed: btn.subscribed === true,
          subParams: subEp?.params ?? '',
          unsubParams: unsubEp?.params ?? '',
          channelIds: subEp?.channelIds ?? unsubEp?.channelIds ?? [],
        }
      }
    }
    const vm = o.subscribeButtonViewModel
    if (vm && !info) {
      const subContent = vm.subscribeButtonContent
      const unsubContent = vm.unsubscribeButtonContent
      const subEp = subContent?.onTapCommand?.innertubeCommand?.subscribeEndpoint
      // Confirmed live (2026-08-04) against a real, currently-subscribed channel:
      // unsubscribing shows a confirm dialog, so unsubscribeEndpoint is NOT a direct
      // sibling of unsubscribeButtonContent.onTapCommand.innertubeCommand (that path
      // doesn't exist) - it's nested inside that command's signalServiceEndpoint's
      // openPopupAction confirm dialog, on the dialog's own confirm button:
      // unsubContent.onTapCommand.innertubeCommand.signalServiceEndpoint.actions[0]
      //   .openPopupAction.popup.confirmDialogRenderer.confirmButton.buttonRenderer
      //   .serviceEndpoint.unsubscribeEndpoint
      const unsubEp =
        unsubContent?.onTapCommand?.innertubeCommand?.unsubscribeEndpoint ??
        unsubContent?.onTapCommand?.innertubeCommand?.signalServiceEndpoint?.actions?.[0]?.openPopupAction?.popup
          ?.confirmDialogRenderer?.confirmButton?.buttonRenderer?.serviceEndpoint?.unsubscribeEndpoint
      if (subEp || unsubEp) {
        // subscribeButtonContent/unsubscribeButtonContent's subscribeState.subscribed
        // booleans are NOT reliable live-state signals - confirmed live: both variants
        // shared the identical subscribeState.key while disagreeing on the "subscribed"
        // value (false vs true) for an account actually subscribed, meaning these are
        // static per-variant template defaults, not the resolved current state. Leave
        // `subscribed` false here; the caller falls back to reading the real DOM once
        // to determine the actual current state instead.
        info = {
          subscribed: false,
          subParams: subEp?.params ?? '',
          unsubParams: unsubEp?.params ?? '',
          channelIds: subEp?.channelIds ?? unsubEp?.channelIds ?? [],
        }
      }
    }
    const bv = o.buttonViewModel
    if (bv && !info) {
      const cmd = bv.onTap?.innertubeCommand
      const subEp = cmd?.subscribeEndpoint
      const unsubEp = cmd?.unsubscribeEndpoint
      if (subEp?.params || unsubEp?.params) {
        const title = extractText(bv.title)
        info = {
          subscribed: !!unsubEp || /subscribed/i.test(title),
          subParams: subEp?.params ?? '',
          unsubParams: unsubEp?.params ?? '',
          channelIds: subEp?.channelIds ?? unsubEp?.channelIds ?? [],
        }
      }
    }
    if (info) found.push(info)
    for (const key of Object.keys(o)) walk(o[key], depth + 1)
  }
  walk(data)
  if (!found.length) return null
  const own = found.filter((f) => f.channelIds.includes(channelId))
  const pool = own.length ? own : found
  return pool.find((f) => f.subParams && f.unsubParams) ?? pool.find((f) => f.subParams || f.unsubParams) ?? pool[0]
}

export async function setChannelSubscription(
  channelId: string,
  subscribe: boolean,
  params: string
): Promise<boolean> {
  const endpoint = subscribe ? 'subscription/subscribe' : 'subscription/unsubscribe'
  const data = await callInnerTube(endpoint, { channelIds: [channelId], params })
  if (!data || data.error) {
    log(`setChannelSubscription(${subscribe ? 'sub' : 'unsub'}) failed`,
      JSON.stringify(data?.error ?? null).slice(0, 200))
    return false
  }
  return true
}

function extractJoinedDate(data: any): string {
  // Try channelAboutFullViewModel in about tab
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? []
  for (const tab of tabs) {
    const content = tab?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
    for (const section of content) {
      const items = section?.itemSectionRenderer?.contents ?? []
      for (const item of items) {
        const about = item?.channelAboutFullViewModel
        if (about?.joinedDateText) return extractText(about.joinedDateText)
      }
    }
  }
  // Try pageHeaderRenderer metadata
  const meta = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? []
  for (const row of meta) {
    for (const part of row.metadataParts ?? []) {
      const text = extractText(part.text)
      if (/joined|since/i.test(text)) return text
    }
  }
  // Try channelMetadataRenderer
  const chMeta = data?.metadata?.channelMetadataRenderer
  if (chMeta?.creationDate) return chMeta.creationDate
  return ''
}

const DURATION_RX = /^\d{1,3}:\d{2}(:\d{2})?$/

function findDurationText(node: any, depth = 0): string {
  if (depth > 14 || typeof node !== 'object' || node === null) return ''
  if (Array.isArray(node)) {
    for (const x of node) {
      const t = findDurationText(x, depth + 1)
      if (t) return t
    }
    return ''
  }
  if (typeof node.text === 'string' && DURATION_RX.test(node.text)) return node.text
  if (typeof node.simpleText === 'string' && DURATION_RX.test(node.simpleText)) return node.simpleText
  if (typeof node.content === 'string' && DURATION_RX.test(node.content)) return node.content
  for (const k of Object.keys(node)) {
    if (k === 'lockupMetadataViewModel' || k === 'title') continue
    const t = findDurationText(node[k], depth + 1)
    if (t) return t
  }
  return ''
}

function vidFromReel(r: any): Video | null {
  if (!r?.videoId) return null
  const a11y = r?.accessibility?.accessibilityData?.label ?? ''
  let duration = ''
  const m = a11y.match(/(\d+)\s+minutes?\s+(\d+)\s+seconds?/)
  if (m) {
    const total = Number(m[1]) * 60 + Number(m[2])
    duration = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  } else {
    const s = a11y.match(/(\d+)\s+seconds?/)
    if (s) duration = `0:${String(Number(s[1])).padStart(2, '0')}`
  }
  return {
    id: r.videoId,
    title: r.headline?.simpleText ?? r.title?.runs?.[0]?.text ?? '',
    channel: r.channelName?.simpleText ?? r.channelTitleText?.runs?.[0]?.text ?? '',
    channelId: r.channelNavigationEndpoint?.browseEndpoint?.browseId ?? '',
    url: `/watch?v=${r.videoId}`,
    views: r.viewCountText?.simpleText ?? '',
    published: '',
    duration,
    verified: false,
    live: false,
  }
}

function vidFromShortsLockup(sl: any): Video | null {
  const videoId =
    sl?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ??
    sl?.onTap?.innertubeCommand?.watchEndpoint?.videoId ??
    String(sl?.entityId ?? '').split('-').pop() ??
    ''
  if (!videoId || videoId.length !== 11) return null
  return {
    id: videoId,
    title:
      sl?.overlayMetadata?.primaryText?.content ??
      sl?.accessibilityText?.split(',')[0] ??
      '',
    channel: '',
    channelId: '',
    url: `/watch?v=${videoId}`,
    views: sl?.overlayMetadata?.secondaryText?.content ?? '',
    published: '',
    duration: '',
    verified: false,
    live: false,
  }
}

function vidFromLockup(lockup: any): Video | null {
  if (!lockup?.contentId || !lockup?.metadata?.lockupMetadataViewModel) return null

  const lmv = lockup.metadata.lockupMetadataViewModel
  const title = extractText(lmv.title?.content)
  if (!title) return null

  const rows = lmv.metadata?.contentMetadataViewModel?.metadataRows ?? []
  let channel = '', views = '', published = ''

  // Real UC-id lives on the navigation endpoint behind the channel name run or the
  // avatar image, not on any field literally called "channelId" - confirmed live via
  // ytInitialData: lockupMetadataViewModel has no channelId field at all.
  let channelId = rows[0]?.metadataParts?.[0]?.text?.commandRuns?.[0]?.onTap
    ?.innertubeCommand?.browseEndpoint?.browseId ?? ''
  if (!channelId) {
    channelId = lmv.image?.decoratedAvatarViewModel?.rendererContext?.commandContext
      ?.onTap?.innertubeCommand?.browseEndpoint?.browseId ?? ''
  }

  if (rows[0]?.metadataParts?.[0]) {
    const t = extractText(rows[0].metadataParts[0].text)
    if (t && !/views?|ago\b|premiered|streamed/i.test(t)) channel = t
  }
  for (const row of rows) {
    for (const part of row?.metadataParts ?? []) {
      const t = extractText(part?.text)
      if (!t) continue
      for (const bit of t.split('•').map((s) => s.trim()).filter(Boolean)) {
        // View counts are usually abbreviated ("379K views", "3.1M views"), not just
        // plain digits - the K/M/B suffix sits between the number and "views".
        if (!views && /[\d.,]+\s*[kmb]?\+?\s*views?/i.test(bit)) views = bit
        else if (!published && /ago|premiered|streamed|yesterday|today|\d{1,2}, \d{4}/i.test(bit)) published = bit
      }
    }
  }

  let duration = ''
  try {
    const ov = lockup.contentImage?.thumbnailViewModel?.overlays ?? []
    for (const o of ov) {
      const badges = o?.thumbnailBottomOverlayViewModel?.badges ?? []
      for (const b of badges) {
        const badge = b?.thumbnailBadgeViewModel
        if (typeof badge === 'string') { duration = badge; break }
        const text = extractText(badge)
        if (text) { duration = text; break }
      }
      if (duration) break
    }
    if (!duration) duration = findDurationText(lockup)
  } catch {}

  return {
    id: lockup.contentId,
    title,
    channel,
    channelId,
    url: `/watch?v=${lockup.contentId}`,
    views,
    published,
    duration,
    verified: false,
    live: lockup.contentType === 'LOCKUP_CONTENT_TYPE_LIVE_STREAM',
  }
}

function vidFromDOM(el: Element): Video | null {
  const link = el.querySelector<HTMLAnchorElement>(
    'a#video-title, #video-title a, a#video-title-link, a[href*="/watch?v="], a[href*="/shorts/"]'
  )
  const title = link?.getAttribute('title')?.trim() ?? link?.textContent?.trim() ?? ''
  const href = link?.getAttribute('href') ?? ''
  const idMatch = href.match(/[?&]v=([\w-]{11})|\/shorts\/([\w-]{11})/)
  if (!idMatch) return null
  const id = idMatch[1] ?? idMatch[2]
  const channelEl = el.querySelector('ytd-channel-name a, ytd-channel-name yt-formatted-string, [aria-label^="Go to channel"]')
  const channel = channelEl?.getAttribute('aria-label')?.replace(/^Go to channel[:\s]+/i, '') ?? channelEl?.textContent?.trim() ?? ''
  const meta = el.querySelector('#metadata-line, ytd-video-meta-block, yt-content-metadata-view-model')
  const spans = meta ? Array.from(meta.querySelectorAll('span')) : []
  const durEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer, yt-thumbnail-badge-view-model, yt-thumbnail-overlay-badge-view-model')
  const dur = durEl?.textContent?.trim() ?? ''
  return {
    id, title, channel, channelId: '',
    url: `/watch?v=${id}`,
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

function collectItemVideos(item: any, out: Video[], seen: Set<string>) {
  if (!item || typeof item !== 'object') return
  if (item.continuationItemRenderer) return
  let node: any = item
  if (item.richItemRenderer) node = item.richItemRenderer.content ?? item.richItemRenderer
  else if (item.richSectionRenderer?.content) {
    const inner = item.richSectionRenderer.content
    if (inner.richGridRenderer) {
      for (const sub of inner.richGridRenderer.contents ?? []) collectItemVideos(sub, out, seen)
      return
    }
    node = inner
  }
  else if (item.itemSectionRenderer?.contents) {
    for (const sub of item.itemSectionRenderer.contents) collectItemVideos(sub, out, seen)
    return
  }
  else if (item.playlistVideoListRenderer?.contents) {
    for (const sub of item.playlistVideoListRenderer.contents) collectItemVideos(sub, out, seen)
    return
  }
  else if (item.gridRenderer?.items) {
    for (const sub of item.gridRenderer.items) collectItemVideos(sub, out, seen)
    return
  }
  else if (item.reelShelfRenderer?.items) {
    for (const sub of item.reelShelfRenderer.items) collectItemVideos(sub, out, seen)
    return
  }
  else if (item.richGridRenderer?.contents) {
    for (const sub of item.richGridRenderer.contents) collectItemVideos(sub, out, seen)
    return
  }
  if (node && typeof node === 'object') {
    let v: Video | null = null
    if (node.videoRenderer) v = vidFromRenderer(node.videoRenderer)
    else if (node.lockupViewModel) v = vidFromLockup(node.lockupViewModel)
    else if (node.reelItemRenderer) v = vidFromReel(node.reelItemRenderer)
    else if (node.shortsLockupViewModel) v = vidFromShortsLockup(node.shortsLockupViewModel)
    else if (node.shortsLockupViewModelV2) v = vidFromShortsLockup(node.shortsLockupViewModelV2)
    else if (node.gridVideoRenderer) v = vidFromRenderer(node.gridVideoRenderer)
    else if (node.compactVideoRenderer) v = vidFromRenderer(node.compactVideoRenderer)
    else if (node.playlistVideoRenderer) v = vidFromRenderer(node.playlistVideoRenderer)
    else if (node.movieRenderer) v = vidFromRenderer(node.movieRenderer)
    else if (node.watchCardCompactVideoRenderer) v = vidFromRenderer(node.watchCardCompactVideoRenderer)
    if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v) }
  }
}

function collectFeedVideos(data: any): { videos: Video[]; itemKeys: Record<string, number> } {
  const out: Video[] = []
  const seen = new Set<string>()
  const itemKeys: Record<string, number> = {}
  const tab = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
  const content = tab?.content ?? data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
  const walk = (parent: any) => {
    if (!parent || typeof parent !== 'object') return
    const items = parent.sectionListRenderer?.contents ?? parent.richGridRenderer?.contents ?? []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      if (item.itemSectionRenderer?.contents) {
        for (const sub of item.itemSectionRenderer.contents) {
          const k = Object.keys(sub)[0]
          if (k) itemKeys[k] = (itemKeys[k] ?? 0) + 1
          collectItemVideos(sub, out, seen)
        }
        continue
      }
      if (item.richSectionRenderer || item.richItemRenderer) {
        const k = Object.keys(item)[0]
        if (k) itemKeys[k] = (itemKeys[k] ?? 0) + 1
        collectItemVideos(item, out, seen)
        continue
      }
      const k = Object.keys(item)[0]
      if (k) itemKeys[k] = (itemKeys[k] ?? 0) + 1
      if (k === 'continuationItemRenderer') continue
      collectItemVideos(item, out, seen)
    }
  }
  walk(content)
  return { videos: out, itemKeys }
}

function extractFromData(data: any): Video[] {
  const { videos, itemKeys } = collectFeedVideos(data)
  if (videos.length) {
    const summary = Object.entries(itemKeys)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}x${n}`)
      .join(', ')
    log(`collectFeedVideos: ${videos.length} videos | item shapes: ${summary}`)
    return videos
  }

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

const VIDEO_RENDERER_KEYS = ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer',
  'reelItemRenderer', 'playlistVideoRenderer', 'movieRenderer', 'showRenderer',
  'cardVideoRenderer', 'shortVideoRenderer']

// Last-resort deep scan. It used to `return` the first non-empty subtree, so a page with
// two sibling shelves only ever yielded the first, and an object holding a renderer
// yielded exactly one video. Now it walks the whole object and dedupes by id.
function findVideoRenderers(obj: any, depth = 0, maxDepth = 20, out: Video[] = [], seen = new Set<string>()): Video[] {
  if (depth > maxDepth || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) findVideoRenderers(item, depth + 1, maxDepth, out, seen)
    return out
  }
  const push = (v: Video | null) => {
    if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v) }
  }
  for (const key of VIDEO_RENDERER_KEYS) {
    if (obj[key]?.videoId) push(vidFromRenderer(obj[key]))
  }
  if (obj.lockupViewModel?.contentId) push(vidFromLockup(obj.lockupViewModel))
  if (obj.videoId && typeof obj.videoId === 'string' && obj.title && (obj.lengthText || obj.viewCountText || obj.publishedTimeText)) {
    push(vidFromRenderer(obj))
  }
  for (const key of Object.keys(obj)) findVideoRenderers(obj[key], depth + 1, maxDepth, out, seen)
  return out
}

function extractFromDOM(): Video[] {
  const selectors = ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-compact-video-renderer', 'ytd-playlist-video-renderer', 'yt-lockup-view-model',
    'ytd-reel-item-renderer', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2']
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
  return html ? tryFindInText(html, name) : null
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
    const rich = c?.richGridRenderer?.contents ?? []
    const last = rich[rich.length - 1]
    let token = last?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null
    if (!token) {
      const sections = c?.sectionListRenderer?.contents ?? []
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents ?? []
        for (const item of items) {
          const t = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
          if (t) token = t
        }
        const t = sec?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
        if (t) token = t
      }
    }
    if (!token) {
      const playlistItems = c?.playlistVideoListRenderer?.contents ?? []
      const lastPl = playlistItems[playlistItems.length - 1]
      token = lastPl?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null
    }
    log(`  extractContinuationToken => ${token ? token.slice(0,30)+'...' : 'null'}`)
    return token
  } catch (e: any) { log(`  extractContinuationToken ERROR: ${e.message}`); return null }
}

function extractSearchContinuationToken(data: any): string | null {
  try {
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? []
    for (const sec of sections) {
      const token = sec?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null
      if (token) return token
    }
    log('  extractSearchContinuationToken: no continuation item found')
    return null
  } catch (e: any) { log(`  extractSearchContinuationToken ERROR: ${e.message}`); return null }
}

function extractContinuationVideos(data: any): { videos: Video[]; token: string | null } {
  const videos: Video[] = []
  const seen = new Set<string>()
  let token: string | null = null
  try {
    const eps = data?.onResponseReceivedEndpoints ?? data?.onResponseReceivedActions
      ?? data?.onResponseReceivedCommands ?? []
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
        // Reuse the same collector the initial page load uses. The previous loop only
        // understood richItemRenderer -> lockupViewModel, which is the home/channel
        // grid shape; history and subscriptions continue as sectionList/videoRenderer
        // and yielded nothing, silently ending pagination after page one.
        for (const item of items) {
          collectItemVideos(item, videos, seen)
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

// Only routes listed here have a real feed URL. Anything else must fail loudly - see
// fetchFreshData.
const ROUTE_URLS: Record<string, string> = {
  home: '/',
  subscriptions: '/feed/subscriptions',
  history: '/feed/history',
  'watch-later': '/playlist?list=WL',
  liked: '/playlist?list=LL',
}

// This had its own brace-matcher (duplicated again inside fetchFreshData) that tested
// `text[i-1] !== '\\'` for the closing quote - which misreads a literal backslash before
// that quote as an escape, never closes the string, and returns null, silently emptying
// a whole feed. parseJSONBlock tracks escapes properly, and tryFindInText already covers
// strictly more assignment forms than the two spelled out here.
function parseInitialData(text: string): any | null {
  return tryFindInText(text, 'ytInitialData')
}

// One place for "fetch a YouTube page and parse its ytInitialData". Six callers each had
// their own copy of this, and only search sent a Range header - so the other five pulled
// the whole multi-megabyte page. The Range window is now consistent, and a truncated body
// (which can't be brace-matched, and used to surface as a silent empty feed) retries in
// full instead of failing.
const INITIAL_DATA_WINDOW = 400000

async function fetchInitialData(path: string, label = path): Promise<any | null> {
  const url = location.origin + path + (path.includes('?') ? '&' : '?') + 'df=' + Date.now()
  const read = async (ranged: boolean) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: ranged
        ? { Accept: 'text/html', Range: `bytes=0-${INITIAL_DATA_WINDOW}` }
        : { Accept: 'text/html' },
    })
    if (!res.ok && res.status !== 206) {
      log(`fetchInitialData(${label}): HTTP ${res.status}`)
      return { status: res.status, data: null as any }
    }
    const text = await res.text()
    return { status: res.status, data: parseInitialData(text) }
  }
  try {
    const first = await read(true)
    if (first.data) return first.data
    // 206 means the server honoured the window, so a parse failure is most likely just
    // truncation rather than a missing payload.
    if (first.status !== 206) return null
    log(`fetchInitialData(${label}): ytInitialData did not fit the range window, refetching in full`)
    return (await read(false)).data
  } catch (e: any) {
    log(`fetchInitialData(${label}) ERROR: ${e.message}`)
    return null
  }
}

async function fetchFreshData(route = 'home'): Promise<{ videos: Video[]; token: string | null } | null> {
  // No `|| '/'` fallback. That silently served the *homepage* for any unmapped route,
  // so /playlist?list=LL ("Liked") and /shorts/<id> rendered home-feed videos under a
  // Playlist/blank header - wrong content, presented as if it were right. Returning
  // null lets the caller show an honest empty state instead.
  const path = ROUTE_URLS[route]
  if (!path) { log(`fetchFreshData: no feed URL mapped for route "${route}"`); return null }

  // If we are already on this route's page, its ytInitialData is right there in the
  // document's own inline scripts. Re-fetching the page to parse the same JSON cost
  // 3.3 MB on a real history feed. Home already read locally first via
  // extractPageVideosWithContinuation; the other feeds never did.
  if (location.pathname + location.search === path || location.pathname === path) {
    const local = getYTDataSync('ytInitialData')
    if (local) {
      const videos = extractFromData(local)
      if (videos.length) {
        log(`fetchFreshData(${route}): served from this page's own ytInitialData, no fetch`)
        return { videos, token: extractContinuationToken(local) }
      }
    }
  }

  const d = await fetchInitialData(path, route)
  if (!d) return null
  const t0 = d?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
  log(`fetchFreshData(${route}): tab content keys: ${t0 ? Object.keys(t0).join(',') : 'none'}`)
  return { videos: extractFromData(d), token: extractContinuationToken(d) }
}

export async function fetchSearchResults(query: string): Promise<PageResult> {
  diag.length = 0
  log(`=== fetchSearchResults: "${query}" ===`)
  if (!query.trim()) return emptyPageResult()
  const d = await fetchInitialData(`/results?search_query=${encodeURIComponent(query.trim())}`, 'search')
  if (!d) return emptyPageResult()
  const videos = extractFromData(d)
  // extractChannelsFromData used to re-run extractSearchItems (and its full recursive
  // scanChannelRenderers walk) over the same multi-megabyte payload just to pull the
  // channels back out. They are already in `items`.
  const items = extractSearchItems(d)
  const channels = items.flatMap((i) => (i.kind === 'channel' ? [i.channel] : []))
  const token = extractSearchContinuationToken(d)
  log(`fetchSearchResults: ${videos.length} videos, ${channels.length} channels, token=${token ? 'yes' : 'no'}`)
  return { videos, channels, items, continuation: token }
}

export interface ChannelPageResult {
  channel: Channel | null
  videos: Video[]
  continuation: string | null
}

export async function fetchChannelPage(channelId: string): Promise<ChannelPageResult> {
  diag.length = 0
  log(`=== fetchChannelPage: ${channelId} ===`)
  if (!channelId) return { channel: null, videos: [], continuation: null }

  let channelFromAPI: Channel | null = null
  let d: any = await fetchInitialData(`/channel/${channelId}/videos`, 'channel')

  if (!d) {
    const data = await callInnerTube('browse', { browseId: channelId })
    if (!data) return { channel: null, videos: [], continuation: null }
    d = data
    channelFromAPI = extractChannelHeader(d)
    if (channelFromAPI) channelFromAPI.joinedAt = extractJoinedDate(d)
  }

  if (!channelFromAPI) {
    channelFromAPI = extractChannelHeader(d)
    if (channelFromAPI) channelFromAPI.joinedAt = extractJoinedDate(d)
  }
  if (!channelFromAPI) {
    const md = d?.metadata?.channelMetadataRenderer
    if (md) {
      channelFromAPI = {
        id: channelId,
        name: md.title ?? '',
        handle: channelHandlePath(md.vanityChannelUrl),
        subscribers: '',
        videoCount: '',
        description: md.shortDescription ?? '',
        verified: false,
      }
    }
  }

  log(`browse header keys: ${Object.keys(d?.header ?? {}).join(', ')}`)
  const videos = extractFromData(d)
  const token = extractContinuationToken(d)
  log(`fetchChannelPage: "${channelFromAPI?.name ?? ''}" ${videos.length} videos, token=${token ? 'yes' : 'no'}`)
  return { channel: channelFromAPI, videos, continuation: token }
}

// Paginates any browse feed - home, subscriptions, history, watch-later, channel -
// since they all continue through the same `browse` endpoint with a continuation
// token. Named for the channel feed originally, which was the only caller.
export async function fetchBrowseContinuation(token: string): Promise<{ videos: Video[]; token: string | null }> {
  const data = await callInnerTube('browse', { continuation: token })
  if (!data) return { videos: [], token: null }
  return extractContinuationVideos(data)
}

export interface PlaylistItem {
  id: string
  title: string
  videoCount: string
  url: string
}

function playlistFromLockup(lockup: any): PlaylistItem | null {
  if (!lockup?.contentId) return null
  if (lockup.contentType && lockup.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') return null
  const lmv = lockup.metadata?.lockupMetadataViewModel
  const title = extractText(lmv?.title?.content)
  if (!title) return null
  const rows = lmv?.metadata?.contentMetadataViewModel?.metadataRows ?? []
  let videoCount = ''
  for (const row of rows) {
    for (const part of row?.metadataParts ?? []) {
      const t = extractText(part?.text)
      if (t && /video/i.test(t)) { videoCount = t; break }
    }
    if (videoCount) break
  }
  return { id: lockup.contentId, title, videoCount, url: `/playlist?list=${lockup.contentId}` }
}

function playlistFromGridRenderer(r: any): PlaylistItem | null {
  const id = r?.playlistId
  if (!id) return null
  const title = r.title?.simpleText ?? r.title?.runs?.map((x: any) => x.text).join('') ?? ''
  if (!title) return null
  const videoCount = r.videoCountText?.runs?.map((x: any) => x.text).join('') ?? r.videoCountShortText?.simpleText ?? ''
  return { id, title, videoCount, url: `/playlist?list=${id}` }
}

function collectPlaylistItems(item: any, out: PlaylistItem[], seen: Set<string>) {
  if (!item || typeof item !== 'object') return
  if (item.continuationItemRenderer) return
  if (item.itemSectionRenderer?.contents) {
    for (const sub of item.itemSectionRenderer.contents) collectPlaylistItems(sub, out, seen)
    return
  }
  if (item.gridRenderer?.items) {
    for (const sub of item.gridRenderer.items) collectPlaylistItems(sub, out, seen)
    return
  }
  if (item.richItemRenderer) {
    const lockup = item.richItemRenderer.content?.lockupViewModel
    const p = lockup ? playlistFromLockup(lockup) : null
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
    return
  }
  if (item.gridPlaylistRenderer) {
    const p = playlistFromGridRenderer(item.gridPlaylistRenderer)
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
    return
  }
  if (item.lockupViewModel) {
    const p = playlistFromLockup(item.lockupViewModel)
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p) }
  }
}

export function extractChannelPlaylists(data: any): PlaylistItem[] {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? []
  const tab = tabs.find((t: any) => t.tabRenderer?.selected) ?? tabs[0]
  const content = tab?.tabRenderer?.content
  const items = content?.sectionListRenderer?.contents ?? content?.richGridRenderer?.contents ?? []
  const out: PlaylistItem[] = []
  const seen = new Set<string>()
  for (const item of items) collectPlaylistItems(item, out, seen)
  return out
}

export async function fetchChannelPlaylists(channelId: string): Promise<PlaylistItem[]> {
  if (!channelId) return []
  const d = await fetchInitialData(`/channel/${channelId}/playlists`, 'channel-playlists')
  return d ? extractChannelPlaylists(d) : []
}

export async function fetchUserPlaylists(): Promise<PlaylistItem[]> {
  const d = await fetchInitialData('/feed/playlists', 'playlists')
  return d ? extractChannelPlaylists(d) : []
}

export interface SavePlaylist {
  id: string
  title: string
  saved: boolean
}

// Matches on shape (a playlistId next to a containsSelectedVideos state) rather than on
// the wrapper key, so the renderer -> viewModel renames YouTube keeps doing don't break it.
function collectAddToOptions(node: any, out: SavePlaylist[], seen: Set<string>, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return
  if (Array.isArray(node)) {
    for (const n of node) collectAddToOptions(n, out, seen, depth + 1)
    return
  }
  if (typeof node.playlistId === 'string' && node.containsSelectedVideos !== undefined) {
    const title = extractText(node.title)
    if (title && !seen.has(node.playlistId)) {
      seen.add(node.playlistId)
      // 'ALL' | 'SOME' | 'NONE' - one video is selected here, so only ALL means saved.
      out.push({ id: node.playlistId, title, saved: node.containsSelectedVideos === 'ALL' })
    }
    return
  }
  for (const k of Object.keys(node)) collectAddToOptions(node[k], out, seen, depth + 1)
}

// Every playlist this video can be saved to - Watch later, Liked-style system lists and
// the user's own - each with whether the video is already in it.
export async function fetchSavePlaylists(videoId: string): Promise<SavePlaylist[]> {
  const data = await callInnerTube('playlist/get_add_to_playlist', {
    videoIds: [videoId],
    excludeWatchLater: false,
  })
  const out: SavePlaylist[] = []
  if (data) collectAddToOptions(data, out, new Set())
  if (out.length) return out

  log('fetchSavePlaylists: no add-to options in response, falling back to the playlists feed')
  // ponytail: the feed carries no saved-state, so the fallback picker shows every row
  // unchecked. Good enough to still save; drop it if get_add_to_playlist stays stable.
  const feed = await fetchUserPlaylists()
  if (!feed.length) return []
  return [
    { id: 'WL', title: 'Watch later', saved: false },
    ...feed.map((p) => ({ id: p.id, title: p.title, saved: false })),
  ]
}

// Creates the playlist with the video already in it - one call, same as the native
// dialog's "Create" does.
export async function createPlaylistWithVideo(
  title: string,
  videoId: string,
  privacy: 'PRIVATE' | 'UNLISTED' | 'PUBLIC' = 'PRIVATE'
): Promise<SavePlaylist | null> {
  const name = title.trim()
  if (!name) return null
  const data = await callInnerTube('playlist/create', {
    title: name,
    privacyStatus: privacy,
    videoIds: [videoId],
  })
  const id = data?.playlistId
  if (!id) {
    log('createPlaylistWithVideo failed', JSON.stringify(data?.status ?? data ?? null).slice(0, 200))
    return null
  }
  return { id, title: name, saved: true }
}

export async function setVideoInPlaylist(
  playlistId: string,
  videoId: string,
  add: boolean
): Promise<boolean> {
  const action = add
    ? { action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }
    : { action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }
  const data = await callInnerTube('browse/edit_playlist', { playlistId, actions: [action] })
  if (data?.status !== 'STATUS_SUCCEEDED') {
    log(`setVideoInPlaylist(${playlistId}, ${add ? 'add' : 'remove'}) failed`,
      JSON.stringify(data?.status ?? data ?? null).slice(0, 200))
    return false
  }
  return true
}

export async function fetchLikedPlaylist(): Promise<{ videos: Video[]; token: string | null }> {
  const d = await fetchInitialData('/playlist?list=LL', 'liked')
  if (!d) return { videos: [], token: null }
  return { videos: extractFromData(d), token: extractContinuationToken(d) }
}

export interface PlaylistPageResult {
  title: string
  videos: Video[]
  token: string | null
}

export async function fetchPlaylistPage(playlistId: string): Promise<PlaylistPageResult> {
  if (!playlistId) return { title: '', videos: [], token: null }
  const d = await fetchInitialData(`/playlist?list=${encodeURIComponent(playlistId)}`, 'playlist')
  if (!d) return { title: '', videos: [], token: null }
  const title =
    d?.header?.playlistHeaderRenderer?.title?.simpleText ??
    d?.header?.playlistHeaderRenderer?.title?.runs?.map((r: any) => r.text).join('') ??
    d?.metadata?.playlistMetadataRenderer?.title ??
    ''
  return { title, videos: extractFromData(d), token: extractContinuationToken(d) }
}

export async function fetchContinuation(token: string, route = 'home', searchQuery = '', channelId = ''): Promise<{ videos: Video[]; token: string | null; items?: SearchItem[] }> {
  if (route === 'search') {
    if (token) return fetchSearchContinuation(token)
    const q = searchQuery || (new URLSearchParams(location.search).get('search_query') ?? '')
    const result = await fetchSearchResults(q)
    log(`fetchContinuation(search): got ${result.videos.length} videos, token=${result.continuation ? 'yes' : 'no'}`)
    return { videos: result.videos, token: result.continuation, items: result.items }
  }
  if (route === 'channel') {
    if (token) return fetchBrowseContinuation(token)
    const result = await fetchChannelPage(channelId)
    if (!result) return { videos: [], token: null }
    return { videos: result.videos, token: result.continuation }
  }
  // Every other browse feed paginates the same way the channel feed does. Without
  // this, the fall-through below re-fetched page 1 on every scroll: its videos all
  // deduped away in appendVideos, so the page never grew, so the bottom-of-feed
  // check stayed true and fired another full-page fetch on the next scroll event.
  if (token) return fetchBrowseContinuation(token)
  const result = await fetchFreshData(route)
  if (!result) return { videos: [], token: null }
  log(`fetchContinuation: got ${result.videos.length} videos for ${route}, token=${result.token ? 'yes' : 'no'}`)
  return result
}

// Search pages page through the `search` endpoint, not `browse`, and hand their items
// back under onResponseReceivedCommands. Without this, fetchContinuation ignored its
// token and re-ran fetchSearchResults - i.e. re-fetched page one, whose items all
// deduped away, so scroll-loading marked the feed exhausted after a single wasted fetch.
export async function fetchSearchContinuation(
  token: string
): Promise<{ videos: Video[]; items: SearchItem[]; token: string | null }> {
  const data = await callInnerTube('search', { continuation: token })
  if (!data) return { videos: [], items: [], token: null }
  const sink = newSearchItemSink()
  let next: string | null = null
  const commands = data.onResponseReceivedCommands ?? data.onResponseReceivedActions ?? []
  for (const cmd of commands) {
    for (const ci of cmd?.appendContinuationItemsAction?.continuationItems ?? []) {
      for (const item of ci?.itemSectionRenderer?.contents ?? []) collectSearchItem(item, sink)
      next = ci?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? next
    }
  }
  const videos = sink.items.flatMap((i) => (i.kind === 'video' ? [i.video] : []))
  log(`fetchSearchContinuation: ${sink.items.length} items, token=${next ? 'yes' : 'no'}`)
  return { videos, items: sink.items, token: next }
}

export interface PageResult {
  videos: Video[]
  channels: Channel[]
  items?: SearchItem[]
  continuation: string | null
}

function emptyPageResult(): PageResult {
  return { videos: [], channels: [], continuation: null }
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
    if (videos.length) return { videos, channels: [], continuation: token }
  }

  const data = await callInnerTube('browse', { browseId: 'FEwhat_to_watch' })
  if (data) {
    const videos = extractFromData(data)
    const token = extractContinuationToken(data)
    if (videos.length) return { videos, channels: [], continuation: token }
  }

  const asyncData = await getYTDataAsync('ytInitialData')
  if (asyncData) {
    const videos = extractFromData(asyncData)
    const token = extractContinuationToken(asyncData)
    if (videos.length) return { videos, channels: [], continuation: token }
  }

  const domVideos = extractFromDOM()
  return { videos: domVideos, channels: [], continuation: null }
}



// YouTube serves a 200 for dead videos, playlists and channels and reports the
// failure inside the page payload instead: playabilityStatus for /watch, an ERROR
// alertRenderer for browse pages. Returns YouTube's own reason, or null if fine.
export function extractPageError(): string | null {
  // A genuinely missing playlist/channel is a real HTTP 404 whose body is just an
  // iframe shell - no ytInitialData, so there is no alert to read, and the feed's
  // own fallbacks would happily render the home feed under the wrong heading.
  if (document.title === '404 Not Found' || document.querySelector('iframe[src*="/error?src=404"]')) {
    return 'This page could not be found on YouTube.'
  }
  const ps = location.pathname === '/watch'
    ? extractFromScripts('ytInitialPlayerResponse')?.playabilityStatus
    : null
  if (ps && (ps.status === 'ERROR' || ps.status === 'UNPLAYABLE' || ps.status === 'LOGIN_REQUIRED')) {
    return nodeText(ps.reason) || nodeText(ps.messages?.[0]) || 'This video is unavailable.'
  }
  const data = extractFromScripts('ytInitialData')
  for (const a of data?.alerts ?? []) {
    const r = a?.alertRenderer ?? a?.alertWithButtonRenderer
    // INFO alerts are ordinary (a real playlist page carries one) - only ERROR counts.
    if (r?.type !== 'ERROR') continue
    const t = nodeText(r.text)
    if (t) return t
  }
  // Signed in, a dead playlist comes back as a normal-looking page with neither an
  // alert nor a 404 shell - just an empty contents object. Verified against live
  // YouTube: every working browse page has a renderer under contents, including a
  // search with no results.
  if (data && location.pathname !== '/watch' && !Object.keys(data.contents ?? {}).length) {
    return 'This page could not be found on YouTube.'
  }
  return null
}

function nodeText(n: any): string {
  if (typeof n === 'string') return n
  return n?.simpleText ?? n?.runs?.map((x: any) => x.text).join('') ?? ''
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

export interface CommentItem {
  author: string
  time: string
  text: string
  likes: string
  likesLiked: string
  likesNotliked: string
  commentId: string | null
  stateKey: string | null
  liked: boolean
  likeAction: string | null
  unlikeAction: string | null
  replyParams: string | null
  replyCount: number
  repliesToken: string | null
  signedOut: boolean
  // True only for the optimistic placeholder inserted right after posting: YouTube's
  // create_comment/create_comment_reply response doesn't hand back the new comment's real id
  // or toolbar commands, so this comment has no like/reply capability until a reload replaces
  // it with the real, server-fetched version.
  justPosted: boolean
}

export function localComment(author: string, text: string): CommentItem {
  return {
    author, time: 'now', text, likes: '', likesLiked: '', likesNotliked: '',
    commentId: null, stateKey: null, liked: false, likeAction: null, unlikeAction: null,
    replyParams: null, replyCount: 0, repliesToken: null, signedOut: false, justPosted: true,
  }
}

function findCommentThreads(obj: any, out: any[] = [], depth = 0): any[] {
  if (depth > 25 || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) findCommentThreads(item, out, depth + 1)
    return out
  }
  if (obj.commentThreadRenderer) {
    out.push(obj.commentThreadRenderer)
    return out
  }
  for (const key of Object.keys(obj)) {
    findCommentThreads(obj[key], out, depth + 1)
  }
  return out
}

function findCommentsHeader(obj: any, depth = 0): any {
  if (depth > 25 || typeof obj !== 'object' || obj === null) return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const h = findCommentsHeader(item, depth + 1)
      if (h) return h
    }
    return null
  }
  if (obj.commentsHeaderRenderer) return obj.commentsHeaderRenderer
  if (obj.commentsEntryPointHeaderRenderer) return obj.commentsEntryPointHeaderRenderer
  for (const key of Object.keys(obj)) {
    const h = findCommentsHeader(obj[key], depth + 1)
    if (h) return h
  }
  return null
}

function findCommentViewModels(obj: any, out: any[] = [], depth = 0): any[] {
  if (depth > 25 || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) findCommentViewModels(item, out, depth + 1)
    return out
  }
  if (obj.commentViewModel) {
    out.push(obj.commentViewModel)
    return out
  }
  for (const key of Object.keys(obj)) {
    findCommentViewModels(obj[key], out, depth + 1)
  }
  return out
}

function findAllMutations(obj: any, out: any[] = [], depth = 0): any[] {
  if (depth > 25 || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) findAllMutations(item, out, depth + 1)
    return out
  }
  if (obj.entityKey && obj.payload && typeof obj.payload === 'object') {
    out.push(obj)
    return out
  }
  for (const key of Object.keys(obj)) {
    findAllMutations(obj[key], out, depth + 1)
  }
  return out
}

function buildPayloadMap(mutations: any[], payloadKey: string): Map<string, any> {
  const map = new Map<string, any>()
  for (const m of mutations) {
    const payload = m.payload?.[payloadKey]
    if (m.entityKey && payload) map.set(m.entityKey, payload)
  }
  return map
}

type CommentEntityBase = Pick<CommentItem, 'author' | 'time' | 'text' | 'likes' | 'likesLiked' | 'likesNotliked'>

function parseCommentEntity(p: any): CommentEntityBase | null {
  const text = p?.properties?.content?.content ?? ''
  if (!text) return null
  const likesLiked = p?.toolbar?.likeCountLiked ?? ''
  const likesNotliked = p?.toolbar?.likeCountNotliked ?? ''
  return {
    author: p?.author?.displayName ?? 'Unknown',
    time: p?.properties?.publishedTime ?? '',
    text,
    likes: likesNotliked && likesNotliked !== '0' ? likesNotliked : (likesLiked && likesLiked !== '0' ? likesLiked : ''),
    likesLiked: likesLiked && likesLiked !== '0' ? likesLiked : '',
    likesNotliked: likesNotliked && likesNotliked !== '0' ? likesNotliked : '',
  }
}

function findByKeyDeep(obj: any, targetKey: string, maxDepth: number, depth = 0): any {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findByKeyDeep(item, targetKey, maxDepth, depth + 1)
      if (r !== null) return r
    }
    return null
  }
  if (obj[targetKey] !== undefined) return obj[targetKey]
  for (const key of Object.keys(obj)) {
    const r = findByKeyDeep(obj[key], targetKey, maxDepth, depth + 1)
    if (r !== null) return r
  }
  return null
}

// Endpoint-command objects on the engagement toolbar surface entity are shaped
// { innertubeCommand: { clickTrackingParams, commandMetadata, <someEndpoint>: { action, ... } } }.
// The trailing key name varies (performCommentActionEndpoint / createCommentReplyDialogEndpoint / etc.),
// and for perform_comment_action the whole opaque instruction is the `action` string itself
// (confirmed against a real signed-in response — there is no separate `params` field), so we
// search generically rather than assume one field name.
function commandFromSurface(surface: any, name: string): string | null {
  const cmd = surface?.[name]?.innertubeCommand
  if (!cmd || typeof cmd !== 'object') return null

  for (const key of Object.keys(cmd)) {
    if (key === 'commandMetadata' || key === 'clickTrackingParams') continue
    const ep = cmd[key]
    if (ep && typeof ep === 'object') {
      const value = ep.action ?? ep.params ?? ep.createReplyParams ?? ep.createCommentParams
      if (typeof value === 'string' && value) return value
    }
  }

  // The reply command (confirmed live) opens a dialog rather than exposing an endpoint
  // directly: the real createCommentReplyEndpoint.createReplyParams is nested several
  // levels down inside dialog/button renderers (which also embed an unrelated emoji picker
  // full of its own "params" fields), so we search specifically for that unique key name
  // rather than doing a generic deep scan that could pick up the wrong "params" value.
  const replyEndpoint = findByKeyDeep(cmd, 'createCommentReplyEndpoint', 15)
  if (typeof replyEndpoint?.createReplyParams === 'string' && replyEndpoint.createReplyParams) {
    return replyEndpoint.createReplyParams
  }

  return null
}

function tokenFromContinuationItemRenderer(cir: any): string | null {
  return (
    cir?.continuationEndpoint?.continuationCommand?.token ??
    cir?.button?.buttonRenderer?.command?.continuationCommand?.token ??
    null
  )
}

function findRepliesToken(repliesRenderer: any): string | null {
  if (!repliesRenderer) return null
  for (const arr of [repliesRenderer.subThreads, repliesRenderer.contents]) {
    if (!Array.isArray(arr)) continue
    for (const entry of arr) {
      const token = tokenFromContinuationItemRenderer(entry?.continuationItemRenderer)
      if (token) return token
    }
  }
  return null
}

function commentItemFromThread(
  t: any,
  contentEntities: Map<string, any>,
  stateEntities: Map<string, any>,
  surfaceEntities: Map<string, any>
): CommentItem | null {
  const repliesToken = findRepliesToken(t?.replies?.commentRepliesRenderer)

  const legacy = t?.comment?.commentRenderer
  if (legacy) {
    const base = parseCommentRenderer(legacy)
    if (!base) return null
    return {
      ...base,
      commentId: legacy.commentId ?? null,
      stateKey: null,
      liked: false,
      likeAction: null,
      unlikeAction: null,
      replyParams: null,
      replyCount: 0,
      repliesToken,
      signedOut: false,
      justPosted: false,
    }
  }

  let vm = t?.commentViewModel
  while (vm?.commentViewModel && typeof vm.commentViewModel === 'object') vm = vm.commentViewModel
  const key = vm?.commentKey
  const payload = key ? contentEntities.get(key) : null
  const base = payload ? parseCommentEntity(payload) : null
  if (!base) return null

  const commentId = payload?.properties?.commentId ?? vm?.commentId ?? null
  const stateKey = vm?.toolbarStateKey ?? payload?.properties?.toolbarStateKey ?? null
  const state = stateKey ? stateEntities.get(stateKey) : null
  const liked = state?.likeState === 'TOOLBAR_LIKE_STATE_LIKED'

  const surfaceKey = vm?.toolbarSurfaceKey ?? null
  const surface = surfaceKey ? surfaceEntities.get(surfaceKey) : null
  const likeAction = surface ? commandFromSurface(surface, 'likeCommand') : null
  const unlikeAction = surface ? commandFromSurface(surface, 'unlikeCommand') : null
  const replyParams = surface ? commandFromSurface(surface, 'replyCommand') : null
  const signedOut = !!surface?.prepareAccountCommand

  const replyCountRaw = payload?.toolbar?.replyCount ?? ''
  const replyCount = parseInt(String(replyCountRaw).replace(/[^0-9]/g, ''), 10) || 0

  return {
    ...base,
    likes: liked ? base.likesLiked : base.likesNotliked,
    commentId,
    stateKey,
    liked,
    likeAction,
    unlikeAction,
    replyParams,
    replyCount,
    repliesToken,
    signedOut,
    justPosted: false,
  }
}

function logCommentStructure(data: any) {
  const keys = new Set<string>()
  const walk = (o: any, depth: number) => {
    if (depth > 8 || typeof o !== 'object' || o === null || keys.size >= 25) return
    if (Array.isArray(o)) {
      for (const x of o) walk(x, depth + 1)
      return
    }
    for (const k of Object.keys(o)) {
      if (/comment/i.test(k)) {
        if (!keys.has(k)) {
          keys.add(k)
          const v = o[k]
          const shape = v && typeof v === 'object' ? Object.keys(v).join(',') : String(v).slice(0, 50)
          log(`  [comment key] ${k} => ${shape}`)
        }
      }
      walk(o[k], depth + 1)
    }
  }
  walk(data, 0)
}

function parseCommentRenderer(c: any): CommentEntityBase | null {
  const text =
    c?.contentText?.runs?.map((r: any) => r.text).join('') ??
    c?.contentText?.simpleText ??
    ''
  if (!text) return null
  const likes = c?.voteCount?.simpleText ?? ''
  const likeVal = likes && likes !== '0' ? likes : ''
  return {
    author: c?.authorText?.simpleText ?? 'Unknown',
    time: c?.publishedTimeText?.simpleText ?? '',
    text,
    likes: likeVal,
    likesLiked: likeVal,
    likesNotliked: likeVal,
  }
}

export function parseCountText(t: string): string {
  const m = t.match(/([\d.,]+)\s*(ألف|مليون|thousand|million|k|m)?/i)
  if (!m) return ''
  let n = parseFloat(m[1].replace(/,/g, ''))
  if (isNaN(n)) return ''
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'ألف' || unit === 'الف' || unit === 'thousand' || unit === 'k') n *= 1000
  else if (unit === 'مليون' || unit === 'million' || unit === 'm') n *= 1000000
  if (n >= 1000000) return `${(n / 1000000).toFixed(n < 10000000 ? 1 : 0).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}K`
  return String(n)
}

function extractCommentsFromObject(data: any): { count: string; comments: CommentItem[] } {
  const comments: CommentItem[] = []
  const header = findCommentsHeader(data)
  const countText =
    header?.commentsCount?.runs?.map((r: any) => r.text).join('') ??
    header?.commentsCount?.simpleText ??
    header?.countText?.simpleText ??
    header?.countText?.runs?.map((r: any) => r.text).join('') ??
    ''
  const count = parseCountText(countText)

  const mutations = findAllMutations(data)
  const contentEntities = buildPayloadMap(mutations, 'commentEntityPayload')
  const stateEntities = buildPayloadMap(mutations, 'engagementToolbarStateEntityPayload')
  const surfaceEntities = buildPayloadMap(mutations, 'engagementToolbarSurfaceEntityPayload')

  for (const t of findCommentThreads(data)) {
    const item = commentItemFromThread(t, contentEntities, stateEntities, surfaceEntities)
    if (item) comments.push(item)
  }
  if (comments.length === 0) {
    for (const vm of findCommentViewModels(data)) {
      const item = commentItemFromThread({ commentViewModel: vm }, contentEntities, stateEntities, surfaceEntities)
      if (item) comments.push(item)
    }
  }
  return { count, comments }
}

function findCommentsContinuation(data: any): string | null {
  const walk = (o: any, depth = 0): string | null => {
    if (depth > 25 || typeof o !== 'object' || o === null) return null
    if (Array.isArray(o)) {
      for (const item of o) {
        const t = walk(item, depth + 1)
        if (t) return t
      }
      return null
    }
    if ((o.header?.commentsHeaderRenderer || o.commentsHeaderRenderer) && Array.isArray(o.contents)) {
      const token = o.contents[0]?.continuationItemRenderer?.continuationEndpoint
        ?.continuationCommand?.token
      if (token) return token
    }
    for (const key of Object.keys(o)) {
      const t = walk(o[key], depth + 1)
      if (t) return t
    }
    return null
  }
  return walk(data)
}

function findNextCommentsToken(data: any): string | null {
  const walk = (o: any, depth = 0): string | null => {
    if (depth > 25 || typeof o !== 'object' || o === null) return null
    if (Array.isArray(o)) {
      for (const item of o) {
        const t = walk(item, depth + 1)
        if (t) return t
      }
      return null
    }
    if (Array.isArray(o.continuationItems)) {
      const items = o.continuationItems
      if (items.some((x: any) => x.commentThreadRenderer)) {
        const cont = items.find((x: any) => x.continuationItemRenderer)
        if (cont) {
          const token = tokenFromContinuationItemRenderer(cont.continuationItemRenderer)
          if (token) return token
        }
      }
    }
    for (const key of Object.keys(o)) {
      const t = walk(o[key], depth + 1)
      if (t) return t
    }
    return null
  }
  return walk(data)
}

function findCreateCommentParams(data: any): string | null {
  const walk = (o: any, depth = 0): string | null => {
    if (depth > 15 || typeof o !== 'object' || o === null) return null
    if (Array.isArray(o)) {
      for (const item of o) {
        const r = walk(item, depth + 1)
        if (r) return r
      }
      return null
    }
    if (typeof o.createCommentParams === 'string') return o.createCommentParams
    for (const key of Object.keys(o)) {
      const r = walk(o[key], depth + 1)
      if (r) return r
    }
    return null
  }
  return walk(data)
}

function logCommentBoxState(data: any): void {
  const walk = (o: any, depth = 0): void => {
    if (depth > 15 || typeof o !== 'object' || o === null) return
    if (Array.isArray(o)) {
      for (const item of o) walk(item, depth + 1)
      return
    }
    if (o.commentSimpleboxRenderer) {
      if (o.commentSimpleboxRenderer.prepareAccountEndpoint)
        log('  comment box: signed-out variant (sign in required)')
      else log('  comment box: present')
      return
    }
    for (const key of Object.keys(o)) walk(o[key], depth + 1)
  }
  walk(data)
}

export interface CommentsPageResult {
  count: string
  comments: CommentItem[]
  token: string | null
  createParams: string | null
}

export async function extractCommentsFromPage(): Promise<CommentsPageResult> {
  const sync = extractFromScripts('ytInitialData')
  if (sync) {
    log('  ytInitialData found in scripts')
    const r = extractCommentsFromObject(sync)
    log(`  sync data: count='${r.count}' comments=${r.comments.length}`)
    if (r.comments.length) {
      return {
        ...r,
        token: findNextCommentsToken(sync),
        createParams: findCreateCommentParams(sync),
      }
    }
  } else {
    log('  ytInitialData NOT found in scripts')
  }
  const token = sync ? findCommentsContinuation(sync) : null
  log(`  comments continuation token: ${token ? 'yes' : 'no'}`)
  if (token) {
    const data = await callInnerTube('next', { continuation: token })
    if (data) {
      const r = extractCommentsFromObject(data)
      log(`  comments continuation API: count='${r.count}' comments=${r.comments.length}`)
      if (!findCreateCommentParams(data)) logCommentBoxState(data)
      if (r.comments.length || r.count) {
        return {
          ...r,
          token: findNextCommentsToken(data),
          createParams: findCreateCommentParams(data),
        }
      }
      logCommentStructure(data)
    } else {
      log('  comments continuation API: no response')
    }
  }
  const videoId = new URLSearchParams(location.search).get('v') ?? ''
  if (videoId) {
    const data = await callInnerTube('next', { videoId })
    if (data) {
      const r = extractCommentsFromObject(data)
      log(`  next API: count='${r.count}' comments=${r.comments.length}`)
      if (r.comments.length || r.count) {
        return {
          ...r,
          token: findNextCommentsToken(data),
          createParams: findCreateCommentParams(data),
        }
      }
    } else {
      log('  next API: no response')
    }
  }
  return { count: '', comments: [], token: null, createParams: null }
}

export async function fetchMoreComments(
  token: string
): Promise<CommentsPageResult> {
  const data = await callInnerTube('next', { continuation: token })
  if (!data) return { count: '', comments: [], token: null, createParams: null }
  const r = extractCommentsFromObject(data)
  return {
    count: r.count,
    comments: r.comments,
    token: findNextCommentsToken(data),
    createParams: findCreateCommentParams(data),
  }
}

export async function postCommentAPI(
  commentText: string,
  createParams: string
): Promise<boolean> {
  const data = await callInnerTube('comment/create_comment', {
    commentText,
    createCommentParams: createParams,
  })
  if (!data || data.error) {
    log('postCommentAPI failed', JSON.stringify(data?.error ?? null).slice(0, 200))
    return false
  }
  return true
}

// Replies use a distinct endpoint and field name from top-level comments (confirmed live via
// the reply command's commandMetadata.webCommandMetadata.apiUrl == comment/create_comment_reply,
// paired with createReplyParams rather than createCommentParams).
export async function postCommentReplyAPI(
  commentText: string,
  createReplyParams: string
): Promise<boolean> {
  const data = await callInnerTube('comment/create_comment_reply', {
    commentText,
    createReplyParams,
  })
  if (!data || data.error) {
    log('postCommentReplyAPI failed', JSON.stringify(data?.error ?? null).slice(0, 200))
    return false
  }
  return true
}

export interface RepliesResult {
  comments: CommentItem[]
  nextToken: string | null
}

export async function fetchCommentReplies(token: string): Promise<RepliesResult> {
  const data = await callInnerTube('next', { continuation: token })
  if (!data) return { comments: [], nextToken: null }
  const { comments } = extractCommentsFromObject(data)
  return { comments, nextToken: findNextCommentsToken(data) }
}

export interface CommentActionResult {
  ok: boolean
  liked: boolean | null
}

export async function performCommentAction(
  action: string,
  stateKey?: string | null
): Promise<CommentActionResult> {
  const data = await callInnerTube('comment/perform_comment_action', { actions: [action] })
  if (!data || data.error) {
    log('performCommentAction failed', JSON.stringify(data?.error ?? null).slice(0, 200))
    return { ok: false, liked: null }
  }
  let liked: boolean | null = null
  if (stateKey) {
    const mutations = findAllMutations(data)
    const stateEntities = buildPayloadMap(mutations, 'engagementToolbarStateEntityPayload')
    const state = stateEntities.get(stateKey)
    if (typeof state?.likeState === 'string') liked = state.likeState === 'TOOLBAR_LIKE_STATE_LIKED'
  }
  return { ok: true, liked }
}

export async function fetchCreateParams(): Promise<string | null> {
  const sync = extractFromScripts('ytInitialData')
  const token = sync ? findCommentsContinuation(sync) : null
  if (token) {
    const data = await callInnerTube('next', { continuation: token })
    if (data) {
      const params = findCreateCommentParams(data)
      if (params) return params
      logCommentBoxState(data)
    }
  }
  const videoId = new URLSearchParams(location.search).get('v') ?? ''
  if (videoId) {
    const data = await callInnerTube('next', { videoId })
    if (data) {
      const params = findCreateCommentParams(data)
      if (params) return params
      logCommentBoxState(data)
    }
  }
  return null
}

// Handle URLs (/@name, /c/x, /user/x) carry no UC id in the path, but the page they
// serve does - in its own ytInitialData, and in the canonical/og:url meta tag.
export function extractPageChannelId(): string | null {
  const d = extractFromScripts('ytInitialData')
  const fromData = d?.metadata?.channelMetadataRenderer?.externalId
  if (typeof fromData === 'string' && /^UC[\w-]{22}$/.test(fromData)) return fromData
  const href = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
    ?? document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
    ?? ''
  return href.match(/\/channel\/(UC[\w-]{22})/)?.[1] ?? null
}

// Signed-out check: ytcfg carries LOGGED_IN. Fail open when ytcfg is missing
// (some error pages have none) rather than locking a signed-in user out.
export function isSignedIn(): boolean {
  const cfg = tryFindYTCfg()
  return cfg ? !!cfg.LOGGED_IN : true
}
