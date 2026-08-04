import type { Video, Channel, WatchData } from '../types'

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

function extractSearchItems(data: any): SearchItem[] {
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
    ?.sectionListRenderer?.contents ?? []
  const items: SearchItem[] = []
  const seenVideos = new Set<string>()
  const seenChannels = new Set<string>()

  for (const sec of sections) {
    for (const item of (sec?.itemSectionRenderer?.contents ?? [])) {
      if (item?.videoRenderer?.videoId) {
        const v = vidFromRenderer(item.videoRenderer)
        if (v && !seenVideos.has(v.id)) { seenVideos.add(v.id); items.push({ kind: 'video', video: v }) }
      } else if (item?.channelRenderer?.channelId) {
        const c = channelFromRenderer(item.channelRenderer)
        if (c && !seenChannels.has(c.id)) { seenChannels.add(c.id); items.push({ kind: 'channel', channel: c }) }
      } else if (item?.lockupViewModel?.contentId) {
        const v = vidFromLockup(item.lockupViewModel)
        if (v && !seenVideos.has(v.id)) { seenVideos.add(v.id); items.push({ kind: 'video', video: v }) }
      }
    }
  }

  for (const c of scanChannelRenderers(data)) {
    if (!seenChannels.has(c.id)) { seenChannels.add(c.id); items.push({ kind: 'channel', channel: c }) }
  }
  return items
}

function extractChannelsFromData(data: any): Channel[] {
  return extractSearchItems(data)
    .filter((i) => i.kind === 'channel')
    .map((i) => (i.kind === 'channel' ? i.channel : null))
    .filter((c): c is Channel => !!c)
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
      handle: meta?.vanityChannelUrl ?? '',
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
        handle: meta?.vanityChannelUrl ?? '',
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
      handle: meta.vanityChannelUrl ?? '',
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
    url: `/shorts/${r.videoId}`,
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
    url: `/shorts/${videoId}`,
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
  const isShort = /\/shorts\//.test(href)
  return {
    id, title, channel, channelId: '',
    url: isShort ? `/shorts/${id}` : `/watch?v=${id}`,
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

function parseInitialData(text: string): any | null {
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
      if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch { return null } } }
    }
  }
  return null
}

async function fetchFreshData(route = 'home'): Promise<{ videos: Video[]; token: string | null } | null> {
  const url = (ROUTE_URLS[route] || '/') + '?df=' + Date.now()
  try {
    const res = await fetch(location.origin + url, {
      credentials: 'include',
      headers: { 'Accept': 'text/html' },
    })
    if (!res.ok && res.status !== 206) { log(`fetchFreshData(${route}): HTTP ${res.status}`); return null }
    const text = await res.text()
    log(`fetchFreshData(${route}): HTTP ${res.status}, ${text.length} bytes`)
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
        if (c === '}') { depth--; if (depth === 0) { try {
          const d = JSON.parse(text.slice(start, i + 1))
          const t0 = d?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
          const contentKeys = t0 ? Object.keys(t0).join(',') : 'none'
          log(`fetchFreshData(${route}): parsed ytInitialData, tab content keys: ${contentKeys}`)
          return { videos: extractFromData(d), token: extractContinuationToken(d) }
        } catch { log(`fetchFreshData(${route}): JSON parse failed`); return null } } }
      }
    }
    log(`fetchFreshData(${route}): no ytInitialData found in HTML`)
    return null
  } catch (e: any) { log(`fetchFreshData(${route}) ERROR: ${e.message}`); return null }
}

export async function fetchSearchResults(query: string): Promise<PageResult> {
  diag.length = 0
  log(`=== fetchSearchResults: "${query}" ===`)
  if (!query.trim()) return emptyPageResult()
  const url = `/results?search_query=${encodeURIComponent(query.trim())}&df=${Date.now()}`
  try {
    const res = await fetch(location.origin + url, {
      credentials: 'include',
      headers: { 'Accept': 'text/html', 'Range': 'bytes=0-400000' },
    })
    if (!res.ok && res.status !== 206) return emptyPageResult()
    const d = parseInitialData(await res.text())
    if (!d) return emptyPageResult()
    const videos = extractFromData(d)
    const items = extractSearchItems(d)
    const channels = extractChannelsFromData(d)
    const token = extractSearchContinuationToken(d)
    log(`fetchSearchResults: ${videos.length} videos, ${channels.length} channels, token=${token ? 'yes' : 'no'}`)
    return { videos, channels, items, continuation: token }
  } catch { return emptyPageResult() }
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

  const url = `/channel/${channelId}/videos?df=${Date.now()}`
  let channelFromAPI: Channel | null = null
  let d: any = null

  try {
    const res = await fetch(location.origin + url, {
      credentials: 'include',
      headers: { 'Accept': 'text/html' },
    })
    if (res.ok) d = parseInitialData(await res.text())
  } catch {}

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
        handle: md.vanityChannelUrl ?? '',
        subscribers: '',
        videoCount: md.externalId ? '' : '',
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

export async function fetchChannelContinuation(token: string): Promise<{ videos: Video[]; token: string | null }> {
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
  const content = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
  const items = content?.sectionListRenderer?.contents ?? content?.richGridRenderer?.contents ?? []
  const out: PlaylistItem[] = []
  const seen = new Set<string>()
  for (const item of items) collectPlaylistItems(item, out, seen)
  return out
}

export async function fetchChannelPlaylists(channelId: string): Promise<PlaylistItem[]> {
  if (!channelId) return []
  try {
    const res = await fetch(location.origin + `/channel/${channelId}/playlists?df=${Date.now()}`, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
    })
    if (res.ok) {
      const d = parseInitialData(await res.text())
      if (d) return extractChannelPlaylists(d)
    }
  } catch {}
  return []
}

