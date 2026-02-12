import { describe, it, expect, vi } from 'vitest'
import { ModelRouter } from '../../../src/main/ai/model-router'
import { AIProviderRegistry } from '../../../src/main/ai/provider-registry'
import type { AIProvider, AIModel } from '../../../src/main/ai/provider-interface'
import { AIProviderError } from '../../../src/main/ai/provider-interface'

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

function makeProvider(id: string, models: AIModel[]): AIProvider {
  return {
    id,
    name: `Provider ${id}`,
    models,
    complete: vi.fn(),
    stream: vi.fn(),
    classify: vi.fn(),
    summarize: vi.fn(),
    draft: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true)
  }
}

describe('ModelRouter', () => {
  describe('route setting and getting', () => {
    it('setRoute and getRoutes', () => {
      const registry = new AIProviderRegistry()
      const router = new ModelRouter(registry)

      router.setRoute('classify', 'claude', 'haiku')
      router.setRoute('draft', 'claude', 'sonnet')

      const routes = router.getRoutes()
      expect(routes).toHaveLength(2)
      expect(routes.find(r => r.taskType === 'classify')).toEqual({
        taskType: 'classify',
        providerId: 'claude',
        modelId: 'haiku'
      })
    })

    it('removeRoute clears both route and fallback chain', () => {
      const registry = new AIProviderRegistry()
      const router = new ModelRouter(registry)

      router.setRoute('classify', 'claude', 'haiku')
      router.setFallbackChain({
        taskType: 'classify',
        chain: [{ providerId: 'claude', modelId: 'haiku' }]
      })

      router.removeRoute('classify')
      expect(router.getRoutes()).toHaveLength(0)
      expect(router.getFallbackChains()).toHaveLength(0)
    })
  })

  describe('resolve', () => {
    it('resolves explicit route when provider and model exist', () => {
      const registry = new AIProviderRegistry()
      const model = makeModel({ id: 'haiku' })
      const provider = makeProvider('claude', [model])
      registry.register(provider)

      const router = new ModelRouter(registry)
      router.setRoute('classify', 'claude', 'haiku')

      const result = router.resolve('classify')
      expect(result.provider.id).toBe('claude')
      expect(result.model.id).toBe('haiku')
    })

    it('falls back to default provider when no route matches', () => {
      const registry = new AIProviderRegistry()
      const model = makeModel({ id: 'default-model' })
      const provider = makeProvider('default-provider', [model])
      registry.register(provider)

      const router = new ModelRouter(registry)
      const result = router.resolve('unknown-task')

      expect(result.provider.id).toBe('default-provider')
      expect(result.model.id).toBe('default-model')
    })

    it('falls back to "general" route when task-specific route not found', () => {
      const registry = new AIProviderRegistry()
      const model = makeModel({ id: 'general-model' })
      const provider = makeProvider('my-provider', [model])
      registry.register(provider)

      const router = new ModelRouter(registry)
      router.setRoute('general', 'my-provider', 'general-model')

      const result = router.resolve('some-unknown-task')
      expect(result.model.id).toBe('general-model')
    })

    it('throws when no providers are registered', () => {
      const registry = new AIProviderRegistry()
      const router = new ModelRouter(registry)

      expect(() => router.resolve('anything')).toThrow('No AI provider available')
    })
  })

  describe('completeWithFallback', () => {
    it('tries fallback chain on retryable errors', async () => {
      const registry = new AIProviderRegistry()
      const model1 = makeModel({ id: 'model-1' })
      const model2 = makeModel({ id: 'model-2' })
      const provider = makeProvider('claude', [model1, model2])

      // First call fails with retryable error, second succeeds
      ;(provider.complete as any)
        .mockRejectedValueOnce(new AIProviderError('Rate limited', 'rate_limited', 'claude', true))
        .mockResolvedValueOnce({ content: 'success', model: 'model-2', inputTokens: 10, outputTokens: 20, stopReason: 'end_turn' })

      registry.register(provider)

      const router = new ModelRouter(registry)
      router.setFallbackChain({
        taskType: 'classify',
        chain: [
          { providerId: 'claude', modelId: 'model-1' },
          { providerId: 'claude', modelId: 'model-2' }
        ]
      })

      const result = await router.completeWithFallback('classify', {
        messages: [{ role: 'user', content: 'test' }]
      })

      expect(result.content).toBe('success')
      expect(provider.complete).toHaveBeenCalledTimes(2)
    })

    it('throws non-retryable errors immediately', async () => {
      const registry = new AIProviderRegistry()
      const model = makeModel({ id: 'model-1' })
      const provider = makeProvider('claude', [model])

      ;(provider.complete as any).mockRejectedValueOnce(
        new AIProviderError('Auth failed', 'authentication_failed', 'claude', false)
      )

      registry.register(provider)

      const router = new ModelRouter(registry)
      router.setFallbackChain({
        taskType: 'classify',
        chain: [{ providerId: 'claude', modelId: 'model-1' }]
      })

      await expect(
        router.completeWithFallback('classify', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('Auth failed')
    })
  })
})
