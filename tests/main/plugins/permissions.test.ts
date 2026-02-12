import { describe, it, expect } from 'vitest'
import {
  isUrlAllowed,
  isPathAllowed,
  validatePermissions,
  checkPermission,
  extractPermissions,
  type PluginPermissions
} from '../../../src/main/plugins/permissions'

describe('isUrlAllowed', () => {
  it('allows exact domain match', () => {
    expect(isUrlAllowed('https://api.github.com/repos', ['api.github.com'])).toBe(true)
  })

  it('rejects non-matching domain', () => {
    expect(isUrlAllowed('https://evil.com/attack', ['api.github.com'])).toBe(false)
  })

  it('allows wildcard subdomain patterns', () => {
    expect(isUrlAllowed('https://api.example.com/data', ['*.example.com'])).toBe(true)
    expect(isUrlAllowed('https://sub.example.com/data', ['*.example.com'])).toBe(true)
  })

  it('allows root domain with wildcard pattern', () => {
    expect(isUrlAllowed('https://example.com/data', ['*.example.com'])).toBe(true)
  })

  it('denies with empty allowlist', () => {
    expect(isUrlAllowed('https://anything.com', [])).toBe(false)
  })

  it('denies invalid URLs', () => {
    expect(isUrlAllowed('not-a-url', ['example.com'])).toBe(false)
  })

  it('handles multiple patterns', () => {
    const allowlist = ['api.github.com', '*.google.com', 'slack.com']
    expect(isUrlAllowed('https://api.github.com/v1', allowlist)).toBe(true)
    expect(isUrlAllowed('https://maps.google.com', allowlist)).toBe(true)
    expect(isUrlAllowed('https://slack.com/api', allowlist)).toBe(true)
    expect(isUrlAllowed('https://evil.com', allowlist)).toBe(false)
  })

  it('does not match partial hostnames without wildcard', () => {
    expect(isUrlAllowed('https://notexample.com', ['example.com'])).toBe(false)
  })
})

describe('isPathAllowed', () => {
  it('allows exact path match', () => {
    expect(isPathAllowed('/tmp/file.txt', ['/tmp/'])).toBe(true)
  })

  it('allows directory patterns (trailing slash)', () => {
    expect(isPathAllowed('/tmp/subdir/file.txt', ['/tmp/'])).toBe(true)
  })

  it('allows wildcard patterns', () => {
    expect(isPathAllowed('/data/plugins/test/file.json', ['/data/plugins/*'])).toBe(true)
  })

  it('denies with empty patterns', () => {
    expect(isPathAllowed('/any/path', [])).toBe(false)
  })

  it('skips __PLUGIN_DATA__ marker (does not match paths against it)', () => {
    expect(isPathAllowed('/some/path', ['__PLUGIN_DATA__'])).toBe(false)
  })

  it('normalizes backslashes', () => {
    expect(isPathAllowed('C:\\tmp\\file.txt', ['/tmp/'])).toBe(false)
    expect(isPathAllowed('C:\\data\\file.txt', ['C:/data/'])).toBe(true)
  })

  it('allows exact match without trailing slash', () => {
    expect(isPathAllowed('/tmp', ['/tmp'])).toBe(true)
  })

  it('allows sub-path of non-trailing-slash pattern', () => {
    expect(isPathAllowed('/tmp/subdir', ['/tmp'])).toBe(true)
  })
})

