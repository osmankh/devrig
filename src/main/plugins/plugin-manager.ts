import { EventEmitter } from 'events'
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import { PluginRepository } from '../db/repositories/plugin.repository'
import { PluginSyncRepository } from '../db/repositories/plugin-sync.repository'
import { InboxRepository } from '../db/repositories/inbox.repository'
import { validateManifest } from './manifest-schema'
import { extractPermissions, validatePermissions } from './permissions'
import { createSandbox, type PluginSandbox, type HostFunctions } from './isolate-sandbox'
import { PluginLoader, type PluginDescriptor } from './plugin-loader'
import { createHostFunctions, type PluginApiDeps } from './plugin-api'
import {SecretsBridge} from "../ai";

const MAX_ACTIVE_SANDBOXES = 10

export type PluginStatus = 'installed' | 'active' | 'error' | 'disabled'

export interface ManagedPlugin {
  descriptor: PluginDescriptor
  dbId: string
  status: PluginStatus
  error?: string
  lastAccessed: number
}

export interface PluginManagerOptions {
  db: Database
  pluginsDir?: string
  secretsBridge?: SecretsBridge
  aiRegistry?: {
    getDefault(): { [op: string]: (params: unknown) => Promise<unknown> } | null
  }
}

export class PluginManager {
  private sandboxes = new Map<string, PluginSandbox>()
  private descriptors = new Map<string, ManagedPlugin>()
  private pluginRepo: PluginRepository
  private syncRepo: PluginSyncRepository
  private inboxRepo: InboxRepository
  private hostFunctions: HostFunctions
  private loader: PluginLoader
  private eventBus = new EventEmitter()

  constructor(private opts: PluginManagerOptions) {
    this.pluginRepo = new PluginRepository(opts.db)
    this.syncRepo = new PluginSyncRepository(opts.db)
    this.inboxRepo = new InboxRepository(opts.db)

    const apiDeps: PluginApiDeps = {
      inboxRepo: this.inboxRepo,
      secretsBridge: opts.secretsBridge!,
      eventBus: this.eventBus,
      aiRegistry: opts.aiRegistry
    }
    this.hostFunctions = createHostFunctions(apiDeps)
    this.loader = new PluginLoader(opts.pluginsDir)
  }

  async initialize(): Promise<void> {
    // 1. Load installed plugins from DB and validate
    const dbPlugins = this.pluginRepo.listEnabled()
    for (const dbPlugin of dbPlugins) {
      try {
        const parsed = JSON.parse(dbPlugin.manifest)
        const result = validateManifest(parsed)
        if (!result.success) {
          this.registerError(dbPlugin.id, dbPlugin.name, `Invalid manifest: ${result.errors.issues[0]?.message}`)
          continue
        }
        const manifest = result.data
        const permissions = extractPermissions(manifest)

        this.descriptors.set(manifest.id, {
          descriptor: {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            manifest,
            path: '',
            permissions,
            entryPoints: new Map()
          },
          dbId: dbPlugin.id,
          status: 'installed',
          lastAccessed: 0
        })
      } catch {
        this.registerError(dbPlugin.id, dbPlugin.name, 'Failed to parse stored manifest')
      }
    }

    // 2. Discover filesystem plugins, supplement/update DB entries
    const discovered = await this.loader.discover()
    for (const desc of discovered) {
      const existing = this.descriptors.get(desc.id)
      if (existing) {
        // Update path and entry points from filesystem
        existing.descriptor.path = desc.path
        existing.descriptor.entryPoints = desc.entryPoints
      } else {
        // Auto-register newly discovered plugins into DB
        const dbRecord = this.pluginRepo.create({
          name: desc.name,
          version: desc.version,
          manifest: JSON.stringify(desc.manifest)
        })

        if (desc.manifest.capabilities?.dataSources) {
          for (const ds of desc.manifest.capabilities.dataSources) {
            this.syncRepo.create({ pluginId: dbRecord.id, dataSourceId: ds.id })
          }
        }

        this.descriptors.set(desc.id, {
          descriptor: desc,
          dbId: dbRecord.id,
          status: 'installed',
          lastAccessed: 0
        })
      }
    }
  }

  async install(sourcePath: string): Promise<PluginDescriptor> {
    // Validate the source directory
    const desc = await this.loader.loadFromPath(sourcePath)

    if (this.descriptors.has(desc.id)) {
      throw new Error(`Plugin "${desc.id}" is already installed`)
    }

    const permResult = validatePermissions(desc.permissions)
    if (!permResult.valid) {
      throw new Error(`Permission validation failed: ${permResult.warnings.join('; ')}`)
    }

    // Copy plugin to userData/plugins/{id}/
    const targetDir = join(this.getPluginsDir(), desc.id)
    if (!existsSync(this.getPluginsDir())) {
      mkdirSync(this.getPluginsDir(), { recursive: true })
    }
    cpSync(sourcePath, targetDir, { recursive: true })

    // Re-load from the installed location
    const installed = await this.loader.loadFromPath(targetDir)

    // Store in DB
    const dbRecord = this.pluginRepo.create({
      name: installed.name,
      version: installed.version,
      manifest: JSON.stringify(installed.manifest)
    })

    // Register sync state for data sources
    if (installed.manifest.capabilities?.dataSources) {
      for (const ds of installed.manifest.capabilities.dataSources) {
        this.syncRepo.create({ pluginId: dbRecord.id, dataSourceId: ds.id })
      }
    }

    this.descriptors.set(installed.id, {
      descriptor: installed,
      dbId: dbRecord.id,
      status: 'installed',
      lastAccessed: 0
    })

    return installed
  }

