import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing SecretsBridge
vi.mock('electron', () => ({
  safeStorage: {
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString()
      if (!str.startsWith('encrypted:')) throw new Error('Decryption failed')
      return str.slice('encrypted:'.length)
    }),
    isEncryptionAvailable: vi.fn().mockReturnValue(true)
  }
}))

import { SecretsBridge } from '../../../src/main/ai/secrets-bridge'
import { safeStorage } from 'electron'

// ---------------------------------------------------------------------------
// Mock secrets repository
// ---------------------------------------------------------------------------

interface MockSecret {
  name: string
  encryptedValue: string
  provider: string
}

function makeMockSecretsRepo() {
  const store = new Map<string, MockSecret>()

  return {
    _store: store,
    create: vi.fn((data: { name: string; encryptedValue: string; provider: string }) => {
      store.set(data.name, { ...data })
    }),
    getByName: vi.fn((name: string) => store.get(name) ?? undefined),
    update: vi.fn((name: string, data: { encryptedValue: string }) => {
      const existing = store.get(name)
      if (existing) {
        existing.encryptedValue = data.encryptedValue
      }
    }),
    delete: vi.fn((name: string) => {
      const had = store.has(name)
      store.delete(name)
      return had
    }),
    list: vi.fn(() => Array.from(store.values()))
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecretsBridge', () => {
  let repo: ReturnType<typeof makeMockSecretsRepo>
  let bridge: SecretsBridge

  beforeEach(() => {
    repo = makeMockSecretsRepo()
    bridge = new SecretsBridge(repo as any)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  })

  // -----------------------------------------------------------------------
  // Provider keys
  // -----------------------------------------------------------------------

  describe('setProviderKey', () => {
    it('encrypts and stores a new provider key', () => {
      bridge.setProviderKey('claude', 'sk-ant-123')

      expect(safeStorage.encryptString).toHaveBeenCalledWith('sk-ant-123')
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ai_provider_key:claude',
          provider: 'safeStorage'
        })
      )
    })

    it('updates an existing provider key', () => {
      bridge.setProviderKey('claude', 'sk-old')
      bridge.setProviderKey('claude', 'sk-new')

      expect(repo.update).toHaveBeenCalledWith(
        'ai_provider_key:claude',
        expect.objectContaining({ encryptedValue: expect.any(String) })
      )
    })
  })

  describe('getProviderKey', () => {
    it('decrypts and returns the stored key', () => {
      bridge.setProviderKey('claude', 'sk-ant-123')

      const key = bridge.getProviderKey('claude')
      expect(key).toBe('sk-ant-123')
    })

    it('returns null when no key is stored', () => {
      expect(bridge.getProviderKey('nonexistent')).toBeNull()
    })

    it('returns null when encryption is unavailable', () => {
      bridge.setProviderKey('claude', 'sk-ant-123')
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      expect(bridge.getProviderKey('claude')).toBeNull()
    })

    it('returns null on decryption failure', () => {
      // Store a secret, then make decryptString throw
      bridge.setProviderKey('claude', 'sk-ant-123')
      vi.mocked(safeStorage.decryptString).mockImplementationOnce(() => {
        throw new Error('Keychain locked')
      })

      expect(bridge.getProviderKey('claude')).toBeNull()
    })
  })

  describe('getProviderKeyAsync', () => {
    it('returns an async function that resolves to the key', async () => {
      bridge.setProviderKey('claude', 'sk-async-key')

      const getKey = bridge.getProviderKeyAsync('claude')
      const key = await getKey()

      expect(key).toBe('sk-async-key')
    })

    it('returns an async function that resolves to null for missing key', async () => {
      const getKey = bridge.getProviderKeyAsync('missing')
      const key = await getKey()

      expect(key).toBeNull()
    })
  })

  describe('hasProviderKey', () => {
    it('returns true when key exists', () => {
      bridge.setProviderKey('claude', 'sk-123')

      expect(bridge.hasProviderKey('claude')).toBe(true)
    })

    it('returns false when key does not exist', () => {
      expect(bridge.hasProviderKey('nonexistent')).toBe(false)
    })
  })

  describe('removeProviderKey', () => {
    it('removes a stored key and returns true', () => {
      bridge.setProviderKey('claude', 'sk-123')

      expect(bridge.removeProviderKey('claude')).toBe(true)
      expect(bridge.hasProviderKey('claude')).toBe(false)
    })

    it('returns false when key does not exist', () => {
      expect(bridge.removeProviderKey('nonexistent')).toBe(false)
    })
  })

  describe('listConfiguredProviders', () => {
    it('returns empty array when no providers configured', () => {
      expect(bridge.listConfiguredProviders()).toEqual([])
    })

    it('returns provider IDs for all stored AI keys', () => {
      bridge.setProviderKey('claude', 'sk-1')
      bridge.setProviderKey('openai', 'sk-2')
      bridge.setProviderKey('gemini', 'sk-3')

      const providers = bridge.listConfiguredProviders()
      expect(providers).toEqual(['claude', 'openai', 'gemini'])
    })

    it('does not include plugin secrets', () => {
      bridge.setProviderKey('claude', 'sk-1')
      bridge.setPluginSecret('gmail', 'oauth-token', 'token-123')

      const providers = bridge.listConfiguredProviders()
      expect(providers).toEqual(['claude'])
    })
  })

  // -----------------------------------------------------------------------
  // Plugin secrets
  // -----------------------------------------------------------------------

  describe('setPluginSecret', () => {
    it('encrypts and stores a plugin secret', () => {
      bridge.setPluginSecret('gmail', 'oauth-token', 'tok-abc')

      expect(safeStorage.encryptString).toHaveBeenCalledWith('tok-abc')
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'plugin:gmail:oauth-token',
          provider: 'safeStorage'
        })
      )
    })

    it('updates an existing plugin secret', () => {
      bridge.setPluginSecret('gmail', 'oauth-token', 'tok-old')
      bridge.setPluginSecret('gmail', 'oauth-token', 'tok-new')

      expect(repo.update).toHaveBeenCalledWith(
        'plugin:gmail:oauth-token',
        expect.objectContaining({ encryptedValue: expect.any(String) })
      )
    })
  })

  describe('getPluginSecret', () => {
    it('decrypts and returns the stored secret', () => {
      bridge.setPluginSecret('gmail', 'refresh-token', 'rt-123')

      expect(bridge.getPluginSecret('gmail', 'refresh-token')).toBe('rt-123')
    })

    it('returns null when secret does not exist', () => {
      expect(bridge.getPluginSecret('gmail', 'nonexistent')).toBeNull()
    })

    it('returns null when encryption is unavailable', () => {
      bridge.setPluginSecret('gmail', 'token', 'val')
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      expect(bridge.getPluginSecret('gmail', 'token')).toBeNull()
    })

    it('returns null on decryption failure', () => {
      bridge.setPluginSecret('gmail', 'token', 'val')
      vi.mocked(safeStorage.decryptString).mockImplementationOnce(() => {
        throw new Error('Keychain error')
      })

      expect(bridge.getPluginSecret('gmail', 'token')).toBeNull()
    })
  })

  describe('hasPluginSecret', () => {
    it('returns true when secret exists', () => {
      bridge.setPluginSecret('gmail', 'token', 'val')

      expect(bridge.hasPluginSecret('gmail', 'token')).toBe(true)
    })

    it('returns false when secret does not exist', () => {
      expect(bridge.hasPluginSecret('gmail', 'token')).toBe(false)
    })
  })

  describe('removePluginSecret', () => {
    it('removes a stored secret and returns true', () => {
      bridge.setPluginSecret('gmail', 'token', 'val')

      expect(bridge.removePluginSecret('gmail', 'token')).toBe(true)
      expect(bridge.hasPluginSecret('gmail', 'token')).toBe(false)
    })

    it('returns false when secret does not exist', () => {
      expect(bridge.removePluginSecret('gmail', 'token')).toBe(false)
    })
  })

  describe('listPluginSecrets', () => {
    it('returns empty array when no secrets stored for plugin', () => {
      expect(bridge.listPluginSecrets('gmail')).toEqual([])
    })

    it('returns secret key names for a plugin', () => {
      bridge.setPluginSecret('gmail', 'oauth-token', 'tok-1')
      bridge.setPluginSecret('gmail', 'refresh-token', 'tok-2')
      bridge.setPluginSecret('gmail', 'client-id', 'cid')

      const keys = bridge.listPluginSecrets('gmail')
      expect(keys).toEqual(['oauth-token', 'refresh-token', 'client-id'])
    })

    it('does not include secrets from other plugins', () => {
      bridge.setPluginSecret('gmail', 'token', 'val1')
      bridge.setPluginSecret('github', 'token', 'val2')

      expect(bridge.listPluginSecrets('gmail')).toEqual(['token'])
      expect(bridge.listPluginSecrets('github')).toEqual(['token'])
    })

    it('does not include provider keys', () => {
      bridge.setProviderKey('claude', 'sk-1')
      bridge.setPluginSecret('gmail', 'token', 'val')

      expect(bridge.listPluginSecrets('gmail')).toEqual(['token'])
    })
  })

  // -----------------------------------------------------------------------
  // Cross-cutting: isolation between provider keys and plugin secrets
  // -----------------------------------------------------------------------

  describe('isolation', () => {
    it('provider and plugin secrets use separate namespaces', () => {
      bridge.setProviderKey('claude', 'provider-key')
      bridge.setPluginSecret('claude', 'key', 'plugin-key')

      expect(bridge.getProviderKey('claude')).toBe('provider-key')
      expect(bridge.getPluginSecret('claude', 'key')).toBe('plugin-key')
    })

    it('removing provider key does not affect plugin secrets', () => {
      bridge.setProviderKey('claude', 'pk')
      bridge.setPluginSecret('claude', 'token', 'pt')

      bridge.removeProviderKey('claude')

      expect(bridge.getPluginSecret('claude', 'token')).toBe('pt')
    })

    it('removing plugin secret does not affect provider key', () => {
      bridge.setProviderKey('claude', 'pk')
      bridge.setPluginSecret('claude', 'token', 'pt')

      bridge.removePluginSecret('claude', 'token')

      expect(bridge.getProviderKey('claude')).toBe('pk')
    })
  })
})
