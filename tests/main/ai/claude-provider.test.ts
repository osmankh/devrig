import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// All mock classes and fns must be in vi.hoisted so vi.mock can reference them
// ---------------------------------------------------------------------------
const {
  mockCreate, mockStream,
  MockRateLimitError, MockAuthenticationError, MockBadRequestError,
  MockInternalServerError, MockAPIConnectionError, MockAPIError
} = vi.hoisted(() => {
  const mockCreate = vi.fn()
  const mockStream = vi.fn()

  class MockRateLimitError extends Error {
    status = 429
    headers: Record<string, string> = {}
    constructor(msg = 'Rate limited') {
      super(msg)
      this.name = 'RateLimitError'
    }
  }

  class MockAuthenticationError extends Error {
    status = 401
    constructor(msg = 'Auth failed') {
      super(msg)
      this.name = 'AuthenticationError'
    }
  }

  class MockBadRequestError extends Error {
    status = 400
    constructor(msg = 'Bad request') {
      super(msg)
      this.name = 'BadRequestError'
    }
  }

  class MockInternalServerError extends Error {
    status = 500
    constructor(msg = 'Server error') {
      super(msg)
      this.name = 'InternalServerError'
    }
  }

  class MockAPIConnectionError extends Error {
    constructor(msg = 'Connection error') {
      super(msg)
      this.name = 'APIConnectionError'
    }
  }

  class MockAPIError extends Error {
    status: number
    constructor(msg = 'API error', status = 500) {
      super(msg)
      this.name = 'APIError'
      this.status = status
    }
  }

  return {
    mockCreate, mockStream,
    MockRateLimitError, MockAuthenticationError, MockBadRequestError,
    MockInternalServerError, MockAPIConnectionError, MockAPIError
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate, stream: mockStream }
    constructor(_opts: unknown) {}
    static RateLimitError = MockRateLimitError
    static AuthenticationError = MockAuthenticationError
    static BadRequestError = MockBadRequestError
    static InternalServerError = MockInternalServerError
    static APIConnectionError = MockAPIConnectionError
    static APIError = MockAPIError
  }
  return {
    default: MockAnthropic,
    RateLimitError: MockRateLimitError,
    AuthenticationError: MockAuthenticationError,
    BadRequestError: MockBadRequestError,
    InternalServerError: MockInternalServerError,
    APIConnectionError: MockAPIConnectionError,
    APIError: MockAPIError
  }
})

