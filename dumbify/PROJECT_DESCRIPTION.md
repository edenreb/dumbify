# Dumbify

A Chrome extension that replaces YouTube's cluttered interface with a calm, text-first reading experience. No thumbnails, no autoplay, no distractions — just the content you came for.

## The Problem

YouTube's interface is designed to maximize engagement, not readability. Thumbnails compete for attention, autoplay pulls you into the next video, sidebars push recommendations, and the overall visual noise makes it hard to focus on what you actually want to watch. For users who come to YouTube with intent — to learn, to research, to listen — the default experience gets in the way.

## What Dumbify Does

Dumbify intercepts YouTube pages before they render and replaces the entire UI with a clean, text-based layout. Videos become simple rows of text: title, channel, view count, and date. The native YouTube player is preserved and relocated into Dumbify's minimal frame, so playback works exactly as before — just without the surrounding clutter.

## Core Features

### Text-First Feed

The homepage, history, subscriptions, search results, and channel pages all render as numbered text lists. Each video shows its title, channel name, view count, publish date, and duration — no thumbnails, no algorithmic suggestions fighting for space. Scroll-loading works seamlessly in the background.

### Clean Watch Page

When you open a video, Dumbify moves the native YouTube player into its own minimal layout. Below the player: title, channel link, view count, publish date, and action buttons. The description is a collapsible section. Comments load on demand with full thread support — read, like, reply, and expand comment threads.

### Playlist Support

Opening a video from a playlist shows a scrollable sidebar with all videos in that playlist, the current one highlighted. Auto-advance works with a URL watcher that reloads the page when YouTube changes the video, keeping the sidebar and metadata in sync.

### Subscribe, Like, Save

All core YouTube interactions work through the InnerTube API:

- **Subscribe/Unsubscribe** from channel pages
- **Like** videos from the watch page (syncs with native YouTube state)
- **Save** to any playlist — the save panel fetches your playlists and lets you toggle which ones contain the video, or create a new playlist inline with a name and privacy setting

### Channel Pages

Each channel gets a dedicated view with name, handle, subscriber count, and tabs for Videos, Popular (sorted by views), Playlists, and About. Subscribe/unsubscribe works directly from the header.

### History with Shorts Bundled

Your watch history is grouped by date. YouTube Shorts are bundled into a single collapsible section per day instead of cluttering the feed individually.

### Subscription Filtering

The subscriptions feed supports toolbar filters: All, Today, Yesterday, Past week, Past month, and By creator. The "By creator" view groups videos alphabetically under each channel name.

## Customization

### Settings Page

A full settings page accessible from the sidebar gear icon or the toolbar popup:

- **Theme** — Day (warm paper) or Night (dark ink)
- **Font Size** — 14px to 32px
- **Font Family** — 8 choices including system default, serif, sans-serif, and monospace
- **Font Color** — Separate color pickers for light and dark mode
- **Background Image** — Upload any image to use as a fullscreen background behind the reading view. Processed client-side (resized, format-optimized) and stored as a data URL
- **Overlay Opacity** — Slider from 30% to 100% controlling how much of the background image shows through the content panels
- **Live Preview** — Sample text updates in real time as you adjust settings

### Toolbar Popup

Quick access to the Day/Night toggle, reset button, and link to full settings.

## Design Philosophy

### Paper and Ink

The design system uses warm, reading-oriented colors: a cream paper background (`#f7f5ee`) for light mode and dark charcoal (`#1d1d1d`) for dark mode. Text uses high-contrast ink colors. The aesthetic is closer to a book than an app.

### No Thumbnails, No Autoplay

Dumbify strips away thumbnails from every page. Videos are identified by title and metadata alone. Autoplay is disabled — you choose what to watch next.

### Native Player Preservation

Rather than building a custom video player, Dumbify physically moves the real YouTube player element into its DOM. This means all playback features (quality selection, speed controls, captions, fullscreen) work exactly as they do on YouTube.

### Progressive Data Extraction

Data is extracted from YouTube through multiple fallback strategies:
1. Synchronous extraction from inline `<script>` tags
2. Background script bridge via `chrome.scripting.executeScript`
3. Fetching the page HTML and parsing it
4. Last resort: DOM scraping

This ensures Dumbify works even when YouTube changes its page structure.

### Graceful Degradation

If anything fails during initialization, Dumbify removes itself and lets the real YouTube page through. The `html.df-failed` CSS class restores normal YouTube visibility, so a broken extension never leaves you with a blank page.

## Architecture

```
content.ts          — Entry point, initialization, route-to-feature mapping
├── UIEngine.ts     — Creates the #dumbify-root overlay, applies theme/fonts
├── PageManager.ts  — SPA routing via history hooks and URL parsing
├── DataExtractor.ts — YouTube JSON parsing, InnerTube API calls
├── shell.ts        — Sidebar, navigation, topbar, search, theme toggle
├── home-feed.ts    — All list pages (home, history, subscriptions, search, channel, playlists)
└── watch-page.ts   — Player relocation, like/save/comments, playlist sidebar

background.ts       — Service worker: MAIN world data bridge, options page
popup/index.ts      — Toolbar popup: theme toggle, reset
options/index.ts    — Full settings page
```

## Technical Details

- **Manifest V3** Chrome extension
- **Permissions**: `storage` (settings), `scripting` (background data bridge)
- **No build framework** for the extension logic — plain TypeScript compiled with Vite
- **Custom fonts** bundled as WOFF2 files (IBM Plex Mono, Inter Tight, Newsreader)
- **InnerTube API** used directly for authenticated actions (subscribe, like, comment, playlist management) with SAPISIDHASH authentication
- **Settings** stored in `chrome.storage.local` with merge-over-defaults pattern
- **Unit tests** for data extraction logic and edge cases

## Installation

1. Clone the repository
2. Run `npm install`
3. Run `npm run build`
4. Open `chrome://extensions/`
5. Enable Developer Mode
6. Click "Load unpacked" and select the `dist/` directory

## Privacy

Dumbify runs entirely client-side. No data is sent to any external server. All API calls go directly to YouTube's existing InnerTube endpoints using your authenticated session. The extension reads YouTube's page data to render its interface and nothing more. See [PRIVACY.md](PRIVACY.md) for details.
