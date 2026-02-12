// ---------------------------------------------------------------------------
// AI Pipeline Engine — composable classify→filter→summarize→draft pipelines
// ---------------------------------------------------------------------------

import type {
  AIProvider,
  ClassifyRequest,
  ClassifyResponse,
  DraftRequest,
  DraftResponse,
  SummarizeRequest,
  SummarizeResponse
} from './provider-interface'

// ---------------------------------------------------------------------------
// Pipeline step definitions
// ---------------------------------------------------------------------------

export interface ClassifyStep {
  type: 'classify'
  labels: string[]
  model?: string
  context?: string
}

export interface FilterStep {
  type: 'filter'
  /** Keep items matching these labels (from a prior classify step). */
  keepLabels: string[]
  /** Minimum confidence to keep. */
  minConfidence?: number
}

export interface SummarizeStep {
  type: 'summarize'
  style?: 'brief' | 'detailed' | 'bullet-points'
  maxLength?: number
  model?: string
}

export interface DraftStep {
  type: 'draft'
  intent?: string
  tone?: 'professional' | 'casual' | 'concise'
  model?: string
}

export interface CustomStep {
  type: 'custom'
  name: string
  fn: (ctx: PipelineContext, provider: AIProvider) => Promise<PipelineContext>
}

export type PipelineStep =
  | ClassifyStep
  | FilterStep
  | SummarizeStep
  | DraftStep
  | CustomStep

// ---------------------------------------------------------------------------
// Pipeline I/O
// ---------------------------------------------------------------------------

export interface PipelineItem {
  id: string
  title: string
  body?: string
  preview?: string
  type?: string
  metadata?: Record<string, unknown>
}

export interface PipelineContext {
  items: PipelineItem[]
  /** Classifications from the latest classify step. */
  classifications: Map<string, { label: string; confidence: number; reasoning?: string }>
  /** Summaries keyed by item id. */
  summaries: Map<string, string>
  /** Drafts keyed by item id. */
  drafts: Map<string, string>
  /** Accumulated token usage across all steps. */
  totalInputTokens: number
  totalOutputTokens: number
  /** Per-step timing. */
  stepTimings: Array<{ step: string; durationMs: number }>
}

export interface PipelineResult {
  items: PipelineItem[]
  classifications: Record<string, { label: string; confidence: number; reasoning?: string }>
  summaries: Record<string, string>
  drafts: Record<string, string>
  totalInputTokens: number
  totalOutputTokens: number
  stepTimings: Array<{ step: string; durationMs: number }>
}

// ---------------------------------------------------------------------------
// Pipeline definition
// ---------------------------------------------------------------------------

export interface PipelineDefinition {
  id: string
  name: string
  steps: PipelineStep[]
}

// ---------------------------------------------------------------------------
// Pipeline engine
// ---------------------------------------------------------------------------

export class PipelineEngine {
  private pipelines = new Map<string, PipelineDefinition>()

  /** Register a reusable pipeline definition. */
  register(pipeline: PipelineDefinition): void {
    this.pipelines.set(pipeline.id, pipeline)
  }

  /** Unregister a pipeline. */
  unregister(id: string): void {
    this.pipelines.delete(id)
  }

  /** Get a registered pipeline definition. */
  get(id: string): PipelineDefinition | undefined {
    return this.pipelines.get(id)
  }

  /** List all registered pipelines. */
  list(): PipelineDefinition[] {
    return Array.from(this.pipelines.values())
  }

