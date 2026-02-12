import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { InboxRepository } from '../db/repositories/inbox.repository'

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerInboxHandlers(inbox: InboxRepository): void {
  secureHandle('inbox:list', (_e, filters: unknown) => {
    const parsed = z
      .object({
        pluginId: z.string().optional(),
        pluginIds: z.array(z.string()).optional(),
        status: z
          .union([z.string(), z.array(z.string())])
          .optional(),
        priority: z
          .union([z.number(), z.array(z.number())])
          .optional(),
        type: z
          .union([z.string(), z.array(z.string())])
          .optional(),
        isActionable: z.boolean().optional(),
        search: z.string().optional(),
        afterId: z.string().optional(),
        limit: z.number().optional()
      })
      .optional()
      .safeParse(filters)

    if (!parsed.success) return err('Invalid filters', 'VALIDATION')

    const f = parsed.data ?? {}
    const limit = f.limit ?? 50

    // If search is provided, use FTS
    if (f.search) {
      const items = inbox.search(f.search, limit + 1, 0)
      const hasMore = items.length > limit
      return ok({
        items: hasMore ? items.slice(0, limit) : items,
        hasMore
      })
    }

    // Build query
    const status = f.status
      ? Array.isArray(f.status) ? f.status : [f.status]
      : undefined
    const priority = f.priority
      ? Array.isArray(f.priority) ? f.priority : [f.priority]
      : undefined
    const types = f.type
      ? Array.isArray(f.type) ? f.type : [f.type]
      : undefined

    const items = inbox.list({
      pluginId: f.pluginId,
      status,
      priority,
      types,
      isActionable: f.isActionable,
      limit: limit + 1,
      offset: 0,
      orderBy: 'priority'
    })

    const hasMore = items.length > limit
    return ok({
      items: hasMore ? items.slice(0, limit) : items,
      hasMore
    })
  })

  secureHandle('inbox:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid inbox item id', 'VALIDATION')
    const result = inbox.get(parsed.data)
    if (!result) return err('Inbox item not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('inbox:search', (_e, query: unknown, filters: unknown) => {
    const queryParsed = z.string().min(1).safeParse(query)
    if (!queryParsed.success) return err('Invalid search query', 'VALIDATION')

    const filtersParsed = z
      .object({ limit: z.number().optional() })
      .optional()
      .safeParse(filters)

    const limit = filtersParsed.success ? (filtersParsed.data?.limit ?? 50) : 50
    const items = inbox.search(queryParsed.data, limit + 1, 0)
    const hasMore = items.length > limit
    return ok({
      items: hasMore ? items.slice(0, limit) : items,
      hasMore
    })
  })

  secureHandle('inbox:markRead', (_e, ids: unknown) => {
    const parsed = z.array(z.string()).min(1).safeParse(ids)
    if (!parsed.success) return err('Invalid ids', 'VALIDATION')
    inbox.markRead(parsed.data)
    return ok(true)
  })

  secureHandle('inbox:markUnread', (_e, ids: unknown) => {
    const parsed = z.array(z.string()).min(1).safeParse(ids)
    if (!parsed.success) return err('Invalid ids', 'VALIDATION')
    inbox.markUnread(parsed.data)
    return ok(true)
  })

  secureHandle('inbox:archive', (_e, ids: unknown) => {
    const parsed = z.array(z.string()).min(1).safeParse(ids)
    if (!parsed.success) return err('Invalid ids', 'VALIDATION')
    inbox.archive(parsed.data)
    return ok(true)
  })

  secureHandle('inbox:snooze', (_e, id: unknown, until: unknown) => {
    const idParsed = z.string().safeParse(id)
    const untilParsed = z.number().safeParse(until)
    if (!idParsed.success || !untilParsed.success)
      return err('Invalid data', 'VALIDATION')
    const result = inbox.snooze(idParsed.data, untilParsed.data)
    if (!result) return err('Inbox item not found', 'NOT_FOUND')
    return ok(true)
  })

  secureHandle('inbox:unsnooze', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid id', 'VALIDATION')
    inbox.unsnooze(parsed.data)
    return ok(true)
  })

  secureHandle('inbox:getStats', () => {
    return ok(inbox.getStats())
  })
}
