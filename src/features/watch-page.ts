import type { NavigationState } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content } from '../core/UIEngine'
import { extractWatchData } from '../core/DataExtractor'

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

function movePlayerInto(target: HTMLElement) {
  if (movedPlayer) {
    if (movedPlayer.parentElement !== target) target.appendChild(movedPlayer)
    fitPlayer()
    bindAspectSync()
    return
  }
  const el = findPlayer()
  if (!el) return
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
}

function restorePlayer() {
  playerWatcher?.disconnect()
  playerWatcher = null
  if (playerTimeout !== null) {
    window.clearTimeout(playerTimeout)
    playerTimeout = null
  }
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

function buildWatchPage(nav: NavigationState) {
  content!.innerHTML = ''

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
  ;['Like', 'Watch later', 'Transcript'].forEach((a) => {
    const btn = document.createElement('button')
    btn.className = 'df-watch-action'
    btn.textContent = a
    actions.appendChild(btn)
  })
  metaBar.appendChild(actions)

  content!.appendChild(metaBar)
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
    restorePlayer()
    content!.innerHTML = ''
  },
}
