export interface Video {
  id: string
  title: string
  channel: string
  channelId: string
  url: string
  views: string
  published: string
  duration: string
  verified: boolean
  live: boolean
  description?: string
  words?: string
  meta?: string
  progress?: string
}

export interface WatchData {
  video: Video
  playerReady: boolean
}

export interface DumbifySettings {
  hideThumbnails: boolean
  hideComments: boolean
  hideRecommendations: boolean
  hideShorts: boolean
  hideNotifications: boolean
  centerLayout: boolean
  compactMode: boolean
  readingModeDefault: boolean
  autoFocusMode: boolean
  fontSize: number
  fontFamily: string
  theme: 'light' | 'dark'
}

export type Route =
  | 'home'
  | 'watch'
  | 'search'
  | 'subscriptions'
  | 'history'
  | 'watch-later'
  | 'playlist'
  | 'channel'
  | 'shorts'
  | 'unknown'

export interface NavigationState {
  route: Route
  href: string
  pathname: string
  searchParams: URLSearchParams
  videoId: string | null
  searchQuery: string | null
  channelId: string | null
  playlistId: string | null
}
