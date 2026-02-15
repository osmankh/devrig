import type { ID, Timestamp } from '@shared/types/common.types'

export interface PluginCapabilities {
  dataSources?: string[]
  actions?: string[]
  aiPipelines?: string[]
  views?: string[]
  flowNodes?: string[]
}

export interface PluginPreference {
  id: string
  label: string
  type: 'toggle' | 'select' | 'text' | 'number'
  description?: string
  default?: string | number | boolean
  options?: Array<{ label: string; value: string }>
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
  preferences?: PluginPreference[]
}

export interface PluginSyncState {
  pluginId: ID
  dataSourceId: string
  lastSyncAt: Timestamp | null
  syncStatus: 'idle' | 'syncing' | 'error'
  error: string | null
  itemsSynced: number
}
