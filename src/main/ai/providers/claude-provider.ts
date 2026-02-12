// ---------------------------------------------------------------------------
// Claude Provider — Anthropic SDK implementation of AIProvider
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk'
import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages'
import {
  AIProviderError,
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
  type SummarizeResponse
} from '../provider-interface'

const CLAUDE_MODELS: AIModel[] = [
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    contextWindow: 200_000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    capabilities: ['completion', 'classification', 'summarization', 'drafting', 'streaming']
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    contextWindow: 200_000,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    capabilities: ['completion', 'classification', 'summarization', 'drafting', 'streaming']
  },
  {
    id: 'claude-haiku-3-5',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200_000,
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.005,
    capabilities: ['completion', 'classification', 'summarization', 'drafting', 'streaming']
  }
]

/** Default models per specialized operation */
const DEFAULT_CLASSIFY_MODEL = 'claude-haiku-3-5'
const DEFAULT_SUMMARIZE_MODEL = 'claude-sonnet-4-5'
const DEFAULT_DRAFT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_COMPLETE_MODEL = 'claude-sonnet-4-5'

export class ClaudeProvider implements AIProvider {
  readonly id = 'claude'
  readonly name = 'Anthropic Claude'
  readonly models = CLAUDE_MODELS

  private client: Anthropic | null = null
  private getApiKey: () => Promise<string | null>

  constructor(getApiKey: () => Promise<string | null>) {
    this.getApiKey = getApiKey
  }

  /** Invalidate the cached client (e.g. after API key change). */
  resetClient(): void {
    this.client = null
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const client = await this.ensureClient()
    const model = request.model ?? DEFAULT_COMPLETE_MODEL

    const response = await this.withErrorHandling(() =>
      client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 4096,
        messages: toAnthropicMessages(request.messages),
        system: request.systemPrompt,
        temperature: request.temperature,
        stop_sequences: request.stopSequences
      })
    )

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return {
      content: text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: mapStopReason(response.stop_reason),
      metadata: request.metadata
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const client = await this.ensureClient()
    const model = request.model ?? DEFAULT_COMPLETE_MODEL

    let messageStream: MessageStream
    try {
      messageStream = client.messages.stream({
        model,
        max_tokens: request.maxTokens ?? 4096,
        messages: toAnthropicMessages(request.messages),
        system: request.systemPrompt,
        temperature: request.temperature,
        stop_sequences: request.stopSequences
      })
    } catch (err) {
      throw mapError(err)
    }

    try {
      for await (const event of messageStream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text', content: event.delta.text }
        }
      }

      const final = await messageStream.finalMessage()
      yield {
        type: 'done',
        model: final.model,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens
      }
    } catch (err) {
      yield { type: 'error', content: (err as Error).message }
      throw mapError(err)
    }
  }

  // ---------------------------------------------------------------------------
  // Specialized operations
  // ---------------------------------------------------------------------------

  async classify(request: ClassifyRequest): Promise<ClassifyResponse> {
    const model = request.model ?? DEFAULT_CLASSIFY_MODEL

    const itemsBlock = request.items
      .map(
        (item) =>
          `<item id="${item.id}">\nTitle: ${item.title}${item.body ? `\nBody: ${item.body}` : ''}${item.preview ? `\nPreview: ${item.preview}` : ''}\n</item>`
      )
      .join('\n\n')

    const systemPrompt = `You are a classification engine. Classify each item into exactly one of these labels: ${request.labels.join(', ')}.${request.context ? `\n\nContext: ${request.context}` : ''}

Respond with a JSON array. Each element must have: { "itemId": string, "label": string, "confidence": number (0-1), "reasoning": string }.
Return ONLY the JSON array — no markdown, no explanation.`

    const response = await this.complete({
      model,
      systemPrompt,
      messages: [{ role: 'user', content: itemsBlock }],
      temperature: 0,
      maxTokens: 4096
    })

    const results = JSON.parse(response.content) as Array<{
      itemId: string
      label: string
      confidence: number
      reasoning?: string
    }>

    return {
      results,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: response.model
    }
  }

  async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    const model = request.model ?? DEFAULT_SUMMARIZE_MODEL

    const styleInstructions: Record<string, string> = {
      brief: 'Write a concise 1-2 sentence summary.',
      detailed: 'Write a thorough multi-paragraph summary.',
      'bullet-points': 'Write a summary as a bulleted list of key points.'
    }

    const systemPrompt = `You are a summarization engine.
${styleInstructions[request.style ?? 'brief']}${request.maxLength ? ` Keep it under ${request.maxLength} characters.` : ''}${request.context ? `\n\nContext: ${request.context}` : ''}
Return ONLY the summary text — no preamble, no explanation.`

    const response = await this.complete({
      model,
      systemPrompt,
      messages: [{ role: 'user', content: request.content }],
      temperature: 0.3,
      maxTokens: request.maxLength ? Math.ceil(request.maxLength / 3) : 2048
    })

    return {
      summary: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: response.model
    }
  }

  async draft(request: DraftRequest): Promise<DraftResponse> {
    const model = request.model ?? DEFAULT_DRAFT_MODEL
    const { item, intent, tone, context } = request

    const toneGuide: Record<string, string> = {
      professional: 'Use a professional, polished tone.',
      casual: 'Use a friendly, conversational tone.',
      concise: 'Be as brief and direct as possible.'
    }

    const systemPrompt = `You are a drafting assistant. Write a ${item.type} response.
${tone ? toneGuide[tone] : toneGuide.professional}${intent ? `\nIntent: ${intent}` : ''}${context ? `\n\nThread context:\n${context}` : ''}
Return ONLY the draft text — no preamble, no explanation.`

    const userContent = `Title: ${item.title}\n\n${item.body}`

    const response = await this.complete({
      model,
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.7,
      maxTokens: 4096
    })

    return {
      draft: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: response.model
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const key = await this.getApiKey()
      return key !== null && key.length > 0
    } catch {
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async ensureClient(): Promise<Anthropic> {
    if (this.client) return this.client

    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new AIProviderError(
        'Claude API key not configured',
        'authentication_failed',
        'claude'
      )
    }

    this.client = new Anthropic({ apiKey })
    return this.client
  }

  private async withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      throw mapError(err)
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toAnthropicMessages(messages: CompletionRequest['messages']): MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
}

