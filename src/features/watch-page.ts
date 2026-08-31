import type { NavigationState } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content, renderNotFound, makeClickable } from '../core/UIEngine'

import {
  extractPageError,
  extractWatchData,
  extractCommentsFromPage,
  fetchMoreComments,
  parseCountText,
  postCommentAPI,
  postCommentReplyAPI,
  fetchCreateParams,
  fetchCommentReplies,
  performCommentAction,
  extractLikeStatus,
  localComment,
  fetchPlaylistPage,
  fetchContinuation,
  fetchSavePlaylists,
  setVideoInPlaylist,
  createPlaylistWithVideo,
  DEBUG,
  type CommentItem,
  type SavePlaylist,
} from '../core/DataExtractor'
import type { Video } from '../types'
import { navigateTo } from '../core/PageManager'


const PLAYER_SELECTORS = [
  'ytd-player',
  '#movie_player',
  '#player-container',
  '#player',
  '.html5-video-player',
]

let movedPlayer: HTMLElement | null = null
let originalParent: HTMLElement | null = null
let originalSibling: Node | null = null
let playerWatcher: MutationObserver | null = null
let playerTimeout: number | null = null
let onFullscreenChange: (() => void) | null = null
let onFullscreenClick: ((e: Event) => void) | null = null
let onFullscreenKey: ((e: KeyboardEvent) => void) | null = null
let aspectBound = false
let aspectTimer: number | null = null
let boundVideo: HTMLVideoElement | null = null
let likeObserver: MutationObserver | null = null
// What the DOM last reported, so the observer can tell a real toggle from the unreliable
// value YouTube renders initially.
let likeDomBaseline: boolean | null = null
let likeWaitObserver: MutationObserver | null = null
let commentsWaitObserver: MutationObserver | null = null
let commentsOpen = false
let commentsSection: HTMLElement | null = null
let commentsBtnEl: HTMLButtonElement | null = null
let commentsObserver: MutationObserver | null = null
let renderTimer: number | null = null
let dataCommentCount = ''
let dataRefreshAttempted = false
let dataRefreshPending = false
let moreToken: string | null = null
let dataComments: CommentItem[] = []
let createParams: string | null = null
const commentReplies = new Map<string, CommentItem[]>()
const commentRepliesNextToken = new Map<string, string | null>()
const expandedReplies = new Set<string>()

let playlistPanel: HTMLElement | null = null
let playlistVideos: Video[] = []
let playlistTitle = ''
let playlistToken: string | null = null
let playlistCurrentId: string | null = null
let playlistLoadObserver: MutationObserver | null = null
let playlistUrlPoll: number | null = null
let playlistLastVideoId: string | null = null

// Waits for a native YouTube element to appear, then hands off. Bounded on purpose:
// an element that never shows up (signed out, comments disabled, markup changed)
// otherwise leaves a MutationObserver running against all of document.body - one of
// the busiest DOMs on the web - for the rest of the page's life.
function waitForNative(found: () => boolean, onFound: () => void, timeout = 15000): MutationObserver {
  const obs = new MutationObserver(() => {
    if (!found()) return
    obs.disconnect()
    onFound()
  })
  obs.observe(document.body, { childList: true, subtree: true })
  window.setTimeout(() => obs.disconnect(), timeout)
  return obs
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

function findNativeComments(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('ytd-comments') ??
    document.querySelector<HTMLElement>('#comments')
  )
}

async function refreshCommentsFromData() {
  const list = commentsSection?.querySelector<HTMLElement>('.df-comment-list')
  if (!list) return
  if (dataComments.length > 0) {
    renderComments(list, dataComments)
    renderMoreButton(list)
    return
  }
  if (dataRefreshAttempted || dataRefreshPending) return
  dataRefreshPending = true
  const { count, comments, token, createParams: params } = await extractCommentsFromPage()
  dataRefreshPending = false
  dataRefreshAttempted = true
  if (!commentsSection?.isConnected) return
  if (comments.length > 0) {
    dataComments = comments
    moreToken = token
    renderComments(list, dataComments)
    renderMoreButton(list)
  }
  if (params) createParams = params
  if (count) {
    dataCommentCount = count
    updateCommentsToggle()
  }
}

function renderMoreButton(list: HTMLElement) {
  list.querySelector('.df-comment-more')?.remove()
  if (!moreToken) return
  const btn = document.createElement('button')
  btn.className = 'df-comment-more'
  btn.textContent = 'Load more'
  btn.onclick = async () => {
    if (!moreToken || btn.disabled) return
    btn.disabled = true
    const { count, comments, token } = await fetchMoreComments(moreToken)
    moreToken = token
    if (count) {
      dataCommentCount = count
      updateCommentsToggle()
    }
    if (commentsSection?.isConnected) {
      dataComments = [...dataComments, ...comments]
      // Append only the new page. Re-rendering the full list was O(n) per page and threw
      // away every already-built item to produce the identical DOM.
      btn.remove()
      for (const c of comments) list.appendChild(renderCommentItem(c))
      renderMoreButton(list)
    }
  }
  list.appendChild(btn)
}

function playerContainer(): HTMLElement | null {
  if (!movedPlayer) return null
  return movedPlayer.querySelector<HTMLElement>('.html5-video-player') ?? movedPlayer
}

function toggleFullscreen() {
  const el = playerContainer()
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  } else {
    el.requestFullscreen?.().catch(() => {})
  }
}

