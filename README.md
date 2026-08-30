# Dumbify

[![Manifest V3](https://img.shields.io/badge/manifest-v3-blue)](src/manifest.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue)](LICENSE)

**A calm, text-first YouTube.**

Dumbify is a Chrome extension that reads YouTube's real data and renders it as a plain, readable list — no thumbnails, no autoplay, no recommendation rabbit holes. It sits on top of `youtube.com`, not a separate site: you stay signed in, subscriptions/history/comments all still work, you just stop getting yelled at by the UI.

<!--
  Add a screenshot here once available, e.g.:
  ![Dumbify home feed](docs/screenshots/home-feed.png)
-->

## Why

YouTube's UI is built to maximize watch time, not help you find or finish a video. Dumbify strips it back to what a feed actually is: a list of titles, channels, and durations you can scan and pick from.

## Features

- **Text-first feed** — titles, channel, views, and upload date, no thumbnails, across home, search, channel pages, history, subscriptions, and watch later
- **Distraction-free watch page** — title, description, and comments; no autoplay, no end-screen suggestions, no sidebar of "up next"
- **Focus mode** — press `F` for a full-screen, chrome-free player
- **Real interactions, not a read-only mirror** — subscribe/unsubscribe, like comments, reply to comments, view replies, all backed by YouTube's actual API using your signed-in session
- **Typography controls** — 8 font sizes, 8 font families (serif, sans, mono), light/dark theme
- **Keyboard-driven** — `Cmd/Ctrl+K` to search, `F` for focus mode
- **Infinite scroll** — loads more of the real feed as you go

## How it works

Dumbify doesn't scrape the rendered page or replace YouTube's backend. On page load it reads the same `ytInitialData` / `ytInitialPlayerResponse` JSON YouTube itself uses to render, and the same InnerTube API YouTube's own frontend calls for pagination, subscribing, and posting comments. Everything you can do in Dumbify hits YouTube's real endpoints with your real session — there's no shadow account, no separate write path, and no data leaves your browser.

## Install

1. Clone the repo
2. `npm install`
3. `npm run build`
4. Open `chrome://extensions`, enable **Developer Mode**, click **Load unpacked**, and select the `dist/` folder

## Development

```bash
npm run dev      # vite dev, watch mode with HMR
npm run build    # production build to dist/ (reload the unpacked extension after)
npm run preview  # vite preview
```

```bash
npx tsc --noEmit                        # typecheck
npx tsc -p tsconfig.node.json --noEmit  # typecheck vite.config.ts + manifest.ts, if changed
```

After any change: `npm run build`, then reload the extension from `chrome://extensions` and check the console for `[Dumbify]`-prefixed errors.

## Tech stack

TypeScript + Vite (via [`@crxjs/vite-plugin`](https://crxjs.dev/vite-plugin)), Manifest V3, hand-written CSS. No UI framework, no runtime dependencies — plain DOM.

## Project structure

```
src/
  content.ts        content script entry — routes pages to features
  background.ts     service worker — page-context data bridging
  core/              DataExtractor, FeatureManager, PageManager, UIEngine, storage
  features/
    shell.ts         top bar, search, sidebar (always active)
    home-feed.ts      home / search / channel / history / subscriptions / watch later / playlists
    watch-page.ts     video player, info, comments
  options/, popup/    settings UI
```

See `CLAUDE.md` for the full architecture and data-extraction notes.

## License

GPL-3.0 — see [LICENSE](LICENSE).