import { ClaudeProvider } from '../../../src/main/ai/providers/claude-provider'
import { AIProviderError } from '../../../src/main/ai/provider-interface'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCompletionResponse(text = 'Hello', overrides: Partial<{
  model: string; input_tokens: number; output_tokens: number; stop_reason: string
}> = {}) {
  return {
    content: [{ type: 'text', text }],
    model: overrides.model ?? 'claude-sonnet-4-5',
    usage: {
      input_tokens: overrides.input_tokens ?? 100,
      output_tokens: overrides.output_tokens ?? 50
    },
    stop_reason: overrides.stop_reason ?? 'end_turn'
  }
}

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider
  const mockGetApiKey = vi.fn<() => Promise<string | null>>()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKey.mockResolvedValue('sk-test-key')
    provider = new ClaudeProvider(mockGetApiKey)
  })

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------
  it('has correct id and name', () => {
    expect(provider.id).toBe('claude')
    expect(provider.name).toBe('Anthropic Claude')
  })

  it('has models list', () => {
    expect(provider.models.length).toBeGreaterThan(0)
    expect(provider.models[0]).toHaveProperty('id')
    expect(provider.models[0]).toHaveProperty('contextWindow')
  })

  // -----------------------------------------------------------------------
  // complete()
  // -----------------------------------------------------------------------
  describe('complete', () => {
    it('sends completion request', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('World'))

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      })

      expect(result.content).toBe('World')
      expect(result.model).toBe('claude-sonnet-4-5')
      expect(result.inputTokens).toBe(100)
      expect(result.outputTokens).toBe(50)
      expect(result.stopReason).toBe('end_turn')
    })

    it('uses default model when not specified', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-5' })
      )
    })

    it('uses custom model when specified', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'claude-haiku-3-5'
      })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-3-5' })
      )
    })

    it('passes system prompt', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        systemPrompt: 'You are helpful'
      })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'You are helpful' })
      )
    })

    it('filters out system messages from messages array', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({
        messages: [
          { role: 'system', content: 'Ignored' },
          { role: 'user', content: 'Hello' }
        ]
      })
      const call = mockCreate.mock.calls[0][0]
      expect(call.messages).toEqual([{ role: 'user', content: 'Hello' }])
    })

    it('maps max_tokens stop reason', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('...', { stop_reason: 'max_tokens' }))
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }]
      })
      expect(result.stopReason).toBe('max_tokens')
    })

    it('maps stop_sequence stop reason', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('...', { stop_reason: 'stop_sequence' }))
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }]
      })
      expect(result.stopReason).toBe('stop_sequence')
    })

    it('maps unknown stop reason to end_turn', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('...', { stop_reason: 'unknown' }))
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }]
      })
      expect(result.stopReason).toBe('end_turn')
    })

    it('throws when no API key', async () => {
      mockGetApiKey.mockResolvedValue(null)
      provider.resetClient()

      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      ).rejects.toThrow(AIProviderError)
    })

    it('throws with authentication_failed code when no key', async () => {
      mockGetApiKey.mockResolvedValue(null)
      provider.resetClient()

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
        expect.fail('Should have thrown')
      } catch (err) {
        expect((err as AIProviderError).code).toBe('authentication_failed')
      }
    })

    it('caches client across calls', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({ messages: [{ role: 'user', content: '1' }] })
      await provider.complete({ messages: [{ role: 'user', content: '2' }] })
      // getApiKey only called once because client is cached
      expect(mockGetApiKey).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // classify()
  // -----------------------------------------------------------------------
  describe('classify', () => {
    it('classifies items using completion', async () => {
      const classifyResult = JSON.stringify([
        { itemId: 'i1', label: 'important', confidence: 0.95, reasoning: 'Critical bug' }
      ])
      mockCreate.mockResolvedValue(makeCompletionResponse(classifyResult))

      const result = await provider.classify({
        items: [{ id: 'i1', title: 'Bug report', body: 'App crashes' }],
        labels: ['important', 'fyi']
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].label).toBe('important')
      expect(result.results[0].confidence).toBe(0.95)
    })

    it('uses haiku model by default for classification', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('[]'))
      await provider.classify({ items: [{ id: 'i1', title: 'Test' }], labels: ['a'] })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-3-5' })
      )
    })

    it('includes preview in prompt when available', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('[]'))
      await provider.classify({
        items: [{ id: 'i1', title: 'Test', preview: 'Short preview' }],
        labels: ['a']
      })
      const call = mockCreate.mock.calls[0][0]
      expect(call.messages[0].content).toContain('Short preview')
    })
  })

  // -----------------------------------------------------------------------
  // summarize()
  // -----------------------------------------------------------------------
  describe('summarize', () => {
    it('summarizes content', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('A concise summary.'))

      const result = await provider.summarize({ content: 'Long content here...' })
      expect(result.summary).toBe('A concise summary.')
    })

    it('uses sonnet model by default', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('Summary'))
      await provider.summarize({ content: 'Content' })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-5' })
      )
    })
  })

  // -----------------------------------------------------------------------
  // draft()
  // -----------------------------------------------------------------------
  describe('draft', () => {
    it('drafts response', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('Draft reply'))

      const result = await provider.draft({
        item: { id: 'i1', title: 'Request', body: 'Please help', type: 'email' }
      })
      expect(result.draft).toBe('Draft reply')
    })

    it('uses sonnet model by default', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('Reply'))
      await provider.draft({
        item: { id: 'i1', title: 'T', body: 'B', type: 'email' }
      })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-5' })
      )
    })

    it('passes intent and tone', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse('Reply'))
      await provider.draft({
        item: { id: 'i1', title: 'T', body: 'B', type: 'email' },
        intent: 'decline politely',
        tone: 'casual'
      })
      const call = mockCreate.mock.calls[0][0]
      expect(call.system).toContain('decline politely')
      expect(call.system).toContain('friendly')
    })
  })

  // -----------------------------------------------------------------------
  // isAvailable()
  // -----------------------------------------------------------------------
  describe('isAvailable', () => {
    it('returns true when API key exists', async () => {
      mockGetApiKey.mockResolvedValue('sk-key')
      expect(await provider.isAvailable()).toBe(true)
    })

    it('returns false when API key is null', async () => {
      mockGetApiKey.mockResolvedValue(null)
      expect(await provider.isAvailable()).toBe(false)
    })

    it('returns false when API key is empty', async () => {
      mockGetApiKey.mockResolvedValue('')
      expect(await provider.isAvailable()).toBe(false)
    })

    it('returns false when getApiKey throws', async () => {
      mockGetApiKey.mockRejectedValue(new Error('Decrypt failed'))
      expect(await provider.isAvailable()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // resetClient()
  // -----------------------------------------------------------------------
  describe('resetClient', () => {
    it('clears cached client', async () => {
      mockCreate.mockResolvedValue(makeCompletionResponse())
      await provider.complete({ messages: [{ role: 'user', content: '1' }] })
      expect(mockGetApiKey).toHaveBeenCalledTimes(1)

      provider.resetClient()
      await provider.complete({ messages: [{ role: 'user', content: '2' }] })
      expect(mockGetApiKey).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // Error mapping
  // -----------------------------------------------------------------------
  describe('error mapping', () => {
    it('maps RateLimitError', async () => {
      const err = new MockRateLimitError()
      err.headers = { 'retry-after': '30' }
      mockCreate.mockRejectedValue(err)

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(AIProviderError)
        expect((e as AIProviderError).code).toBe('rate_limited')
        expect((e as AIProviderError).retryable).toBe(true)
        expect((e as AIProviderError).retryAfterMs).toBe(30000)
      }
    })

    it('maps RateLimitError with default retry', async () => {
      const err = new MockRateLimitError()
      err.headers = {}
      mockCreate.mockRejectedValue(err)

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).retryAfterMs).toBe(60000)
      }
    })

    it('maps AuthenticationError', async () => {
      mockCreate.mockRejectedValue(new MockAuthenticationError())

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect(e).toBeInstanceOf(AIProviderError)
        expect((e as AIProviderError).code).toBe('authentication_failed')
        expect((e as AIProviderError).retryable).toBe(false)
      }
    })

    it('maps BadRequestError with token message', async () => {
      mockCreate.mockRejectedValue(new MockBadRequestError('token limit exceeded'))

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('token_limit_exceeded')
      }
    })

    it('maps BadRequestError without token message', async () => {
      mockCreate.mockRejectedValue(new MockBadRequestError('invalid model'))

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('invalid_request')
      }
    })

    it('maps InternalServerError', async () => {
      mockCreate.mockRejectedValue(new MockInternalServerError())

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('provider_unavailable')
        expect((e as AIProviderError).retryable).toBe(true)
      }
    })

    it('maps APIConnectionError', async () => {
      mockCreate.mockRejectedValue(new MockAPIConnectionError())

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('network_error')
        expect((e as AIProviderError).retryable).toBe(true)
      }
    })

    it('maps generic APIError (5xx)', async () => {
      mockCreate.mockRejectedValue(new MockAPIError('Overloaded', 503))

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('unknown')
        expect((e as AIProviderError).retryable).toBe(true)
      }
    })

    it('maps generic APIError (4xx)', async () => {
      mockCreate.mockRejectedValue(new MockAPIError('Not Found', 404))

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect((e as AIProviderError).code).toBe('unknown')
        expect((e as AIProviderError).retryable).toBe(false)
      }
    })

    it('maps unknown error', async () => {
      mockCreate.mockRejectedValue(new Error('Something went wrong'))

      try {
        await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] })
      } catch (e) {
        expect(e).toBeInstanceOf(AIProviderError)
        expect((e as AIProviderError).code).toBe('unknown')
        expect((e as AIProviderError).provider).toBe('claude')
      }
    })
  })
})
