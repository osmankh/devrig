// ---------------------------------------------------------------------------
// Model Router — per-task model selection with fallback chains
// ---------------------------------------------------------------------------

import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  StreamChunk
} from './provider-interface'
import { AIProviderError } from './provider-interface'
import type { AIProviderRegistry } from './provider-registry'

/** Which model to pick for a given task type. */
export interface ModelRoute {
  taskType: string
  providerId: string
  modelId: string
}

/** A sequence of provider+model pairs to try in order. */
export interface FallbackChain {
  taskType: string
  chain: Array<{ providerId: string; modelId: string }>
}

export class ModelRouter {
  /** Task-type → preferred provider+model. */
  private routes = new Map<string, ModelRoute>()
  /** Task-type → ordered fallback chain. */
  private fallbacks = new Map<string, FallbackChain>()
  /** Global default task-type when none matches. */
  private defaultTaskType = 'general'

  constructor(private registry: AIProviderRegistry) {}

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Set the preferred route for a task type (e.g. "classify" → haiku). */
  setRoute(taskType: string, providerId: string, modelId: string): void {
    this.routes.set(taskType, { taskType, providerId, modelId })
  }

  /** Set the fallback chain for a task type. */
  setFallbackChain(chain: FallbackChain): void {
    this.fallbacks.set(chain.taskType, chain)
  }

  /** Remove routing config for a task type. */
  removeRoute(taskType: string): void {
    this.routes.delete(taskType)
    this.fallbacks.delete(taskType)
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the provider and model for a given task type.
   * Checks routes first, then falls back to default provider + first model.
   */
  resolve(taskType: string): { provider: AIProvider; model: AIModel } {
    // Check explicit route
    const route = this.routes.get(taskType) ?? this.routes.get(this.defaultTaskType)
    if (route) {
      const provider = this.registry.get(route.providerId)
      if (provider) {
        const model = provider.models.find((m) => m.id === route.modelId)
        if (model) return { provider, model }
      }
    }

    // Fall back to default provider + first model
    const defaultProvider = this.registry.getDefault()
    if (!defaultProvider || defaultProvider.models.length === 0) {
      throw new AIProviderError(
        'No AI provider available for routing',
        'provider_unavailable',
        'router'
      )
    }

    return { provider: defaultProvider, model: defaultProvider.models[0] }
  }

  // ---------------------------------------------------------------------------
  // Execution with fallback
  // ---------------------------------------------------------------------------

  /**
   * Execute a completion request with automatic fallback on retryable errors.
   * Walks the fallback chain for the task type; if exhausted falls back to resolve().
   */
  async completeWithFallback(
    taskType: string,
    request: CompletionRequest
  ): Promise<CompletionResponse> {
    const chain = this.fallbacks.get(taskType)

    if (chain && chain.chain.length > 0) {
      let lastError: AIProviderError | undefined
      for (const entry of chain.chain) {
        const provider = this.registry.get(entry.providerId)
        if (!provider) continue

        try {
          return await provider.complete({ ...request, model: entry.modelId })
        } catch (err) {
          if (err instanceof AIProviderError && err.retryable) {
            lastError = err
            continue
          }
          throw err
        }
      }
      if (lastError) throw lastError
    }

    // No fallback chain or chain empty — use direct resolution
    const { provider, model } = this.resolve(taskType)
    return provider.complete({ ...request, model: model.id })
  }

  /**
   * Stream a completion with fallback. Only retries before the first chunk;
   * once streaming has begun the generator is committed.
   */
  async *streamWithFallback(
    taskType: string,
    request: CompletionRequest
  ): AsyncIterable<StreamChunk> {
    const chain = this.fallbacks.get(taskType)
    const entries = chain?.chain ?? []

    for (const entry of entries) {
      const provider = this.registry.get(entry.providerId)
      if (!provider) continue

      try {
        yield* provider.stream({ ...request, model: entry.modelId })
        return
      } catch (err) {
        if (err instanceof AIProviderError && err.retryable) continue
        throw err
      }
    }

    // Fallback exhausted — use resolved default
    const { provider, model } = this.resolve(taskType)
    yield* provider.stream({ ...request, model: model.id })
  }

  /** Return all configured routes (for UI / debugging). */
  getRoutes(): ModelRoute[] {
    return Array.from(this.routes.values())
  }

  /** Return all configured fallback chains. */
  getFallbackChains(): FallbackChain[] {
    return Array.from(this.fallbacks.values())
  }
}
