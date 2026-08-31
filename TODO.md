# YouTube Extension Roadmap

# Open Tasks

Found while testing the extension against real YouTube.

## Subscriptions: sort by creator, group by date

On the subscriptions feed, add sorting by creator, and group videos into date
buckets: Today, Yesterday, Past week, Past month, then by month.

## Watch page: duplicated date in the meta row

The publish date appears twice in the watch page meta row (next to the Like and
Comments buttons). Small display bug.


# Completed Tasks

Move completed tasks here.

Format:

## Task Name

Completed:
- Date:
- Changes:
- Files modified:
- Testing:


## Fix Liked tab, Playlists tab, and playlist sidebar

Completed:
- Date: 2026-08-31
- Changes:
  - Added `'liked'` and `'playlists'` routes to `Route` type in `types.ts`.
  - Updated `PageManager.ts` route detection: `/playlist?list=LL` → `liked`,
    `/feed/playlists` → `playlists`.
  - Updated `content.ts` feature routing and `shell.ts` NAV entries.
  - Added `fetchUserPlaylists()`, `fetchLikedPlaylist()`, `fetchPlaylistPage()` to
    `DataExtractor.ts`.
  - Implemented `doLoad` branches for `liked`, `playlists`, and `playlist` routes in
    `home-feed.ts` with dynamic page head titles.
  - Added playlist sidebar on the watch page: when a video is opened from a playlist,
    a scrollable panel below the player shows all videos in the playlist with the
    current one highlighted. Clicking a video navigates within the playlist and
    reloads the page.
  - Videos on playlist pages now carry the `&list=` parameter so clicking them
    preserves playlist context on the watch page.
  - Added URL watcher that detects YouTube's auto-advance in playlists and reloads the
    page so title, sidebar highlight, and metadata update.
- Files modified: src/types.ts, src/core/PageManager.ts, src/core/DataExtractor.ts,
  src/content.ts, src/features/home-feed.ts, src/features/watch-page.ts,
  src/features/shell.ts, src/styles/main.css
- Testing: `npx tsc --noEmit` and `npm run build` pass. Manually tested in Chrome:
  Liked tab shows liked videos, Playlists tab shows user playlists, clicking a playlist
  opens its video list, clicking a video shows the playlist sidebar on the watch page,
  auto-advance reloads the page correctly.


## Codebase audit: phases 1-3 (correctness, trust, cleanup)

Completed:
- Date: 2026-08-30
- Changes:
  - **Pagination.** `fetchContinuation` ignored its continuation token for every route
    except channel/search and re-fetched page 1 instead. Its videos all deduped away, so
    the page never grew, so the bottom-of-feed check stayed true and fired another
    full-page fetch on every further scroll event. Now routes through the browse
    continuation endpoint; `extractContinuationVideos` reuses `collectItemVideos` so
    sectionList feeds (history, subscriptions) page too, not just lockup grids. Added a
    stop condition: a fetch yielding nothing new ends scroll-loading.
  - **Feature lifecycle.** `home-feed.update()` called `mount()` without `unmount()`,
    leaving every prior page's scroll listener attached and still calling loadMore.
  - **Comment posting.** Dropped the native-composer path, which resolved 'ok' on a 400ms
    timer regardless of outcome (and beat its own API fallback), so "Posted" could appear
    for a comment that never posted. Posting now reports the real API result.
  - **Fullscreen hotkey.** `f` was captured document-wide with no target check, making the
    letter untypeable in the comment and reply composers on the same page.
  - **Observers.** The two fallback MutationObservers watching all of document.body for a
    native element were never disconnected when that element never appeared. Now bounded
    and torn down.
  - **Settings.** 9 of 12 settings had no consumer anywhere, and the font settings wrote
    CSS variables no rule read - the popup and options page drove ~10 controls that did
    nothing. Deleted the dead keys; wired `--df-font-family`/`--df-font-size` into
    `#dumbify-root` so font settings work; rebuilt the popup around the theme toggle;
    rebuilt the options page with `createElement` (six of eight font stacks contain
    double quotes, which broke `value="..."` and persisted truncated stacks).
    `getSettings` now merges over defaults instead of returning stored values as-is.
  - **Blank-page failure.** `main.css` hides `<body>` on inject; nothing un-hid it if the
    content script threw before mounting. `init()` now catches, sets `html.df-failed`, and
    tears down - a failed start degrades to plain YouTube.
  - **Unmapped routes** no longer fall back to the homepage (`ROUTE_URLS[route] || '/'`),
    which is why Liked and /shorts rendered home-feed videos under the wrong header.
  - **Cleanup.** Deleted `DOMEngine.ts` (unreachable), 5 dead exports, `Route.'unknown'`,
    `Video.words`/`progress`, the orphaned `dumbify:installed` write, 33 orphaned CSS rules
    (CSS bundle 25.3 -> 21.0 kB), and Tailwind + autoprefixer + `postcss.config.js`
    (Tailwind emitted zero output - `main.css` never imported it). Fixed
    `tsconfig.node.json`, which had never passed (TS6307 + a nonexistent
    `tailwind.config.js`). Debug logging is now behind `localStorage['dumbify:debug']`.
    All navigation goes through `navigateTo`, which now rejects non-same-origin paths.
- Files modified: src/core/DataExtractor.ts, src/core/PageManager.ts, src/core/UIEngine.ts,
  src/core/FeatureManager.ts, src/core/storage.ts, src/content.ts, src/background.ts,
  src/types.ts, src/features/home-feed.ts, src/features/watch-page.ts, src/features/shell.ts,
  src/options/index.ts, src/popup/index.ts, src/styles/main.css, package.json,
  tsconfig.node.json, README.md, CLAUDE.md, CURRENT_TASK.md
- Files deleted: src/core/DOMEngine.ts, postcss.config.js
- Testing: `npx tsc --noEmit` and `npx tsc -p tsconfig.node.json --noEmit` both pass (the
  second for the first time), `npm run build` passes. NOT yet manually verified in Chrome -
  see the verification checklist in the audit report.

## Comment interactions: like, view replies, reply

Completed:
- Date: 2026-08-04
- Changes: Extended `CommentItem` with the ids/commands needed for interactivity
  (comment id, like/unlike commands, reply params, reply count, replies continuation
  token), resolved from YouTube's comment entity/toolbar mutation payloads. Added
  per-comment Like and Reply buttons, an indented lazy-loaded replies panel with
  "load more" pagination, and an inline reply composer to the watch-page comments
  section. Liking re-derives state from the server's actual response rather than
  only optimistic UI. Replies post via `comment/create_comment_reply` (a distinct
  endpoint/field name from top-level comment posting, confirmed via live inspection
  rather than assumption). Signed-out, reply-disabled, and just-posted-but-not-yet-
  reloaded comments each show a specific inline notice instead of failing silently.
- Files modified: src/core/DataExtractor.ts, src/features/watch-page.ts,
  src/styles/main.css
- Testing: `npx tsc --noEmit` and `npm run build` pass. Manually tested in Chrome on
  real signed-in YouTube: liking a comment (verified state survives reload), viewing
  replies on comments with and without existing replies, replying to a comment
  (verified the reply appears under the correct parent both locally and after
  reload, and merges correctly with already-loaded replies), and the just-posted/
  signed-out notice states.


---

# Planned Improvements

Future ideas:

- Improve UI animations.
- Improve search.
- Add playlists.
- Add user profiles.
- Add recommendations.