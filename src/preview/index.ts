// The settings page's live preview: a stand-in reading view built from the same class
// names the real one uses, dressed by the same stylesheet and the same appearance code.
// Nothing here fetches anything - the videos are made up.

import '../styles/main.css'
import '../styles/fonts.css'
import { applyAppearance, computeAppearance, prefersReducedMotion } from '../core/appearance'
import { getSettings, getWallpaper } from '../core/storage'
import { normalizeSettings, type DumbifySettings } from '../core/settings'
import { WallpaperLayer } from '../ui/wallpaper-layer'
import { h, avatar, switchButton } from '../ui/dom'
import { UI_LOCALE, shortcutLabel } from '../ui/routes'
import { brandMark, icon, type IconName } from '../ui/icons'

interface Sample {
  title: string
  channel: string
  views: string
  date: string
  duration: string
  live?: boolean
}

const VIDEOS: Sample[] = [
  { title: 'The quiet genius of Japanese joinery', channel: 'Workshop Notes', views: '1.2M views', date: '3 days ago', duration: '18:42' },
  { title: 'Why cities are rediscovering the tram', channel: 'City Lines', views: '845K views', date: '1 week ago', duration: '24:10' },
  { title: 'Northern lights over Tromsø', channel: 'Arctic Cam', views: '12K watching', date: '', duration: '', live: true },
  { title: 'A slow tour of the Milky Way, in true scale', channel: 'Deep Field', views: '3.4M views', date: '2 weeks ago', duration: '41:07' },
  { title: 'How sourdough actually works', channel: 'The Kitchen Lab', views: '512K views', date: '5 days ago', duration: '15:36' },
  { title: 'Learning the cello at 40: one year in', channel: 'Late Bloomer', views: '96K views', date: '1 month ago', duration: '12:58' },
  { title: 'The mathematics of paper folding', channel: 'Proof by Example', views: '2.1M views', date: '3 months ago', duration: '19:21' },
  { title: 'Restoring a 1960s typewriter, start to finish', channel: 'Workshop Notes', views: '430K views', date: '2 months ago', duration: '32:05' },
  { title: 'What the tide tables don’t tell you', channel: 'Coastline', views: '77K views', date: '4 days ago', duration: '9:44' },
]

const COMMENTS = [
  { author: 'Mara Lindqvist', time: '2 days ago', text: 'The bit about the kanawa tsugi joint finally made it click for me. Beautifully explained.', likes: '214' },
  { author: 'tomás', time: '1 day ago', text: 'No music, no jump cuts, just the work. More of this please.', likes: '98' },
  { author: 'Priya K', time: '5 hours ago', text: 'Watched this twice. Going to try the simple lap joint this weekend.', likes: '12' },
]

const noop = (e: Event) => e.preventDefault()

function navLink(iconName: IconName, label: string, active = false): HTMLElement {
  return h('a', { class: active ? 'df-nav-link df-active' : 'df-nav-link', href: '#', title: label },
    icon(iconName), h('span', { class: 'df-nav-label', text: label }))
}

function sidebar(): HTMLElement {
  const dark = switchButton('Dark mode', false, () => {}, 'df-nav-link')
  dark.prepend(icon('moon'), h('span', { class: 'df-nav-label', text: 'Dark mode' }))
  dark.classList.add('df-dark-switch')
  return h('aside', { class: 'df-sidebar' },
    h('div', { class: 'df-sidebar-head' },
      h('a', { class: 'df-brand', href: '#' }, brandMark(), h('span', { class: 'df-brand-name', text: 'dumbify' })),
      h('button', { class: 'df-icon-btn df-sidebar-toggle', type: 'button' }, icon('collapse')),
    ),
    h('nav', { class: 'df-nav' },
      h('button', { class: 'df-nav-link', type: 'button' }, icon('search'), h('span', { class: 'df-nav-label', text: 'Search' }), h('span', { class: 'df-kbd', text: shortcutLabel('K') })),
      navLink('home', 'Home', true),
      navLink('subscriptions', 'Subscriptions'),
    ),
    h('nav', { class: 'df-nav' },
      h('div', { class: 'df-nav-heading', text: 'Library' }),
      navLink('history', 'History'),
      navLink('clock', 'Watch later'),
      navLink('thumb', 'Liked videos'),
      navLink('playlists', 'Playlists'),
    ),
    h('div', { class: 'df-sidebar-foot' },
      dark,
      h('button', { class: 'df-nav-link', type: 'button' }, icon('sliders'), h('span', { class: 'df-nav-label', text: 'Settings' })),
      h('p', { class: 'df-tagline', text: 'No thumbnails. No distractions.' }),
    ),
  )
}

