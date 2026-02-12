import { app, shell, type BrowserWindow } from 'electron'

export function configureNavigationGuards(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    // Always allow file:// and devtools://
    if (parsed.protocol === 'file:' || parsed.protocol === 'devtools:') return
    // In dev mode, allow the Vite dev server on localhost
    if (!app.isPackaged && parsed.hostname === 'localhost') return
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}
