const BASE_URL = 'https://boti-qa.vercel.app'

async function openPopup(path, width, height) {
  const existing = await chrome.windows.getAll({ windowTypes: ['popup'] })
  for (const win of existing) {
    const tabs = await chrome.tabs.query({ windowId: win.id })
    const match = tabs.find(t => t.url?.includes(path))
    if (match) {
      chrome.windows.update(win.id, { focused: true })
      return
    }
  }

  const allWindows = await chrome.windows.getAll()
  const currentWin = allWindows.find(w => w.focused) ?? allWindows[0]
  const left = currentWin ? Math.round(currentWin.left + currentWin.width - width - 20) : 1400
  const top = currentWin ? Math.round(currentWin.top + currentWin.height - height - 60) : 700

  chrome.windows.create({
    url: `${BASE_URL}${path}`,
    type: 'popup',
    width,
    height,
    left,
    top,
    focused: true,
  })
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-quick-note') openPopup('/quick-note-popup', 420, 290)
  if (command === 'open-chat') openPopup('/chat-popup', 480, 520)
})