function findPlayer(): HTMLElement | null {
  for (const sel of PLAYER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function fitPlayer() {
  if (!movedPlayer) return
  movedPlayer.style.width = ''
  movedPlayer.style.height = ''
  const container = movedPlayer.querySelector<HTMLElement>('.html5-video-player')
  if (container) {
    container.style.width = ''
    container.style.height = ''
  }
}

function syncPlayerAspect() {
  const el = playerContainer()
  if (!el) return
  if (document.fullscreenElement) return
  const width = el.clientWidth
  if (width <= 0) return
  const video = el.querySelector('video')
  let ratio = 9 / 16
  if (video?.videoWidth && video.videoHeight) {
    ratio = video.videoHeight / video.videoWidth
  }
  // Tall (9:16 shorts) videos are clamped by max-height in CSS, not here: any
  // scroll-position-dependent cap feeds back through this element's own height.
  el.style.height = `${Math.round(width * ratio)}px`
}

function bindAspectSync() {
  if (!movedPlayer || aspectBound) return
  const video = movedPlayer.querySelector('video')
  if (!video) return
  aspectBound = true
  boundVideo = video
  video.addEventListener('resize', syncPlayerAspect)
  video.addEventListener('loadedmetadata', syncPlayerAspect)
  window.addEventListener('resize', syncPlayerAspect)
  syncPlayerAspect()
  aspectTimer = window.setInterval(syncPlayerAspect, 1000)
}

function unbindAspectSync() {
  if (boundVideo) {
    boundVideo.removeEventListener('resize', syncPlayerAspect)
    boundVideo.removeEventListener('loadedmetadata', syncPlayerAspect)
    boundVideo = null
  }
  window.removeEventListener('resize', syncPlayerAspect)
  if (aspectTimer !== null) {
    window.clearInterval(aspectTimer)
    aspectTimer = null
  }
  aspectBound = false
}

const LIKE_SELECTORS = [
  'ytd-segmented-like-dislike-button-renderer ytd-toggle-button-renderer button#button',
  'ytd-segmented-like-dislike-button-renderer ytd-toggle-button-renderer',
  'ytd-segmented-like-dislike-button-renderer',
  '#top-level-buttons-computed ytd-toggle-button-renderer[like-button] button#button',
  '#top-level-buttons-computed ytd-toggle-button-renderer[like-button]',
  '#top-level-buttons-computed button[aria-pressed]',
]

function nativeLikeEl(): HTMLElement | null {
  for (const sel of LIKE_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function nativeLikeState(): boolean {
  const el = nativeLikeEl()
  if (!el) return false
  const btn = el.querySelector<HTMLElement>('button[aria-pressed], button[aria-label]')
  const target = btn ?? el
  if (target.getAttribute('aria-pressed') === 'true') return true
  return /unlike/i.test(target.getAttribute('aria-label') ?? '')
}

function setLikeUi(btn: HTMLButtonElement, liked: boolean) {
  btn.classList.toggle('df-liked', liked)
  btn.textContent = liked ? 'Liked' : 'Like'
}

function syncLikeState(btn: HTMLButtonElement) {
  likeDomBaseline = nativeLikeState()
  setLikeUi(btn, likeDomBaseline)
}

// The initial state comes from the payload (paintInitialLikeState), not from here. The
// DOM's *first* value is not trustworthy: on a watch page opened inside a playlist it
// reads "not liked" for a video that is liked. So the observer only follows the DOM once
// it actually changes from what it said when we attached - which is a real like/unlike,
// whether it came from our button or from YouTube's own.
function watchLikeState(btn: HTMLButtonElement) {
  likeObserver?.disconnect()
  const target = nativeLikeEl()
  if (target) {
    likeDomBaseline = nativeLikeState()
    likeObserver = new MutationObserver(() => {
      const now = nativeLikeState()
      if (now === likeDomBaseline) return
      likeDomBaseline = now
      setLikeUi(btn, now)
    })
    likeObserver.observe(target, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-pressed', 'aria-label'],
    })
    return
  }
  likeWaitObserver?.disconnect()
  likeWaitObserver = waitForNative(() => !!nativeLikeEl(), () => watchLikeState(btn))
}

// Payload first, DOM only as a fallback when the page carries no like status at all.
function paintInitialLikeState(btn: HTMLButtonElement) {
  const status = extractLikeStatus()
  setLikeUi(btn, status !== null ? status === 'LIKE' : nativeLikeState())
}

function clickLikeTarget(btn: HTMLButtonElement, target: HTMLElement) {
  const wasLiked = nativeLikeState()
  likeDomBaseline = !wasLiked
  setLikeUi(btn, !wasLiked)
  target.click()
  if (DEBUG) console.log('[Dumbify] clicked like target:', target)
  window.setTimeout(() => syncLikeState(btn), 600)
}

function clickNativeLike(btn: HTMLButtonElement) {
  const target = nativeLikeEl()
  if (target) {
    clickLikeTarget(btn, target)
    return
  }
  console.warn('[Dumbify] native like button not found')
  let tries = 0
  const poll = window.setInterval(() => {
    const t = nativeLikeEl()
    if (t) {
      window.clearInterval(poll)
      clickLikeTarget(btn, t)
    } else if (++tries >= 4) {
      window.clearInterval(poll)
    }
  }, 500)
}

// Saving goes straight through InnerTube (playlist/get_add_to_playlist +
// browse/edit_playlist). The old path drove YouTube's own save dialog and scraped it
// for a "Watch later" row, which only ever reached that one playlist and broke every
// time the dialog's markup moved.
let savePicker: HTMLElement | null = null
let savePickerClose: (() => void) | null = null

function closeSavePicker() {
  savePickerClose?.()
}

function paintSaveButton(btn: HTMLButtonElement, playlists: SavePlaylist[]) {
  const saved = playlists.some((p) => p.saved)
  btn.classList.toggle('df-saved', saved)
  btn.textContent = saved ? 'Saved' : 'Save'
}

function renderSaveRow(
  p: SavePlaylist,
  videoId: string,
  btn: HTMLButtonElement,
  all: SavePlaylist[]
): HTMLElement {
  const row = document.createElement('button')
  row.className = 'df-save-row'

  const box = document.createElement('span')
  box.className = 'df-save-row-box'
  const name = document.createElement('span')
  name.className = 'df-save-row-name'
  name.textContent = p.title
  row.append(box, name)

  const paint = () => {
    box.textContent = p.saved ? '[x]' : '[ ]'
    row.classList.toggle('df-save-row--on', p.saved)
  }
  paint()

  row.onclick = async () => {
    if (row.disabled) return
    row.disabled = true
    const next = !p.saved
    p.saved = next
    paint()
    paintSaveButton(btn, all)

    const ok = await setVideoInPlaylist(p.id, videoId, next)
    if (!ok) {
      p.saved = !next
      paint()
      paintSaveButton(btn, all)
      row.classList.add('df-save-row--failed')
      window.setTimeout(() => row.classList.remove('df-save-row--failed'), 1500)
    }
    row.disabled = false
  }
  return row
}

// The "+ New playlist" footer, which swaps in place for a name + visibility form the
// way youtube.com's own save dialog does.
function renderCreateFooter(
  panel: HTMLElement,
  videoId: string,
  btn: HTMLButtonElement,
  all: SavePlaylist[]
): HTMLElement {
  const footer = document.createElement('div')
  footer.className = 'df-save-create'

  const open = document.createElement('button')
  open.className = 'df-save-row df-save-create-open'
  open.textContent = '+ New playlist'
  footer.appendChild(open)

  open.onclick = () => {
    footer.innerHTML = ''

    const form = document.createElement('form')
    form.className = 'df-save-create-form'

    const name = document.createElement('input')
    name.className = 'df-save-create-name'
    name.type = 'text'
    name.placeholder = 'Playlist name'
    name.maxLength = 150
    form.appendChild(name)

    const privacy = document.createElement('select')
    privacy.className = 'df-save-create-privacy'
    for (const [value, label] of [['PRIVATE', 'Private'], ['UNLISTED', 'Unlisted'], ['PUBLIC', 'Public']]) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = label
      privacy.appendChild(opt)
    }
    form.appendChild(privacy)

    const row = document.createElement('div')
    row.className = 'df-save-create-actions'
    const create = document.createElement('button')
    create.className = 'df-save-create-submit'
    create.type = 'submit'
    create.textContent = 'Create'
    create.disabled = true
    const cancel = document.createElement('button')
    cancel.className = 'df-save-create-cancel'
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    row.append(create, cancel)
    form.appendChild(row)

    const error = document.createElement('p')
    error.className = 'df-save-create-error'
    form.appendChild(error)

    footer.appendChild(form)
    name.focus()

    name.oninput = () => {
      create.disabled = !name.value.trim()
      error.textContent = ''
    }

    cancel.onclick = () => {
      footer.replaceWith(renderCreateFooter(panel, videoId, btn, all))
    }

    form.onsubmit = async (e) => {
      e.preventDefault()
      const title = name.value.trim()
      if (!title || create.disabled) return
      create.disabled = true
      cancel.disabled = true
      create.textContent = 'Creating'
      error.textContent = ''

      const made = await createPlaylistWithVideo(title, videoId, privacy.value as 'PRIVATE' | 'UNLISTED' | 'PUBLIC')
      if (savePicker !== panel) return
      if (!made) {
        create.disabled = false
        cancel.disabled = false
        create.textContent = 'Create'
        error.textContent = "Couldn't create that playlist"
        return
      }

      all.push(made)
      panel.insertBefore(renderSaveRow(made, videoId, btn, all), footer)
      paintSaveButton(btn, all)
      footer.replaceWith(renderCreateFooter(panel, videoId, btn, all))
    }
  }

  return footer
}

function toggleSavePicker(btn: HTMLButtonElement, videoId: string) {
  if (savePicker) {
    closeSavePicker()
    return
  }

  const panel = document.createElement('div')
  panel.className = 'df-save-picker'
  savePicker = panel

  const status = document.createElement('p')
  status.className = 'df-save-picker-status'
  status.textContent = 'Loading'
  panel.appendChild(status)
  btn.parentElement!.appendChild(panel)

  const onDocClick = (e: MouseEvent) => {
    const t = e.target as Node
    if (panel.contains(t) || btn.contains(t)) return
    closeSavePicker()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeSavePicker()
  }
  savePickerClose = () => {
    document.removeEventListener('click', onDocClick, true)
    document.removeEventListener('keydown', onKey)
    panel.remove()
    savePicker = null
    savePickerClose = null
  }
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)

  fetchSavePlaylists(videoId).then((playlists) => {
    if (savePicker !== panel) return
    if (!playlists.length) {
      status.textContent = 'No playlists — sign in to save'
      return
    }
    panel.innerHTML = ''
    paintSaveButton(btn, playlists)
    playlists.forEach((p) => panel.appendChild(renderSaveRow(p, videoId, btn, playlists)))
    panel.appendChild(renderCreateFooter(panel, videoId, btn, playlists))
  })
}

let moveCheck: number | null = null
let moveSafety: number | null = null

function playerReady(el: HTMLElement): boolean {
  const video = el.querySelector('video')
  return !!video && (!!video.currentSrc || video.readyState > 0)
}

function checkPlaybackHealth() {
  window.setTimeout(() => {
    const video = movedPlayer?.querySelector('video')
    if (!video || !movedPlayer) return
    // currentSrc is a signed googlevideo URL - only logged behind the debug flag.
    if (DEBUG) {
      console.log(
        '[Dumbify] video state:',
        JSON.stringify({
          src: video.currentSrc?.slice(0, 100),
          readyState: video.readyState,
          error: video.error ? `${video.error.code}: ${video.error.message}` : null,
        })
      )
    }
    if (video.readyState === 0 && video.currentSrc && !video.error) {
      if (DEBUG) console.log('[Dumbify] nudging video.load()')
      video.load()
    }
  }, 4000)
}

function movePlayerNow(target: HTMLElement, el: HTMLElement) {
  if (movedPlayer) return
  if (DEBUG) console.log('[Dumbify] player found:', el.tagName, el.id || el.className)
  originalParent = el.parentElement
  originalSibling = el.nextSibling
  el.classList.add('df-native-player')
  target.appendChild(el)
  movedPlayer = el
  playerWatcher?.disconnect()
  playerWatcher = null
  if (playerTimeout !== null) {
    window.clearTimeout(playerTimeout)
    playerTimeout = null
  }
  fitPlayer()
  bindAspectSync()
  checkPlaybackHealth()
}

function movePlayerInto(target: HTMLElement) {
  if (movedPlayer) {
    if (movedPlayer.parentElement !== target) target.appendChild(movedPlayer)
    fitPlayer()
    bindAspectSync()
    return
  }
  const el = findPlayer()
  if (!el) return
  if (playerReady(el)) {
    if (moveCheck !== null) {
      window.clearInterval(moveCheck)
      moveCheck = null
    }
    if (moveSafety !== null) {
      window.clearTimeout(moveSafety)
      moveSafety = null
    }
    movePlayerNow(target, el)
    return
  }
  if (moveCheck !== null) return
  const interval = window.setInterval(() => {
    const el2 = findPlayer()
    if (el2 && playerReady(el2)) {
      window.clearInterval(interval)
      moveCheck = null
      if (moveSafety !== null) {
        window.clearTimeout(moveSafety)
        moveSafety = null
      }
      movePlayerNow(target, el2)
    }
  }, 250)
  moveCheck = interval
  moveSafety = window.setTimeout(() => {
    if (moveCheck !== null) {
      window.clearInterval(moveCheck)
      moveCheck = null
    }
    const el2 = findPlayer()
    if (el2 && !movedPlayer) movePlayerNow(target, el2)
  }, 3000)
}

function restorePlayer() {
  playerWatcher?.disconnect()
  playerWatcher = null
  if (playerTimeout !== null) {
    window.clearTimeout(playerTimeout)
    playerTimeout = null
  }
  if (moveCheck !== null) {
    window.clearInterval(moveCheck)
    moveCheck = null
  }
  if (moveSafety !== null) {
    window.clearTimeout(moveSafety)
    moveSafety = null
  }
  likeObserver?.disconnect()
  likeObserver = null
  likeWaitObserver?.disconnect()
  likeWaitObserver = null
  likeDomBaseline = null
  unbindAspectSync()
  if (onFullscreenChange) {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange = null
  }
  if (onFullscreenClick) {
    document.removeEventListener('click', onFullscreenClick, true)
    onFullscreenClick = null
  }
  if (onFullscreenKey) {
    document.removeEventListener('keydown', onFullscreenKey, true)
    onFullscreenKey = null
  }
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  }
  if (movedPlayer && originalParent) {
    const video = movedPlayer.querySelector('video')
    if (video) video.pause()
    originalParent.insertBefore(movedPlayer, originalSibling ?? null)
    movedPlayer.classList.remove('df-native-player')
    fitPlayer()
  }
  movedPlayer = null
  originalParent = null
  originalSibling = null
}

