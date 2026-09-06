import { getSettings, onSettingsChange } from './core/storage'
import { sameInjectedFiles } from './core/registration'

// The reading view is registered at runtime rather than declared in the manifest, so
// that switching Dumbify off injects nothing at all - no stylesheet, no bundle. See the
// deferContentScripts plugin in vite.config.ts for the build side of this.
const SCRIPT_ID = 'dumbify-reading-view'

// `vite dev` keeps the static declaration for HMR. Chrome already injects it there and
// it cannot be unregistered, so leave it alone.
function staticallyDeclared(): boolean {
  return !!chrome.runtime.getManifest().content_scripts?.length
}

async function registeredScript(): Promise<chrome.scripting.RegisteredContentScript | null> {
  try {
    const [found] = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
    return found ?? null
  } catch {
    return null
  }
}

// The hashed js/css filenames are only known at build time, so the vite plugin writes
// the manifest entry it removed to this file.
async function wantedScript(): Promise<chrome.scripting.RegisteredContentScript> {
  const res = await fetch(chrome.runtime.getURL('content-scripts.json'))
  const [spec] = (await res.json()) as chrome.scripting.RegisteredContentScript[]
  return { ...spec, id: SCRIPT_ID, persistAcrossSessions: true }
}

// Returns whether the registration actually changed, so callers only disturb open tabs
// when something moved. The live registration is the source of truth rather than a
// remembered flag: the worker is torn down between events and wakes with no memory.
async function syncContentScript(): Promise<boolean> {
  if (staticallyDeclared()) return false

  const { enabled } = await getSettings()
  const current = await registeredScript()

  if (!enabled) {
    if (!current) return false
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
    return true
  }

  // Not just "is anything registered" - a registration left over from the previous
  // version points at filenames this build no longer has. See core/registration.ts.
  const wanted = await wantedScript()
  if (current && sameInjectedFiles(current, wanted)) return false

  // updateContentScripts would be one call, but it fails when nothing is registered yet.
  // Unregistering first covers the fresh install and the stale-after-update case alike.
  if (current) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
  await chrome.scripting.registerContentScripts([wanted])
  return true
}

// Nothing is injected while the switch is off, so an already-open tab has no content
// script left to notice the change - the reload has to come from here, both ways.
async function reloadYouTubeTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
  await Promise.all(tabs.map((t) => (t.id ? chrome.tabs.reload(t.id) : undefined)))
}

// A registration that throws leaves the extension silently doing nothing at all, which
// is indistinguishable from the switch being off. Say so.
function sync(): Promise<boolean> {
  return syncContentScript().catch((err) => {
    console.error('[Dumbify] could not update the content script registration:', err)
    return false
  })
}

chrome.runtime.onInstalled.addListener(() => { void sync() })
chrome.runtime.onStartup.addListener(() => { void sync() })

// Every settings write lands here, not just the switch - reload only if the switch was
// the thing that moved, or changing a font would reload every YouTube tab.
onSettingsChange(() => {
  void sync().then((changed) => {
    if (changed) return reloadYouTubeTabs()
  })
})

interface YTDataMessage {
  type: 'GET_YT_DATA'
  name: string
}

interface YTCfgMessage {
  type: 'GET_YT_CFG'
}

interface OpenOptionsMessage {
  type: 'OPEN_OPTIONS'
}

type BGMessage = YTDataMessage | YTCfgMessage | OpenOptionsMessage

// GET_YT_DATA evaluates window[name] in the page's MAIN world. Only this extension can
// reach onMessage (there is no externally_connectable), but there is no reason for the
// name to be open-ended - these are the only two globals anything asks for.
const READABLE_GLOBALS = new Set(['ytInitialData', 'ytInitialPlayerResponse'])

chrome.runtime.onMessage.addListener((message: BGMessage, sender, sendResponse) => {
  if (message.type === 'GET_YT_DATA') {
    const tabId = sender.tab?.id
    if (!tabId || !READABLE_GLOBALS.has(message.name)) { sendResponse(null); return }

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (name: string) => {
        try {
          const val = (window as any)[name]
          if (val === undefined || val === null) return null
          return JSON.parse(JSON.stringify(val))
        } catch { return null }
      },
      args: [message.name],
    }).then((results) => {
      const data = results?.[0]?.result ?? null
      sendResponse(data)
    }).catch(() => sendResponse(null))

    return true
  }

  if (message.type === 'GET_YT_CFG') {
    const tabId = sender.tab?.id
    if (!tabId) { sendResponse(null); return }

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const cfg = (window as any).ytcfg
          if (!cfg) return null
          const data = cfg.data_ ?? cfg
          return JSON.parse(JSON.stringify(data))
        } catch { return null }
      },
    }).then((results) => {
      const data = results?.[0]?.result ?? null
      sendResponse(data)
    }).catch(() => sendResponse(null))

    return true
  }

  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage()
    return
  }
})