function topbar(page: 'feed' | 'watch'): HTMLElement {
  return h('header', { class: 'df-topbar' },
    h('button', { class: 'df-icon-btn df-drawer-btn', type: 'button' }, icon('menu')),
    h('div', { class: 'df-crumbs' }, icon(page === 'watch' ? 'play' : 'home'),
      h('span', { class: 'df-crumbs-label', text: page === 'watch' ? VIDEOS[0].title : 'Home' })),
    h('form', { class: 'df-search' }, icon('search'),
      h('input', { class: 'df-search-input', type: 'search', placeholder: 'Search YouTube', tabindex: '-1' }),
      h('span', { class: 'df-kbd', text: shortcutLabel('K') })),
    h('div', { class: 'df-popover-anchor' }, h('button', { class: 'df-icon-btn', type: 'button' }, icon('more'))),
  )
}

function row(v: Sample): HTMLElement {
  const title = h('span', { class: 'df-item-title', text: v.title })
  return h('a', { class: 'df-item-row', href: '#' },
    h('span', { class: 'df-item-number' }),
    h('span', { class: 'df-item-body' }, title,
      h('span', { class: 'df-item-meta' },
        h('span', { class: 'df-item-channel df-item-channel-link', text: v.channel }),
        h('span', { class: 'df-item-views', text: v.views }),
        v.date ? h('span', { class: 'df-item-date', text: v.date }) : null)),
    v.live
      ? h('span', { class: 'df-item-duration df-item-live', text: 'Live' })
      : h('span', { class: 'df-item-duration', text: v.duration }),
  )
}

function feedPage(): HTMLElement[] {
  const hour = new Date().getHours()
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'
  const date = new Date().toLocaleDateString(UI_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })
  return [
    h('header', { class: 'df-page-head' }, h('div', { class: 'df-page-head-body' },
      h('div', { class: 'df-page-icon' }, icon('home')),
      h('h1', { class: 'df-page-title', text: greeting }),
      h('p', { class: 'df-page-sub', text: `${date} · Recommended for you` }))),
    h('div', { class: 'df-table-head' }, h('span'), h('span', { text: 'Title' }), h('span', { text: 'Channel' }),
      h('span', { text: 'Views' }), h('span', { text: 'Published' }), h('span', { text: 'Length' })),
    h('div', { class: 'df-item-list' }, ...VIDEOS.map(row)),
  ]
}

