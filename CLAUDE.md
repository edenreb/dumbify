# CLAUDE.md

This file provides technical guidance for working in this repository. Read this first, then AGENTS.MD for the workflow rules.

## Project Overview

"Dumbify" is a Chrome MV3 extension (Manifest V3) that renders a simplified, text-first view on top of youtube.com. It does not replace the page — it reads the real YouTube DOM/ytcfg data and injects its own UI into the page.

- Built with TypeScript + Vite via `@crxjs/vite-plugin`.
- No runtime framework (no React/Vue) — plain DOM manipulation.
- Styling via Tailwind CSS 4 (PostCSS) plus a custom stylesheet in `src/styles/main.css`.

## Commands

```bash
npm run build    # builds extension output to dist/ (required after any change)
npm run dev      # vite dev (not commonly used)
npm run preview  # vite preview
```

Typecheck: `npx tsc --noEmit` (also run `npx tsc -p tsconfig.node.json --noEmit` if vite.config.ts changes).

## Architecture

Entry points (manifest defined in `src/manifest.ts`):

- `src/content.ts` — content script entry. Registers features, maps routes to feature IDs, syncs features on navigation.
- `src/background.ts` — service worker. Handles `GET_YT_YT_DATA` (reads globals from page via MAIN-world script injection) and `GET_YT_CFG` (returns ytcfg).
- `src/core/` — shared infrastructure:
  - `DataExtractor.ts` — the heart of the extension. Extracts data from YouTube's page HTML/ytcfg, and makes InnerTube API calls (`callInnerTube`). All extraction logic lives here.
  - `DOMEngine.ts` — MutationObserver wrapper + cleanup helper.
  - `FeatureManager.ts` — feature registry: `registerFeature`, `activateFeatures` (mount/update/unmount).
  - `PageManager.ts` — navigation state; `navigateTo(path)` performs real full-page navigation via `window.location.href`.
  - `UIEngine.ts` — mounts the extension's root UI.
  - `storage.ts` — chrome.storage.local helpers.
- `src/features/` — page features:
  - `shell.ts` — global chrome: top bar, search bar, sidebar (this is the home-feed feature's sibling; always active).
  - `home-feed.ts` — home, search results, channel pages, history, subscriptions, watch-later, playlist rendering.
  - `watch-page.ts` — video page: player overlay, video info, comment section.
- `src/types.ts` — shared interfaces (`Video`, `Channel`, `WatchData`, `NavigationState`, etc.).
- `src/options/`, `src/popup/` — extension settings pages.

Route → feature mapping is in `content.ts` `getFeatureIdsForRoute` (shell + home-feed covers most routes; watch gets watch-page).

## Key Technical Details

### Data extraction pattern
YouTube page HTML contains `ytInitialData` / `ytInitialPlayerResponse` JSON globals inside inline `<script>` tags. `DataExtractor.ts` parses these with `tryFindInText` / `parseJSONBlock` / `extractFromScripts`, then walks the nested renderer objects (e.g. `videoRenderer`, `channelRenderer`, `lockupViewModel`, `subscribeButtonViewModel`). The parser is a hand-rolled brace-matcher — be careful when changing it.

### InnerTube API calls
`callInnerTube(endpoint, body)` POSTs to `https://www.youtube.com/youtubei/v1/{endpoint}?key={INNERTUBE_API_KEY}` using `ytcfg` (from `tryFindYTCfg`) for the key/context/client headers, with `credentials: 'include'`. When signed in, it adds an `Authorization: SAPISIDHASH <ts>_<sha1>` header computed from the SAPISID cookie (`sapisidAuthHeader`). This auth header is what makes write operations (commenting, subscribing) work. It logs non-2xx responses (including body) via the `log()` helper.

### Subscribe/unsubscribe (current work)
- `extractSubscriptionInfo(data, channelId)` — collects subscribe button nodes (`subscribeButtonRenderer`, `subscribeButtonViewModel`, `buttonViewModel`), prefers the one matching the channel, reads real state from `subscribeButtonContent.subscribeState.subscribed` (the `unsubscribeButtonContent` variant is ALWAYS true — do not read it) and the `params` from `onTapCommand.innertubeCommand.subscribeEndpoint`/`unsubscribeEndpoint`.
- `setChannelSubscription(channelId, subscribe, params)` — POSTs `{ channelIds: [channelId], params }` to `subscription/subscribe` or `subscription/unsubscribe`.
- Channel `Channel` type carries `subscribed?`, `subParams?`, `unsubParams?`.

### Comments
`postCommentAPI(videoId, text, params)` posts via `comment/create_comment` with the SAPISID auth. Requires `params` extracted from the page (logged in state). Native-comment fallback path polls for newly added comments in the DOM.

### Rendering convention
Features build DOM with `document.createElement` and inject into `#df-*` containers managed by the shell. All custom classes are prefixed `df-`. The shell must be mounted before other features render.

### Navigation
Almost everything navigates via full page loads (`window.location.href = ...`) rather than SPA-style state swaps; `navigateTo` in PageManager follows the same pattern. Content script re-initializes on each page load.

## Conventions / Gotchas

- Never add any Claude markings when pushing/committing using Git.
- Never add any Claude references anywhere in code or via Git.
- Always run `npm run build` after changes — the extension loads from `dist/`.
- Manual testing: `chrome://extensions` → Developer Mode → Load unpacked → select `dist`. Verify no console errors (`[Dumbify]` prefixed logs are from this extension), no broken UI.
- `log()` in DataExtractor pushes to `diag` array and console — used heavily for debugging extraction issues.
- Extension stores no secrets; auth header is derived from the user's session cookie at request time.
- ytcfg may not exist on some pages (e.g., certain error pages) — `callInnerTube` falls back to a minimal context and returns `null` without an API key.
- YouTube's DOM structure changes frequently; extraction logic is inherently fragile. When adding extraction, prefer `ytInitialData` / `ytInitialPlayerResponse` globals over DOM scraping, and log the relevant subtree (`log(JSON.stringify(...).slice(0, N))`) before writing the parser.
- Do not commit changes without first explaining: what changed, where (files), and why.
