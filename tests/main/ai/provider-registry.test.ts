import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIProviderRegistry } from '../../../src/main/ai/provider-registry'
import type { AIProvider, AIModel } from '../../../src/main/ai/provider-interface'

function makeModel(overrides?: Partial<AIModel>): AIModel {
  return {
    id: 'test-model',
    name: 'Test Model',
    contextWindow: 100_000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    capabilities: ['completion'],
    ...overrides
  }
}

function makeProvider(id: string, overrides?: Partial<AIProvider>): AIProvider {
  return {
    id,
    name: `Provider ${id}`,
    models: [makeModel()],
    complete: vi.fn(),
    stream: vi.fn(),
    classify: vi.fn(),
    summarize: vi.fn(),
    draft: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides
  }
}

describe('AIProviderRegistry', () => {
  let registry: AIProviderRegistry

  beforeEach(() => {
    registry = new AIProviderRegistry()
  })

  describe('register', () => {
    it('adds a provider that can be retrieved by id', () => {
      const provider = makeProvider('claude')
      registry.register(provider)

      expect(registry.get('claude')).toBe(provider)
    })

    it('auto-sets the first registered provider as default', () => {
      const provider = makeProvider('claude')
      registry.register(provider)

      expect(registry.getDefault()).toBe(provider)
    })

    it('does not change default when a second provider is registered', () => {
      const first = makeProvider('claude')
      const second = makeProvider('openai')
      registry.register(first)
      registry.register(second)

      expect(registry.getDefault()).toBe(first)
    })

    it('overwrites an existing provider with the same id', () => {
      const original = makeProvider('claude', { name: 'Original' })
      const updated = makeProvider('claude', { name: 'Updated' })

      registry.register(original)
      registry.register(updated)

      expect(registry.get('claude')?.name).toBe('Updated')
      expect(registry.listProviders()).toHaveLength(1)
    })
  })

  describe('unregister', () => {
    it('removes the provider', () => {
      registry.register(makeProvider('claude'))
      registry.unregister('claude')

      expect(registry.get('claude')).toBeUndefined()
    })

    it('resets default to next provider when default is removed', () => {
      const first = makeProvider('claude')
      const second = makeProvider('openai')
      registry.register(first)
      registry.register(second)

      registry.unregister('claude')

      expect(registry.getDefault()).toBe(second)
    })

    it('sets default to null when the last provider is removed', () => {
      registry.register(makeProvider('claude'))
      registry.unregister('claude')

      expect(registry.getDefault()).toBeUndefined()
    })

    it('does not change default when a non-default provider is removed', () => {
      const first = makeProvider('claude')
      registry.register(first)
      registry.register(makeProvider('openai'))

      registry.unregister('openai')

      expect(registry.getDefault()).toBe(first)
    })

    it('is a no-op for unknown ids', () => {
      registry.register(makeProvider('claude'))
      registry.unregister('nonexistent')

      expect(registry.listProviders()).toHaveLength(1)
    })
  })

  describe('get', () => {
    it('returns the provider for a known id', () => {
      const provider = makeProvider('claude')
      registry.register(provider)

      expect(registry.get('claude')).toBe(provider)
    })

    it('returns undefined for an unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })
  })

  describe('getDefault', () => {
    it('returns undefined when no providers are registered', () => {
      expect(registry.getDefault()).toBeUndefined()
    })

    it('returns the first registered provider by default', () => {
      const provider = makeProvider('claude')
      registry.register(provider)

      expect(registry.getDefault()).toBe(provider)
    })
  })

  describe('setDefault', () => {
    it('changes the default provider', () => {
      const first = makeProvider('claude')
      const second = makeProvider('openai')
      registry.register(first)
      registry.register(second)

      registry.setDefault('openai')

      expect(registry.getDefault()).toBe(second)
    })

    it('throws when setting default to an unregistered provider', () => {
      expect(() => registry.setDefault('nonexistent')).toThrow(
        'Provider "nonexistent" is not registered'
      )
    })

    it('throws even after registering and then unregistering', () => {
      registry.register(makeProvider('claude'))
      registry.unregister('claude')

      expect(() => registry.setDefault('claude')).toThrow(
        'Provider "claude" is not registered'
      )
    })
  })

  describe('listProviders', () => {
    it('returns empty array when no providers are registered', () => {
      expect(registry.listProviders()).toEqual([])
    })

    it('returns all registered providers', () => {
      registry.register(makeProvider('claude'))
      registry.register(makeProvider('openai'))
      registry.register(makeProvider('gemini'))

      const providers = registry.listProviders()
      expect(providers).toHaveLength(3)
      expect(providers.map((p) => p.id)).toEqual(['claude', 'openai', 'gemini'])
    })

    it('reflects unregistrations', () => {
      registry.register(makeProvider('claude'))
      registry.register(makeProvider('openai'))
      registry.unregister('claude')

      const providers = registry.listProviders()
      expect(providers).toHaveLength(1)
      expect(providers[0].id).toBe('openai')
    })
  })
})