  async uninstall(pluginId: string): Promise<void> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) return

    // Dispose sandbox
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      sandbox.dispose()
      this.sandboxes.delete(pluginId)
    }

    // Clean up DB data
    this.inboxRepo.deleteByPlugin(managed.dbId)
    this.syncRepo.deleteByPlugin(managed.dbId)
    this.pluginRepo.delete(managed.dbId)

    // Delete plugin files
    const pluginDir = join(this.getPluginsDir(), pluginId)
    if (existsSync(pluginDir)) {
      rmSync(pluginDir, { recursive: true, force: true })
    }

    this.descriptors.delete(pluginId)
  }

  async enable(pluginId: string): Promise<void> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)

    this.pluginRepo.update(managed.dbId, { enabled: true })
    managed.status = 'installed'
    managed.error = undefined
  }

  async disable(pluginId: string): Promise<void> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)

    // Dispose sandbox if active
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      sandbox.dispose()
      this.sandboxes.delete(pluginId)
    }

    this.pluginRepo.update(managed.dbId, { enabled: false })
    managed.status = 'disabled'
  }

  async getSandbox(pluginId: string): Promise<PluginSandbox> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)
    if (managed.status === 'disabled') throw new Error(`Plugin "${pluginId}" is disabled`)

    // Return existing sandbox
    const existing = this.sandboxes.get(pluginId)
    if (existing) {
      managed.lastAccessed = Date.now()
      return existing
    }

    // Evict LRU if at capacity
    if (this.sandboxes.size >= MAX_ACTIVE_SANDBOXES) {
      this.evictOldestSandbox()
    }

    // Lazy creation
    const permissions = managed.descriptor.permissions
    const permResult = validatePermissions(permissions)
    if (!permResult.valid) {
      managed.status = 'error'
      managed.error = permResult.warnings.join('; ')
      throw new Error(managed.error)
    }

    try {
      const sandbox = await createSandbox(pluginId, permissions, this.hostFunctions)

      // Load all entry points
      for (const [, code] of managed.descriptor.entryPoints) {
        await sandbox.loadModule(code)
      }

      this.sandboxes.set(pluginId, sandbox)
      managed.status = 'active'
      managed.lastAccessed = Date.now()
      managed.error = undefined

      return sandbox
    } catch (err) {
      managed.status = 'error'
      managed.error = (err as Error).message
      throw err
    }
  }

  async callDataSource(pluginId: string, dataSourceId: string, method: string, args?: unknown[]): Promise<unknown> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)

    const ds = managed.descriptor.manifest.capabilities?.dataSources?.find((d) => d.id === dataSourceId)
    if (!ds) throw new Error(`Data source "${dataSourceId}" not found in plugin "${pluginId}"`)

    const sandbox = await this.getSandbox(pluginId)
    return sandbox.call(method, args)
  }

  async callAction(pluginId: string, actionId: string, args?: unknown[]): Promise<unknown> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)

    const action = managed.descriptor.manifest.capabilities?.actions?.find((a) => a.id === actionId)
    if (!action) throw new Error(`Action "${actionId}" not found in plugin "${pluginId}"`)

    const sandbox = await this.getSandbox(pluginId)
    return sandbox.call(`action_${actionId}`, args)
  }

  async callAIPipeline(pluginId: string, pipelineId: string, args?: unknown[]): Promise<unknown> {
    const managed = this.descriptors.get(pluginId)
    if (!managed) throw new Error(`Plugin "${pluginId}" not found`)

    const pipeline = managed.descriptor.manifest.capabilities?.aiPipelines?.find((p) => p.id === pipelineId)
    if (!pipeline) throw new Error(`AI pipeline "${pipelineId}" not found in plugin "${pluginId}"`)

    const sandbox = await this.getSandbox(pluginId)
    return sandbox.call(`pipeline_${pipelineId}`, args)
  }

  getActivePlugins(): PluginDescriptor[] {
    return Array.from(this.descriptors.values())
      .filter((m) => m.status !== 'disabled' && m.status !== 'error')
      .map((m) => m.descriptor)
  }

  getPlugin(pluginId: string): ManagedPlugin | undefined {
    return this.descriptors.get(pluginId)
  }

  listPlugins(): ManagedPlugin[] {
    return Array.from(this.descriptors.values())
  }

  getMemoryUsage(pluginId: string): { used: number; limit: number } | null {
    const sandbox = this.sandboxes.get(pluginId)
    if (!sandbox) return null
    return sandbox.getMemoryUsage()
  }

  getEventBus(): EventEmitter {
    return this.eventBus
  }

  dispose(): void {
    for (const [, sandbox] of this.sandboxes) {
      sandbox.dispose()
    }
    this.sandboxes.clear()
    this.descriptors.clear()
    this.eventBus.removeAllListeners()
  }

  private evictOldestSandbox(): void {
    let oldestId: string | null = null
    let oldestTime = Infinity

    for (const [pluginId] of this.sandboxes) {
      const managed = this.descriptors.get(pluginId)
      if (managed && managed.lastAccessed < oldestTime) {
        oldestTime = managed.lastAccessed
        oldestId = pluginId
      }
    }

    if (oldestId) {
      const sandbox = this.sandboxes.get(oldestId)
      if (sandbox) {
        sandbox.dispose()
        this.sandboxes.delete(oldestId)
      }
      const managed = this.descriptors.get(oldestId)
      if (managed) {
        managed.status = 'installed'
      }
    }
  }

  private getPluginsDir(): string {
    return this.opts.pluginsDir ?? join(app.getPath('userData'), 'plugins')
  }

  private registerError(dbId: string, name: string, error: string): void {
    console.error(`[plugin-manager] Error for plugin "${name}": ${error}`)
  }
}