function topLevelButtonsJson(): string {
  const tlb = document.querySelector('#top-level-buttons-computed')
  if (!tlb) return 'NO #top-level-buttons-computed'
  return JSON.stringify(
    [...tlb.querySelectorAll('button')].map((b) => ({
      aria: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      pressed: b.getAttribute('aria-pressed'),
      text: b.textContent?.trim().slice(0, 40),
    }))
  )
}

function logLikeDiagnostics() {
  for (const sel of LIKE_SELECTORS) {
    if (document.querySelector(sel)) console.log('[Dumbify] like selector ok:', sel)
  }
  console.log('[Dumbify] top-level buttons:', topLevelButtonsJson())
}

function extractComments(): CommentItem[] {
  const nodes = document.querySelectorAll<HTMLElement>(
    'ytd-comment-thread-renderer ytd-comment-renderer'
  )
  const list: CommentItem[] = []
  nodes.forEach((t) => {
    const text = t.querySelector('#content-text')?.textContent?.trim() ?? ''
    if (!text) return
    const likes = t.querySelector('#vote-count-middle')?.textContent?.trim() ?? ''
    const likeVal = likes && likes !== '0' ? likes : ''
    list.push({
      author: t.querySelector('#author-text')?.textContent?.trim() ?? 'Unknown',
      time: t.querySelector('#published-time-text')?.textContent?.trim() ?? '',
      text,
      likes: likeVal,
      likesLiked: likeVal,
      likesNotliked: likeVal,
      commentId: null,
      stateKey: null,
      liked: false,
      likeAction: null,
      unlikeAction: null,
      replyParams: null,
      replyCount: 0,
      repliesToken: null,
      signedOut: false,
      justPosted: false,
    })
  })
  return list
}

