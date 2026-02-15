import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ipc-security
// ---------------------------------------------------------------------------
const handlers: Record<string, Function> = {}

vi.mock('../../../src/main/ipc-security', () => ({
  secureHandle: vi.fn((channel: string, handler: Function) => {
    handlers[channel] = handler
  })
}))

import { registerAIHandlers } from '../../../src/main/ipc/ai-handlers'

// ---------------------------------------------------------------------------
// Mock provider, registry, secrets
// ---------------------------------------------------------------------------
function makeMockProvider() {
  return {
    id: 'claude',
    name: 'Anthropic Claude',
    models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
    classify: vi.fn(),
    summarize: vi.fn(),
    draft: vi.fn(),
    complete: vi.fn(),
    isAvailable: vi.fn()
  }
}

function makeMockRepos() {
  return {
    inbox: {
      get: vi.fn(),
      update: vi.fn()
    },
    aiOperations: {
      create: vi.fn(),
      getUsageSummary: vi.fn(() => [])
    }
  }
}

function makeMockRegistry() {
  return {
    setDefault: vi.fn(),
    get: vi.fn()
  }
}

function makeMockSecretsBridge() {
  return {
    setProviderKey: vi.fn(),
    hasProviderKey: vi.fn(() => false)
  }
}

describe('ai-handlers', () => {
  let provider: ReturnType<typeof makeMockProvider>
  let repos: ReturnType<typeof makeMockRepos>
  let registry: ReturnType<typeof makeMockRegistry>
  let secretsBridge: ReturnType<typeof makeMockSecretsBridge>
  let getProvider: () => ReturnType<typeof makeMockProvider> | null
  const evt = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    provider = makeMockProvider()
    repos = makeMockRepos()
    registry = makeMockRegistry()
    secretsBridge = makeMockSecretsBridge()
    getProvider = () => provider
    registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)
  })

  // -----------------------------------------------------------------------
  // ai:getProviders
  // -----------------------------------------------------------------------
  describe('ai:getProviders', () => {
    it('returns provider info', () => {
      const result = handlers['ai:getProviders'](evt)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('claude')
      expect(result.data[0].isDefault).toBe(true)
    })

    it('returns empty array when no provider', () => {
      getProvider = () => null
      Object.keys(handlers).forEach((k) => delete handlers[k])
      registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)

      const result = handlers['ai:getProviders'](evt)
      expect(result).toEqual({ data: [] })
    })
  })

  // -----------------------------------------------------------------------
  // ai:setProvider
  // -----------------------------------------------------------------------
  describe('ai:setProvider', () => {
    it('sets default provider', () => {
      const result = handlers['ai:setProvider'](evt, 'claude')
      expect(result).toEqual({ data: true })
      expect(registry.setDefault).toHaveBeenCalledWith('claude')
    })

    it('rejects invalid id', () => {
      const result = handlers['ai:setProvider'](evt, 42)
      expect(result).toEqual({ error: 'Invalid provider id', code: 'VALIDATION' })
    })

    it('handles registry error', () => {
      registry.setDefault.mockImplementation(() => {
        throw new Error('Provider not found')
      })
      const result = handlers['ai:setProvider'](evt, 'openai')
      expect(result).toEqual({ error: 'Provider not found', code: 'SET_PROVIDER_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:classify
  // -----------------------------------------------------------------------
  describe('ai:classify', () => {
    it('classifies items', async () => {
      repos.inbox.get.mockReturnValue({ id: 'i1', title: 'Test', body: 'Body' })
      provider.classify.mockResolvedValue({
        results: [{ itemId: 'i1', label: 'important', confidence: 0.9 }],
        model: 'claude-haiku-3-5',
        inputTokens: 100,
        outputTokens: 50
      })

      const result = await handlers['ai:classify'](evt, ['i1'])
      expect(result).toEqual({ data: true })
      expect(repos.inbox.update).toHaveBeenCalledWith('i1', expect.objectContaining({
        aiClassification: expect.any(String)
      }))
      expect(repos.aiOperations.create).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'classify'
      }))
    })

    it('rejects empty array', async () => {
      const result = await handlers['ai:classify'](evt, [])
      expect(result).toEqual({ error: 'Invalid item ids', code: 'VALIDATION' })
    })

    it('rejects non-array', async () => {
      const result = await handlers['ai:classify'](evt, 'not-array')
      expect(result).toEqual({ error: 'Invalid item ids', code: 'VALIDATION' })
    })

    it('returns error when no provider', async () => {
      getProvider = () => null
      Object.keys(handlers).forEach((k) => delete handlers[k])
      registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)

      const result = await handlers['ai:classify'](evt, ['i1'])
      expect(result).toEqual({ error: 'No AI provider configured', code: 'NO_PROVIDER' })
    })

    it('returns not-found when no items match', async () => {
      repos.inbox.get.mockReturnValue(undefined)
      const result = await handlers['ai:classify'](evt, ['missing'])
      expect(result).toEqual({ error: 'No items found', code: 'NOT_FOUND' })
    })

    it('handles classify error', async () => {
      repos.inbox.get.mockReturnValue({ id: 'i1', title: 'Test' })
      provider.classify.mockRejectedValue(new Error('API error'))
      const result = await handlers['ai:classify'](evt, ['i1'])
      expect(result).toEqual({ error: 'API error', code: 'UNKNOWN' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:summarize
  // -----------------------------------------------------------------------
  describe('ai:summarize', () => {
    it('summarizes item', async () => {
      repos.inbox.get.mockReturnValue({ id: 'i1', title: 'Bug Report', body: 'Details here' })
      provider.summarize.mockResolvedValue({
        summary: 'A bug was reported.',
        model: 'claude-sonnet-4-5',
        inputTokens: 200,
        outputTokens: 30
      })

      const result = await handlers['ai:summarize'](evt, 'i1')
      expect(result).toEqual({ data: 'A bug was reported.' })
      expect(repos.inbox.update).toHaveBeenCalledWith('i1', { aiSummary: 'A bug was reported.' })
    })

    it('rejects invalid id', async () => {
      const result = await handlers['ai:summarize'](evt, 42)
      expect(result).toEqual({ error: 'Invalid item id', code: 'VALIDATION' })
    })

    it('returns error when no provider', async () => {
      getProvider = () => null
      Object.keys(handlers).forEach((k) => delete handlers[k])
      registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)

      const result = await handlers['ai:summarize'](evt, 'i1')
      expect(result).toEqual({ error: 'No AI provider configured', code: 'NO_PROVIDER' })
    })

    it('returns not-found for missing item', async () => {
      repos.inbox.get.mockReturnValue(undefined)
      const result = await handlers['ai:summarize'](evt, 'missing')
      expect(result).toEqual({ error: 'Inbox item not found', code: 'NOT_FOUND' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:draft
  // -----------------------------------------------------------------------
  describe('ai:draft', () => {
    it('drafts response', async () => {
      repos.inbox.get.mockReturnValue({
        id: 'i1', title: 'Feature request', body: 'Please add X', type: 'email'
      })
      provider.draft.mockResolvedValue({
        draft: 'Thanks for the suggestion!',
        model: 'claude-sonnet-4-5',
        inputTokens: 300,
        outputTokens: 50
      })

      const result = await handlers['ai:draft'](evt, 'i1', 'polite decline')
      expect(result).toEqual({ data: 'Thanks for the suggestion!' })
      expect(repos.inbox.update).toHaveBeenCalledWith('i1', {
        aiDraft: 'Thanks for the suggestion!'
      })
    })

    it('works without intent', async () => {
      repos.inbox.get.mockReturnValue({
        id: 'i1', title: 'Test', body: 'Body', type: 'email'
      })
      provider.draft.mockResolvedValue({
        draft: 'Response',
        model: 'claude-sonnet-4-5',
        inputTokens: 100,
        outputTokens: 20
      })

      const result = await handlers['ai:draft'](evt, 'i1', undefined)
      expect(result).toEqual({ data: 'Response' })
    })

    it('rejects invalid id', async () => {
      const result = await handlers['ai:draft'](evt, null, undefined)
      expect(result).toEqual({ error: 'Invalid item id', code: 'VALIDATION' })
    })

    it('returns error when no provider', async () => {
      getProvider = () => null
      Object.keys(handlers).forEach((k) => delete handlers[k])
      registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)

      const result = await handlers['ai:draft'](evt, 'i1', undefined)
      expect(result).toEqual({ error: 'No AI provider configured', code: 'NO_PROVIDER' })
    })

    it('returns not-found for missing item', async () => {
      repos.inbox.get.mockReturnValue(undefined)
      const result = await handlers['ai:draft'](evt, 'missing', undefined)
      expect(result).toEqual({ error: 'Inbox item not found', code: 'NOT_FOUND' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:complete
  // -----------------------------------------------------------------------
  describe('ai:complete', () => {
    it('completes prompt', async () => {
      provider.complete.mockResolvedValue({
        content: 'Hello!',
        model: 'claude-sonnet-4-5',
        inputTokens: 10,
        outputTokens: 5
      })

      const result = await handlers['ai:complete'](evt, 'Say hello')
      expect(result).toEqual({ data: 'Hello!' })
      expect(repos.aiOperations.create).toHaveBeenCalled()
    })

    it('rejects empty prompt', async () => {
      const result = await handlers['ai:complete'](evt, '')
      expect(result).toEqual({ error: 'Invalid prompt', code: 'VALIDATION' })
    })

    it('returns error when no provider', async () => {
      getProvider = () => null
      Object.keys(handlers).forEach((k) => delete handlers[k])
      registerAIHandlers(repos as any, getProvider as any, registry as any, secretsBridge as any)

      const result = await handlers['ai:complete'](evt, 'test')
      expect(result).toEqual({ error: 'No AI provider configured', code: 'NO_PROVIDER' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:getUsage
  // -----------------------------------------------------------------------
  describe('ai:getUsage', () => {
    it('returns usage totals', () => {
      repos.aiOperations.getUsageSummary.mockReturnValue([
        { totalInputTokens: 1000, totalOutputTokens: 500, totalCostUsd: 0.05, operationCount: 10 }
      ])

      const result = handlers['ai:getUsage'](evt, undefined, undefined)
      expect(result.data.total.inputTokens).toBe(1000)
      expect(result.data.total.outputTokens).toBe(500)
      expect(result.data.total.operationCount).toBe(10)
    })

    it('passes since parameter', () => {
      repos.aiOperations.getUsageSummary.mockReturnValue([])
      handlers['ai:getUsage'](evt, 1000000, undefined)
      expect(repos.aiOperations.getUsageSummary).toHaveBeenCalledWith(1000000)
    })

    it('handles no usage data', () => {
      repos.aiOperations.getUsageSummary.mockReturnValue([])
      const result = handlers['ai:getUsage'](evt, undefined, undefined)
      expect(result.data.total.inputTokens).toBe(0)
      expect(result.data.total.operationCount).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // ai:setApiKey
  // -----------------------------------------------------------------------
  describe('ai:setApiKey', () => {
    it('sets API key and resets client', () => {
      const mockProvider = { resetClient: vi.fn() }
      registry.get.mockReturnValue(mockProvider)

      const result = handlers['ai:setApiKey'](evt, 'claude', 'sk-key-123')
      expect(result).toEqual({ data: true })
      expect(secretsBridge.setProviderKey).toHaveBeenCalledWith('claude', 'sk-key-123')
      expect(mockProvider.resetClient).toHaveBeenCalled()
    })

    it('sets API key without resetClient', () => {
      registry.get.mockReturnValue({ id: 'openai' })
      const result = handlers['ai:setApiKey'](evt, 'openai', 'sk-xxx')
      expect(result).toEqual({ data: true })
    })

    it('rejects invalid data', () => {
      const result = handlers['ai:setApiKey'](evt, 42, '')
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('handles error', () => {
      secretsBridge.setProviderKey.mockImplementation(() => {
        throw new Error('Encryption failed')
      })
      const result = handlers['ai:setApiKey'](evt, 'claude', 'key')
      expect(result).toEqual({ error: 'Encryption failed', code: 'SAVE_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:hasApiKey
  // -----------------------------------------------------------------------
  describe('ai:hasApiKey', () => {
    it('returns true when key exists', () => {
      secretsBridge.hasProviderKey.mockReturnValue(true)
      const result = handlers['ai:hasApiKey'](evt, 'claude')
      expect(result).toEqual({ data: true })
    })

    it('returns false when no key', () => {
      secretsBridge.hasProviderKey.mockReturnValue(false)
      const result = handlers['ai:hasApiKey'](evt, 'openai')
      expect(result).toEqual({ data: false })
    })

    it('rejects invalid id', () => {
      const result = handlers['ai:hasApiKey'](evt, 42)
      expect(result).toEqual({ error: 'Invalid provider id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // ai:testConnection
  // -----------------------------------------------------------------------
  describe('ai:testConnection', () => {
    it('returns success on valid connection', async () => {
      const mockProvider = {
        isAvailable: vi.fn().mockResolvedValue(true),
        classify: vi.fn().mockResolvedValue({ results: [] })
      }
      registry.get.mockReturnValue(mockProvider)

      const result = await handlers['ai:testConnection'](evt, 'claude')
      expect(result).toEqual({ data: { success: true } })
    })

    it('returns failure when not available', async () => {
      const mockProvider = { isAvailable: vi.fn().mockResolvedValue(false) }
      registry.get.mockReturnValue(mockProvider)

      const result = await handlers['ai:testConnection'](evt, 'claude')
      expect(result).toEqual({ data: { success: false, error: 'API key not configured' } })
    })

    it('returns failure on classify error', async () => {
      const mockProvider = {
        isAvailable: vi.fn().mockResolvedValue(true),
        classify: vi.fn().mockRejectedValue(new Error('Auth failed'))
      }
      registry.get.mockReturnValue(mockProvider)

      const result = await handlers['ai:testConnection'](evt, 'claude')
      expect(result).toEqual({ data: { success: false, error: 'Auth failed' } })
    })

    it('returns not-found for unknown provider', async () => {
      registry.get.mockReturnValue(undefined)
      const result = await handlers['ai:testConnection'](evt, 'unknown')
      expect(result).toEqual({ error: 'Provider not found', code: 'NOT_FOUND' })
    })

    it('rejects invalid id', async () => {
      const result = await handlers['ai:testConnection'](evt, 42)
      expect(result).toEqual({ error: 'Invalid provider id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('ai:getProviders')
    expect(channels).toContain('ai:setProvider')
    expect(channels).toContain('ai:classify')
    expect(channels).toContain('ai:summarize')
    expect(channels).toContain('ai:draft')
    expect(channels).toContain('ai:complete')
    expect(channels).toContain('ai:getUsage')
    expect(channels).toContain('ai:setApiKey')
    expect(channels).toContain('ai:hasApiKey')
    expect(channels).toContain('ai:testConnection')
  })
})
