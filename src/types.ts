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
}

export interface Channel {
  id: string
  name: string
  handle: string
  subscribers: string
  videoCount: string
  description: string
  verified: boolean
  joinedAt?: string
  subscribed?: boolean
  subParams?: string
  unsubParams?: string
}

export interface WatchData {
  video: Video
  playerReady: boolean
}

export interface DumbifySettings {
  fontSize: number
  fontFamily: string
  fontColor: string
  fontColorDark: string
  theme: 'light' | 'dark'
}

export type Route =
  | 'home'
  | 'watch'
  | 'search'
  | 'subscriptions'
  | 'history'
  | 'watch-later'
  | 'liked'
  | 'playlists'
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
