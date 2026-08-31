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