  /**
   * Run a pipeline (by ID or inline definition) over a set of items.
   */
  async run(
    pipelineOrId: string | PipelineDefinition,
    items: PipelineItem[],
    provider: AIProvider
  ): Promise<PipelineResult> {
    const pipeline =
      typeof pipelineOrId === 'string'
        ? this.pipelines.get(pipelineOrId)
        : pipelineOrId

    if (!pipeline) {
      throw new Error(
        typeof pipelineOrId === 'string'
          ? `Pipeline "${pipelineOrId}" not found`
          : 'Invalid pipeline definition'
      )
    }

    let ctx: PipelineContext = {
      items: [...items],
      classifications: new Map(),
      summaries: new Map(),
      drafts: new Map(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      stepTimings: []
    }

    for (const step of pipeline.steps) {
      const start = Date.now()
      ctx = await this.executeStep(step, ctx, provider)
      ctx.stepTimings.push({
        step: step.type === 'custom' ? step.name : step.type,
        durationMs: Date.now() - start
      })
    }

    return {
      items: ctx.items,
      classifications: Object.fromEntries(ctx.classifications),
      summaries: Object.fromEntries(ctx.summaries),
      drafts: Object.fromEntries(ctx.drafts),
      totalInputTokens: ctx.totalInputTokens,
      totalOutputTokens: ctx.totalOutputTokens,
      stepTimings: ctx.stepTimings
    }
  }

  // ---------------------------------------------------------------------------
  // Step executors
  // ---------------------------------------------------------------------------

  private async executeStep(
    step: PipelineStep,
    ctx: PipelineContext,
    provider: AIProvider
  ): Promise<PipelineContext> {
    switch (step.type) {
      case 'classify':
        return this.runClassify(step, ctx, provider)
      case 'filter':
        return this.runFilter(step, ctx)
      case 'summarize':
        return this.runSummarize(step, ctx, provider)
      case 'draft':
        return this.runDraft(step, ctx, provider)
      case 'custom':
        return step.fn(ctx, provider)
    }
  }

  private async runClassify(
    step: ClassifyStep,
    ctx: PipelineContext,
    provider: AIProvider
  ): Promise<PipelineContext> {
    if (ctx.items.length === 0) return ctx

    const request: ClassifyRequest = {
      items: ctx.items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        preview: item.preview
      })),
      labels: step.labels,
      model: step.model,
      context: step.context
    }

    const response: ClassifyResponse = await provider.classify(request)

    const newClassifications = new Map(ctx.classifications)
    for (const r of response.results) {
      newClassifications.set(r.itemId, {
        label: r.label,
        confidence: r.confidence,
        reasoning: r.reasoning
      })
    }

    return {
      ...ctx,
      classifications: newClassifications,
      totalInputTokens: ctx.totalInputTokens + response.inputTokens,
      totalOutputTokens: ctx.totalOutputTokens + response.outputTokens
    }
  }

  private runFilter(step: FilterStep, ctx: PipelineContext): PipelineContext {
    const minConf = step.minConfidence ?? 0
    const keepSet = new Set(step.keepLabels)

    const filtered = ctx.items.filter((item) => {
      const c = ctx.classifications.get(item.id)
      if (!c) return false
      return keepSet.has(c.label) && c.confidence >= minConf
    })

    return { ...ctx, items: filtered }
  }

  private async runSummarize(
    step: SummarizeStep,
    ctx: PipelineContext,
    provider: AIProvider
  ): Promise<PipelineContext> {
    const newSummaries = new Map(ctx.summaries)
    let addedInput = 0
    let addedOutput = 0

    for (const item of ctx.items) {
      const request: SummarizeRequest = {
        content: `${item.title}\n\n${item.body ?? item.preview ?? ''}`,
        style: step.style,
        maxLength: step.maxLength,
        model: step.model
      }
      const response: SummarizeResponse = await provider.summarize(request)
      newSummaries.set(item.id, response.summary)
      addedInput += response.inputTokens
      addedOutput += response.outputTokens
    }

    return {
      ...ctx,
      summaries: newSummaries,
      totalInputTokens: ctx.totalInputTokens + addedInput,
      totalOutputTokens: ctx.totalOutputTokens + addedOutput
    }
  }

  private async runDraft(
    step: DraftStep,
    ctx: PipelineContext,
    provider: AIProvider
  ): Promise<PipelineContext> {
    const newDrafts = new Map(ctx.drafts)
    let addedInput = 0
    let addedOutput = 0

    for (const item of ctx.items) {
      const request: DraftRequest = {
        item: {
          id: item.id,
          title: item.title,
          body: item.body ?? item.preview ?? '',
          type: item.type ?? 'unknown'
        },
        intent: step.intent,
        tone: step.tone,
        model: step.model
      }
      const response: DraftResponse = await provider.draft(request)
      newDrafts.set(item.id, response.draft)
      addedInput += response.inputTokens
      addedOutput += response.outputTokens
    }

    return {
      ...ctx,
      drafts: newDrafts,
      totalInputTokens: ctx.totalInputTokens + addedInput,
      totalOutputTokens: ctx.totalOutputTokens + addedOutput
    }
  }
}
