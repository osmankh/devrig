import { app } from 'electron'
import { join, resolve } from 'path'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { validateManifest, type PluginManifest } from './manifest-schema'
import { extractPermissions, validatePermissions, type PluginPermissions } from './permissions'

export interface PluginDescriptor {
  id: string
  name: string
  version: string
  manifest: PluginManifest
  path: string
  permissions: PluginPermissions
  entryPoints: Map<string, string>
}

export interface LoadError {
  pluginDir: string
  error: string
}

function readEntryPoint(basePath: string, relativePath: string): string | null {
  const fullPath = resolve(basePath, relativePath)
  // Prevent path traversal
  if (!fullPath.startsWith(basePath)) return null
  if (!existsSync(fullPath)) return null
  return readFileSync(fullPath, 'utf-8')
}

function collectEntryPoints(manifest: PluginManifest, basePath: string): Map<string, string> {
  const entries = new Map<string, string>()
  const caps = manifest.capabilities
  if (!caps) return entries

  const capArrays = [
    caps.dataSources,
    caps.actions,
    caps.aiPipelines,
    caps.views,
    caps.flowNodes
  ]

  for (const arr of capArrays) {
    if (!arr) continue
    for (const cap of arr) {
      if (entries.has(cap.entryPoint)) continue
      const code = readEntryPoint(basePath, cap.entryPoint)
      if (code) {
        entries.set(cap.entryPoint, code)
      }
    }
  }

  return entries
}

export class PluginLoader {
  constructor(private pluginsDir?: string) {}

  private getDir(): string {
    return this.pluginsDir ?? join(app.getPath('userData'), 'plugins')
  }

  async discover(): Promise<PluginDescriptor[]> {
    const dir = this.getDir()
    if (!existsSync(dir)) return []

    const entries = readdirSync(dir)
    const descriptors: PluginDescriptor[] = []

    for (const entry of entries) {
      const pluginDir = join(dir, entry)
      if (!statSync(pluginDir).isDirectory()) continue

      try {
        const descriptor = await this.validatePluginDir(pluginDir)
        descriptors.push(descriptor)
      } catch (err) {
        console.warn(`[plugin-loader] Skipping ${entry}: ${(err as Error).message}`)
      }
    }

    return descriptors
  }

  async loadFromPath(pluginPath: string): Promise<PluginDescriptor> {
    const absPath = resolve(pluginPath)
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      throw new Error(`Plugin path does not exist or is not a directory: ${absPath}`)
    }
    return this.validatePluginDir(absPath)
  }

  private async validatePluginDir(dirPath: string): Promise<PluginDescriptor> {
    const manifestPath = join(dirPath, 'manifest.json')

    if (!existsSync(manifestPath)) {
      throw new Error('Missing manifest.json')
    }

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (e) {
      throw new Error(`Invalid JSON in manifest.json: ${(e as Error).message}`)
    }

    const result = validateManifest(raw)
    if (!result.success) {
      const issues = result.errors.issues.map((i) => i.message).join('; ')
      throw new Error(`Manifest validation failed: ${issues}`)
    }

    const manifest = result.data
    const permissions = extractPermissions(manifest)
    const permCheck = validatePermissions(permissions)
    if (!permCheck.valid) {
      throw new Error(`Permission validation failed: ${permCheck.warnings.join('; ')}`)
    }

    const entryPoints = collectEntryPoints(manifest, dirPath)

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      manifest,
      path: dirPath,
      permissions,
      entryPoints
    }
  }
}
