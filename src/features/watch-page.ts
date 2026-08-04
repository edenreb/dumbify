import type { NavigationState } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content } from '../core/UIEngine'
import {
  extractWatchData,
  extractCommentsFromPage,
  fetchMoreComments,
  parseCountText,
  postCommentAPI,
  postCommentReplyAPI,
  fetchCreateParams,
  fetchCommentReplies,
  performCommentAction,
  localComment,
  type CommentItem,
} from '../core/DataExtractor'

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
      renderComments(list, dataComments)
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
  setLikeUi(btn, nativeLikeState())
}

function watchLikeState(btn: HTMLButtonElement) {
  likeObserver?.disconnect()
  const target = nativeLikeEl()
  if (target) {
    likeObserver = new MutationObserver(() => syncLikeState(btn))
    likeObserver.observe(target, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-pressed', 'aria-label'],
    })
    syncLikeState(btn)
    return
  }
  const wait = new MutationObserver(() => {
    if (!nativeLikeEl()) return
    wait.disconnect()
    watchLikeState(btn)
  })
  wait.observe(document.body, { childList: true, subtree: true })
}

function clickLikeTarget(btn: HTMLButtonElement, target: HTMLElement) {
  const wasLiked = nativeLikeState()
  setLikeUi(btn, !wasLiked)
  target.click()
  console.log('[dumbify] clicked like target:', target)
  window.setTimeout(() => syncLikeState(btn), 600)
}

