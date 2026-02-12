import { ipcInvoke, ipcOn, ipcOff } from '@shared/lib/ipc'
import type { Plugin, PluginSyncState } from '../model/plugin.types'

export async function listPlugins(): Promise<Plugin[]> {
  return ipcInvoke<Plugin[]>('plugin:list')
}

export async function getPlugin(id: string): Promise<Plugin> {
  return ipcInvoke<Plugin>('plugin:get', id)
}

export async function installPlugin(path: string): Promise<Plugin> {
  return ipcInvoke<Plugin>('plugin:install', path)
}

export async function uninstallPlugin(id: string): Promise<void> {
  return ipcInvoke<void>('plugin:uninstall', id)
}

export async function enablePlugin(id: string): Promise<void> {
  return ipcInvoke<void>('plugin:enable', id)
}

export async function disablePlugin(id: string): Promise<void> {
  return ipcInvoke<void>('plugin:disable', id)
}

export async function configurePlugin(
  id: string,
  settings: Record<string, unknown>
): Promise<void> {
  return ipcInvoke<void>('plugin:configure', id, settings)
}

export async function getSyncState(id: string): Promise<PluginSyncState[]> {
  return ipcInvoke<PluginSyncState[]>('plugin:getSyncState', id)
}

export async function triggerSync(id: string): Promise<void> {
  return ipcInvoke<void>('plugin:triggerSync', id)
}

export function onSyncProgress(
  callback: (data: { pluginId: string; progress: number }) => void
): void {
  ipcOn('plugin:sync-progress', callback as (...args: unknown[]) => void)
}

export function offSyncProgress(
  callback: (data: { pluginId: string; progress: number }) => void
): void {
  ipcOff('plugin:sync-progress', callback as (...args: unknown[]) => void)
}

export function onSyncComplete(
  callback: (data: { pluginId: string; itemsSynced: number }) => void
): void {
  ipcOn('plugin:sync-complete', callback as (...args: unknown[]) => void)
}

export function offSyncComplete(
  callback: (data: { pluginId: string; itemsSynced: number }) => void
): void {
  ipcOff('plugin:sync-complete', callback as (...args: unknown[]) => void)
}
