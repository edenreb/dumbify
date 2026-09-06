// Kept apart from PageManager so it can be tested: PageManager reads location at import
// time, which a test runner has no answer for.

/** The click modifiers browsers use for "open this somewhere else". */
export interface ModifiedClick {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
}

// Cmd/Ctrl-click opens a new tab, Shift a new window, Alt downloads, middle-click a
// background tab. All of them are the reader asking the browser for something we have
// no business intercepting - a single-page router should only claim the plain left
// click.
export function wantsNewTab(e: ModifiedClick): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}
