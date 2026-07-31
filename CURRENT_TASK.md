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
- Status: code complete, typecheck + build pass. Manual Chrome testing still needed (load `dist` unpacked).

---

# 🔴 Priority 2 - Navigation System

Status: Pending

Tasks:

- Fix page navigation state issues.
- Ensure pages properly reload their own content.
- Ensure video components unmount correctly.

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
