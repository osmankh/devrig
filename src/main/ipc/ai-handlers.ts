import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { InboxRepository } from '../db/repositories/inbox.repository'
import type { AiOperationsRepository } from '../db/repositories/ai-operations.repository'
import type { AIProvider } from '../ai/provider-interface'
import type { AIProviderRegistry } from '../ai/provider-registry'
import type { SecretsBridge } from '../ai/secrets-bridge'

interface AIRepos {
  inbox: InboxRepository
  aiOperations: AiOperationsRepository
}

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerAIHandlers(
  repos: AIRepos,
  getProvider: () => AIProvider | null,
  registry: AIProviderRegistry,
  secretsBridge: SecretsBridge
): void {
  secureHandle('ai:getProviders', () => {
    const provider = getProvider()
    if (!provider) return ok([])
    return ok([
      {
        id: provider.id,
        name: provider.name,
        models: provider.models,
        isDefault: true
      }
    ])
  })

  secureHandle('ai:setProvider', (_e, providerId: unknown) => {
    const parsed = z.string().safeParse(providerId)
    if (!parsed.success) return err('Invalid provider id', 'VALIDATION')
    try {
      registry.setDefault(parsed.data)
      return ok(true)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Failed to set provider', 'SET_PROVIDER_FAILED')
    }
  })

  secureHandle('ai:classify', async (_e, itemIds: unknown) => {
    const parsed = z.array(z.string()).min(1).safeParse(itemIds)
    if (!parsed.success) return err('Invalid item ids', 'VALIDATION')

    const provider = getProvider()
    if (!provider) return err('No AI provider configured', 'NO_PROVIDER')

    const items = parsed.data
      .map((id) => repos.inbox.get(id))
      .filter((item): item is NonNullable<typeof item> => item !== null && item !== undefined)

    if (items.length === 0) return err('No items found', 'NOT_FOUND')

    try {
      const startMs = Date.now()
      const response = await provider.classify({
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body ?? undefined,
          preview: item.preview ?? undefined
        })),
        labels: ['important', 'needs_response', 'fyi', 'spam']
      })

      const durationMs = Date.now() - startMs

      // Update items with classification results
      for (const result of response.results) {
        repos.inbox.update(result.itemId, {
          aiClassification: JSON.stringify({
            label: result.label,
            confidence: result.confidence,
            reasoning: result.reasoning
          })
        })
      }

      // Track the AI operation
      repos.aiOperations.create({
        provider: provider.id,
        model: response.model,
        operation: 'classify',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        durationMs
      })

      return ok(true)
    } catch (error) {
      return err(
        error instanceof Error ? error.message : 'Classification failed'
      )
    }
  })

  secureHandle('ai:summarize', async (_e, itemId: unknown) => {
    const parsed = z.string().safeParse(itemId)
    if (!parsed.success) return err('Invalid item id', 'VALIDATION')

    const provider = getProvider()
    if (!provider) return err('No AI provider configured', 'NO_PROVIDER')

    const item = repos.inbox.get(parsed.data)
    if (!item) return err('Inbox item not found', 'NOT_FOUND')

    try {
      const startMs = Date.now()
      const response = await provider.summarize({
        content: `${item.title}\n\n${item.body ?? item.preview ?? ''}`,
        style: 'brief'
      })

      const durationMs = Date.now() - startMs

      // Store summary on the item
      repos.inbox.update(item.id, { aiSummary: response.summary })

      // Track the operation
      repos.aiOperations.create({
        provider: provider.id,
        model: response.model,
        operation: 'summarize',
        inboxItemId: item.id,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        durationMs
      })

      return ok(response.summary)
    } catch (error) {
      return err(
        error instanceof Error ? error.message : 'Summarization failed'
      )
    }
  })

  secureHandle('ai:draft', async (_e, itemId: unknown, intent: unknown) => {
    const idParsed = z.string().safeParse(itemId)
    if (!idParsed.success) return err('Invalid item id', 'VALIDATION')

    const intentParsed = z.string().optional().safeParse(intent)
    const intentValue = intentParsed.success ? intentParsed.data : undefined

    const provider = getProvider()
    if (!provider) return err('No AI provider configured', 'NO_PROVIDER')

    const item = repos.inbox.get(idParsed.data)
    if (!item) return err('Inbox item not found', 'NOT_FOUND')

    try {
      const startMs = Date.now()
      const response = await provider.draft({
        item: {
          id: item.id,
          title: item.title,
          body: item.body ?? item.preview ?? '',
          type: item.type
        },
        intent: intentValue
      })

      const durationMs = Date.now() - startMs

      // Store draft on the item
      repos.inbox.update(item.id, { aiDraft: response.draft })

      // Track the operation
      repos.aiOperations.create({
        provider: provider.id,
        model: response.model,
        operation: 'draft',
        inboxItemId: item.id,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        durationMs
      })

      return ok(response.draft)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Drafting failed')
    }
  })

  secureHandle('ai:complete', async (_e, prompt: unknown) => {
    const parsed = z.string().min(1).safeParse(prompt)
    if (!parsed.success) return err('Invalid prompt', 'VALIDATION')

    const provider = getProvider()
    if (!provider) return err('No AI provider configured', 'NO_PROVIDER')

    try {
      const startMs = Date.now()
      const response = await provider.complete({
        messages: [{ role: 'user', content: parsed.data }]
      })

      const durationMs = Date.now() - startMs

      repos.aiOperations.create({
        provider: provider.id,
        model: response.model,
        operation: 'complete',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        durationMs
      })

      return ok(response.content)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Completion failed')
    }
  })

  secureHandle('ai:getUsage', (_e, dateFrom: unknown, dateTo: unknown) => {
    const fromParsed = z.number().optional().safeParse(dateFrom)
    const _toParsed = z.number().optional().safeParse(dateTo)

    const since = fromParsed.success ? fromParsed.data : undefined

    const byProvider = repos.aiOperations.getUsageSummary(since)

    const total = {
      inputTokens: byProvider.reduce((sum, p) => sum + p.totalInputTokens, 0),
      outputTokens: byProvider.reduce((sum, p) => sum + p.totalOutputTokens, 0),
      totalCostUsd: byProvider.reduce((sum, p) => sum + p.totalCostUsd, 0),
      operationCount: byProvider.reduce((sum, p) => sum + p.operationCount, 0)
    }

    return ok({ total, byProvider })
  })

  secureHandle('ai:setApiKey', (_e, providerId: unknown, apiKey: unknown) => {
    const id = z.string().safeParse(providerId)
    const key = z.string().min(1).safeParse(apiKey)
    if (!id.success || !key.success) return err('Invalid data', 'VALIDATION')
    try {
      secretsBridge.setProviderKey(id.data, key.data)
      // Reset the provider client so it picks up the new key
      const provider = registry.get(id.data)
      if (provider && 'resetClient' in provider) {
        (provider as { resetClient: () => void }).resetClient()
      }
      return ok(true)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Failed to save API key', 'SAVE_FAILED')
    }
  })

  secureHandle('ai:hasApiKey', (_e, providerId: unknown) => {
    const id = z.string().safeParse(providerId)
    if (!id.success) return err('Invalid provider id', 'VALIDATION')
    return ok(secretsBridge.hasProviderKey(id.data))
  })

  secureHandle('ai:testConnection', async (_e, providerId: unknown) => {
    const id = z.string().safeParse(providerId)
    if (!id.success) return err('Invalid provider id', 'VALIDATION')
    const provider = registry.get(id.data)
    if (!provider) return err('Provider not found', 'NOT_FOUND')
    try {
      const available = await provider.isAvailable()
      if (!available) return ok({ success: false, error: 'API key not configured' })
      // Try a minimal classify call to verify the key works
      await provider.classify({
        items: [{ id: 'test', title: 'Test connection' }],
        labels: ['test']
      })
      return ok({ success: true })
    } catch (error) {
      return ok({ success: false, error: error instanceof Error ? error.message : 'Connection test failed' })
    }
  })
}
