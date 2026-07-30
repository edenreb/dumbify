export class DOMEngine {
  private observer: MutationObserver | null = null
  private cleanupFns: (() => void)[] = []

  start() {
    this.observer = new MutationObserver(() => {})
    this.observer.observe(document.body, { childList: true, subtree: true })

    const cleanup = this.injectHideCSS()
    this.cleanupFns.push(cleanup)
  }

  destroy() {
    this.observer?.disconnect()
    this.observer = null
    this.cleanupFns.forEach((fn) => fn())
    this.cleanupFns = []
  }

  onCleanup(fn: () => void) {
    this.cleanupFns.push(fn)
  }

  waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
    return new Promise((resolve) => {
      const found = document.querySelector(selector)
      if (found) return resolve(found)

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector)
        if (el) {
          obs.disconnect()
          resolve(el)
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })

      setTimeout(() => {
        obs.disconnect()
        resolve(null)
      }, timeout)
    })
  }

  hideSelector(selector: string) {
    const el = document.querySelector(selector)
    if (el instanceof HTMLElement) el.style.setProperty('display', 'none', 'important')
  }

  private injectHideCSS(): () => void {
    const style = document.createElement('style')
    style.id = 'dumbify-base'
    style.textContent = `
      #masthead-container, ytd-masthead { display: none !important; }
      ytd-guide-renderer, ytd-mini-guide-renderer { display: none !important; }
      ytd-page-manager { margin-top: 0 !important; margin-left: 0 !important; }
      ytd-rich-grid-renderer, ytd-rich-grid-row { display: none !important; }
      ytd-search #header { display: none !important; }
      ytd-watch-flexy #secondary { display: none !important; }
      #related, ytd-watch-next-secondary-results-renderer { display: none !important; }
      #chat-container, ytd-live-chat-frame { display: none !important; }
      ytd-comments, #comments { display: none !important; }
      ytd-reel-shelf-renderer { display: none !important; }
      tp-yt-app-drawer { display: none !important; }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }
}