// Posting goes through the API only. The previous native path drove YouTube's own
// composer via execCommand + a simulated submit click, then resolved 'ok' on a 400ms
// timer regardless of what actually happened - so a comment that never posted still
// reported "Posted", and when it fell back to the API the timer beat the request and
// reported success while it was still in flight. postCommentViaApi returns the real
// outcome, so the button can tell the truth.
async function postCommentViaApi(comment: string): Promise<'ok' | 'signin' | 'failed'> {
  let params = createParams
  if (!params) {
    params = await fetchCreateParams()
    if (params) createParams = params
  }
  if (!params) {
    console.warn('[Dumbify] cannot post: not signed in to YouTube (no createCommentParams)')
    return 'signin'
  }
  let ok = await postCommentAPI(comment, params)
  if (!ok && createParams) {
    const fresh = await fetchCreateParams()
    if (fresh && fresh !== createParams) {
      createParams = fresh
      ok = await postCommentAPI(comment, fresh)
    }
  }
  if (ok) {
    dataComments = [localComment('You', comment), ...dataComments]
    // dataCommentCount is the abbreviated form ("1.2K"), so stripping non-digits and
    // incrementing turned 1.2K into 13. Only a plain integer can be counted up; anything
    // abbreviated stays as it is until the next real count arrives.
    if (/^\d+$/.test(dataCommentCount)) dataCommentCount = String(Number(dataCommentCount) + 1)
    updateCommentsToggle()
    const list = commentsSection?.querySelector<HTMLElement>('.df-comment-list')
    if (list && commentsSection?.isConnected) {
      renderComments(list, dataComments)
      renderMoreButton(list)
    }
  } else {
    console.warn('[Dumbify] comment post failed (not signed in?)')
  }
  return ok ? 'ok' : 'failed'
}

