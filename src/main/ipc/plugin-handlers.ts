import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { PluginRepository } from '../db/repositories/plugin.repository'
import type { PluginSyncRepository } from '../db/repositories/plugin-sync.repository'
import type { InboxRepository } from '../db/repositories/inbox.repository'
import type { SettingsRepository } from '../db/repositories/settings.repository'
import type { PluginManager } from '../plugins/plugin-manager'
import type { SyncScheduler } from '../services/sync-scheduler'
import type { SecretsBridge } from '../ai/secrets-bridge'

interface PluginRepos {
  plugin: PluginRepository
  pluginSync: PluginSyncRepository
  inbox: InboxRepository
  settings: SettingsRepository
}

interface PluginServices {
  pluginManager: PluginManager
  syncScheduler: SyncScheduler
  secretsBridge: SecretsBridge
}

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

/** Transform a raw DB plugin record into the shape the renderer expects */
function toRendererPlugin(row: {
  id: string
  name: string
  version: string
  manifest: string
  enabled: number | boolean
  installedAt: number
  updatedAt: number
}) {
  let capabilities = { dataSources: [], actions: [], aiPipelines: [], views: [], flowNodes: [] }
  let description: string | undefined
  let icon: string | undefined
  let requiredSecrets: string[] = []
  let authType: string | undefined
  try {
    const parsed = JSON.parse(row.manifest)
    description = parsed.description
    icon = parsed.icon
    requiredSecrets = parsed.permissions?.secrets ?? []
    authType = parsed.auth?.type
    const caps = parsed.capabilities ?? {}
    capabilities = {
      dataSources: caps.dataSources?.map((d: { id: string }) => d.id) ?? [],
      actions: caps.actions?.map((a: { id: string }) => a.id) ?? [],
      aiPipelines: caps.aiPipelines?.map((p: { id: string }) => p.id) ?? [],
      views: caps.views?.map((v: { id: string }) => v.id) ?? [],
      flowNodes: caps.flowNodes?.map((n: { id: string }) => n.id) ?? []
    }
  } catch { /* manifest parse failed — use defaults */ }
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description,
    icon,
    enabled: row.enabled === 1 || row.enabled === true,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    capabilities,
    requiredSecrets,
    authType
  }
}

