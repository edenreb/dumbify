# Current Active Tasks

Only work on tasks listed here.

Complete tasks from highest priority downward.

---

# 🔴 Priority 1 - Search Function

Status: In Progress

Tasks:

- Currently I can use ctrl + k in order to bring up a search menu but it does not look good.
- Implement a search bar on the top for users to search relevant content and a search button so that they can actually search it
- Change the page to the search results page and display the relevant content which they searched for. 

Progress notes:

- Added a search bar + search button to the top of the main content area (shell.ts), replacing the old Ctrl+K `prompt()`.
- Ctrl+K now focuses/selects the search input instead of opening the prompt.
- Submitting the search navigates to `/results?search_query=...`.
- `fetchSearchResults(query)` added to DataExtractor.ts: fetches the results page HTML, parses `ytInitialData`, extracts videoRenderer/lockup videos, and pulls the continuation token.
- Search route now loads real results in home-feed.ts (initial load via `fetchSearchResults`, scroll-pagination via `fetchContinuation` with `searchQuery`).
- Search page head shows "Results for "..." " when a query is present.
- **Channel results:** `fetchSearchResults` now also parses `channelRenderer` items; a featured channel banner (name, verified mark, subscribers, video count, description, "View channel" CTA) renders at the top of search results when a channel matches.
- **Channel pages:** added `fetchChannelPage(channelId)` (via InnerTube browse API) + `fetchChannelContinuation`; the `channel` route now renders a zen-viewer-style channel page — head (name, description, Verified/Subscribed badge), 3-stat strip (Subscribers / Videos / Avg. length), and the channel's videos with scroll pagination. Navigate to `/channel/<channelId>`.
- **Search item list (2nd iteration):** added `SearchItem` union (`video | channel`), `extractSearchItems` preserves the interleaved order of video + channel results from search, and `PageResult.items`. Search results now render inline channel cards throughout the list (compact card, skips the featured banner channel), so related channels appear alongside videos. Banner moved to the top of the page (inserted before the list). Continuation loads render `items` too.
- **Channel page tabs:** the channel page now has Latest / Popular / About tabs. Latest shows videos in order, Popular re-sorts by view count, About shows description, handle link, and stats. About replaces the list (list hidden).
- **Search ordering (3rd iteration):** all relevant channel cards now render grouped at the top of the results list (featured banner + remaining channel cards), with videos loading after them.
- **Channel page (4th iteration, matching screenshot):** channel page renders: eyebrow "Channel · handle", big serif title (52px/64px via `.df-channel-page-title`), description note, "Subscribed"/"Verified" badge on right. Below: 3-column stats strip (Subscribers / Videos / Avg. Length) with border-top/bottom. Below that: toolbar with Videos (active)/Popular/Playlists/About tabs. Below that: video list. Popular tab re-sorts by views; About tab shows description and channel link.
- **Channel navigation (4th iteration):** clicking a channel banner/card uses `window.location.href = '/channel/<id>'` (full URL navigation, same pattern as video cards). This properly routes to the channel page URL.
- Status: code complete, typecheck + build pass. Manual Chrome testing still needed (load `dist` unpacked).

---

# 🔴 Priority 2 - Navigation System

Status: In Progress

Tasks:

- Fix page navigation state issues.
- Ensure pages properly reload their own content.
- Ensure video components unmount correctly.

Progress notes:

- **Navigation links (1st iteration):** `navigateTo(path)` in PageManager.ts no longer just fires feature callbacks with a fabricated state — it now performs a real full-page navigation via `window.location.href = href` (and no-ops if already on that URL). Sidebar buttons, the brand/logo, and the search submit all go through `navigateTo`, so clicking them now updates the browser URL and reloads the page to the correct link. This matches the existing full-page navigation pattern already used by video cards and channel cards/links. Active link highlighting still works because shell re-reads the route on the fresh page load.
- Status: code complete, typecheck + build pass. Manual Chrome testing still needed (load `dist` unpacked).

---

# 🔴 Priority 3 - Watch Later

Status: Pending

Tasks:

- Make Watch Later button add videos correctly.
- Save Watch Later data.
- Allow removing saved videos.

---

# 🟠 Priority 4 - History

Status: Pending

Tasks:

- Fix History only showing Shorts.
- Add normal videos to History.
- Verify watched videos are recorded.

---

# 🟠 Priority 5 - Comments

Status: Pending

Tasks:

- Add toggleable comment section.
- Allow users to write comments.
- Display submitted comments.

---

# 🟠 Priority 6 - Channel Pages

Status: Pending

Tasks:

- Create individual channel pages.
- Display channel information.
- Display videos uploaded by the channel.

---

# 🟠 Priority 7 - Video Information

Tasks:

- Fix video descriptions.
- Implement Share functionality.

---

# 🟢 Priority 8 - Extension Settings

Tasks:

- Review extension settings.
- Remove unnecessary settings.
- Verify remaining settings work.

---

# 🟢 Priority 9 - Custom Theme

Tasks:

- Allow users to choose custom backgrounds.
- Save theme preferences.
- Apply themes consistently.
