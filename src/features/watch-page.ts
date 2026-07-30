import type { NavigationState, WatchData } from '../types'
import type { Feature } from '../core/FeatureManager'
import { content } from '../core/UIEngine'
import { extractWatchData } from '../core/DataExtractor'

const chapters = [
  { at: '00:00', label: 'Introduction' },
  { at: '03:12', label: 'Chapter one' },
  { at: '08:40', label: 'Chapter two' },
  { at: '13:05', label: 'Chapter three' },
  { at: '16:20', label: 'Conclusion' },
]

function buildWatchPage(data: WatchData) {
  content!.innerHTML = ''

  const nowPlaying = document.createElement('p')
  nowPlaying.className = 'df-now-playing'
  nowPlaying.textContent = 'Now playing'
  content!.appendChild(nowPlaying)

  const player = document.createElement('div')
  player.className = 'df-player'
  content!.appendChild(player)

  const screen = document.createElement('div')
  screen.className = 'df-player-screen'
  player.appendChild(screen)

  const playBtn = document.createElement('button')
  playBtn.className = 'df-play-btn'
  playBtn.setAttribute('aria-label', 'Play')

  const circle = document.createElement('span')
  circle.className = 'df-play-circle'

  const icon = document.createElement('span')
  icon.className = 'df-play-icon'
  circle.appendChild(icon)

  const label = document.createElement('span')
  label.className = 'df-play-label'
  label.textContent = 'Tap to play'

  playBtn.appendChild(circle)
  playBtn.appendChild(label)
  screen.appendChild(playBtn)

  let playing = false
  playBtn.onclick = () => {
    playing = !playing
    if (playing) {
      icon.className = 'df-pause-icon'
      icon.innerHTML = '<span></span><span></span>'
      label.textContent = 'Playing · tap to pause'
    } else {
      icon.className = 'df-play-icon'
      icon.innerHTML = ''
      label.textContent = 'Tap to play'
    }
  }

  const controls = document.createElement('div')
  controls.className = 'df-player-controls'

  const currTime = document.createElement('span')
  currTime.className = 'df-time-label'
  currTime.textContent = '00:00'
  controls.appendChild(currTime)

  const track = document.createElement('div')
  track.className = 'df-progress-track'
  const fill = document.createElement('div')
  fill.className = 'df-progress-fill'
  track.appendChild(fill)
  const thumb = document.createElement('div')
  thumb.className = 'df-progress-thumb'
  track.appendChild(thumb)
  controls.appendChild(track)

  const totalTime = document.createElement('span')
  totalTime.className = 'df-time-label'
  totalTime.textContent = data.video.duration || '00:00'
  controls.appendChild(totalTime)

  const speed = document.createElement('span')
  speed.className = 'df-time-label df-speed-label'
  speed.textContent = '1.0×'
  controls.appendChild(speed)

  player.appendChild(controls)

  const title = document.createElement('h1')
  title.className = 'df-watch-title'
  title.textContent = data.video.title || 'Untitled'
  content!.appendChild(title)

  const metaBar = document.createElement('div')
  metaBar.className = 'df-watch-meta-bar'

  const channelLink = document.createElement('a')
  channelLink.className = 'df-watch-channel'
  const channelSpan = document.createElement('span')
  channelSpan.textContent = data.video.channel || 'Unknown'
  channelLink.appendChild(channelSpan)
  metaBar.appendChild(channelLink)

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

  const grid = document.createElement('div')
  grid.className = 'df-watch-grid'

  const mainCol = document.createElement('div')
  mainCol.className = 'df-watch-content'

  if (data.video.description) {
    const descLabel = document.createElement('p')
    descLabel.className = 'df-watch-section-label'
    descLabel.textContent = 'Description'
    mainCol.appendChild(descLabel)

    const desc = document.createElement('p')
    desc.className = 'df-watch-desc'
    desc.textContent = data.video.description
    mainCol.appendChild(desc)
  }

  const chapLabel = document.createElement('p')
  chapLabel.className = 'df-watch-section-label'
  chapLabel.style.marginTop = '48px'
  chapLabel.textContent = 'Chapters'
  mainCol.appendChild(chapLabel)

  const chapList = document.createElement('div')
  chapList.className = 'df-chapter-list'
  chapters.forEach((c) => {
    const btn = document.createElement('button')
    btn.className = 'df-chapter-item'
    const time = document.createElement('span')
    time.className = 'df-chapter-time'
    time.textContent = c.at
    btn.appendChild(time)
    const lab = document.createElement('span')
    lab.className = 'df-chapter-label'
    lab.textContent = c.label
    btn.appendChild(lab)
    chapList.appendChild(btn)
  })
  mainCol.appendChild(chapList)

  grid.appendChild(mainCol)

  const aside = document.createElement('aside')
  aside.className = 'df-upnext'

  const upnextLabel = document.createElement('p')
  upnextLabel.className = 'df-upnext-label'
  upnextLabel.textContent = 'Up next'
  aside.appendChild(upnextLabel)

  const upnextList = document.createElement('ul')
  upnextList.className = 'df-upnext-list'

  const upnextDefault = [
    { title: 'A history of the page number', duration: '16:02' },
    { title: 'Everything I know about focus, in one sitting', duration: '44:31' },
    { title: 'The economics of doing less', duration: '29:18' },
  ]

  upnextDefault.forEach((v) => {
    const li = document.createElement('li')
    const a = document.createElement('span')
    a.className = 'df-upnext-item'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'df-upnext-title'
    titleSpan.textContent = v.title
    a.appendChild(titleSpan)
    const durSpan = document.createElement('span')
    durSpan.className = 'df-upnext-duration'
    durSpan.textContent = v.duration
    a.appendChild(durSpan)
    li.appendChild(a)
    upnextList.appendChild(li)
  })

  aside.appendChild(upnextList)

  const autoplayOff = document.createElement('p')
  autoplayOff.className = 'df-autoplay-off'
  autoplayOff.textContent = 'Autoplay off, permanently.'
  aside.appendChild(autoplayOff)

  grid.appendChild(aside)
  content!.appendChild(grid)
}

export const watchPageFeature: Feature = {
  id: 'watch-page',

  mount(nav: NavigationState) {
    const data = extractWatchData()
    buildWatchPage(data)
  },

  unmount() {
    content!.innerHTML = ''
  },
}