describe('validatePermissions', () => {
  it('returns valid for safe permissions', () => {
    const perms: PluginPermissions = {
      network: ['api.github.com'],
      secrets: ['GITHUB_TOKEN'],
      ai: true,
      filesystem: ['/tmp/']
    }
    const result = validatePermissions(perms)
    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns about broad network wildcard *', () => {
    const perms: PluginPermissions = {
      network: ['*'],
      secrets: [],
      ai: false,
      filesystem: []
    }
    const result = validatePermissions(perms)
    expect(result.valid).toBe(true) // still valid, just warned
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('too broad')
  })

  it('warns about *.* wildcard', () => {
    const perms: PluginPermissions = {
      network: ['*.*'],
      secrets: [],
      ai: false,
      filesystem: []
    }
    const result = validatePermissions(perms)
    expect(result.warnings[0]).toContain('too broad')
  })

  it('rejects too many secret keys (>20)', () => {
    const perms: PluginPermissions = {
      network: [],
      secrets: Array.from({ length: 21 }, (_, i) => `SECRET_${i}`),
      ai: false,
      filesystem: []
    }
    const result = validatePermissions(perms)
    expect(result.valid).toBe(false)
    expect(result.warnings.some(w => w.includes('Too many secret keys'))).toBe(true)
  })

  it('rejects filesystem paths outside allowed directories', () => {
    const perms: PluginPermissions = {
      network: [],
      secrets: [],
      ai: false,
      filesystem: ['/etc/passwd']
    }
    const result = validatePermissions(perms)
    expect(result.valid).toBe(false)
    expect(result.warnings.some(w => w.includes('outside allowed directories'))).toBe(true)
  })

  it('allows /tmp/ and __PLUGIN_DATA__ filesystem paths', () => {
    const perms: PluginPermissions = {
      network: [],
      secrets: [],
      ai: false,
      filesystem: ['/tmp/mydata']
    }
    const result = validatePermissions(perms)
    expect(result.valid).toBe(true)
  })
})

describe('checkPermission', () => {
  const perms: PluginPermissions = {
    network: ['api.github.com', '*.google.com'],
    secrets: ['GITHUB_TOKEN', 'API_KEY'],
    ai: true,
    filesystem: ['/tmp/']
  }

  it('checks network permission with resource', () => {
    expect(checkPermission(perms, 'network', 'https://api.github.com/repos')).toBe(true)
    expect(checkPermission(perms, 'network', 'https://evil.com')).toBe(false)
  })

  it('checks network permission without resource (has any access)', () => {
    expect(checkPermission(perms, 'network')).toBe(true)
    expect(checkPermission({ ...perms, network: [] }, 'network')).toBe(false)
  })

  it('checks secrets permission', () => {
    expect(checkPermission(perms, 'secrets', 'GITHUB_TOKEN')).toBe(true)
    expect(checkPermission(perms, 'secrets', 'UNKNOWN_KEY')).toBe(false)
  })

  it('checks secrets permission without resource', () => {
    expect(checkPermission(perms, 'secrets')).toBe(true)
    expect(checkPermission({ ...perms, secrets: [] }, 'secrets')).toBe(false)
  })

  it('checks ai permission', () => {
    expect(checkPermission(perms, 'ai')).toBe(true)
    expect(checkPermission({ ...perms, ai: false }, 'ai')).toBe(false)
  })

  it('checks filesystem permission', () => {
    expect(checkPermission(perms, 'filesystem', '/tmp/data.json')).toBe(true)
    expect(checkPermission(perms, 'filesystem', '/etc/passwd')).toBe(false)
  })

  it('checks filesystem permission without resource', () => {
    expect(checkPermission(perms, 'filesystem')).toBe(true)
    expect(checkPermission({ ...perms, filesystem: [] }, 'filesystem')).toBe(false)
  })
})

describe('extractPermissions', () => {
  it('extracts permissions from manifest', () => {
    const manifest = {
      permissions: {
        network: ['api.github.com'],
        secrets: ['TOKEN'],
        ai: true,
        filesystem: ['/tmp/']
      }
    } as any

    const result = extractPermissions(manifest)
    expect(result.network).toEqual(['api.github.com'])
    expect(result.secrets).toEqual(['TOKEN'])
    expect(result.ai).toBe(true)
    expect(result.filesystem).toEqual(['/tmp/'])
  })

  it('provides defaults for missing permissions', () => {
    const manifest = { permissions: {} } as any
    const result = extractPermissions(manifest)
    expect(result.network).toEqual([])
    expect(result.secrets).toEqual([])
    expect(result.ai).toBe(false)
    expect(result.filesystem).toEqual([])
  })

  it('handles undefined permissions', () => {
    const manifest = {} as any
    const result = extractPermissions(manifest)
    expect(result.network).toEqual([])
    expect(result.secrets).toEqual([])
    expect(result.ai).toBe(false)
    expect(result.filesystem).toEqual([])
  })
})