function clickNativeLike(btn: HTMLButtonElement) {
  const target = nativeLikeEl()
  if (target) {
    clickLikeTarget(btn, target)
    return
  }
  console.warn('[dumbify] native like button not found')
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

// YouTube replaced the dedicated Watch-Later toggle button with a generic
// "Save to playlist" action that opens a dialog listing every playlist
// (Watch later included) as a checkbox row; there is no toggled/pressed
// state on the button itself, only inside that dialog.
const SAVE_BUTTON_SELECTORS = [
  'button[aria-label="Save to playlist"]',
  'button[aria-label^="Save" i]',
  '#actions button[aria-label^="Save" i]',
  'ytd-menu-renderer button[aria-label^="Save" i]',
]

const SAVE_DIALOG_SELECTORS = [
  'ytd-add-to-playlist-renderer',
  'yt-add-to-playlist-dialog-renderer',
  'tp-yt-paper-dialog[aria-label*="playlist" i]',
]

function nativeSaveButtonEl(): HTMLElement | null {
  for (const sel of SAVE_BUTTON_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function findSaveDialog(): HTMLElement | null {
  for (const sel of SAVE_DIALOG_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function findWatchLaterRow(dialog: HTMLElement): HTMLElement | null {
  const candidates = dialog.querySelectorAll<HTMLElement>('*')
  for (const el of candidates) {
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ')
    if (ownText && /^watch later$/i.test(ownText)) {
      return (
        el.closest<HTMLElement>(
          'ytd-playlist-add-to-option-renderer, [role="menuitemcheckbox"], [role="checkbox"], tp-yt-paper-item, li'
        ) ?? el.parentElement
      )
    }
  }
  return null
}

function watchLaterRowState(row: HTMLElement): { checked: boolean; target: HTMLElement } {
  const control = row.querySelector<HTMLElement>(
    '[role="checkbox"], tp-yt-paper-checkbox, yt-checkbox-shape, input[type="checkbox"]'
  )
  const target = control ?? row
  const checked =
    target.getAttribute('aria-checked') === 'true' ||
    (target as HTMLInputElement).checked === true ||
    target.classList.contains('iron-selected')
  return { checked, target }
}

function closeSaveDialog() {
  const closeBtn = document.querySelector<HTMLElement>(
    [...SAVE_DIALOG_SELECTORS.map((s) => `${s} button[aria-label="Close"]`), 'button[aria-label="Close"]'].join(', ')
  )
  if (closeBtn) {
    closeBtn.click()
    return
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

function setWlUi(btn: HTMLButtonElement, saved: boolean) {
  btn.classList.toggle('df-saved', saved)
  btn.textContent = saved ? 'Saved' : 'Watch later'
}

function clickNativeWl(btn: HTMLButtonElement) {
  const saveBtn = nativeSaveButtonEl()
  if (!saveBtn) {
    console.warn('[dumbify] native save/watch-later button not found; buttons:', topLevelButtonsJson())
    return
  }
  saveBtn.click()
  let tries = 0
  const poll = window.setInterval(() => {
    tries++
    const dialog = findSaveDialog()
    const row = dialog ? findWatchLaterRow(dialog) : null
    if (row) {
      window.clearInterval(poll)
      const { checked, target } = watchLaterRowState(row)
      target.click()
      setWlUi(btn, !checked)
      console.log('[dumbify] toggled watch later:', !checked)
      window.setTimeout(closeSaveDialog, 400)
    } else if (tries >= 15) {
      window.clearInterval(poll)
      console.warn('[dumbify] watch-later option not found in save dialog')
      closeSaveDialog()
    }
  }, 200)
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
    console.log(
      '[dumbify] video state:',
      JSON.stringify({
        src: video.currentSrc?.slice(0, 100),
        readyState: video.readyState,
        error: video.error ? `${video.error.code}: ${video.error.message}` : null,
      })
    )
    if (video.readyState === 0 && video.currentSrc && !video.error) {
      console.log('[dumbify] nudging video.load()')
      video.load()
    }
  }, 4000)
}

function movePlayerNow(target: HTMLElement, el: HTMLElement) {
  if (movedPlayer) return
  console.log('[dumbify] player found:', el.tagName, el.id || el.className)
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
    if (document.querySelector(sel)) console.log('[dumbify] like selector ok:', sel)
  }
  for (const sel of SAVE_BUTTON_SELECTORS) {
    if (document.querySelector(sel)) console.log('[dumbify] save button selector ok:', sel)
  }
  console.log('[dumbify] top-level buttons:', topLevelButtonsJson())
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

function postComment(comment: string): Promise<'ok' | 'signin' | 'failed'> {
  return new Promise((resolve) => {
    const find = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel)
    const findPlaceholder = () =>
      find('ytd-comments ytd-comment-simplebox-renderer #placeholder-area, ytd-comment-simplebox-renderer #placeholder-area')

    const postViaApi = () => postCommentViaApi(comment).then(resolve)

    const submitNative = () => {
      const editable = find('ytd-comments #contenteditable-root, ytd-comment-simplebox-renderer #contenteditable-root, #contenteditable-root')
      if (!editable) {
        postViaApi()
        return
      }
      editable.focus()
      const inserted = document.execCommand('insertText', false, comment)
      if (!inserted) {
        editable.textContent = comment
        editable.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertText', data: comment })
        )
      }
      window.setTimeout(() => {
        const submit = find('ytd-comments #submit-button button, ytd-comment-simplebox-renderer #submit-button button, #submit-button button')
        if (submit) submit.click()
        else postViaApi()
      }, 200)
      window.setTimeout(() => resolve('ok'), 400)
    }

    let attempts = 0
    const tryNative = () => {
      const placeholder = findPlaceholder()
      if (placeholder) {
        placeholder.click()
        window.setTimeout(submitNative, 300)
        return
      }
      attempts += 1
      if (attempts >= 8) {
        postViaApi()
        return
      }
      window.setTimeout(tryNative, 250)
    }
    tryNative()
  })
}

async function postCommentViaApi(comment: string): Promise<'ok' | 'signin' | 'failed'> {
  let params = createParams
  if (!params) {
    params = await fetchCreateParams()
    if (params) createParams = params
  }
  if (!params) {
    console.warn('[dumbify] cannot post: not signed in to YouTube (no createCommentParams)')
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
    const next = parseInt(dataCommentCount.replace(/[^0-9]/g, ''), 10) || 0
    dataCommentCount = `${next + 1}`
    updateCommentsToggle()
    const list = commentsSection?.querySelector<HTMLElement>('.df-comment-list')
    if (list && commentsSection?.isConnected) {
      renderComments(list, dataComments)
      renderMoreButton(list)
    }
  } else {
    console.warn('[dumbify] comment post failed (not signed in?)')
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
    const threads = document.querySelectorAll('ytd-comment-thread-renderer').length
    const withText = [...document.querySelectorAll('ytd-comment-thread-renderer')].filter(
      (t) => t.querySelector('#content-text')?.textContent?.trim()
    ).length
    console.log('[dumbify] no comments rendered; threads:', threads, 'with text:', withText)
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
    const r = await postComment(text)
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
  const wait = new MutationObserver(() => {
    if (!findNativeComments()) return
    wait.disconnect()
    watchComments()
  })
  wait.observe(document.body, { childList: true, subtree: true })
}

function resetComments() {
  commentsOpen = false
  commentsSection = null
  commentsBtnEl = null
  commentsObserver?.disconnect()
  commentsObserver = null
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

function buildWatchPage(nav: NavigationState) {
  content!.innerHTML = ''
  resetComments()

  const nowPlaying = document.createElement('p')
  nowPlaying.className = 'df-now-playing'
  nowPlaying.textContent = 'Now playing'
  content!.appendChild(nowPlaying)

  const player = document.createElement('div')
  player.className = 'df-player'
  content!.appendChild(player)

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
        console.warn('[dumbify] player not found after 10s; selectors:', PLAYER_SELECTORS.join(', '))
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
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleFullscreen()
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('click', onFullscreenClick, true)
    document.addEventListener('keydown', onFullscreenKey, true)
  }

  const data = extractWatchData()

  const title = document.createElement('h1')
  title.className = 'df-watch-title'
  title.textContent = data.video.title || 'Untitled'
  content!.appendChild(title)

  const metaBar = document.createElement('div')
  metaBar.className = 'df-watch-meta-bar'

  if (data.video.channel) {
    const channelSpan = document.createElement('span')
    channelSpan.className = 'df-watch-channel'
    channelSpan.textContent = data.video.channel
    metaBar.appendChild(channelSpan)
  }

  if (data.video.views || data.video.published) {
    const metaItem = document.createElement('span')
    metaItem.className = 'df-watch-meta-item'
    const parts: string[] = []
    if (data.video.views) parts.push(data.video.views)
    if (data.video.published) parts.push(data.video.published)
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
  syncLikeState(likeBtn)
  watchLikeState(likeBtn)

  const wlBtn = document.createElement('button')
  wlBtn.className = 'df-watch-action'
  wlBtn.textContent = 'Watch later'
  wlBtn.onclick = () => clickNativeWl(wlBtn)
  actions.appendChild(wlBtn)

  const commentsBtn = document.createElement('button')
  commentsBtn.className = 'df-watch-action'
  commentsBtn.textContent = 'Comments'
  commentsBtnEl = commentsBtn
  commentsBtn.onclick = () => toggleComments()
  actions.appendChild(commentsBtn)
  updateCommentsToggle()

  metaBar.appendChild(actions)

  content!.appendChild(metaBar)

  const description = document.createElement('details')
  description.className = 'df-watch-description'
  const summary = document.createElement('summary')
  summary.textContent = 'Description'
  description.appendChild(summary)
  const text = document.createElement('p')
  text.className = 'df-watch-description-text'
  text.textContent = (data.video.description ?? '').trim() || 'No description'
  description.appendChild(text)
  content!.appendChild(description)

  logLikeDiagnostics()
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
    restorePlayer()
    content!.innerHTML = ''
  },
}
