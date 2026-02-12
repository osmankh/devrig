export interface AIModelInfo {
  id: string
  name: string
  contextWindow: number
  capabilities: string[]
}

export interface AIProviderInfo {
  id: string
  name: string
  models: AIModelInfo[]
  isDefault: boolean
}

export interface AIUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  operationCount: number
}

export interface AIUsageByProvider {
  provider: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  operationCount: number
}