function mapStopReason(
  reason: string | null
): CompletionResponse['stopReason'] {
  switch (reason) {
    case 'end_turn':
      return 'end_turn'
    case 'max_tokens':
      return 'max_tokens'
    case 'stop_sequence':
      return 'stop_sequence'
    default:
      return 'end_turn'
  }
}

function mapError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err

  if (err instanceof Anthropic.RateLimitError) {
    const retryAfter = parseRetryAfter(err)
    return new AIProviderError(
      'Claude rate limit exceeded',
      'rate_limited',
      'claude',
      true,
      retryAfter
    )
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AIProviderError(
      'Claude authentication failed — check your API key',
      'authentication_failed',
      'claude'
    )
  }
  if (err instanceof Anthropic.BadRequestError) {
    const msg = (err as Error).message
    if (msg.includes('token')) {
      return new AIProviderError(msg, 'token_limit_exceeded', 'claude')
    }
    return new AIProviderError(msg, 'invalid_request', 'claude')
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AIProviderError(
      'Claude service unavailable',
      'provider_unavailable',
      'claude',
      true,
      5000
    )
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AIProviderError(
      'Network error connecting to Claude',
      'network_error',
      'claude',
      true,
      3000
    )
  }
  if (err instanceof Anthropic.APIError) {
    return new AIProviderError(
      (err as Error).message,
      'unknown',
      'claude',
      err.status >= 500,
      err.status >= 500 ? 5000 : undefined
    )
  }

  return new AIProviderError(
    (err as Error).message ?? 'Unknown error',
    'unknown',
    'claude'
  )
}

function parseRetryAfter(err: InstanceType<typeof Anthropic.APIError>): number {
  const headers = err.headers as Record<string, string> | undefined
  const header = headers?.['retry-after']
  if (header) {
    const seconds = Number(header)
    if (!Number.isNaN(seconds)) return seconds * 1000
  }
  return 60_000 // default 60s
}
