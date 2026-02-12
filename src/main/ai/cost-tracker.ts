// ---------------------------------------------------------------------------
// Cost Tracker — token/cost tracking with daily/monthly budgets
// ---------------------------------------------------------------------------

import type { AIModel } from './provider-interface'
import { AIProviderError } from './provider-interface'
import type { AiOperationsRepository } from '../db/repositories/ai-operations.repository'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostBudget {
  /** Max spend in USD per period. null = unlimited. */
  maxCostUsd: number | null
  /** Max total operations per period. null = unlimited. */
  maxOperations: number | null
}

export interface CostSnapshot {
  costUsd: number
  inputTokens: number
  outputTokens: number
  operationCount: number
}

export interface CostBudgetStatus {
  period: 'daily' | 'monthly'
  budget: CostBudget
  usage: CostSnapshot
  remainingCostUsd: number | null
  remainingOperations: number | null
  /** true if any limit is exceeded. */
  exceeded: boolean
}

// ---------------------------------------------------------------------------
// Cost Tracker
// ---------------------------------------------------------------------------

export class CostTracker {
  private dailyBudget: CostBudget = { maxCostUsd: null, maxOperations: null }
  private monthlyBudget: CostBudget = { maxCostUsd: null, maxOperations: null }

  constructor(private aiOps: AiOperationsRepository) {}

  // ---------------------------------------------------------------------------
  // Budget configuration
  // ---------------------------------------------------------------------------

  setDailyBudget(budget: Partial<CostBudget>): void {
    if (budget.maxCostUsd !== undefined) this.dailyBudget.maxCostUsd = budget.maxCostUsd
    if (budget.maxOperations !== undefined) this.dailyBudget.maxOperations = budget.maxOperations
  }

  setMonthlyBudget(budget: Partial<CostBudget>): void {
    if (budget.maxCostUsd !== undefined) this.monthlyBudget.maxCostUsd = budget.maxCostUsd
    if (budget.maxOperations !== undefined) this.monthlyBudget.maxOperations = budget.maxOperations
  }

  getDailyBudget(): CostBudget {
    return { ...this.dailyBudget }
  }

  getMonthlyBudget(): CostBudget {
    return { ...this.monthlyBudget }
  }

  // ---------------------------------------------------------------------------
  // Cost calculation
  // ---------------------------------------------------------------------------

  /** Calculate cost for a given token count against a model's pricing. */
  estimateCost(
    model: AIModel,
    inputTokens: number,
    outputTokens: number
  ): number {
    return (
      (inputTokens / 1000) * model.inputCostPer1k +
      (outputTokens / 1000) * model.outputCostPer1k
    )
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /** Record a completed AI operation and return the USD cost. */
  record(params: {
    provider: string
    model: string
    modelDef: AIModel
    operation: string
    inputTokens: number
    outputTokens: number
    durationMs?: number
    pluginId?: string
    pipelineId?: string
    inboxItemId?: string
    executionId?: string
  }): number {
    const costUsd = this.estimateCost(
      params.modelDef,
      params.inputTokens,
      params.outputTokens
    )

    this.aiOps.create({
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd,
      durationMs: params.durationMs,
      pluginId: params.pluginId,
      pipelineId: params.pipelineId,
      inboxItemId: params.inboxItemId,
      executionId: params.executionId
    })

    return costUsd
  }

  // ---------------------------------------------------------------------------
  // Budget enforcement
  // ---------------------------------------------------------------------------

  /**
   * Check if the budget allows another operation.
   * Throws `AIProviderError` with code `budget_exceeded` if a limit is hit.
   */
  assertBudget(): void {
    const daily = this.getDailyStatus()
    if (daily.exceeded) {
      throw new AIProviderError(
        `Daily AI budget exceeded (${formatUsd(daily.usage.costUsd)} / ${formatUsd(daily.budget.maxCostUsd)})`,
        'budget_exceeded',
        'cost-tracker'
      )
    }

    const monthly = this.getMonthlyStatus()
    if (monthly.exceeded) {
      throw new AIProviderError(
        `Monthly AI budget exceeded (${formatUsd(monthly.usage.costUsd)} / ${formatUsd(monthly.budget.maxCostUsd)})`,
        'budget_exceeded',
        'cost-tracker'
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Usage snapshots
  // ---------------------------------------------------------------------------

  getDailyStatus(): CostBudgetStatus {
    return this.buildStatus('daily', this.dailyBudget, startOfDay())
  }

  getMonthlyStatus(): CostBudgetStatus {
    return this.buildStatus('monthly', this.monthlyBudget, startOfMonth())
  }

  /** Total usage across all time. */
  getTotalUsage(): CostSnapshot {
    return this.snapshotSince(0)
  }

  /** Usage for a specific plugin in the current month. */
  getPluginMonthlyUsage(pluginId: string): number {
    return this.aiOps.getPluginCost(pluginId, startOfMonth())
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildStatus(
    period: 'daily' | 'monthly',
    budget: CostBudget,
    sinceMs: number
  ): CostBudgetStatus {
    const usage = this.snapshotSince(sinceMs)

    const remainingCostUsd =
      budget.maxCostUsd !== null ? Math.max(0, budget.maxCostUsd - usage.costUsd) : null
    const remainingOperations =
      budget.maxOperations !== null
        ? Math.max(0, budget.maxOperations - usage.operationCount)
        : null

    const exceeded =
      (budget.maxCostUsd !== null && usage.costUsd >= budget.maxCostUsd) ||
      (budget.maxOperations !== null && usage.operationCount >= budget.maxOperations)

    return { period, budget, usage, remainingCostUsd, remainingOperations, exceeded }
  }

  private snapshotSince(sinceMs: number): CostSnapshot {
    const summaries = this.aiOps.getUsageSummary(sinceMs)

    let costUsd = 0
    let inputTokens = 0
    let outputTokens = 0
    let operationCount = 0

    for (const s of summaries) {
      costUsd += s.totalCostUsd
      inputTokens += s.totalInputTokens
      outputTokens += s.totalOutputTokens
      operationCount += s.operationCount
    }

    return { costUsd, inputTokens, outputTokens, operationCount }
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function startOfDay(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfMonth(): number {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatUsd(value: number | null): string {
  if (value === null) return 'unlimited'
  return `$${value.toFixed(2)}`
}
