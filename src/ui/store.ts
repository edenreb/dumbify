// The settings page's and popup's view of the settings: changes show at once, are saved
// in the background, and a failed save puts things back and says why.

import { getSettings, onSettingsChange, setSettings } from '../core/storage'
import { DEFAULT_SETTINGS, applySettingsPatch, type DumbifySettings } from '../core/settings'

type Listener = (s: DumbifySettings, prev: DumbifySettings) => void

export class SettingsStore {
  value: DumbifySettings = DEFAULT_SETTINGS
  private listeners = new Set<Listener>()
  private inflight = 0
  private dragging = false

  constructor(
    private readonly hooks: { saved?: () => void; failed?: (message: string) => void } = {},
  ) {}

  async load(): Promise<DumbifySettings> {
    this.value = await getSettings()
    // Changes made elsewhere - the popup, another settings tab, the page's own menu -
    // land here. Our own saves echo back too; while one is in flight the echo of an
    // earlier one would briefly undo a later change, so they wait.
    onSettingsChange((s) => {
      if (this.inflight > 0 || this.dragging) return
      this.set(s)
    })
    this.emit(this.value)
    return this.value
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.value, this.value)
    return () => this.listeners.delete(fn)
  }

  /** Shows a change without saving it - a slider mid-drag. */
  preview(patch: Partial<DumbifySettings>) {
    this.dragging = true
    this.set(applySettingsPatch(this.value, patch))
  }

  /** Shows a change and saves it. */
  async commit(patch: Partial<DumbifySettings>): Promise<boolean> {
    this.dragging = false
    this.set(applySettingsPatch(this.value, patch))
    this.inflight++
    try {
      const stored = await setSettings(patch)
      this.inflight--
      if (this.inflight === 0 && !this.dragging) this.set(stored)
      this.hooks.saved?.()
      return true
    } catch (err) {
      this.inflight--
      this.hooks.failed?.(err instanceof Error ? err.message : 'Couldn’t save that change')
      this.set(await getSettings())
      return false
    }
  }

  /** Adopts settings that were written by someone else (an import, a reset). */
  replace(s: DumbifySettings) {
    this.dragging = false
    this.set(s)
  }

  private set(next: DumbifySettings) {
    const prev = this.value
    this.value = next
    this.emit(prev)
  }

  private emit(prev: DumbifySettings) {
    for (const fn of this.listeners) fn(this.value, prev)
  }
}
