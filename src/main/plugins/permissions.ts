import type { PluginManifest } from './manifest-schema'

export interface PluginPermissions {
  network: string[]
  secrets: string[]
  ai: boolean
  filesystem: string[]
}

export function extractPermissions(manifest: PluginManifest): PluginPermissions {
  const perms = manifest.permissions
  return {
    network: perms?.network ?? [],
    secrets: perms?.secrets ?? [],
    ai: perms?.ai ?? false,
    filesystem: perms?.filesystem ?? []
  }
}

export function validatePermissions(permissions: PluginPermissions): {
  valid: boolean
  warnings: string[]
} {
  const warnings: string[] = []

  for (const pattern of permissions.network) {
    if (pattern === '*' || pattern === '*.*') {
      warnings.push(`Network wildcard "${pattern}" is too broad — restrict to specific domains`)
    }
  }

  if (permissions.secrets.length > 20) {
    warnings.push(`Too many secret keys (${permissions.secrets.length}) — max 20 per plugin`)
    return { valid: false, warnings }
  }

  for (const pattern of permissions.filesystem) {
    if (!isPathAllowed(pattern, ['/tmp/', '__PLUGIN_DATA__'])) {
      warnings.push(`Filesystem path "${pattern}" is outside allowed directories (/tmp/ or plugin data)`)
      return { valid: false, warnings }
    }
  }

  return { valid: true, warnings }
}

export function checkPermission(
  permissions: PluginPermissions,
  type: 'network' | 'secrets' | 'ai' | 'filesystem',
  resource?: string
): boolean {
  switch (type) {
    case 'network':
      return resource ? isUrlAllowed(resource, permissions.network) : permissions.network.length > 0
    case 'secrets':
      return resource ? permissions.secrets.includes(resource) : permissions.secrets.length > 0
    case 'ai':
      return permissions.ai
    case 'filesystem':
      return resource ? isPathAllowed(resource, permissions.filesystem) : permissions.filesystem.length > 0
  }
}

export function isUrlAllowed(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  for (const pattern of allowlist) {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1) // ".example.com"
      if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
        return true
      }
    } else if (hostname === pattern) {
      return true
    }
  }

  return false
}

export function isPathAllowed(path: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false

  const normalized = path.replace(/\\/g, '/')

  for (const pattern of patterns) {
    if (pattern === '__PLUGIN_DATA__') continue

    const normalizedPattern = pattern.replace(/\\/g, '/')
    if (normalizedPattern.endsWith('/')) {
      if (normalized.startsWith(normalizedPattern) || normalized === normalizedPattern.slice(0, -1)) {
        return true
      }
    } else if (normalizedPattern.endsWith('*')) {
      const prefix = normalizedPattern.slice(0, -1)
      if (normalized.startsWith(prefix)) return true
    } else if (normalized === normalizedPattern || normalized.startsWith(normalizedPattern + '/')) {
      return true
    }
  }

  return false
}

export function describePermissions(permissions: PluginPermissions): string[] {
  const descriptions: string[] = []

  if (permissions.network.length > 0) {
    const domains = permissions.network.join(', ')
    descriptions.push(`Network access: ${domains}`)
  }

  if (permissions.secrets.length > 0) {
    const keys = permissions.secrets.join(', ')
    descriptions.push(`Secret keys: ${keys}`)
  }

  if (permissions.ai) {
    descriptions.push('AI model access')
  }

  if (permissions.filesystem.length > 0) {
    const paths = permissions.filesystem.join(', ')
    descriptions.push(`Filesystem access: ${paths}`)
  }

  if (descriptions.length === 0) {
    descriptions.push('No special permissions required')
  }

  return descriptions
}
