# Current Tasks

One active task. Work it to completion, then move it into the Completed Tasks section of
TODO.md per AGENTS.MD.

(Tasks 1-3 - watch-page channel link, unused sidebar tabs, home-feed meta order - shipped
in PRs #8, #7 and #9 and have been moved to TODO.md.)

## Rules for every task below

- **Branch first.** Each task gets its own branch off the latest `main`
  (`git fetch origin && git checkout main && git pull && git checkout -b <branch>`).
  Never work on `main`, and never mix two of these tasks in one branch.
- `npm run build` and `npx tsc --noEmit` must both pass before committing.
- Explain what changed / where / why before committing (AGENTS.MD pre-commit rule).
- Manual test in Chrome (`chrome://extensions` → Load unpacked → `dist`), no console errors,
  no broken UI, existing features still work.
- Push the branch, open a PR, merge only after the change is confirmed working.

---

## 1. Fix the Liked tab and the Playlists tab

**Branch:** `fix/liked-and-playlists-tabs`

Both sidebar tabs are broken today:

- **Liked** (`/playlist?list=LL`) resolves to route `playlist` in
  [PageManager.ts:14](src/core/PageManager.ts:14), but the page renders with the generic
  "Playlist" header and the liked videos do not come through reliably.
- **Playlists** (`/feed/playlists`) matches nothing in `getRoute`
  ([PageManager.ts](src/core/PageManager.ts)) and falls through to `'home'`, so it renders
  the home feed under the "Today's reading list" header.
  (As of the Phase 1-3 audit fixes, unmapped routes no longer silently serve the homepage -
  they now show an empty state. The routes still need real implementations.) There is also a
  playlists tab on the channel page ([home-feed.ts:474](src/features/home-feed.ts:474)) that
  hardcodes "No playlists to display".

Work to do:
- Add real route handling for `/feed/playlists` (and give Liked its own identity rather than
  the generic playlist header). Update `Route` in [types.ts](src/types.ts), `getRoute`,
  `getFeatureIdsForRoute` in [content.ts](src/content.ts), and the `NAV` route labels in
  [shell.ts](src/features/shell.ts) so active-link highlighting matches.
- Extract liked videos from the `LL` playlist page data
  (`playlistVideoListRenderer` / `playlistVideoRenderer` are already handled in
  `collectItemVideos`, [DataExtractor.ts:638](src/core/DataExtractor.ts:638)) — confirm
  continuation/paging works there too.
- Extract the user's playlist collection for `/feed/playlists` and render it as a list of
  playlists that navigate to `/playlist?list=<id>`.
- Replace the hardcoded empty state on the channel Playlists tab with the real data
  (or drop that tab if the data isn't available).

Acceptance:
- Liked shows the signed-in user's liked videos, with a Liked-specific page header,
  and paging works.
- Playlists shows the user's playlists; clicking one opens that playlist's video list.
- Neither tab silently renders the home feed.
