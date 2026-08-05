# YouTube Extension Roadmap


# Completed Tasks

Move completed tasks here.

Format:

## Task Name

Completed:
- Date:
- Changes:
- Files modified:
- Testing:


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