import type { ID, Timestamp } from '@shared/types/common.types'

export interface Workspace {
  id: ID
  name: string
  settings: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
