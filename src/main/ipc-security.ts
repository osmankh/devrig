import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'

function validateSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) return false
  try {
    const origin = new URL(senderUrl).origin
    return origin === 'file://' || origin.startsWith('app://devrig')
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
