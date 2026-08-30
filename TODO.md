# YouTube Extension Roadmap

# Open Tasks

Found while testing the extension against real YouTube.

## Sidebar: link 'Your Videos' to YouTube Studio

The sidebar's 'Your Videos' entry is not wired to anything. Point it at the
creator studio (`studio.youtube.com`) so it opens the user's own video list.

## Sidebar: rename 'Channel' to 'Your Channel' and link it

Rename the 'Channel' sidebar entry to 'Your Channel' and link it to the signed-in
user's own channel. Needs the user's own channel id resolved at runtime — it is not
the same as whatever channel page happens to be open.

## Playlists do not work

Playlists (Liked videos, sounds, Watch Later) do not render at all in this version.
Playlist routes need to actually fetch and show their contents.

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


## Shorts: redirect to the normal watch page, and fit tall videos

Completed:
- Date: 2026-08-31
- Changes: Shorts now play through the normal watch page. `DataExtractor` emits
  `/watch?v=<id>` for every video it extracts (reel items, shorts lockups, and the
  DOM fallback), so in-app shorts links go straight to the watch page with no
  intermediate load. A `redirectShorts` guard in `content.ts` covers the entry
  points extraction can't reach — direct `/shorts/<id>` loads and YouTube's own
  SPA navigations; bare `/shorts` (the shorts feed, which has no equivalent here)
  falls back to `/`. The content script moved to `run_at: document_start` and the
  guard runs at module top level, before DOMContentLoaded, so the redirect happens
  before YouTube's own scripts boot the shorts player — at `document_end` the short
  had already started playing. Tall videos are clamped with `max-height: 85vh` in
  CSS rather than in `syncPlayerAspect`: a JS cap derived from the player's viewport
  position feeds back through the element's own height and grows the page on every
  scroll. The clamp sits on both `.df-native-player` and its `.html5-video-player`
  descendant because `playerContainer()` returns whichever of the two exists, and
  on a real watch page `#movie_player` is itself the `.html5-video-player`.
- Files modified: src/core/DataExtractor.ts, src/content.ts, src/manifest.ts,
  src/features/watch-page.ts, src/styles/main.css
- Testing: `npx tsc --noEmit` and `npm run build` pass. Manually tested in Chrome on
  real signed-in YouTube: a short from the home feed opens on the watch page and
  plays, a pasted `/shorts/<id>` URL redirects before the native player starts, and
  a 9:16 video fits the viewport instead of overflowing it.


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