export function registerPluginHandlers(repos: PluginRepos, services: PluginServices): void {
  secureHandle('plugin:list', () => {
    const plugins = repos.plugin.list()
    return ok(plugins.map(toRendererPlugin))
  })

  secureHandle('plugin:discoverAvailable', () => {
    try {
      const managed = services.pluginManager.listPlugins()
      const installedIds = new Set(managed.map((m) => m.descriptor.id))

      // Also scan the bundled plugins/ directory at project root
      const { join } = require('path') as typeof import('path')
      const { existsSync, readdirSync, readFileSync, statSync } = require('fs') as typeof import('fs')
      const { app } = require('electron') as typeof import('electron')

      // Bundled plugins dir: next to the app (in dev: project root; in prod: resources)
      const bundledDirs = [
        join(app.getAppPath(), 'plugins'),
        join(app.getAppPath(), '..', 'plugins'),
        join(process.cwd(), 'plugins')
      ]

      interface AvailablePlugin {
        id: string
        name: string
        version: string
        description: string
        icon?: string
        author: { name: string; url?: string }
        authType?: string
        installed: boolean
        enabled: boolean
        capabilities: {
          dataSources: string[]
          actions: string[]
          aiPipelines: string[]
        }
      }

      const seen = new Set<string>()
      const available: AvailablePlugin[] = []

      // Add installed plugins
      for (const m of managed) {
        const manifest = m.descriptor.manifest
        seen.add(manifest.id)
        available.push({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          icon: manifest.icon,
          author: manifest.author,
          authType: manifest.auth?.type,
          installed: true,
          enabled: m.status !== 'disabled',
          capabilities: {
            dataSources: manifest.capabilities?.dataSources?.map((d) => d.id) ?? [],
            actions: manifest.capabilities?.actions?.map((a) => a.id) ?? [],
            aiPipelines: manifest.capabilities?.aiPipelines?.map((p) => p.id) ?? []
          }
        })
      }

      // Scan bundled dirs for not-yet-installed plugins
      for (const dir of bundledDirs) {
        if (!existsSync(dir)) continue
        for (const entry of readdirSync(dir)) {
          const pluginDir = join(dir, entry)
          if (!statSync(pluginDir).isDirectory()) continue
          const manifestPath = join(pluginDir, 'manifest.json')
          if (!existsSync(manifestPath)) continue
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
            if (seen.has(manifest.id)) continue
            seen.add(manifest.id)
            available.push({
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              description: manifest.description ?? '',
              icon: manifest.icon,
              author: manifest.author ?? { name: 'Unknown' },
              authType: manifest.auth?.type,
              installed: false,
              enabled: false,
              capabilities: {
                dataSources: manifest.capabilities?.dataSources?.map((d: { id: string }) => d.id) ?? [],
                actions: manifest.capabilities?.actions?.map((a: { id: string }) => a.id) ?? [],
                aiPipelines: manifest.capabilities?.aiPipelines?.map((p: { id: string }) => p.id) ?? []
              }
            })
          } catch { /* skip malformed manifest */ }
        }
      }

      return ok(available)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Discovery failed', 'DISCOVERY_FAILED')
    }
  })

  secureHandle('plugin:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    const result = repos.plugin.get(parsed.data)
    if (!result) return err('Plugin not found', 'NOT_FOUND')
    return ok(toRendererPlugin(result))
  })

  secureHandle('plugin:install', async (_e, path: unknown) => {
    const parsed = z.string().safeParse(path)
    if (!parsed.success) return err('Invalid path', 'VALIDATION')
    try {
      const descriptor = await services.pluginManager.install(parsed.data)
      const plugin = repos.plugin.get(descriptor.id)
      if (!plugin) return err('Plugin installed but not found in database', 'INSTALL_FAILED')
      return ok(toRendererPlugin(plugin))
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

    // Separate secret keys from regular settings
    const secretKeyPatterns = /_token$|_key$|_secret$/
    const secretKeyNames = new Set(['apiKey', 'token', 'secret'])
    const regularSettings: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(settingsParsed.data)) {
      if ((secretKeyPatterns.test(key) || secretKeyNames.has(key)) && typeof value === 'string') {
        services.secretsBridge.setPluginSecret(idParsed.data, key, value)
      } else {
        regularSettings[key] = value
      }
    }

    // Store non-secret settings in the manifest metadata
    const manifest = JSON.parse(plugin.manifest)
    manifest._userSettings = regularSettings
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

  secureHandle('plugin:setSecret', (_e, pluginId: unknown, secretKey: unknown, secretValue: unknown) => {
    const id = z.string().safeParse(pluginId)
    const key = z.string().safeParse(secretKey)
    const val = z.string().safeParse(secretValue)
    if (!id.success || !key.success || !val.success) return err('Invalid data', 'VALIDATION')
    try {
      services.secretsBridge.setPluginSecret(id.data, key.data, val.data)
      return ok(true)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Failed to store secret', 'SECRET_FAILED')
    }
  })

  secureHandle('plugin:hasSecret', (_e, pluginId: unknown, secretKey: unknown) => {
    const id = z.string().safeParse(pluginId)
    const key = z.string().safeParse(secretKey)
    if (!id.success || !key.success) return err('Invalid data', 'VALIDATION')
    return ok(services.secretsBridge.hasPluginSecret(id.data, key.data))
  })

  secureHandle('plugin:getSettings', (_e, pluginId: unknown) => {
    const id = z.string().safeParse(pluginId)
    if (!id.success) return err('Invalid plugin id', 'VALIDATION')
    const prefix = `plugin:${id.data}:`
    const allSettings = repos.settings.getAll()
    const pluginSettings: Record<string, string> = {}
    for (const s of allSettings) {
      if (s.key.startsWith(prefix)) {
        pluginSettings[s.key.slice(prefix.length)] = s.value
      }
    }
    return ok(pluginSettings)
  })

  secureHandle('plugin:setSetting', (_e, pluginId: unknown, key: unknown, value: unknown) => {
    const id = z.string().safeParse(pluginId)
    const k = z.string().safeParse(key)
    const v = z.string().safeParse(value)
    if (!id.success || !k.success || !v.success) return err('Invalid data', 'VALIDATION')
    repos.settings.set(`plugin:${id.data}:${k.data}`, v.data)
    return ok(true)
  })
}
