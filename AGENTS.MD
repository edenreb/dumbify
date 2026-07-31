# Project Instructions - YouTube Extension

## Project Overview

This project is a simplified YouTube-style browser extension.

The goal is to recreate core YouTube functionality:
- Watching videos
- Browsing videos
- Managing user interactions
- Channel pages
- History
- Watch Later
- Comments
- Custom user settings

Prioritize functionality, reliability, and maintainable code.

---

# Task Management Workflow

The project uses three documentation files:

## AGENTS.md
Contains permanent instructions and rules for development.

Do not modify this file unless development workflow rules change.

## TODO.md
Contains the complete list of planned features, bugs, and improvements.

This is the long-term roadmap.

## CURRENT_TASK.md
Contains the currently active tasks.

Only work on tasks listed in CURRENT_TASK.md unless explicitly instructed otherwise.

---

# Completing Tasks

When working on tasks:

1. Read CURRENT_TASK.md first.
2. Identify the highest priority unfinished task.
3. Complete only the relevant task unless another change is required.
4. Test the change.
5. Explain all changes before committing.
6. Update documentation after completion.

When a task is completed:

1. Remove it from the active task list in CURRENT_TASK.md.
2. Move it into the Completed Tasks section of TODO.md.
3. Include:
   - What was changed
   - Which files were modified
   - Why it was changed
   - Testing status

Do not mark tasks as complete if they have not been tested.

---

# Development Workflow

## Before Making Changes

Always:

1. Fetch the latest version from GitHub.
2. Check the current branch.
3. Review existing code before modifying files.
4. Understand the existing architecture and dependencies.

Do not overwrite existing functionality without understanding how it interacts with other parts of the project.

---

# Git Workflow

Follow this workflow:

1. Never directly push unfinished changes to `main`.
2. Create a feature branch for each change.

Example:

git checkout -b feature/video-player-fix

When starting a new task, create a branch to start that task and name it after the task at hand, then checkout and do whatever work you need to do for a specific task on that corresponding branch.

3. Make changes.
4. Test locally.
5. Explain all changes before committing.
6. Commit changes.
7. Push the branch.
8. Create a Pull Request.
9. Merge only after confirming the feature works.

---

# Pre-Commit Change Explanation

Before creating any commit, explain:

## 1. What changed

Provide a summary of the functionality or code modifications.

## 2. Where it changed

List exact files and relevant components/functions.

Example:

Changed:
- src/components/VideoPlayer.jsx
- src/hooks/useVideoState.js

## 3. Why it changed

Explain the reason for the modification.

Example:

Reason:
Fixed video cleanup issue causing audio playback after navigation.

Do not commit changes until this explanation has been provided.

---

# Testing Requirements

Before considering a feature complete:

1. Build the extension.
2. Provide manual testing instructions.
3. If automated testing tools exist, use them.

Manual Chrome testing:

1. Open:

chrome://extensions/

2. Enable Developer Mode.

3. Select:

Load unpacked

4. Load the `dist` directory.

Verify:

- No console errors.
- No broken UI.
- No unexpected behavior.
- Existing features still work.

Before committing, state whether testing was:

- Automatically completed
- Manually completed by developer
- Not completed yet

---

# Debugging Guidelines

When fixing bugs:

1. Identify the root cause.
2. Avoid temporary patches.
3. Prefer clean solutions.
4. Check whether changes affect other features.

When possible:

- Keep components modular.
- Remove unused code.
- Add comments for complex logic.
- Avoid unnecessary refactoring.

---

# Code Quality

Prioritize:

1. Functionality
2. Stability
3. Maintainability
4. UI improvements

Do not add unnecessary features unless they improve the extension.

Remove irrelevant settings/features if they do not contribute to the extension.