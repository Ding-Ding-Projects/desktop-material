const HOST_NAME = 'com.dingdingprojects.desktop_material.browser_download'
const MAX_URL_LENGTH = 8192
const MAX_FILENAME_LENGTH = 240
const MAX_DESTINATION_LENGTH = 32768

function safeFileName(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_FILENAME_LENGTH &&
    !/[\\/:*?"<>|\u0000-\u001f]/u.test(value)
  )
}

function safeRequest(request) {
  if (request === null || typeof request !== 'object') return false
  if (
    typeof request.id !== 'string' ||
    request.id.length === 0 ||
    request.id.length > 128
  )
    return false
  if (
    typeof request.source !== 'string' ||
    request.source.length === 0 ||
    request.source.length > MAX_URL_LENGTH
  )
    return false
  try {
    if (!/^https?:$/u.test(new URL(request.source).protocol)) return false
  } catch {
    return false
  }
  if (!safeFileName(request.suggestedFileName)) return false
  if (
    typeof request.destination !== 'string' ||
    request.destination.length === 0 ||
    request.destination.length > MAX_DESTINATION_LENGTH
  )
    return false
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/])/u.test(request.destination))
    return false
  return Number.isSafeInteger(request.receivedAt) && request.receivedAt >= 0
}

function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const candidate = decodeURIComponent(
      pathname.slice(pathname.lastIndexOf('/') + 1)
    )
    return safeFileName(candidate) ? candidate : 'download'
  } catch {
    return 'download'
  }
}

async function sendDownload(source) {
  const { destination } = await chrome.storage.local.get({ destination: '' })
  if (typeof destination !== 'string' || destination.length === 0) {
    throw new Error(
      'Choose a local Windows destination folder in the extension options first.'
    )
  }

  const request = {
    id: crypto.randomUUID(),
    source,
    suggestedFileName: fileNameFromUrl(source),
    destination: `${destination.replace(/[\\/]$/u, '')}\\${fileNameFromUrl(
      source
    )}`,
    receivedAt: Date.now(),
  }
  if (!safeRequest(request))
    throw new Error('The download request did not pass validation.')

  const port = chrome.runtime.connectNative(HOST_NAME)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(new Error('The native host did not acknowledge the request.')),
      10000
    )
    port.onMessage.addListener(message => {
      clearTimeout(timeout)
      if (message && message.accepted === true) resolve()
      else reject(new Error('The native host rejected the request.'))
      port.disconnect()
    })
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout)
      if (chrome.runtime.lastError)
        reject(new Error('The native host is unavailable.'))
    })
    port.postMessage(request)
  })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-link-to-desktop-material',
    title: 'Send download to Desktop Material',
    contexts: ['link'],
  })
})

chrome.contextMenus.onClicked.addListener(info => {
  if (
    info.menuItemId !== 'send-link-to-desktop-material' ||
    typeof info.linkUrl !== 'string'
  )
    return
  void sendDownload(info.linkUrl).catch(error => {
    console.warn(
      'Desktop Material download handoff unavailable:',
      error instanceof Error ? error.message : 'unknown error'
    )
  })
})
