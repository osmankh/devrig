import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const INVOKE_CHANNELS = [
  'system:getAppVersion',
  'system:getPlatform',
  'theme:get-native-theme',
  'db:workspace:list',
  'db:workspace:get',
  'db:workspace:create',
  'db:workspace:update',
  'db:workflow:list',
  'db:workflow:get',
  'db:workflow:getWithNodes',
  'db:workflow:create',
  'db:workflow:update',
  'db:workflow:delete',
  'db:node:create',
  'db:node:update',
  'db:node:delete',
  'db:node:batchCreate',
  'db:node:batchUpdate',
  'db:edge:create',
  'db:edge:delete',
  'db:edge:deleteByWorkflow',
  'db:edge:batchCreate',
  'db:execution:list',
  'db:execution:create',
  'db:execution:update',
  'db:execution:get',
  'db:execution:getWithSteps',
  'db:settings:get',
  'db:settings:set',
  'execution:run',
  'execution:cancel'
] as const

const LISTEN_CHANNELS = [
  'app:update-available',
  'app:update-downloaded',
  'execution:step-update',
  'execution:complete'
] as const

type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
type ListenChannel = (typeof LISTEN_CHANNELS)[number]

export const api = {
  invoke(channel: InvokeChannel, ...args: unknown[]): Promise<unknown> {
    if (!INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on(channel: ListenChannel, callback: (...args: unknown[]) => void): void {
    if (!LISTEN_CHANNELS.includes(channel)) return
    ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: unknown[]) => {
      callback(...args)
    })
  },

  off(channel: ListenChannel, callback: (...args: unknown[]) => void): void {
    if (!LISTEN_CHANNELS.includes(channel)) return
    ipcRenderer.removeListener(channel, callback)
  }
}
