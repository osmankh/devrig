import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'

function validateSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) return false
  try {
    const parsed = new URL(senderUrl)
    // Production: only allow file:// or app://devrig
    if (parsed.origin === 'file://' || parsed.origin.startsWith('app://devrig')) return true
    // Dev mode: allow Vite dev server on localhost
    if (!app.isPackaged && parsed.hostname === 'localhost') return true
    return false
  } catch {
    return false
  }
}

export function secureHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!validateSender(event)) {
      throw new Error(`Unauthorized IPC sender for channel: ${channel}`)
    }
    return handler(event, ...args)
  })
}