function watchPage(): HTMLElement[] {
  const v = VIDEOS[0]
  const player = h('div', { class: 'df-player' }, h('div', { class: 'df-player-screen' },
    h('div', { class: 'df-preview-player' }, h('span', { class: 'df-preview-play' }, icon('play')))))
  const comments = h('section', { class: 'df-comments' },
    h('h2', { class: 'df-comments-title', text: 'Comments · 1.2K' }),
    h('div', { class: 'df-comment-composer' },
      h('textarea', { class: 'df-comment-input', rows: '1', placeholder: 'Add a comment…', tabindex: '-1' }),
      h('button', { class: 'df-btn df-btn-primary', type: 'button', text: 'Post' })),
    h('div', { class: 'df-comment-list' }, ...COMMENTS.map((c) => h('article', { class: 'df-comment' },
      avatar(c.author),
      h('div', null,
        h('p', { class: 'df-comment-meta' }, h('span', { class: 'df-comment-author', text: c.author }), h('span', { class: 'df-comment-time', text: c.time })),
        h('p', { class: 'df-comment-text', text: c.text }),
        h('div', { class: 'df-comment-actions' },
          h('button', { class: 'df-comment-action', type: 'button' }, icon('thumb'), c.likes),
          h('button', { class: 'df-comment-action', type: 'button' }, icon('comment'), 'Reply')))))),
  )
  return [h('div', { class: 'df-watch-layout' },
    h('div', { class: 'df-watch-main' }, player,
      h('div', { class: 'df-watch-info' },
        h('h1', { class: 'df-watch-title', text: v.title }),
        h('div', { class: 'df-watch-meta-bar' },
          h('a', { class: 'df-watch-channel df-watch-channel--link', href: '#' }, avatar(v.channel), h('span', { class: 'df-watch-channel-name', text: v.channel })),
          h('span', { class: 'df-watch-meta-item', text: '1,204,331 views · Sep 21, 2026' }),
          h('div', { class: 'df-watch-actions' },
            h('button', { class: 'df-btn df-on', type: 'button' }, icon('thumb'), 'Liked'),
            h('button', { class: 'df-btn', type: 'button' }, icon('bookmark'), 'Save'),
            h('button', { class: 'df-btn df-on', type: 'button' }, icon('comment'), 'Comments · 1.2K'))),
        h('details', { class: 'df-watch-description' },
          h('summary', null, icon('chevron'), 'Description', h('span', { class: 'df-summary-hint', text: '— Six joints, no nails, no glue.' })),
          h('p', { class: 'df-watch-description-text', text: 'Six joints, no nails, no glue.' })))),
    h('aside', { class: 'df-watch-side' }, comments),
  )]
}

const root = h('div', { id: 'dumbify-root' })
const backdrop = h('div', { class: 'df-backdrop' }, h('div', { class: 'df-wall-fade' }))
const cover = h('div', { class: 'df-cover' })
const content = h('div', { id: 'dumbify-content' })
const sheet = h('div', { class: 'df-sheet' })
root.append(backdrop, h('div', { class: 'df-layout' }, sidebar(), h('main', { class: 'df-main' }, sheet)))
document.body.appendChild(root)

// A stand-in for the real player: the preview has no video to move in.
const style = document.createElement('style')
style.textContent = `
  .df-preview-player { display: grid; place-items: center; aspect-ratio: 16 / 9;
    background: radial-gradient(circle at 30% 30%, #3b3f4a, #0e0f12 70%); }
  .df-preview-play { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%;
    background: rgba(255,255,255,0.14); color: #fff; }
  .df-preview-play .df-icon { width: 28px; height: 28px; margin-left: 4px; fill: currentColor; }
  #dumbify-root, #dumbify-root * { cursor: default !important; }
`
document.head.appendChild(style)

const wallpaper = new WallpaperLayer({ window: backdrop, cover }, getWallpaper)
let page: 'feed' | 'watch' | null = null

function render(s: DumbifySettings, nextPage: 'feed' | 'watch', systemDark: boolean) {
  const a = computeAppearance(s, systemDark)
  applyAppearance(root, a)
  root.dataset.route = nextPage === 'watch' ? 'watch' : 'home'
  document.documentElement.style.setProperty('--df-paint', a.paint)
  root.querySelectorAll('.df-dark-switch').forEach((b) => b.setAttribute('aria-checked', String(a.scheme === 'dark')))
  if (nextPage !== page) {
    page = nextPage
    content.replaceChildren(...(page === 'watch' ? watchPage() : feedPage()))
    sheet.replaceChildren(topbar(page), cover, content)
  }
  void wallpaper.sync(s, a.wallpaper, !s.wallpaperAnimate || prefersReducedMotion())
}

root.addEventListener('click', noop, true)
root.addEventListener('submit', noop, true)

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const data = e.data as { type?: string; settings?: unknown; page?: string; systemDark?: boolean }
  if (data?.type !== 'dumbify:preview') return
  render(normalizeSettings(data.settings), data.page === 'watch' ? 'watch' : 'feed', !!data.systemDark)
})

// Until the settings page says otherwise, show what is stored.
getSettings().then((s) => {
  if (page === null) render(s, 'feed', window.matchMedia('(prefers-color-scheme: dark)').matches)
})
