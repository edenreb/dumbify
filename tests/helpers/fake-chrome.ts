// A just-big-enough chrome.storage.local for unit tests: async callbacks, lastError on
// failure, and onChanged events - the three behaviours storage.ts depends on.

type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void

export interface FakeChrome {
  data: Map<string, unknown>
  /** Every write, in order, as [key, value] ("remove" writes undefined). */
  writes: [string, unknown][]
  /** Make the next set() fail with this message, as chrome.runtime.lastError does. */
  failNextSet(message: string): void
  install(): void
}

export function fakeChrome(initial: Record<string, unknown> = {}): FakeChrome {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)))
  const writes: [string, unknown][] = []
  const listeners = new Set<Listener>()
  let failure: string | null = null
  const runtime: { lastError?: { message: string } } = {}

  const emit = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
    for (const l of listeners) l(structuredClone(changes))
  }

  const local = {
    get(key: string, cb: (res: Record<string, unknown>) => void) {
      setTimeout(() => cb(data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}), 0)
    },
    set(items: Record<string, unknown>, cb: () => void) {
      setTimeout(() => {
        if (failure) {
          runtime.lastError = { message: failure }
          failure = null
          cb()
          runtime.lastError = undefined
          return
        }
        const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data.get(k), newValue: structuredClone(v) }
          data.set(k, structuredClone(v))
          writes.push([k, structuredClone(v)])
        }
        cb()
        emit(changes)
      }, 0)
    },
    remove(key: string, cb: () => void) {
      setTimeout(() => {
        const had = data.has(key)
        const old = data.get(key)
        data.delete(key)
        writes.push([key, undefined])
        cb()
        if (had) emit({ [key]: { oldValue: old } })
      }, 0)
    },
    onChanged: {
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    },
  }

  return {
    data,
    writes,
    failNextSet(message: string) { failure = message },
    install() {
      ;(globalThis as any).chrome = { storage: { local }, runtime }
    },
  }
}
