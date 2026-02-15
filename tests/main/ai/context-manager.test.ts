import { describe, it, expect, beforeEach } from 'vitest'
import {
  ContextManager,
  estimateTokens,
  type ContextSource,
  type ContextBudget
} from '../../../src/main/ai/context-manager'
import type { AIMessage, AIModel } from '../../../src/main/ai/provider-interface'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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

function makeSource(key: string, overrides?: Partial<ContextSource>): ContextSource {
  return {
    key,
    content: `Content for ${key}`,
    priority: 50,
    ...overrides
  }
}

function makeMessage(role: AIMessage['role'], content: string): AIMessage {
  return { role, content }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1) // 3/4 = 0.75 → ceil = 1
    expect(estimateTokens('abcde')).toBe(2) // 5/4 = 1.25 → ceil = 2
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('ContextManager', () => {
  let cm: ContextManager

  beforeEach(() => {
    cm = new ContextManager()
  })

  // -----------------------------------------------------------------------
  // Budget
  // -----------------------------------------------------------------------

  describe('setBudget / getBudget', () => {
    it('has default budget values', () => {
      const budget = cm.getBudget()
      expect(budget.maxContextTokens).toBe(100_000)
      expect(budget.reservedOutputTokens).toBe(4096)
    })

    it('updates maxContextTokens only', () => {
      cm.setBudget({ maxContextTokens: 50_000 })
      const budget = cm.getBudget()
      expect(budget.maxContextTokens).toBe(50_000)
      expect(budget.reservedOutputTokens).toBe(4096) // unchanged
    })

    it('updates reservedOutputTokens only', () => {
      cm.setBudget({ reservedOutputTokens: 8192 })
      const budget = cm.getBudget()
      expect(budget.maxContextTokens).toBe(100_000) // unchanged
      expect(budget.reservedOutputTokens).toBe(8192)
    })

    it('updates both at once', () => {
      cm.setBudget({ maxContextTokens: 200_000, reservedOutputTokens: 1024 })
      const budget = cm.getBudget()
      expect(budget.maxContextTokens).toBe(200_000)
      expect(budget.reservedOutputTokens).toBe(1024)
    })

    it('returns a copy (mutations do not affect internal state)', () => {
      const budget = cm.getBudget()
      budget.maxContextTokens = 999
      expect(cm.getBudget().maxContextTokens).toBe(100_000)
    })
  })

  // -----------------------------------------------------------------------
  // System context
  // -----------------------------------------------------------------------

  describe('addSystemContext / removeSystemContext / getSystemContextKeys', () => {
    it('adds and lists system context keys', () => {
      cm.addSystemContext(makeSource('user-profile'))
      cm.addSystemContext(makeSource('workspace-rules'))

      expect(cm.getSystemContextKeys()).toEqual(['user-profile', 'workspace-rules'])
    })

    it('deduplicates by key on add', () => {
      cm.addSystemContext(makeSource('profile', { content: 'v1' }))
      cm.addSystemContext(makeSource('profile', { content: 'v2' }))

      expect(cm.getSystemContextKeys()).toEqual(['profile'])
    })

    it('removes system context by key', () => {
      cm.addSystemContext(makeSource('a'))
      cm.addSystemContext(makeSource('b'))
      cm.removeSystemContext('a')

      expect(cm.getSystemContextKeys()).toEqual(['b'])
    })

    it('is a no-op to remove a key that does not exist', () => {
      cm.addSystemContext(makeSource('a'))
      cm.removeSystemContext('nonexistent')

      expect(cm.getSystemContextKeys()).toEqual(['a'])
    })
  })

  // -----------------------------------------------------------------------
  // build()
  // -----------------------------------------------------------------------

  describe('build', () => {
    it('includes system context in the system prompt', () => {
      cm.addSystemContext(makeSource('profile', { content: 'User is a developer', priority: 100 }))
      cm.addSystemContext(makeSource('rules', { content: 'Be concise', priority: 90 }))

      const model = makeModel({ contextWindow: 100_000 })
      const result = cm.build([], model)

      expect(result.systemPrompt).toContain('User is a developer')
      expect(result.systemPrompt).toContain('Be concise')
    })

    it('includes extra sources in system prompt', () => {
      const extra = makeSource('thread-context', {
        content: 'Previous conversation thread',
        priority: 80
      })

      const model = makeModel({ contextWindow: 100_000 })
      const result = cm.build([], model, [extra])

      expect(result.systemPrompt).toContain('Previous conversation thread')
    })

    it('sorts sources by priority (highest first)', () => {
      cm.addSystemContext(makeSource('low', { content: 'LOW', priority: 10 }))
      cm.addSystemContext(makeSource('high', { content: 'HIGH', priority: 100 }))

      const model = makeModel({ contextWindow: 100_000 })
      const result = cm.build([], model)

      const highIdx = result.systemPrompt.indexOf('HIGH')
      const lowIdx = result.systemPrompt.indexOf('LOW')
      expect(highIdx).toBeLessThan(lowIdx)
    })

    it('respects the 40% system context budget limit', () => {
      // Model has 10,000 context window, reserved output = 0 → budget = 10,000
      // 40% of 10,000 = 4,000 tokens for system context
      cm.setBudget({ reservedOutputTokens: 0, maxContextTokens: 10_000 })
      const model = makeModel({ contextWindow: 10_000 })

      // Each source: 4 chars/token → need content of ~16,000 chars = 4,000 tokens
      // Add a source that fits (3,000 tokens)
      cm.addSystemContext(makeSource('fits', {
        content: 'a'.repeat(12_000), // ~3,000 tokens
        priority: 100
      }))
      // Add another that would push over 40% budget
      cm.addSystemContext(makeSource('too-much', {
        content: 'b'.repeat(8_000), // ~2,000 tokens — total would be 5,000 > 4,000
        priority: 50
      }))

      const result = cm.build([], model)

      expect(result.systemPrompt).toContain('a'.repeat(100)) // first source included
      expect(result.systemPrompt).not.toContain('bbb') // second source excluded
    })

    it('uses tokenEstimate when provided instead of heuristic', () => {
      cm.setBudget({ reservedOutputTokens: 0, maxContextTokens: 1000 })
      const model = makeModel({ contextWindow: 1000 })

      // 40% of 1000 = 400 token budget for system context
      // This source has short content but claims 500 tokens — should be excluded
      cm.addSystemContext(makeSource('big', {
        content: 'small text',
        priority: 100,
        tokenEstimate: 500
      }))

      const result = cm.build([], model)

      expect(result.systemPrompt).toBe('') // excluded due to tokenEstimate > 400
    })

    it('passes through messages unchanged when within budget', () => {
      const model = makeModel({ contextWindow: 100_000 })
      const messages = [
        makeMessage('user', 'Hello'),
        makeMessage('assistant', 'Hi there'),
        makeMessage('user', 'How are you?')
      ]

      const result = cm.build(messages, model)

      expect(result.messages).toEqual(messages)
    })

    it('trims oldest messages when they exceed remaining budget', () => {
      // Budget: tiny context window forces trimming
      cm.setBudget({ reservedOutputTokens: 0, maxContextTokens: 40 })
      const model = makeModel({ contextWindow: 40 })

      // No system context → systemTokens = 0, remainingBudget = 40 tokens
      // Each message ~25 tokens (100 chars / 4). Three messages = ~75 tokens > 40 → trimming
      const messages = [
        makeMessage('user', 'a'.repeat(100)),       // ~25 tokens
        makeMessage('assistant', 'b'.repeat(100)),   // ~25 tokens
        makeMessage('user', 'c'.repeat(100))         // ~25 tokens — kept (last)
      ]

      const result = cm.build(messages, model)

      // Last message is always kept; first should be trimmed (only 15 tokens remaining for older)
      expect(result.messages.length).toBeLessThan(3)
      expect(result.messages[result.messages.length - 1].content).toContain('c'.repeat(50))
    })

    it('truncates the last message when it alone exceeds budget', () => {
      cm.setBudget({ reservedOutputTokens: 0, maxContextTokens: 20 })
      const model = makeModel({ contextWindow: 20 })
      // 40% for system = 8 tokens, remaining = 12 tokens for messages
      // 12 tokens * 4 chars = 48 chars max

      const messages = [
        makeMessage('user', 'x'.repeat(200)) // ~50 tokens, way over 12
      ]

      const result = cm.build(messages, model)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toContain('[content truncated]')
      expect(result.messages[0].content.length).toBeLessThan(200)
    })

    it('returns estimatedTokens in the result', () => {
      const model = makeModel({ contextWindow: 100_000 })
      cm.addSystemContext(makeSource('ctx', { content: 'Hello world', priority: 100 }))

      const result = cm.build(
        [makeMessage('user', 'Test message')],
        model
      )

      expect(result.estimatedTokens).toBeGreaterThan(0)
    })

    it('uses model contextWindow minus reservedOutputTokens as budget cap', () => {
      // maxContextTokens = 100,000 but model only has 8,000 window
      // reservedOutputTokens = 4,096 → effective budget = 8,000 - 4,096 = 3,904
      const model = makeModel({ contextWindow: 8_000 })

      // Add a source that fits in 100k budget but not in 3,904 * 0.4 = 1,561 tokens
      cm.addSystemContext(makeSource('big', {
        content: 'x'.repeat(8_000), // ~2,000 tokens > 1,561
        priority: 100
      }))

      const result = cm.build([], model)

      expect(result.systemPrompt).toBe('') // source too big for model budget
    })

    it('handles empty messages array', () => {
      const model = makeModel({ contextWindow: 100_000 })
      const result = cm.build([], model)

      expect(result.messages).toEqual([])
      expect(result.systemPrompt).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // budgetForModel
  // -----------------------------------------------------------------------

  describe('budgetForModel', () => {
    it('returns budget capped by model contextWindow', () => {
      const model = makeModel({ contextWindow: 8_000 })

      const budget = cm.budgetForModel(model)

      expect(budget.maxContextTokens).toBe(8_000 - 4096) // 3,904
      expect(budget.reservedOutputTokens).toBe(4096)
    })

    it('respects desiredOutputTokens override', () => {
      const model = makeModel({ contextWindow: 10_000 })

      const budget = cm.budgetForModel(model, 2000)

      expect(budget.maxContextTokens).toBe(8_000) // 10,000 - 2,000
      expect(budget.reservedOutputTokens).toBe(2000)
    })

    it('uses default maxContextTokens when model has large window', () => {
      cm.setBudget({ maxContextTokens: 50_000 })
      const model = makeModel({ contextWindow: 200_000 })

      const budget = cm.budgetForModel(model)

      // min(50,000, 200,000 - 4,096) = 50,000
      expect(budget.maxContextTokens).toBe(50_000)
    })
  })
})
