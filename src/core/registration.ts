// Pulled out of background.ts so it can be tested: that module registers Chrome event
// listeners at import time, which a test runner has no answer for.

export interface InjectedFiles {
  js?: string[]
  css?: string[]
}

// Vite content-hashes the bundle, so every release changes the filenames a registration
// points at. Comparing only *whether* something was registered left an updated extension
// still pointing at the previous build's files - which no longer exist - and so
// injecting nothing at all, silently, for everyone who already had it installed. A fresh
// install was fine, which is exactly why local testing would never have caught it.
export function sameInjectedFiles(a: InjectedFiles, b: InjectedFiles): boolean {
  // js and css are compared apart, not flattened into one run of names: concatenated,
  // a file that moved from one list to the other compared equal.
  const list = (files?: string[]) => (files ?? []).join('\n')
  return list(a.js) === list(b.js) && list(a.css) === list(b.css)
}
