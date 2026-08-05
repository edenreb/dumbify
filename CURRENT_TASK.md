# Current Tasks

Four active tasks, listed in no particular priority order. Pick one, work it to completion,
then move it into the Completed Tasks section of TODO.md per AGENTS.MD.

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

## 1. Channel name on the watch page should link to the channel

**Branch:** `fix/watch-page-channel-link`

In [watch-page.ts:858](src/features/watch-page.ts:858) the channel name renders as a plain
`<span class="df-watch-channel">` with no navigation.

Work to do:
- Render it as a link (or keep the span but attach a click handler) that navigates to the
  channel page using `navigateTo` from `PageManager` — full page load, matching the
  extension's navigation convention.
- `Video.channelId` already exists in [types.ts](src/types.ts); verify it is actually
  populated on the watch route. If the watch-page extraction doesn't fill `channelId`,
  extract it (owner / `videoOwnerRenderer` / `videoSecondaryInfoRenderer`) so the link
  targets `/channel/<UC…>`. Prefer the canonical `/channel/<id>` URL over a handle.
- Style it so it reads as clickable (hover state in [main.css](src/styles/main.css)).

Acceptance:
- Clicking the channel name on a watch page opens that channel's Dumbify channel page.
- No dead link when `channelId` is missing — fall back to plain text rather than a broken href.

---

## 2. Remove the "Your Videos" and "Channel" sidebar tabs

**Branch:** `fix/remove-unused-sidebar-tabs`

Both entries in the `NAV` array at [shell.ts:37](src/features/shell.ts:37) point at pages the
extension does not render (`/feed/videos`, `/feed/channels`), and both are mislabeled with
`route: 'playlist'` / `route: 'channel'`, which also breaks active-link highlighting.

Work to do:
- Delete both `NAV` entries.
- Remove anything left dangling by the deletion (unused route mapping, unused styles).
- Confirm the remaining tabs still highlight correctly via `updateActiveLink`.

Acceptance:
- Sidebar shows only: Home, Subscriptions, History, Watch Later, Liked, Playlists.
- No dead nav entries, no console errors, active-tab highlight still correct.

---

## 3. Home feed item layout: title, then channel / views / release date

**Branch:** `fix/home-feed-meta-order`

Target layout for every feed item:

```
VIDEO TITLE
Channel Name / Views / Release Date
```

Current state in `renderVideo` ([home-feed.ts:303](src/features/home-feed.ts:303)):
- Title renders first — correct.
- The meta row appends the channel, then takes one of two paths:
  - if `v.meta` is set (the lockup extraction path packs channel/views/date into one
    pre-joined string), it prints that blob instead of the individual fields;
  - otherwise it prints `views` then `published`, but a `dateFirst` flag reverses them.
- Result: order is inconsistent across routes, and views are sometimes missing entirely.

Work to do:
- Make the order deterministic: channel → views → release date, separated by ` / `.
- Stop relying on the pre-joined `v.meta` blob for the feed row. In the lockup path
  ([DataExtractor.ts:531](src/core/DataExtractor.ts:531) onward), populate `views` and
  `published` as separate fields so `renderVideo` can order them itself.
- Remove or repurpose the `dateFirst` reversal so it can't flip the requested order.
- Missing fields collapse cleanly — no leading, trailing, or doubled ` / ` separators.

Acceptance:
- Home, search results, subscriptions, history, and channel feeds all show
  `Channel / Views / Release Date` in that order.
- Views are present wherever YouTube supplies them (verify against the real page).

---

## 4. Fix the Liked tab and the Playlists tab

**Branch:** `fix/liked-and-playlists-tabs`

Both sidebar tabs are broken today:

- **Liked** (`/playlist?list=LL`) resolves to route `playlist` in
  [PageManager.ts:14](src/core/PageManager.ts:14), but the page renders with the generic
  "Playlist" header and the liked videos do not come through reliably.
- **Playlists** (`/feed/playlists`) matches nothing in `getRoute`
  ([PageManager.ts:8](src/core/PageManager.ts:8)) and falls through to `'home'`, so it renders
  the home feed under the "Today's reading list" header. There is also a stubbed
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
