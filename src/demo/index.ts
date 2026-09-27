// The website's live demo: the settings page's preview, framed by the landing page and
// answering clicks the way the reading view does. It owns the demo's settings, so a click
// inside the frame and a control outside it never disagree.
//
//   page -> demo  { type: 'dumbify:demo-set', look | theme | dark | layout | page }
//                 (with none of them, it just asks for the state)
//   demo -> page  { type: 'dumbify:demo', look, theme, dark, layout, page, themes }
//
// The starting look comes from the hash (#look=paper&mode=dark), so the first frame is
// already the right one.

import '../preview/index.ts'
import { normalizeSettings, type DumbifySettings, type FeedLayout } from '../core/settings.ts'
import { LOOKS, getLook, lookPatch, matchesLook } from '../core/looks.ts'
import { THEMES } from '../core/themes.ts'
import { isModKey } from '../ui/routes.ts'

interface Command {
  type?: string
  look?: string
  theme?: string
  dark?: boolean
  layout?: string
  page?: string
}

const LAYOUTS: readonly string[] = ['list', 'cards', 'table']
const framed = parent !== window
const hash = new URLSearchParams(location.hash.slice(1))

let settings: DumbifySettings = normalizeSettings(null)
let page: 'feed' | 'watch' = 'feed'
let video = 0

const start = getLook(hash.get('look') ?? '')
if (start) settings = normalizeSettings({ ...settings, ...lookPatch(start, settings) })
if (hash.get('mode') === 'dark' || hash.get('mode') === 'light') settings.mode = hash.get('mode') as 'dark' | 'light'

function update(patch: Partial<DumbifySettings> = {}) {
  settings = normalizeSettings({ ...settings, ...patch })
  window.postMessage({ type: 'dumbify:preview', settings, page, video, systemDark: false }, location.origin)
}

// Sent once the preview has drawn (see the listener below), so the page can reveal the
// frame without a flash of the stored-settings default. The theme list rides along every
// time: the page may have missed the first message, if it loaded after the demo did.
function tellPage() {
  if (!framed) return
  parent.postMessage({
    type: 'dumbify:demo',
    look: LOOKS.find((l) => matchesLook(settings, l))?.id ?? '',
    theme: settings.mode === 'dark' ? settings.darkTheme : settings.lightTheme,
    dark: settings.mode === 'dark',
    layout: settings.layout,
    page,
    themes: THEMES.map(({ id, name, scheme, bg, accent }) => ({ id, name, scheme, bg, accent })),
  }, location.origin)
}

// Registered after the preview's own listener, so this runs once it has rendered.
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  const c = e.data as Command
  if (e.source === window && c?.type === 'dumbify:preview') return tellPage()
  if (!framed || e.source !== parent || c?.type !== 'dumbify:demo-set') return
  const look = getLook(c.look ?? '')
  const theme = THEMES.find((t) => t.id === c.theme)
  if (look) update(lookPatch(look, settings))
  else if (theme) update(theme.scheme === 'dark' ? { mode: 'dark', darkTheme: theme.id } : { mode: 'light', lightTheme: theme.id })
  else if (typeof c.dark === 'boolean') update({ mode: c.dark ? 'dark' : 'light' })
  else if (c.layout && LAYOUTS.includes(c.layout)) {
    page = 'feed'
    update({ layout: c.layout as FeedLayout })
  } else if (c.page === 'feed' || c.page === 'watch') {
    page = c.page
    update()
  } else {
    tellPage()
  }
})

const root = document.getElementById('dumbify-root') as HTMLElement
const setDrawer = (open: boolean) => root.classList.toggle('df-drawer-open', open)
const narrow = () => window.innerWidth <= 860
const toggleDark = () => update({ mode: settings.mode === 'dark' ? 'light' : 'dark' })
const focusSearch = () => document.querySelector<HTMLInputElement>('.df-search-input')?.focus()

// As in the reading view: a wide window flips between the sidebar and hidden, a narrow
// one - which only has the drawer - opens and closes that.
function toggleSidebar() {
  if (narrow()) return setDrawer(!root.classList.contains('df-drawer-open'))
  setDrawer(false)
  update({ sidebar: settings.sidebar === 'hidden' ? 'expanded' : 'hidden' })
}

// The preview has no scrim, and the drawer needs one to close on a click beside it.
document.querySelector('.df-layout')?.append(Object.assign(document.createElement('div'), { className: 'df-scrim' }))

// The preview cancels every click; these are the ones the demo answers.
document.addEventListener('click', (e) => {
  const t = e.target as Element
  const row = t.closest('.df-item-row')
  if (row?.parentElement) {
    video = [...row.parentElement.children].indexOf(row)
    page = 'watch'
    setDrawer(false)
    update()
  } else if (t.closest('.df-brand, .df-nav-link[title="Home"]')) {
    page = 'feed'
    setDrawer(false)
    update()
  } else if (t.closest('.df-dark-switch')) {
    toggleDark()
  } else if (t.closest('.df-sidebar-toggle')) {
    toggleSidebar()
  } else if (t.closest('.df-drawer-btn')) {
    setDrawer(!root.classList.contains('df-drawer-open'))
  } else if (t.closest('.df-scrim')) {
    setDrawer(false)
  } else if (t.closest('.df-nav-link')?.querySelector('.df-kbd')) {
    setDrawer(false)
    focusSearch()
  } else {
    const details = t.closest('summary')?.parentElement
    if (details instanceof HTMLDetailsElement) details.open = !details.open
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return setDrawer(false)
  if (!isModKey(e) || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'k' && !e.shiftKey) focusSearch()
  else if (e.key === '\\' || e.code === 'Backslash') toggleSidebar()
  else if (key === 'l' && e.shiftKey) toggleDark()
  else return
  e.preventDefault()
})

// The preview is a picture of the reading view; the demo can be clicked.
const style = document.createElement('style')
style.textContent = `
  #dumbify-root .df-item-row, #dumbify-root .df-brand, #dumbify-root .df-nav-link,
  #dumbify-root .df-icon-btn, #dumbify-root summary, #dumbify-root .df-scrim { cursor: pointer !important; }
  #dumbify-root .df-search-input { cursor: text !important; }
`
document.head.appendChild(style)

update()
