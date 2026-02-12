// Provider interface & types
export {
  type AICapability,
  type AIMessage,
  type AIModel,
  type AIProvider,
  type ClassifyRequest,
  type ClassifyResponse,
  type CompletionRequest,
  type CompletionResponse,
  type DraftRequest,
  type DraftResponse,
  type StreamChunk,
  type SummarizeRequest,
  type SummarizeResponse,
  type AIErrorCode,
  AIProviderError
} from './provider-interface'

// Providers
export { ClaudeProvider } from './providers/claude-provider'

// Registry & Router
export { AIProviderRegistry } from './provider-registry'
export { ModelRouter, type ModelRoute, type FallbackChain } from './model-router'

// Pipeline engine
export {
  PipelineEngine,
  type PipelineDefinition,
  type PipelineStep,
  type PipelineItem,
  type PipelineResult,
  type ClassifyStep,
  type FilterStep,
  type SummarizeStep,
  type DraftStep,
  type CustomStep,
  type PipelineContext
} from './pipeline-engine'

// Cost tracking
export {
  CostTracker,
  type CostBudget,
  type CostSnapshot,
  type CostBudgetStatus
} from './cost-tracker'

// Context management
export {
  ContextManager,
  estimateTokens,
  type ContextSource,
  type ContextBudget,
  type BuiltContext
} from './context-manager'

// Secrets bridge
export { SecretsBridge } from './secrets-bridge'
