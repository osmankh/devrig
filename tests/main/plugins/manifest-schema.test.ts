import { describe, it, expect } from 'vitest'
import { pluginManifestSchema, validateManifest } from '../../../src/main/plugins/manifest-schema'

function validManifest(overrides?: Record<string, unknown>) {
  return {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: { name: 'Test Author' },
    ...overrides
  }
}

describe('pluginManifestSchema', () => {
  describe('id field', () => {
    it('accepts valid kebab-case ids (3-64 chars)', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'abc' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'my-plugin' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'a1b2c3' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'a'.repeat(64) }))).not.toThrow()
    })

    it('rejects ids starting with a number', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: '1abc' }))).toThrow()
    })

    it('rejects ids ending with a hyphen', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'abc-' }))).toThrow()
    })

    it('rejects ids with uppercase letters', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'MyPlugin' }))).toThrow()
    })

    it('rejects ids shorter than 3 chars', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'ab' }))).toThrow()
    })

    it('rejects ids longer than 64 chars', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'a'.repeat(65) }))).toThrow()
    })

    it('rejects ids with underscores or dots', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'my_plugin' }))).toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ id: 'my.plugin' }))).toThrow()
    })
  })

  describe('version field', () => {
    it('accepts valid semver strings', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ version: '1.0.0' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ version: '0.1.0' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ version: '10.20.30' }))).not.toThrow()
    })

    it('accepts semver with prerelease', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ version: '1.0.0-alpha' }))).not.toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ version: '1.0.0-beta.1' }))).not.toThrow()
    })

    it('accepts semver with build metadata', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ version: '1.0.0+build.123' }))).not.toThrow()
    })

    it('rejects non-semver strings', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ version: '1.0' }))).toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ version: 'v1.0.0' }))).toThrow()
      expect(() => pluginManifestSchema.parse(validManifest({ version: 'latest' }))).toThrow()
    })
  })

  describe('name and description', () => {
    it('accepts valid name and description', () => {
      expect(() =>
        pluginManifestSchema.parse(validManifest({ name: 'A', description: 'Short' }))
      ).not.toThrow()
    })

    it('rejects empty name', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ name: '' }))).toThrow()
    })

    it('rejects name over 100 chars', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ name: 'x'.repeat(101) }))).toThrow()
    })

    it('rejects empty description', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ description: '' }))).toThrow()
    })

    it('rejects description over 500 chars', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ description: 'x'.repeat(501) }))).toThrow()
    })
  })

  describe('author schema', () => {
    it('accepts author with just name', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ author: { name: 'Alice' } }))).not.toThrow()
    })

    it('accepts author with name, email, and url', () => {
      const author = { name: 'Alice', email: 'alice@example.com', url: 'https://alice.dev' }
      expect(() => pluginManifestSchema.parse(validManifest({ author }))).not.toThrow()
    })

    it('rejects empty author name', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ author: { name: '' } }))).toThrow()
    })

    it('rejects invalid email', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ author: { name: 'A', email: 'not-an-email' } }))).toThrow()
    })

    it('rejects invalid url', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ author: { name: 'A', url: 'not-a-url' } }))).toThrow()
    })
  })

  describe('permissions schema', () => {
    it('accepts valid permissions', () => {
      const permissions = {
        network: ['api.github.com'],
        secrets: ['TOKEN'],
        ai: true,
        filesystem: ['/tmp/']
      }
      expect(() => pluginManifestSchema.parse(validManifest({ permissions }))).not.toThrow()
    })

    it('accepts empty permissions object', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ permissions: {} }))).not.toThrow()
    })

    it('accepts omitted permissions', () => {
      const m = validManifest()
      delete (m as Record<string, unknown>).permissions
      expect(() => pluginManifestSchema.parse(m)).not.toThrow()
    })

    it('rejects empty strings in network array', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ permissions: { network: [''] } }))).toThrow()
    })

    it('rejects empty network array (min 1)', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ permissions: { network: [] } }))).toThrow()
    })

    it('rejects more than 20 secrets', () => {
      const secrets = Array.from({ length: 21 }, (_, i) => `SECRET_${i}`)
      expect(() => pluginManifestSchema.parse(validManifest({ permissions: { secrets } }))).toThrow()
    })

    it('accepts up to 20 secrets', () => {
      const secrets = Array.from({ length: 20 }, (_, i) => `SECRET_${i}`)
      expect(() => pluginManifestSchema.parse(validManifest({ permissions: { secrets } }))).not.toThrow()
    })
  })

  describe('capabilities schema', () => {
    it('accepts omitted capabilities', () => {
      expect(() => pluginManifestSchema.parse(validManifest())).not.toThrow()
    })

    it('accepts empty capabilities', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities: {} }))).not.toThrow()
    })
  })

  describe('dataSource capability', () => {
    it('accepts valid data source', () => {
      const capabilities = {
        dataSources: [{ id: 'emails', name: 'Email Fetcher', entryPoint: 'sync.js' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
    })

    it('accepts data source with optional fields', () => {
      const capabilities = {
        dataSources: [{
          id: 'emails',
          name: 'Email Fetcher',
          entryPoint: 'sync.js',
          syncInterval: 300,
          description: 'Fetches emails from Gmail'
        }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
    })

    it('rejects syncInterval below 10', () => {
      const capabilities = {
        dataSources: [{ id: 'ds', name: 'DS', entryPoint: 'sync.js', syncInterval: 5 }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })

    it('rejects syncInterval above 86400', () => {
      const capabilities = {
        dataSources: [{ id: 'ds', name: 'DS', entryPoint: 'sync.js', syncInterval: 86401 }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })

    it('rejects non-integer syncInterval', () => {
      const capabilities = {
        dataSources: [{ id: 'ds', name: 'DS', entryPoint: 'sync.js', syncInterval: 30.5 }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })

    it('rejects empty entryPoint', () => {
      const capabilities = {
        dataSources: [{ id: 'ds', name: 'DS', entryPoint: '' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })
  })

  describe('action capability', () => {
    it('accepts valid action', () => {
      const capabilities = {
        actions: [{ id: 'reply', name: 'Reply', entryPoint: 'actions.js' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
    })

    it('accepts action with parameters', () => {
      const capabilities = {
        actions: [{
          id: 'reply',
          name: 'Reply',
          entryPoint: 'actions.js',
          parameters: {
            body: { type: 'string' as const, description: 'Reply body', required: true },
            urgent: { type: 'boolean' as const }
          }
        }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
    })

    it('rejects invalid parameter type', () => {
      const capabilities = {
        actions: [{
          id: 'reply',
          name: 'Reply',
          entryPoint: 'actions.js',
          parameters: { body: { type: 'invalid' } }
        }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })
  })

  describe('aiPipeline capability', () => {
    it('accepts valid pipeline with trigger types', () => {
      for (const trigger of ['onNewItems', 'onAction', 'manual'] as const) {
        const capabilities = {
          aiPipelines: [{ id: 'classify', name: 'Classifier', entryPoint: 'pipelines.js', trigger }]
        }
        expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
      }
    })

    it('rejects invalid trigger', () => {
      const capabilities = {
        aiPipelines: [{ id: 'classify', name: 'Classifier', entryPoint: 'p.js', trigger: 'invalid' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })
  })

  describe('view capability', () => {
    it('accepts valid views with all target types', () => {
      for (const target of ['detail-panel', 'settings', 'dashboard'] as const) {
        const capabilities = {
          views: [{ id: 'panel', name: 'Panel', entryPoint: 'view.js', target }]
        }
        expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
      }
    })

    it('rejects invalid target', () => {
      const capabilities = {
        views: [{ id: 'v', name: 'V', entryPoint: 'v.js', target: 'sidebar' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })
  })

  describe('flowNode capability', () => {
    it('accepts valid flow nodes with all types', () => {
      for (const type of ['trigger', 'action', 'condition'] as const) {
        const capabilities = {
          flowNodes: [{ id: 'node', name: 'Node', entryPoint: 'node.js', type }]
        }
        expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).not.toThrow()
      }
    })

    it('rejects invalid flow node type', () => {
      const capabilities = {
        flowNodes: [{ id: 'n', name: 'N', entryPoint: 'n.js', type: 'filter' }]
      }
      expect(() => pluginManifestSchema.parse(validManifest({ capabilities }))).toThrow()
    })
  })

  describe('preferences', () => {
    it('accepts valid preferences', () => {
      const preferences = [
        { id: 'auto-sync', label: 'Auto Sync', type: 'toggle' as const, default: true },
        {
          id: 'interval',
          label: 'Sync Interval',
          type: 'select' as const,
          options: [
            { label: '5 min', value: '300' },
            { label: '15 min', value: '900' }
          ]
        },
        { id: 'api-url', label: 'API URL', type: 'text' as const },
        { id: 'max-items', label: 'Max Items', type: 'number' as const, default: 100 }
      ]
      expect(() => pluginManifestSchema.parse(validManifest({ preferences }))).not.toThrow()
    })

    it('rejects more than 20 preferences', () => {
      const preferences = Array.from({ length: 21 }, (_, i) => ({
        id: `pref-${i}`,
        label: `Preference ${i}`,
        type: 'text' as const
      }))
      expect(() => pluginManifestSchema.parse(validManifest({ preferences }))).toThrow()
    })

    it('rejects invalid preference type', () => {
      const preferences = [{ id: 'x', label: 'X', type: 'slider' }]
      expect(() => pluginManifestSchema.parse(validManifest({ preferences }))).toThrow()
    })
  })

  describe('auth', () => {
    it('accepts valid auth types', () => {
      for (const type of ['oauth', 'api_key', 'none'] as const) {
        expect(() => pluginManifestSchema.parse(validManifest({ auth: { type } }))).not.toThrow()
      }
    })

    it('accepts auth with providerId', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ auth: { type: 'oauth', providerId: 'google' } }))).not.toThrow()
    })

    it('defaults auth type to api_key', () => {
      const result = pluginManifestSchema.parse(validManifest({ auth: {} }))
      expect(result.auth?.type).toBe('api_key')
    })
  })

  describe('optional URL fields', () => {
    it('accepts valid homepage and repository URLs', () => {
      expect(() => pluginManifestSchema.parse(validManifest({
        homepage: 'https://example.com',
        repository: 'https://github.com/user/repo'
      }))).not.toThrow()
    })

    it('rejects invalid homepage URL', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ homepage: 'not-a-url' }))).toThrow()
    })

    it('rejects invalid repository URL', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ repository: 'not-a-url' }))).toThrow()
    })
  })

  describe('app version constraints', () => {
    it('accepts valid minAppVersion and maxAppVersion', () => {
      expect(() => pluginManifestSchema.parse(validManifest({
        minAppVersion: '1.0.0',
        maxAppVersion: '2.0.0'
      }))).not.toThrow()
    })

    it('rejects non-semver minAppVersion', () => {
      expect(() => pluginManifestSchema.parse(validManifest({ minAppVersion: '1.0' }))).toThrow()
    })
  })
})

describe('validateManifest', () => {
  it('returns success with data for valid manifest', () => {
    const result = validateManifest(validManifest())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('my-plugin')
      expect(result.data.name).toBe('My Plugin')
      expect(result.data.version).toBe('1.0.0')
    }
  })

  it('returns failure with errors for invalid manifest', () => {
    const result = validateManifest({ id: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.issues.length).toBeGreaterThan(0)
    }
  })

  it('returns failure for non-object input', () => {
    const result = validateManifest(null)
    expect(result.success).toBe(false)
  })

  it('returns failure for completely empty object', () => {
    const result = validateManifest({})
    expect(result.success).toBe(false)
  })

  it('preserves all fields on successful parse', () => {
    const input = validManifest({
      icon: 'icon.png',
      capabilities: {
        dataSources: [{ id: 'ds', name: 'DS', entryPoint: 'sync.js' }],
        actions: [{ id: 'act', name: 'Act', entryPoint: 'actions.js' }]
      },
      permissions: { network: ['api.example.com'], ai: true },
      preferences: [{ id: 'pref', label: 'Pref', type: 'toggle' }]
    })
    const result = validateManifest(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.icon).toBe('icon.png')
      expect(result.data.capabilities?.dataSources).toHaveLength(1)
      expect(result.data.capabilities?.actions).toHaveLength(1)
      expect(result.data.permissions?.ai).toBe(true)
      expect(result.data.preferences).toHaveLength(1)
    }
  })
})