function commentLikeLabel(c: CommentItem): string {
  const count = c.liked ? c.likesLiked : c.likesNotliked
  const word = c.liked ? 'Liked' : 'Like'
  return count ? `${word} · ${count}` : word
}

function showCommentNotice(anchor: HTMLElement, message: string) {
  const note = document.createElement('span')
  note.className = 'df-comment-notice'
  note.textContent = message
  anchor.insertAdjacentElement('afterend', note)
  window.setTimeout(() => note.remove(), 2500)
}

function rerenderCommentList() {
  const list = commentsSection?.querySelector<HTMLElement>('.df-comment-list')
  if (list && commentsSection?.isConnected) renderComments(list, dataComments)
}

async function handleCommentLike(c: CommentItem, btn: HTMLButtonElement) {
  if (btn.disabled) return
  const action = c.liked ? c.unlikeAction : c.likeAction
  if (!action) {
    const msg = c.justPosted
      ? 'Reload to like this comment'
      : c.signedOut
        ? 'Sign in on YouTube to like comments'
        : 'Liking isn’t available for this comment'
    showCommentNotice(btn, msg)
    return
  }
  btn.disabled = true
  const result = await performCommentAction(action, c.stateKey)
  btn.disabled = false
  if (!result.ok) {
    showCommentNotice(btn, 'Failed to update like')
    return
  }
  c.liked = result.liked ?? !c.liked
  btn.classList.toggle('df-liked', c.liked)
  btn.textContent = commentLikeLabel(c)
}

function toggleReplyBox(c: CommentItem, host: HTMLElement) {
  const existing = host.querySelector<HTMLElement>('.df-comment-reply-box')
  if (existing) {
    existing.remove()
    return
  }
  const box = document.createElement('div')
  box.className = 'df-comment-reply-box'
  const input = document.createElement('textarea')
  input.className = 'df-comment-input'
  input.placeholder = `Reply to ${c.author}…`
  input.rows = 1
  const submit = document.createElement('button')
  submit.className = 'df-comment-submit'
  submit.textContent = 'Reply'
  submit.onclick = async () => {
    const text = input.value.trim()
    if (!text || submit.disabled) return
    if (!c.replyParams) {
      const msg = c.justPosted
        ? 'Reload to reply to this comment'
        : c.signedOut
          ? 'Sign in on YouTube to reply'
          : 'Replies are disabled for this comment'
      showCommentNotice(submit, msg)
      return
    }
    submit.disabled = true
    submit.textContent = 'Posting…'
    const ok = await postCommentReplyAPI(text, c.replyParams)
    if (ok) {
      await addLocalReply(c, text)
    } else {
      submit.disabled = false
      submit.textContent = 'Reply'
      showCommentNotice(submit, 'Failed to post reply')
    }
  }
  box.appendChild(input)
  box.appendChild(submit)
  host.appendChild(box)
  input.focus()
}

async function addLocalReply(parent: CommentItem, text: string) {
  if (!parent.commentId) return
  let existing = commentReplies.get(parent.commentId)
  if (!existing) {
    if (parent.repliesToken) {
      const { comments, nextToken } = await fetchCommentReplies(parent.repliesToken)
      existing = comments
      commentRepliesNextToken.set(parent.commentId, nextToken)
    } else {
      existing = []
    }
  }
  commentReplies.set(parent.commentId, [localComment('You', text), ...existing])
  expandedReplies.add(parent.commentId)
  parent.replyCount += 1
  rerenderCommentList()
}

async function toggleReplies(c: CommentItem) {
  if (!c.commentId) return
  if (expandedReplies.has(c.commentId)) {
    expandedReplies.delete(c.commentId)
    rerenderCommentList()
    return
  }
  expandedReplies.add(c.commentId)
  if (!commentReplies.has(c.commentId) && c.repliesToken) {
    rerenderCommentList()
    const { comments, nextToken } = await fetchCommentReplies(c.repliesToken)
    commentReplies.set(c.commentId, comments)
    commentRepliesNextToken.set(c.commentId, nextToken)
  }
  rerenderCommentList()
}

function renderRepliesInto(container: HTMLElement, c: CommentItem) {
  container.innerHTML = ''
  if (!c.commentId) return
  const replies = commentReplies.get(c.commentId)
  if (!replies) {
    const loading = document.createElement('p')
    loading.className = 'df-comment-empty'
    loading.textContent = 'Loading replies…'
    container.appendChild(loading)
    return
  }
  replies.forEach((r) => container.appendChild(renderCommentItem(r, 1)))
  const nextToken = commentRepliesNextToken.get(c.commentId)
  if (nextToken) {
    const more = document.createElement('button')
    more.className = 'df-comment-more'
    more.textContent = 'Load more replies'
    more.onclick = async () => {
      if (more.disabled || !c.commentId) return
      more.disabled = true
      const { comments, nextToken: next } = await fetchCommentReplies(nextToken)
      commentReplies.set(c.commentId, [...(commentReplies.get(c.commentId) ?? []), ...comments])
      commentRepliesNextToken.set(c.commentId, next)
      renderRepliesInto(container, c)
    }
    container.appendChild(more)
  }
}

