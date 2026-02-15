import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PipelineEngine,
  type PipelineDefinition,
  type PipelineItem,
  type PipelineContext
} from '../../../src/main/ai/pipeline-engine'
import type {
  AIProvider,
  AIModel,
  ClassifyResponse,
  SummarizeResponse,
  DraftResponse
} from '../../../src/main/ai/provider-interface'

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
    capabilities: ['completion', 'classification', 'summarization', 'drafting'],
    ...overrides
  }
}

function makeProvider(overrides?: Partial<AIProvider>): AIProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    models: [makeModel()],
    complete: vi.fn(),
    stream: vi.fn(),
    classify: vi.fn(),
    summarize: vi.fn(),
    draft: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides
  }
}

function makeItem(id: string, overrides?: Partial<PipelineItem>): PipelineItem {
  return {
    id,
    title: `Item ${id}`,
    body: `Body of item ${id}`,
    ...overrides
  }
}

function makeClassifyResponse(
  results: Array<{ itemId: string; label: string; confidence: number }>
): ClassifyResponse {
  return {
    results: results.map((r) => ({ ...r })),
    inputTokens: 100,
    outputTokens: 50,
    model: 'test-model'
  }
}

function makeSummarizeResponse(summary: string): SummarizeResponse {
  return { summary, inputTokens: 80, outputTokens: 30, model: 'test-model' }
}

