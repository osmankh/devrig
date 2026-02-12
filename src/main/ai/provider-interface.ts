// ---------------------------------------------------------------------------
// AI Provider Abstraction Layer — Type Definitions
// ---------------------------------------------------------------------------

// --- Provider & Model ---

export type AICapability =
  | 'completion'
  | 'classification'
  | 'summarization'
  | 'drafting'
  | 'streaming'

export interface AIModel {
  id: string
  name: string
  contextWindow: number
  inputCostPer1k: number
  outputCostPer1k: number
  capabilities: AICapability[]
}

export interface AIProvider {
  readonly id: string
  readonly name: string
  readonly models: AIModel[]

  // Core operations
  complete(request: CompletionRequest): Promise<CompletionResponse>
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>

  // Specialized operations (built on complete)
  classify(request: ClassifyRequest): Promise<ClassifyResponse>
  summarize(request: SummarizeRequest): Promise<SummarizeResponse>
  draft(request: DraftRequest): Promise<DraftResponse>

  // Status
  isAvailable(): Promise<boolean>
}

// --- Messages ---

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// --- Completion ---

export interface CompletionRequest {
  model?: string
  messages: AIMessage[]
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  metadata?: Record<string, unknown>
}

export interface CompletionResponse {
  content: string
  model: string
  inputTokens: number
  outputTokens: number
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence'
  metadata?: Record<string, unknown>
}

// --- Streaming ---

export interface StreamChunk {
  type: 'text' | 'done' | 'error'
  content?: string
  // Present on 'done' chunks
  inputTokens?: number
  outputTokens?: number
  model?: string
}

// --- Classification ---

export interface ClassifyRequest {
  items: Array<{
    id: string
    title: string
    body?: string
    preview?: string
    metadata?: Record<string, unknown>
  }>
  labels: string[]
  model?: string
  context?: string
}

export interface ClassifyResponse {
  results: Array<{
    itemId: string
    label: string
    confidence: number
    reasoning?: string
  }>
  inputTokens: number
  outputTokens: number
  model: string
}

// --- Summarization ---

export interface SummarizeRequest {
  content: string
  maxLength?: number
  style?: 'brief' | 'detailed' | 'bullet-points'
  model?: string
  context?: string
}

export interface SummarizeResponse {
  summary: string
  inputTokens: number
  outputTokens: number
  model: string
}

// --- Drafting ---

export interface DraftRequest {
  item: {
    id: string
    title: string
    body: string
    type: string
    metadata?: Record<string, unknown>
  }
  intent?: string
  tone?: 'professional' | 'casual' | 'concise'
  model?: string
  context?: string
}

export interface DraftResponse {
  draft: string
  inputTokens: number
  outputTokens: number
  model: string
}

// --- Errors ---

export type AIErrorCode =
  | 'rate_limited'
  | 'token_limit_exceeded'
  | 'invalid_request'
  | 'authentication_failed'
  | 'network_error'
  | 'provider_unavailable'
  | 'budget_exceeded'
  | 'unknown'

export class AIProviderError extends Error {
  constructor(
    message: string,
    public code: AIErrorCode,
    public provider: string,
    public retryable: boolean = false,
    public retryAfterMs?: number
  ) {
    super(message)
    this.name = 'AIProviderError'
  }
}
