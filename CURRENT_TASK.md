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
