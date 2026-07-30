import type { NavigationState, WatchData } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content } from '../core/UIEngine'
import { extractWatchData } from '../core/DataExtractor'
import { DOMEngine } from '../core/DOMEngine'

let domEngine: DOMEngine | null = null

function buildWatchPage(data: WatchData) {
  content.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.className = 'df-watch'

  const title = document.createElement('h1')
  title.className = 'df-watch-title'
  title.textContent = data.video.title || 'Untitled'
  wrapper.appendChild(title)

  const meta = document.createElement('div')
  meta.className = 'df-watch-meta'
  if (data.video.channel) {
    const ch = document.createElement('span')
    ch.className = 'df-watch-channel'
    ch.textContent = data.video.channel
    meta.appendChild(ch)
  }
  if (data.video.views) {
    const v = document.createElement('span')
    v.textContent = `${data.video.views} views`
    meta.appendChild(v)
  }
  if (data.video.published) {
    const d = document.createElement('span')
    d.textContent = data.video.published
    meta.appendChild(d)
  }
  wrapper.appendChild(meta)

  const playerBox = document.createElement('div')
  playerBox.className = 'df-player-box'
  wrapper.appendChild(playerBox)

  const controls = document.createElement('div')
  controls.className = 'df-watch-controls'

  const focusBtn = document.createElement('button')
  focusBtn.className = 'df-btn'
  focusBtn.textContent = 'Focus (F)'
  controls.appendChild(focusBtn)

  const readingBtn = document.createElement('button')
  readingBtn.className = 'df-btn'
  readingBtn.textContent = 'Reading (R)'
  controls.appendChild(readingBtn)

  wrapper.appendChild(controls)

  function toggleSection(label: string, buildContent: () => HTMLElement) {
    const btn = document.createElement('button')
    btn.className = 'df-section-toggle'
    btn.innerHTML = `<span>${label}</span><span class="df-arrow">▶</span>`

    let panel: HTMLElement | null = null
    let open = false

    btn.onclick = () => {
      open = !open
      if (open) {
        btn.querySelector('.df-arrow')!.textContent = '▼'
        panel = buildContent()
        panel.className = 'df-section-panel'
        btn.after(panel)
      } else {
        btn.querySelector('.df-arrow')!.textContent = '▶'
        panel?.remove()
        panel = null
      }
    }

    wrapper.appendChild(btn)
  }

  if (data.video.description) {
    toggleSection('Description', () => {
      const p = document.createElement('div')
      p.className = 'df-description'
      p.textContent = data.video.description
      return p
    })
  }

  toggleSection('Comments', () => {
    const p = document.createElement('div')
    p.className = 'df-empty-small'
    p.textContent = 'Comments hidden by Dumbify'
    return p
  })

  content.appendChild(wrapper)

  domEngine = new DOMEngine()
  domEngine.start()

  const movePlayerInto = (box: HTMLElement) => {
    domEngine.waitForElement('#movie_player, #player-container, #player', 8000).then((el) => {
      if (!el || box.contains(el)) return
      const video = el.querySelector('video')
      if (video) {
        video.style.width = '100%'
        video.style.height = '100%'
      }
      el.setAttribute('style', 'position:absolute !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important;max-width:100% !important;max-height:100% !important')
      box.appendChild(el)
    })
  }

  movePlayerInto(playerBox)

  focusBtn.onclick = () => {
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'f' || e.key === 'Escape') {
        document.removeEventListener('keydown', onKey)
        wrapper.style.display = ''
        playerBox.style.position = ''
        playerBox.style.inset = ''
        playerBox.style.zIndex = ''
      }
    })
    wrapper.style.display = 'none'
    playerBox.style.position = 'fixed'
    playerBox.style.inset = '0'
    playerBox.style.zIndex = '999999'
    playerBox.style.background = '#000'
  }
}

export const watchPageFeature: Feature = {
  id: 'watch-page',

  mount(nav: NavigationState) {
    const data = extractWatchData()
    buildWatchPage(data)
  },

  unmount() {
    domEngine?.destroy()
    domEngine = null
    content.innerHTML = ''
  },
}
