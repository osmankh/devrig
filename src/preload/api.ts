import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const INVOKE_CHANNELS = [
  // System
  'system:getAppVersion',
  'system:getPlatform',
  'theme:get-native-theme',
  // Workspace
  'db:workspace:list',
  'db:workspace:get',
  'db:workspace:create',
  'db:workspace:update',
  // Workflow
  'db:workflow:list',
  'db:workflow:get',
  'db:workflow:getWithNodes',
  'db:workflow:create',
  'db:workflow:update',
  'db:workflow:delete',
  // Node
  'db:node:create',
  'db:node:update',
  'db:node:delete',
  'db:node:batchCreate',
  'db:node:batchUpdate',
  // Edge
  'db:edge:create',
  'db:edge:delete',
  'db:edge:deleteByWorkflow',
  'db:edge:batchCreate',
  // Execution
  'db:execution:list',
  'db:execution:create',
  'db:execution:update',
  'db:execution:get',
  'db:execution:getWithSteps',
  // Settings
  'db:settings:get',
  'db:settings:set',
  // Execution control
  'execution:validate',
  'execution:run',
  'execution:cancel',
  // Inbox
  'inbox:list',
  'inbox:get',
  'inbox:search',
  'inbox:markRead',
  'inbox:markUnread',
  'inbox:archive',
  'inbox:snooze',
  'inbox:unsnooze',
  'inbox:getStats',
  // Plugin
  'plugin:list',
  'plugin:get',
  'plugin:install',
  'plugin:uninstall',
  'plugin:enable',
  'plugin:disable',
  'plugin:configure',
  'plugin:getSyncState',
  'plugin:triggerSync',
  // AI
  'ai:getProviders',
  'ai:setProvider',
  'ai:classify',
  'ai:summarize',
  'ai:draft',
  'ai:complete',
  'ai:getUsage'
] as const

const LISTEN_CHANNELS = [
  'app:update-available',
  'app:update-downloaded',
  'execution:step-update',
  'execution:complete',
  // Inbox
  'inbox:updated',
  // Plugin sync
  'plugin:sync-progress',
  'plugin:sync-complete',
  // AI pipeline
  'ai:pipeline-progress'
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