function renderCommentItem(c: CommentItem, depth = 0): HTMLElement {
  const item = document.createElement('article')
  item.className = depth > 0 ? 'df-comment df-comment-reply' : 'df-comment'

  const meta = document.createElement('p')
  meta.className = 'df-comment-meta'
  meta.textContent = [c.author, c.time].filter(Boolean).join(' · ')
  item.appendChild(meta)

  const text = document.createElement('p')
  text.className = 'df-comment-text'
  text.textContent = c.text
  item.appendChild(text)

  const actions = document.createElement('div')
  actions.className = 'df-comment-actions'

  const likeBtn = document.createElement('button')
  likeBtn.className = 'df-comment-action'
  likeBtn.classList.toggle('df-liked', c.liked)
  likeBtn.textContent = commentLikeLabel(c)
  likeBtn.onclick = () => handleCommentLike(c, likeBtn)
  actions.appendChild(likeBtn)

  const replyBoxHost = document.createElement('div')
  replyBoxHost.className = 'df-comment-reply-box-host'

  const replyBtn = document.createElement('button')
  replyBtn.className = 'df-comment-action'
  replyBtn.textContent = 'Reply'
  replyBtn.onclick = () => toggleReplyBox(c, replyBoxHost)
  actions.appendChild(replyBtn)

  item.appendChild(actions)
  item.appendChild(replyBoxHost)

  const hasLocalReplies = !!c.commentId && commentReplies.has(c.commentId)
  if (depth === 0 && c.commentId && (c.repliesToken || c.replyCount > 0 || hasLocalReplies)) {
    const isOpen = expandedReplies.has(c.commentId)
    const toggle = document.createElement('button')
    toggle.className = 'df-comment-replies-toggle'
    toggle.textContent = isOpen ? 'Hide replies' : `View ${c.replyCount > 0 ? c.replyCount + ' ' : ''}replies`
    toggle.onclick = () => toggleReplies(c)
    item.appendChild(toggle)

    const repliesContainer = document.createElement('div')
    repliesContainer.className = 'df-comment-replies'
    item.appendChild(repliesContainer)
    if (isOpen) renderRepliesInto(repliesContainer, c)
  }

  return item
}

function renderComments(list: HTMLElement, source: CommentItem[] | null = null) {
  const comments = source ?? extractComments()
  list.innerHTML = ''
  if (comments.length === 0) {
    if (DEBUG) {
      const threads = document.querySelectorAll('ytd-comment-thread-renderer').length
      const withText = [...document.querySelectorAll('ytd-comment-thread-renderer')].filter(
        (t) => t.querySelector('#content-text')?.textContent?.trim()
      ).length
      console.log('[Dumbify] no comments rendered; threads:', threads, 'with text:', withText)
    }
    const empty = document.createElement('p')
    empty.className = 'df-comment-empty'
    empty.textContent = 'No comments yet'
    list.appendChild(empty)
    return
  }
  comments.forEach((c) => list.appendChild(renderCommentItem(c)))
}

