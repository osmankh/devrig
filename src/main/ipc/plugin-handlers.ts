import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { PluginRepository } from '../db/repositories/plugin.repository'
import type { PluginSyncRepository } from '../db/repositories/plugin-sync.repository'
import type { InboxRepository } from '../db/repositories/inbox.repository'
import type { PluginManager } from '../plugins/plugin-manager'
import type { SyncScheduler } from '../services/sync-scheduler'

interface PluginRepos {
  plugin: PluginRepository
  pluginSync: PluginSyncRepository
  inbox: InboxRepository
}

interface PluginServices {
  pluginManager: PluginManager
  syncScheduler: SyncScheduler
}

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerPluginHandlers(repos: PluginRepos, services: PluginServices): void {
  secureHandle('plugin:list', () => {
    return ok(repos.plugin.list())
  })

  secureHandle('plugin:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    const result = repos.plugin.get(parsed.data)
    if (!result) return err('Plugin not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('plugin:install', async (_e, path: unknown) => {
    const parsed = z.string().safeParse(path)
    if (!parsed.success) return err('Invalid path', 'VALIDATION')
    try {
      const descriptor = await services.pluginManager.install(parsed.data)
      return ok({ id: descriptor.id, name: descriptor.name, version: descriptor.version })
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Plugin installation failed', 'INSTALL_FAILED')
    }
  })

  secureHandle('plugin:uninstall', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')

    // Clean up plugin data
    repos.inbox.deleteByPlugin(parsed.data)
    repos.pluginSync.deleteByPlugin(parsed.data)
    const deleted = repos.plugin.delete(parsed.data)
    if (!deleted) return err('Plugin not found', 'NOT_FOUND')
    return ok(true)
  })

  secureHandle('plugin:enable', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    const result = repos.plugin.update(parsed.data, { enabled: true })
    if (!result) return err('Plugin not found', 'NOT_FOUND')
    return ok(true)
  })

  secureHandle('plugin:disable', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    const result = repos.plugin.update(parsed.data, { enabled: false })
    if (!result) return err('Plugin not found', 'NOT_FOUND')
    return ok(true)
  })

  secureHandle('plugin:configure', (_e, id: unknown, settings: unknown) => {
    const idParsed = z.string().safeParse(id)
    const settingsParsed = z.record(z.string(), z.unknown()).safeParse(settings)
    if (!idParsed.success || !settingsParsed.success)
      return err('Invalid data', 'VALIDATION')

    const plugin = repos.plugin.get(idParsed.data)
    if (!plugin) return err('Plugin not found', 'NOT_FOUND')

    // Store settings in the manifest metadata
    const manifest = JSON.parse(plugin.manifest)
    manifest._userSettings = settingsParsed.data
    repos.plugin.update(idParsed.data, { manifest: JSON.stringify(manifest) })
    return ok(true)
  })

  secureHandle('plugin:getSyncState', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    return ok(repos.pluginSync.listByPlugin(parsed.data))
  })

  secureHandle('plugin:triggerSync', async (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    try {
      await services.syncScheduler.triggerSync(parsed.data)
      return ok(true)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Sync trigger failed', 'SYNC_FAILED')
    }
  })
}
