const APP_URL = 'http://localhost:3000/quick-note-popup'
const WIN_W = 420
const WIN_H = 290

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-quick-note') return

  const existing = await chrome.windows.getAll({ windowTypes: ['popup'] })
  for (const win of existing) {
    const tabs = await chrome.tabs.query({ windowId: win.id })
    const match = tabs.find(t => t.url?.includes('quick-note-popup'))
    if (match) {
      chrome.windows.update(win.id, { focused: true })
      return
    }
  }

  const allWindows = await chrome.windows.getAll()
  const currentWin = allWindows.find(w => w.focused) ?? allWindows[0]
  const left = currentWin ? Math.round(currentWin.left + currentWin.width - WIN_W - 20) : 1400
  const top = currentWin ? Math.round(currentWin.top + currentWin.height - WIN_H - 60) : 700

  chrome.windows.create({
    url: APP_URL,
    type: 'popup',
    width: WIN_W,
    height: WIN_H,
    left,
    top,
    focused: true,
  })
})
