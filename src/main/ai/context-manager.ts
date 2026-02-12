// ---------------------------------------------------------------------------
// Context Manager — smart context injection with token budgeting
// ---------------------------------------------------------------------------

import type { AIMessage, AIModel } from './provider-interface'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextSource {
  /** Unique key for deduplication (e.g. "inbox:abc123", "thread:xyz"). */
  key: string
  /** The content to inject. */
  content: string
  /** Priority: higher = more likely to be included when trimming. */
  priority: number
  /** Estimated token count. If not provided, will be estimated heuristically. */
  tokenEstimate?: number
}

export interface ContextBudget {
  /** Maximum tokens to allocate for context (across system prompt + messages). */
  maxContextTokens: number
  /** Reserved tokens for the model response. */
  reservedOutputTokens: number
}

export interface BuiltContext {
  systemPrompt: string
  messages: AIMessage[]
  estimatedTokens: number
}

// ---------------------------------------------------------------------------
// Context Manager
// ---------------------------------------------------------------------------

export class ContextManager {
  private systemParts: ContextSource[] = []
  private defaultBudget: ContextBudget = {
    maxContextTokens: 100_000,
    reservedOutputTokens: 4096
  }

  /** Set the default token budget. */
  setBudget(budget: Partial<ContextBudget>): void {
    if (budget.maxContextTokens !== undefined) {
      this.defaultBudget.maxContextTokens = budget.maxContextTokens
    }
    if (budget.reservedOutputTokens !== undefined) {
      this.defaultBudget.reservedOutputTokens = budget.reservedOutputTokens
    }
  }

  getBudget(): ContextBudget {
    return { ...this.defaultBudget }
  }

  // ---------------------------------------------------------------------------
  // System-level context (always included first)
  // ---------------------------------------------------------------------------

  /** Add a persistent system-level context source (e.g. user profile, workspace rules). */
  addSystemContext(source: ContextSource): void {
    this.removeSystemContext(source.key)
    this.systemParts.push(source)
  }

  removeSystemContext(key: string): void {
    this.systemParts = this.systemParts.filter((s) => s.key !== key)
  }

  getSystemContextKeys(): string[] {
    return this.systemParts.map((s) => s.key)
  }

  // ---------------------------------------------------------------------------
  // Build context for a request
  // ---------------------------------------------------------------------------

  /**
   * Build a context-managed prompt from messages and optional extra sources.
   * Trims low-priority sources when the token budget is exceeded.
   */
  build(
    messages: AIMessage[],
    model: AIModel,
    extraSources?: ContextSource[]
  ): BuiltContext {
    const budget = Math.min(
      this.defaultBudget.maxContextTokens,
      model.contextWindow - this.defaultBudget.reservedOutputTokens
    )

    // Sort all context sources by priority (highest first)
    const allSources = [
      ...this.systemParts,
      ...(extraSources ?? [])
    ].sort((a, b) => b.priority - a.priority)

    // Build system prompt from highest-priority sources that fit
    let systemTokens = 0
    const includedSources: ContextSource[] = []

    for (const source of allSources) {
      const tokens = source.tokenEstimate ?? estimateTokens(source.content)
      if (systemTokens + tokens <= budget * 0.4) {
        // Reserve at most 40% of budget for system context
        includedSources.push(source)
        systemTokens += tokens
      }
    }

    const systemPrompt = includedSources
      .map((s) => s.content)
      .join('\n\n')

    // Estimate tokens for conversation messages
    const messageTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    )

    // If messages exceed remaining budget, trim from the beginning (keep most recent)
    const remainingBudget = budget - systemTokens
    let trimmedMessages = messages

    if (messageTokens > remainingBudget) {
      trimmedMessages = trimMessages(messages, remainingBudget)
    }

    const totalEstimate =
      systemTokens +
      trimmedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

    return {
      systemPrompt,
      messages: trimmedMessages,
      estimatedTokens: totalEstimate
    }
  }

  /**
   * Compute a budget-aware ContextBudget for a specific model,
   * accounting for the model's context window.
   */
  budgetForModel(model: AIModel, desiredOutputTokens?: number): ContextBudget {
    const reserved = desiredOutputTokens ?? this.defaultBudget.reservedOutputTokens
    return {
      maxContextTokens: Math.min(
        this.defaultBudget.maxContextTokens,
        model.contextWindow - reserved
      ),
      reservedOutputTokens: reserved
    }
  }
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough heuristic: ~4 chars per token for English text.
 * This avoids a tiktoken dependency; real counts come from API usage.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// Message trimming
// ---------------------------------------------------------------------------

/**
 * Trim conversation messages to fit within a token budget.
 * Always keeps the last message (user's current turn) and trims from the top.
 */
function trimMessages(messages: AIMessage[], budgetTokens: number): AIMessage[] {
  if (messages.length === 0) return []

  // Always keep the last message
  const last = messages[messages.length - 1]
  const lastTokens = estimateTokens(last.content)

  if (lastTokens >= budgetTokens) {
    // Even the last message exceeds budget — truncate it
    const maxChars = budgetTokens * 4
    return [
      {
        ...last,
        content: last.content.slice(0, maxChars) + '\n\n[content truncated]'
      }
    ]
  }

  let remaining = budgetTokens - lastTokens
  const kept: AIMessage[] = []

  // Walk backwards from second-to-last, keeping as many recent messages as possible
  for (let i = messages.length - 2; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content)
    if (tokens <= remaining) {
      kept.unshift(messages[i])
      remaining -= tokens
    } else {
      break
    }
  }

  kept.push(last)
  return kept
}