function makeDraftResponse(draft: string): DraftResponse {
  return { draft, inputTokens: 120, outputTokens: 60, model: 'test-model' }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineEngine', () => {
  let engine: PipelineEngine
  let provider: AIProvider

  beforeEach(() => {
    engine = new PipelineEngine()
    provider = makeProvider()
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('register / unregister / get / list', () => {
    it('registers and retrieves a pipeline by id', () => {
      const pipeline: PipelineDefinition = {
        id: 'p1',
        name: 'Pipeline 1',
        steps: []
      }
      engine.register(pipeline)

      expect(engine.get('p1')).toBe(pipeline)
    })

    it('unregisters a pipeline', () => {
      engine.register({ id: 'p1', name: 'P1', steps: [] })
      engine.unregister('p1')

      expect(engine.get('p1')).toBeUndefined()
    })

    it('returns undefined for unknown ids', () => {
      expect(engine.get('nonexistent')).toBeUndefined()
    })

    it('lists all registered pipelines', () => {
      engine.register({ id: 'p1', name: 'P1', steps: [] })
      engine.register({ id: 'p2', name: 'P2', steps: [] })

      const list = engine.list()
      expect(list).toHaveLength(2)
      expect(list.map((p) => p.id)).toEqual(['p1', 'p2'])
    })
  })

  // -----------------------------------------------------------------------
  // run() — basics
  // -----------------------------------------------------------------------

  describe('run', () => {
    it('throws when given a string id for an unregistered pipeline', async () => {
      await expect(engine.run('nonexistent', [], provider)).rejects.toThrow(
        'Pipeline "nonexistent" not found'
      )
    })

    it('runs an inline pipeline definition', async () => {
      const pipeline: PipelineDefinition = {
        id: 'inline',
        name: 'Inline',
        steps: []
      }

      const result = await engine.run(pipeline, [makeItem('1')], provider)

      expect(result.items).toHaveLength(1)
      expect(result.totalInputTokens).toBe(0)
      expect(result.totalOutputTokens).toBe(0)
    })

    it('runs a registered pipeline by id', async () => {
      engine.register({ id: 'p1', name: 'P1', steps: [] })
      const result = await engine.run('p1', [makeItem('1')], provider)

      expect(result.items).toHaveLength(1)
    })

    it('records step timings for each step', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([{ itemId: '1', label: 'important', confidence: 0.9 }])
      )

      const pipeline: PipelineDefinition = {
        id: 'timed',
        name: 'Timed',
        steps: [{ type: 'classify', labels: ['important', 'spam'] }]
      }

      const result = await engine.run(pipeline, [makeItem('1')], provider)

      expect(result.stepTimings).toHaveLength(1)
      expect(result.stepTimings[0].step).toBe('classify')
      expect(result.stepTimings[0].durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  // -----------------------------------------------------------------------
  // Classify step
  // -----------------------------------------------------------------------

  describe('classify step', () => {
    it('classifies items and stores results', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'urgent', confidence: 0.95 },
          { itemId: 'b', label: 'spam', confidence: 0.8 }
        ])
      )

      const pipeline: PipelineDefinition = {
        id: 'cls',
        name: 'Classify',
        steps: [{ type: 'classify', labels: ['urgent', 'spam', 'normal'] }]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b')],
        provider
      )

      expect(result.classifications).toEqual({
        a: { label: 'urgent', confidence: 0.95 },
        b: { label: 'spam', confidence: 0.8 }
      })
      expect(result.totalInputTokens).toBe(100)
      expect(result.totalOutputTokens).toBe(50)
    })

    it('skips classification for empty items', async () => {
      const pipeline: PipelineDefinition = {
        id: 'cls',
        name: 'Classify',
        steps: [{ type: 'classify', labels: ['a', 'b'] }]
      }

      const result = await engine.run(pipeline, [], provider)

      expect(provider.classify).not.toHaveBeenCalled()
      expect(result.classifications).toEqual({})
    })

    it('passes model and context to classify request', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([{ itemId: '1', label: 'a', confidence: 0.5 }])
      )

      const pipeline: PipelineDefinition = {
        id: 'cls',
        name: 'Classify',
        steps: [{
          type: 'classify',
          labels: ['a', 'b'],
          model: 'fast-model',
          context: 'classify for urgency'
        }]
      }

      await engine.run(pipeline, [makeItem('1')], provider)

      expect(provider.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'fast-model',
          context: 'classify for urgency',
          labels: ['a', 'b']
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // Filter step
  // -----------------------------------------------------------------------

  describe('filter step', () => {
    it('keeps items matching keepLabels from prior classification', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'urgent', confidence: 0.95 },
          { itemId: 'b', label: 'spam', confidence: 0.8 },
          { itemId: 'c', label: 'urgent', confidence: 0.7 }
        ])
      )

      const pipeline: PipelineDefinition = {
        id: 'cf',
        name: 'Classify+Filter',
        steps: [
          { type: 'classify', labels: ['urgent', 'spam'] },
          { type: 'filter', keepLabels: ['urgent'] }
        ]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b'), makeItem('c')],
        provider
      )

      expect(result.items.map((i) => i.id)).toEqual(['a', 'c'])
    })

    it('applies minConfidence threshold', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'urgent', confidence: 0.95 },
          { itemId: 'b', label: 'urgent', confidence: 0.4 }
        ])
      )

      const pipeline: PipelineDefinition = {
        id: 'cf',
        name: 'Filter min',
        steps: [
          { type: 'classify', labels: ['urgent'] },
          { type: 'filter', keepLabels: ['urgent'], minConfidence: 0.5 }
        ]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b')],
        provider
      )

      expect(result.items.map((i) => i.id)).toEqual(['a'])
    })

    it('removes all items when none match filter', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'spam', confidence: 0.9 }
        ])
      )

      const pipeline: PipelineDefinition = {
        id: 'cf',
        name: 'None match',
        steps: [
          { type: 'classify', labels: ['spam', 'urgent'] },
          { type: 'filter', keepLabels: ['urgent'] }
        ]
      }

      const result = await engine.run(pipeline, [makeItem('a')], provider)

      expect(result.items).toHaveLength(0)
    })

    it('removes items without classification', async () => {
      // No classify step — filter runs on unclassified items
      const pipeline: PipelineDefinition = {
        id: 'f',
        name: 'Filter without classify',
        steps: [{ type: 'filter', keepLabels: ['urgent'] }]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b')],
        provider
      )

      expect(result.items).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // Summarize step
  // -----------------------------------------------------------------------

  describe('summarize step', () => {
    it('summarizes each item and accumulates tokens', async () => {
      ;(provider.summarize as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeSummarizeResponse('Summary of A'))
        .mockResolvedValueOnce(makeSummarizeResponse('Summary of B'))

      const pipeline: PipelineDefinition = {
        id: 'sum',
        name: 'Summarize',
        steps: [{ type: 'summarize', style: 'brief', maxLength: 100 }]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b')],
        provider
      )

      expect(result.summaries).toEqual({
        a: 'Summary of A',
        b: 'Summary of B'
      })
      expect(result.totalInputTokens).toBe(160) // 80 * 2
      expect(result.totalOutputTokens).toBe(60) // 30 * 2
    })

    it('uses body, falling back to preview', async () => {
      ;(provider.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSummarizeResponse('sum')
      )

      const pipeline: PipelineDefinition = {
        id: 'sum',
        name: 'Sum',
        steps: [{ type: 'summarize' }]
      }

      await engine.run(
        pipeline,
        [makeItem('a', { body: undefined, preview: 'Preview text' })],
        provider
      )

      expect(provider.summarize).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Preview text')
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // Draft step
  // -----------------------------------------------------------------------

  describe('draft step', () => {
    it('drafts for each item and accumulates tokens', async () => {
      ;(provider.draft as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeDraftResponse('Draft reply to A'))
        .mockResolvedValueOnce(makeDraftResponse('Draft reply to B'))

      const pipeline: PipelineDefinition = {
        id: 'dr',
        name: 'Draft',
        steps: [{ type: 'draft', intent: 'reply', tone: 'professional' }]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b')],
        provider
      )

      expect(result.drafts).toEqual({
        a: 'Draft reply to A',
        b: 'Draft reply to B'
      })
      expect(result.totalInputTokens).toBe(240) // 120 * 2
      expect(result.totalOutputTokens).toBe(120) // 60 * 2
    })

    it('passes item type and intent to draft request', async () => {
      ;(provider.draft as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeDraftResponse('Draft')
      )

      const pipeline: PipelineDefinition = {
        id: 'dr',
        name: 'Draft',
        steps: [{ type: 'draft', intent: 'acknowledge', tone: 'casual' }]
      }

      await engine.run(
        pipeline,
        [makeItem('a', { type: 'email' })],
        provider
      )

      expect(provider.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ type: 'email' }),
          intent: 'acknowledge',
          tone: 'casual'
        })
      )
    })

    it('defaults type to "unknown" when item has no type', async () => {
      ;(provider.draft as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeDraftResponse('Draft')
      )

      const pipeline: PipelineDefinition = {
        id: 'dr',
        name: 'Draft',
        steps: [{ type: 'draft' }]
      }

      await engine.run(pipeline, [makeItem('a')], provider)

      expect(provider.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ type: 'unknown' })
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // Custom step
  // -----------------------------------------------------------------------

  describe('custom step', () => {
    it('executes the custom function', async () => {
      const customFn = vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        return {
          ...ctx,
          items: ctx.items.filter((i) => i.id !== 'b')
        }
      })

      const pipeline: PipelineDefinition = {
        id: 'custom',
        name: 'Custom',
        steps: [{ type: 'custom', name: 'remove-b', fn: customFn }]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b'), makeItem('c')],
        provider
      )

      expect(result.items.map((i) => i.id)).toEqual(['a', 'c'])
      expect(customFn).toHaveBeenCalledWith(
        expect.objectContaining({ items: expect.any(Array) }),
        provider
      )
    })

    it('records custom step name in timings', async () => {
      const pipeline: PipelineDefinition = {
        id: 'custom',
        name: 'Custom',
        steps: [{
          type: 'custom',
          name: 'my-custom-step',
          fn: async (ctx) => ctx
        }]
      }

      const result = await engine.run(pipeline, [makeItem('a')], provider)

      expect(result.stepTimings[0].step).toBe('my-custom-step')
    })
  })

  // -----------------------------------------------------------------------
  // Multi-step pipeline (integration)
  // -----------------------------------------------------------------------

  describe('multi-step pipeline', () => {
    it('runs classify → filter → summarize → draft in sequence', async () => {
      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'urgent', confidence: 0.95 },
          { itemId: 'b', label: 'spam', confidence: 0.9 },
          { itemId: 'c', label: 'urgent', confidence: 0.6 }
        ])
      )
      ;(provider.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSummarizeResponse('Quick summary')
      )
      ;(provider.draft as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeDraftResponse('Draft response')
      )

      const pipeline: PipelineDefinition = {
        id: 'full',
        name: 'Full Pipeline',
        steps: [
          { type: 'classify', labels: ['urgent', 'spam'] },
          { type: 'filter', keepLabels: ['urgent'], minConfidence: 0.5 },
          { type: 'summarize', style: 'brief' },
          { type: 'draft', intent: 'reply', tone: 'professional' }
        ]
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a'), makeItem('b'), makeItem('c')],
        provider
      )

      // After filter: only 'a' and 'c' remain (urgent with conf >= 0.5)
      expect(result.items.map((i) => i.id)).toEqual(['a', 'c'])

      // Summaries for remaining items
      expect(Object.keys(result.summaries)).toEqual(['a', 'c'])

      // Drafts for remaining items
      expect(Object.keys(result.drafts)).toEqual(['a', 'c'])

      // Token accumulation: classify(100+50) + summarize(80*2 + 30*2) + draft(120*2 + 60*2)
      expect(result.totalInputTokens).toBe(100 + 160 + 240) // 500
      expect(result.totalOutputTokens).toBe(50 + 60 + 120) // 230

      // All 4 steps timed
      expect(result.stepTimings).toHaveLength(4)
      expect(result.stepTimings.map((t) => t.step)).toEqual([
        'classify',
        'filter',
        'summarize',
        'draft'
      ])
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles pipeline with no steps', async () => {
      const pipeline: PipelineDefinition = {
        id: 'empty',
        name: 'Empty',
        steps: []
      }

      const result = await engine.run(
        pipeline,
        [makeItem('a')],
        provider
      )

      expect(result.items).toHaveLength(1)
      expect(result.stepTimings).toHaveLength(0)
      expect(result.totalInputTokens).toBe(0)
    })

    it('does not mutate the original items array', async () => {
      const items = [makeItem('a'), makeItem('b')]
      const originalLength = items.length

      ;(provider.classify as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeClassifyResponse([
          { itemId: 'a', label: 'spam', confidence: 0.9 },
          { itemId: 'b', label: 'spam', confidence: 0.9 }
        ])
      )

      const pipeline: PipelineDefinition = {
        id: 'cf',
        name: 'Filter all',
        steps: [
          { type: 'classify', labels: ['spam'] },
          { type: 'filter', keepLabels: ['urgent'] }
        ]
      }

      const result = await engine.run(pipeline, items, provider)

      expect(result.items).toHaveLength(0)
      expect(items).toHaveLength(originalLength) // original unchanged
    })

    it('converts Maps to plain objects in result', async () => {
      const pipeline: PipelineDefinition = {
        id: 'p',
        name: 'P',
        steps: []
      }

      const result = await engine.run(pipeline, [], provider)

      // classifications, summaries, drafts should be plain objects, not Maps
      expect(result.classifications).toEqual({})
      expect(result.summaries).toEqual({})
      expect(result.drafts).toEqual({})
    })
  })
})
