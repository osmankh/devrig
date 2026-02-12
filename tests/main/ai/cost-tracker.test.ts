import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CostTracker } from '../../../src/main/ai/cost-tracker'
import type { AIModel } from '../../../src/main/ai/provider-interface'

function makeModel(overrides?: Partial<AIModel>): AIModel {
  return {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    contextWindow: 200_000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    capabilities: ['completion'],
    ...overrides
  }
}

function makeMockAiOps() {
  return {
    create: vi.fn().mockReturnValue({ id: 'op-1' }),
    getUsageSummary: vi.fn().mockReturnValue([]),
    getPluginCost: vi.fn().mockReturnValue(0),
    get: vi.fn(),
    list: vi.fn(),
    listByPlugin: vi.fn(),
    listByInboxItem: vi.fn(),
    getOperationCount: vi.fn().mockReturnValue(0),
    deleteOlderThan: vi.fn(),
    log: vi.fn(),
    getUsage: vi.fn(),
    getUsageByProvider: vi.fn(),
    getUsageByPlugin: vi.fn(),
    getDailyUsage: vi.fn(),
    listFiltered: vi.fn()
  }
}

describe('CostTracker', () => {
  let mockAiOps: ReturnType<typeof makeMockAiOps>
  let tracker: CostTracker

  beforeEach(() => {
    mockAiOps = makeMockAiOps()
    tracker = new CostTracker(mockAiOps as any)
  })

  describe('estimateCost', () => {
    it('calculates cost based on token counts and model pricing', () => {
      const model = makeModel({ inputCostPer1k: 0.003, outputCostPer1k: 0.015 })
      const cost = tracker.estimateCost(model, 1000, 500)
      // (1000/1000) * 0.003 + (500/1000) * 0.015 = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4)
    })

    it('returns 0 for zero tokens', () => {
      const model = makeModel()
      expect(tracker.estimateCost(model, 0, 0)).toBe(0)
    })

    it('handles large token counts', () => {
      const model = makeModel({ inputCostPer1k: 0.003, outputCostPer1k: 0.015 })
      const cost = tracker.estimateCost(model, 100_000, 50_000)
      // (100000/1000) * 0.003 + (50000/1000) * 0.015 = 0.3 + 0.75 = 1.05
      expect(cost).toBeCloseTo(1.05, 2)
    })
  })

  describe('record', () => {
    it('records an operation and returns USD cost', () => {
      const model = makeModel({ inputCostPer1k: 0.003, outputCostPer1k: 0.015 })

      const cost = tracker.record({
        provider: 'anthropic',
        model: 'claude-sonnet',
        modelDef: model,
        operation: 'classify',
        inputTokens: 1000,
        outputTokens: 500
      })

      expect(cost).toBeCloseTo(0.0105, 4)
      expect(mockAiOps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-sonnet',
          operation: 'classify',
          inputTokens: 1000,
          outputTokens: 500,
          costUsd: expect.closeTo(0.0105, 4)
        })
      )
    })

    it('passes optional fields to repository', () => {
      const model = makeModel()

      tracker.record({
        provider: 'anthropic',
        model: 'claude-sonnet',
        modelDef: model,
        operation: 'draft',
        inputTokens: 100,
        outputTokens: 200,
        durationMs: 1500,
        pluginId: 'plugin-gmail',
        pipelineId: 'pipeline-1',
        inboxItemId: 'item-1',
        executionId: 'exec-1'
      })

      expect(mockAiOps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: 1500,
          pluginId: 'plugin-gmail',
          pipelineId: 'pipeline-1',
          inboxItemId: 'item-1',
          executionId: 'exec-1'
        })
      )
    })
  })

  describe('budget configuration', () => {
    it('sets and gets daily budget', () => {
      tracker.setDailyBudget({ maxCostUsd: 5.0, maxOperations: 100 })
      const budget = tracker.getDailyBudget()
      expect(budget.maxCostUsd).toBe(5.0)
      expect(budget.maxOperations).toBe(100)
    })

    it('sets and gets monthly budget', () => {
      tracker.setMonthlyBudget({ maxCostUsd: 50.0 })
      const budget = tracker.getMonthlyBudget()
      expect(budget.maxCostUsd).toBe(50.0)
      expect(budget.maxOperations).toBeNull() // not set
    })

    it('defaults to null (unlimited) budgets', () => {
      expect(tracker.getDailyBudget().maxCostUsd).toBeNull()
      expect(tracker.getDailyBudget().maxOperations).toBeNull()
    })
  })

  describe('usage aggregation', () => {
    it('aggregates usage from repository summaries', () => {
      mockAiOps.getUsageSummary.mockReturnValue([
        { provider: 'anthropic', totalInputTokens: 5000, totalOutputTokens: 2000, totalCostUsd: 0.05, operationCount: 10 },
        { provider: 'openai', totalInputTokens: 3000, totalOutputTokens: 1000, totalCostUsd: 0.03, operationCount: 5 }
      ])

      const usage = tracker.getTotalUsage()
      expect(usage.inputTokens).toBe(8000)
      expect(usage.outputTokens).toBe(3000)
      expect(usage.costUsd).toBeCloseTo(0.08, 4)
      expect(usage.operationCount).toBe(15)
    })

    it('returns zero for empty summaries', () => {
      mockAiOps.getUsageSummary.mockReturnValue([])

      const usage = tracker.getTotalUsage()
      expect(usage.inputTokens).toBe(0)
      expect(usage.outputTokens).toBe(0)
      expect(usage.costUsd).toBe(0)
      expect(usage.operationCount).toBe(0)
    })
  })

  describe('budget status', () => {
    it('reports not exceeded when under budget', () => {
      tracker.setDailyBudget({ maxCostUsd: 10.0, maxOperations: 100 })
      mockAiOps.getUsageSummary.mockReturnValue([
        { provider: 'anthropic', totalInputTokens: 1000, totalOutputTokens: 500, totalCostUsd: 1.0, operationCount: 5 }
      ])

      const status = tracker.getDailyStatus()
      expect(status.exceeded).toBe(false)
      expect(status.remainingCostUsd).toBeCloseTo(9.0, 2)
      expect(status.remainingOperations).toBe(95)
    })

    it('reports exceeded when cost exceeds budget', () => {
      tracker.setDailyBudget({ maxCostUsd: 1.0 })
      mockAiOps.getUsageSummary.mockReturnValue([
        { provider: 'anthropic', totalInputTokens: 10000, totalOutputTokens: 5000, totalCostUsd: 2.0, operationCount: 20 }
      ])

      const status = tracker.getDailyStatus()
      expect(status.exceeded).toBe(true)
      expect(status.remainingCostUsd).toBe(0)
    })

    it('reports not exceeded when no budget set (unlimited)', () => {
      mockAiOps.getUsageSummary.mockReturnValue([
        { provider: 'anthropic', totalInputTokens: 100000, totalOutputTokens: 50000, totalCostUsd: 100.0, operationCount: 500 }
      ])

      const status = tracker.getDailyStatus()
      expect(status.exceeded).toBe(false)
      expect(status.remainingCostUsd).toBeNull()
      expect(status.remainingOperations).toBeNull()
    })
  })

  describe('assertBudget', () => {
    it('does not throw when under budget', () => {
      tracker.setDailyBudget({ maxCostUsd: 10.0 })
      tracker.setMonthlyBudget({ maxCostUsd: 100.0 })
      mockAiOps.getUsageSummary.mockReturnValue([])

      expect(() => tracker.assertBudget()).not.toThrow()
    })

    it('throws when daily budget exceeded', () => {
      tracker.setDailyBudget({ maxCostUsd: 1.0 })
      mockAiOps.getUsageSummary.mockReturnValue([
        { provider: 'anthropic', totalInputTokens: 10000, totalOutputTokens: 5000, totalCostUsd: 2.0, operationCount: 20 }
      ])

      expect(() => tracker.assertBudget()).toThrow('Daily AI budget exceeded')
    })

    it('throws when monthly budget exceeded', () => {
      tracker.setMonthlyBudget({ maxCostUsd: 5.0 })
      // Daily returns under budget
      mockAiOps.getUsageSummary
        .mockReturnValueOnce([]) // daily check
        .mockReturnValueOnce([
          { provider: 'anthropic', totalInputTokens: 100000, totalOutputTokens: 50000, totalCostUsd: 10.0, operationCount: 100 }
        ]) // monthly check

      expect(() => tracker.assertBudget()).toThrow('Monthly AI budget exceeded')
    })
  })

  describe('getPluginMonthlyUsage', () => {
    it('delegates to repository getPluginCost', () => {
      mockAiOps.getPluginCost.mockReturnValue(3.50)

      const usage = tracker.getPluginMonthlyUsage('plugin-gmail')
      expect(usage).toBe(3.50)
      expect(mockAiOps.getPluginCost).toHaveBeenCalledWith('plugin-gmail', expect.any(Number))
    })
  })
})
