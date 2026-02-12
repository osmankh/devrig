import type { InboxItemStatus, InboxItemType, InboxPriority } from '@entities/inbox-item'

export interface FilterOption<T = string> {
  value: T
  label: string
  icon?: string
}

export const STATUS_OPTIONS: FilterOption<InboxItemStatus>[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
  { value: 'snoozed', label: 'Snoozed' }
]

export const PRIORITY_OPTIONS: FilterOption<InboxPriority>[] = [
  { value: 3, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 1, label: 'Low' },
  { value: 0, label: 'None' }
]

export const TYPE_OPTIONS: FilterOption<InboxItemType>[] = [
  { value: 'email', label: 'Email' },
  { value: 'pr', label: 'Pull Request' },
  { value: 'issue', label: 'Issue' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'alert', label: 'Alert' },
  { value: 'notification', label: 'Notification' }
]
