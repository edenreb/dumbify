# Dumbify

A calm, text-first YouTube experience. Replaces YouTube's UI with a minimal, distraction-free interface.

## Features

- **Text-first feed** — video list with title, channel, and metadata (no thumbnails)
- **Distraction-free watch page** — stripped-down player with only title, description, and comments
- **Focus mode** — full-screen video with a single keypress (F)
- **Hide what you don't want** — thumbnails, comments, recommendations, Shorts, notifications
- **Customizable** — font size, font family, layout options
- **Keyboard-driven** — Cmd+K to search
- **Infinite scroll** — loads more videos as you scroll

## Install

1. Clone the repo
2. `npm install`
3. `npm run build`
4. Load the `dist/` folder as an unpacked extension in Chrome (`chrome://extensions`)

## Development

```bash
npm run dev    # watch mode with HMR
npm run build  # production build
```
