import type { ID, Timestamp } from '@shared/types/common.types'

export interface PluginCapabilities {
  dataSources?: string[]
  actions?: string[]
  aiPipelines?: string[]
  views?: string[]
  flowNodes?: string[]
}

export interface Plugin {
  id: ID
  name: string
  version: string
  description?: string
  icon?: string
  enabled: boolean
  installedAt: Timestamp
  updatedAt: Timestamp
  capabilities: PluginCapabilities
  requiredSecrets?: string[]
  authType?: 'oauth' | 'api_key' | 'none'
}

export interface PluginSyncState {
  pluginId: ID
  dataSourceId: string
  lastSyncAt: Timestamp | null
  syncStatus: 'idle' | 'syncing' | 'error'
  error: string | null
  itemsSynced: number
}