export async function fetchContinuation(token: string, route = 'home', searchQuery = '', channelId = ''): Promise<{ videos: Video[]; token: string | null; items?: SearchItem[] }> {
  if (route === 'search') {
    const q = searchQuery || (new URLSearchParams(location.search).get('search_query') ?? '')
    const result = await fetchSearchResults(q)
    if (!result) return { videos: [], token: null }
    log(`fetchContinuation(search): got ${result.videos.length} videos, token=${result.continuation ? 'yes' : 'no'}`)
    return { videos: result.videos, token: result.continuation, items: result.items }
  }
  if (route === 'channel') {
    if (token) return fetchChannelContinuation(token)
    const result = await fetchChannelPage(channelId)
    if (!result) return { videos: [], token: null }
    return { videos: result.videos, token: result.continuation }
  }
  const result = await fetchFreshData(route)
  if (!result) return { videos: [], token: null }
  log(`fetchContinuation: got ${result.videos.length} videos for ${route}, token=${result.token ? 'yes' : 'no'}`)
  return result
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

export interface CommentItem {
  author: string
  time: string
  text: string
  likes: string
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

function findCommentMutations(obj: any, out: any[] = [], depth = 0): any[] {
  if (depth > 25 || typeof obj !== 'object' || obj === null) return out
  if (Array.isArray(obj)) {
    for (const item of obj) findCommentMutations(item, out, depth + 1)
    return out
  }
  if (obj.entityKey && obj.payload?.commentEntityPayload) {
    out.push(obj)
    return out
  }
  for (const key of Object.keys(obj)) {
    findCommentMutations(obj[key], out, depth + 1)
  }
  return out
}

function commentKeyFromVm(vm: any): string | null {
  if (!vm || typeof vm !== 'object') return null
  let v = vm
  while (v.commentViewModel && typeof v.commentViewModel === 'object') v = v.commentViewModel
  return v.commentKey ?? null
}

function buildCommentEntityMap(mutations: any[]): Map<string, any> {
  const map = new Map<string, any>()
  for (const m of mutations) {
    const key = m.entityKey
    const payload = m.payload?.commentEntityPayload
    if (key && payload) map.set(key, payload)
  }
  return map
}

function parseCommentEntity(p: any): CommentItem | null {
  const text = p?.properties?.content?.content ?? ''
  if (!text) return null
  const likes = p?.toolbar?.likeCountNotliked ?? p?.toolbar?.likeCountLiked ?? ''
  return {
    author: p?.author?.displayName ?? 'Unknown',
    time: p?.properties?.publishedTime ?? '',
    text,
    likes: likes && likes !== '0' ? likes : '',
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

function parseCommentRenderer(c: any): CommentItem | null {
  const text =
    c?.contentText?.runs?.map((r: any) => r.text).join('') ??
    c?.contentText?.simpleText ??
    ''
  if (!text) return null
  const likes = c?.voteCount?.simpleText ?? ''
  return {
    author: c?.authorText?.simpleText ?? 'Unknown',
    time: c?.publishedTimeText?.simpleText ?? '',
    text,
    likes: likes && likes !== '0' ? likes : '',
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
  for (const t of findCommentThreads(data)) {
    const c = t.comment?.commentRenderer
    if (c) {
      const item = parseCommentRenderer(c)
      if (item) comments.push(item)
    }
  }
  if (comments.length === 0) {
    const entities = buildCommentEntityMap(findCommentMutations(data))
    for (const vm of findCommentViewModels(data)) {
      const key = commentKeyFromVm(vm)
      const p = key ? entities.get(key) : null
      if (p) {
        const item = parseCommentEntity(p)
        if (item) comments.push(item)
      }
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
          const token = cont.continuationItemRenderer.continuationEndpoint
            ?.continuationCommand?.token
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