function buildCommentsSection(): HTMLElement {
  const section = document.createElement('section')
  section.className = 'df-comments'

  const composer = document.createElement('div')
  composer.className = 'df-comment-composer'

  const input = document.createElement('textarea')
  input.className = 'df-comment-input'
  input.placeholder = 'Add a comment…'
  input.rows = 1
  const autoGrow = () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`
  }
  input.addEventListener('input', autoGrow)
  autoGrow()

  const postBtn = document.createElement('button')
  postBtn.className = 'df-comment-submit'
  postBtn.textContent = 'Post'
  postBtn.onclick = async () => {
    const text = input.value.trim()
    if (!text || postBtn.disabled) return
    input.value = ''
    input.style.height = ''
    postBtn.disabled = true
    postBtn.textContent = 'Posting…'
    const r = await postCommentViaApi(text)
    postBtn.textContent = r === 'ok' ? 'Posted' : r === 'signin' ? 'Sign in to post' : 'Failed'
    window.setTimeout(() => {
      postBtn.disabled = false
      postBtn.textContent = 'Post'
    }, 1500)
  }

  composer.appendChild(input)
  composer.appendChild(postBtn)
  section.appendChild(composer)

  const list = document.createElement('div')
  list.className = 'df-comment-list'
  section.appendChild(list)

  commentsSection = section
  renderComments(list)
  watchComments()

  return section
}

function toggleComments() {
  commentsOpen = !commentsOpen
  if (commentsOpen) {
    if (!commentsSection) {
      commentsSection = buildCommentsSection()
      content!.appendChild(commentsSection)
      const inp = commentsSection.querySelector<HTMLTextAreaElement>('.df-comment-input')
      if (inp) inp.dispatchEvent(new Event('input'))
      commentsSection.scrollIntoView({ block: 'start' })
      window.dispatchEvent(new Event('scroll'))
      refreshCommentsFromData()
    }
  } else if (commentsSection) {
    commentsObserver?.disconnect()
    commentsObserver = null
    commentsSection.remove()
    commentsSection = null
  }
}

function commentCount(): string {
  if (dataCommentCount) return dataCommentCount
  const el = document.querySelector<HTMLElement>('ytd-comments-header-renderer #count')
  if (el?.textContent) return parseCountText(el.textContent)
  return ''
}

function updateCommentsToggle() {
  if (!commentsBtnEl) return
  const count = commentCount()
  commentsBtnEl.textContent = count ? `Comments · ${count}` : 'Comments'
}

function scheduleRender() {
  if (renderTimer !== null) window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(() => {
    renderTimer = null
    const list = commentsSection?.querySelector<HTMLElement>('.df-comment-list')
    if (list && commentsSection?.isConnected) {
      if (dataComments.length > 0) {
        renderComments(list, dataComments)
        renderMoreButton(list)
      } else {
        renderComments(list)
      }
    }
    updateCommentsToggle()
  }, 300)
}

function watchComments() {
  const commentsNative = findNativeComments()
  if (commentsNative) {
    commentsObserver?.disconnect()
    commentsObserver = new MutationObserver(scheduleRender)
    commentsObserver.observe(commentsNative, { childList: true, subtree: true })
    updateCommentsToggle()
    return
  }
  commentsWaitObserver?.disconnect()
  commentsWaitObserver = waitForNative(() => !!findNativeComments(), () => watchComments())
}

function resetComments() {
  commentsOpen = false
  commentsSection = null
  commentsBtnEl = null
  commentsObserver?.disconnect()
  commentsObserver = null
  commentsWaitObserver?.disconnect()
  commentsWaitObserver = null
  if (renderTimer !== null) {
    window.clearTimeout(renderTimer)
    renderTimer = null
  }
  dataCommentCount = ''
  dataRefreshAttempted = false
  dataRefreshPending = false
  moreToken = null
  dataComments = []
  createParams = null
  commentReplies.clear()
  commentRepliesNextToken.clear()
  expandedReplies.clear()
}

function resetPlaylist() {
  playlistPanel = null
  playlistVideos = []
  playlistTitle = ''
  playlistToken = null
  playlistCurrentId = null
  playlistLoadObserver?.disconnect()
  playlistLoadObserver = null
  if (playlistUrlPoll !== null) {
    window.clearInterval(playlistUrlPoll)
    playlistUrlPoll = null
  }
  playlistLastVideoId = null
}

function renderPlaylistItem(video: Video, index: number, current: boolean): HTMLElement {
  const item = document.createElement('div')
  item.className = 'df-playlist-item' + (current ? ' df-playlist-item--current' : '')

  const num = document.createElement('span')
  num.className = 'df-playlist-item-num'
  num.textContent = String(index + 1)
  item.appendChild(num)

  const info = document.createElement('div')
  info.className = 'df-playlist-item-info'

  const title = document.createElement('p')
  title.className = 'df-playlist-item-title'
  title.textContent = video.title || 'Untitled'
  info.appendChild(title)

  const channel = document.createElement('p')
  channel.className = 'df-playlist-item-channel'
  channel.textContent = video.channel || ''
  info.appendChild(channel)

  item.appendChild(info)

  if (!current) {
    makeClickable(item, () => {
      const listParam = new URLSearchParams(location.search).get('list')
      const url = listParam ? `/watch?v=${video.id}&list=${listParam}` : `/watch?v=${video.id}`
      navigateTo(url)
    })
  }

  return item
}

function renderPlaylistPanel() {
  if (!playlistPanel) return
  playlistPanel.innerHTML = ''

  if (playlistTitle) {
    const header = document.createElement('p')
    header.className = 'df-playlist-header'
    header.textContent = playlistTitle
    playlistPanel.appendChild(header)
  }

  const currentVideoId = playlistCurrentId ?? new URLSearchParams(location.search).get('v')
  playlistVideos.forEach((v, i) => {
    playlistPanel!.appendChild(renderPlaylistItem(v, i, v.id === currentVideoId))
  })

  if (playlistToken) {
    const loadMore = document.createElement('button')
    loadMore.className = 'df-playlist-load-more'
    loadMore.textContent = 'Load more'
    loadMore.onclick = async () => {
      if (!playlistToken || loadMore.disabled) return
      loadMore.disabled = true
      loadMore.textContent = 'Loading…'
      const result = await fetchContinuation(playlistToken, 'playlist')
      if (!result.videos.length) {
        // Nothing more to page through - say so rather than sitting on "Loading…".
        playlistToken = null
        loadMore.remove()
        return
      }
      playlistVideos = [...playlistVideos, ...result.videos]
      playlistToken = result.token
      renderPlaylistPanel()
    }
    playlistPanel.appendChild(loadMore)
  }

  // Scroll to current item
  requestAnimationFrame(() => {
    const current = playlistPanel?.querySelector('.df-playlist-item--current')
    if (current) current.scrollIntoView({ block: 'nearest' })
  })
}

async function loadPlaylistSidebar(playlistId: string, currentVideoId: string) {
  playlistCurrentId = currentVideoId
  const result = await fetchPlaylistPage(playlistId)
  if (!playlistPanel?.isConnected) return
  playlistVideos = result.videos
  playlistTitle = result.title
  playlistToken = result.token
  renderPlaylistPanel()
}

function startPlaylistUrlWatch() {
  if (playlistUrlPoll !== null) return
  playlistLastVideoId = new URLSearchParams(location.search).get('v')
  playlistUrlPoll = window.setInterval(() => {
    const currentVid = new URLSearchParams(location.search).get('v')
    if (currentVid && currentVid !== playlistLastVideoId) {
      window.location.reload()
    }
  }, 500)
}

function buildWatchPage(nav: NavigationState) {
  content!.innerHTML = ''
  resetComments()
  resetPlaylist()
  closeSavePicker()

  const hasPlaylist = !!nav.playlistId

  // Two-column layout when in a playlist
  const layout = document.createElement('div')
  layout.className = hasPlaylist ? 'df-watch-layout' : ''

  const mainCol = document.createElement('div')
  mainCol.className = hasPlaylist ? 'df-watch-main' : ''

  const pageError = extractPageError()
  if (pageError) {
    renderNotFound(pageError)
    return
  }

  const nowPlaying = document.createElement('p')
  nowPlaying.className = 'df-now-playing'
  nowPlaying.textContent = 'Now playing'
  mainCol.appendChild(nowPlaying)

  const player = document.createElement('div')
  player.className = 'df-player'
  mainCol.appendChild(player)

  const screen = document.createElement('div')
  screen.className = 'df-player-screen df-player-screen--native'
  player.appendChild(screen)

  movePlayerInto(screen)

  if (!movedPlayer) {
    playerWatcher?.disconnect()
    playerWatcher = new MutationObserver(() => movePlayerInto(screen))
    playerWatcher.observe(document.documentElement, { childList: true, subtree: true })
    playerTimeout = window.setTimeout(() => {
      if (playerTimeout !== null) {
        window.clearTimeout(playerTimeout)
        playerTimeout = null
      }
      playerWatcher?.disconnect()
      playerWatcher = null
      if (!movedPlayer) {
        console.warn('[Dumbify] player not found after 10s; selectors:', PLAYER_SELECTORS.join(', '))
        const msg = document.createElement('p')
        msg.className = 'df-play-label'
        msg.textContent = 'Video not available'
        screen.appendChild(msg)
      }
    }, 10000)
  }

  if (movedPlayer && !onFullscreenChange) {
    onFullscreenChange = () => {
      const container = playerContainer()
      if (container) container.classList.toggle('ytp-fullscreen', !!document.fullscreenElement)
      if (!document.fullscreenElement) {
        requestAnimationFrame(() => {
          fitPlayer()
          syncPlayerAspect()
        })
      }
    }
    onFullscreenClick = (e) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest?.('.ytp-fullscreen-button')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      toggleFullscreen()
    }
    onFullscreenKey = (e) => {
      if (e.key !== 'f' && e.key !== 'F') return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      toggleFullscreen()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('click', onFullscreenClick, true)
    document.addEventListener('keydown', onFullscreenKey, true)
  }

  const data = extractWatchData()

  const title = document.createElement('h1')
  title.className = 'df-watch-title'
  title.textContent = data.video.title || 'Untitled'
  if (data.video.live) {
    const liveBadge = document.createElement('span')
    liveBadge.className = 'df-live-badge'
    liveBadge.textContent = 'LIVE'
    title.appendChild(liveBadge)
  }
  mainCol.appendChild(title)

  const metaBar = document.createElement('div')
  metaBar.className = 'df-watch-meta-bar'

  if (data.video.channel) {
    const channelId = data.video.channelId
    const channelSpan = document.createElement('span')
    channelSpan.className = 'df-watch-channel'
    if (channelId) {
      channelSpan.classList.add('df-watch-channel--link')
      const label = document.createElement('span')
      label.textContent = data.video.channel
      channelSpan.appendChild(label)
      channelSpan.onclick = (e) => { e.stopPropagation(); navigateTo(`/channel/${channelId}`) }
    } else {
      channelSpan.textContent = data.video.channel
    }
    metaBar.appendChild(channelSpan)
  }

  if (data.video.views || data.video.published) {
    const metaItem = document.createElement('span')
    metaItem.className = 'df-watch-meta-item'
    const parts: string[] = []
    if (data.video.views) {
      const num = parseInt(data.video.views.replace(/[^0-9]/g, ''), 10)
      parts.push(isNaN(num) ? data.video.views : `${num.toLocaleString()} views`)
    }
    if (data.video.published) {
      // publishDate carries the uploader's own offset ("2009-10-24T23:57:33-07:00").
      // new Date() + toLocaleDateString would re-render it in the viewer's timezone and
      // shift the day, so take the calendar date straight from the string.
      const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.video.published)
      const d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(data.video.published)
      if (!isNaN(d.getTime())) {
        parts.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
      } else {
        parts.push(data.video.published)
      }
    }
    metaItem.textContent = parts.join(' · ')
    metaBar.appendChild(metaItem)
  }

  const actions = document.createElement('div')
  actions.className = 'df-watch-actions'

  const likeBtn = document.createElement('button')
  likeBtn.className = 'df-watch-action'
  likeBtn.textContent = 'Like'
  likeBtn.onclick = () => clickNativeLike(likeBtn)
  actions.appendChild(likeBtn)
  paintInitialLikeState(likeBtn)
  watchLikeState(likeBtn)

  const saveBtn = document.createElement('button')
  saveBtn.className = 'df-watch-action'
  saveBtn.textContent = 'Save'
  saveBtn.onclick = () => toggleSavePicker(saveBtn, data.video.id)
  actions.appendChild(saveBtn)

  const commentsBtn = document.createElement('button')
  commentsBtn.className = 'df-watch-action'
  commentsBtn.textContent = 'Comments'
  commentsBtnEl = commentsBtn
  commentsBtn.onclick = () => toggleComments()
  actions.appendChild(commentsBtn)
  updateCommentsToggle()

  metaBar.appendChild(actions)

  mainCol.appendChild(metaBar)

  const description = document.createElement('details')
  description.className = 'df-watch-description'
  const summary = document.createElement('summary')
  summary.textContent = 'Description'
  description.appendChild(summary)
  const text = document.createElement('p')
  text.className = 'df-watch-description-text'
  text.textContent = (data.video.description ?? '').trim() || 'No description'
  description.appendChild(text)
  mainCol.appendChild(description)

  // Playlist sidebar (below main content, full width)
  if (hasPlaylist) {
    const sideCol = document.createElement('div')
    sideCol.className = 'df-playlist-panel'
    playlistPanel = sideCol
    mainCol.appendChild(sideCol)
    renderPlaylistPanel()
    loadPlaylistSidebar(nav.playlistId!, data.video.id)
    startPlaylistUrlWatch()
  }

  layout.appendChild(mainCol)

  content!.appendChild(layout)

  if (DEBUG) logLikeDiagnostics()
}

export const watchPageFeature: Feature = {
  id: 'watch-page',

  mount(nav: NavigationState) {
    buildWatchPage(nav)
  },

  update(nav: NavigationState) {
    buildWatchPage(nav)
  },

  unmount() {
    resetComments()
    resetPlaylist()
    closeSavePicker()
    restorePlayer()
    content!.innerHTML = ''
  },
}
