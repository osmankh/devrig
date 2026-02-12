import type { ID, Timestamp } from '@shared/types/common.types'

export type InboxItemType =
  | 'email'
  | 'pr'
  | 'issue'
  | 'alert'
  | 'notification'
  | 'ticket'
  | 'other'

export type InboxPriority = 0 | 1 | 2 | 3 // none, low, medium, high

export type InboxItemStatus = 'unread' | 'read' | 'archived' | 'snoozed'

export interface AIClassification {
  label: string
  confidence: number
  reasoning?: string
}

export interface InboxItem {
  id: ID
  pluginId: ID
  externalId: string
  type: InboxItemType
  title: string
  body: string | null
  preview: string | null
  sourceUrl: string | null
  priority: InboxPriority
  status: InboxItemStatus
  aiClassification: AIClassification | null
  aiSummary: string | null
  aiDraft: string | null
  metadata: Record<string, unknown>
  isActionable: boolean
  snoozedUntil: Timestamp | null
  externalCreatedAt: Timestamp | null
  syncedAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface InboxFilters {
  pluginId?: string
  pluginIds?: string[]
  status?: InboxItemStatus | InboxItemStatus[]
  priority?: InboxPriority | InboxPriority[]
  type?: InboxItemType | InboxItemType[]
  isActionable?: boolean
  search?: string
  afterId?: string
  limit?: number
}

export interface InboxStats {
  unreadCount: number
  actionableCount: number
  pluginCounts: Record<string, number>
}
