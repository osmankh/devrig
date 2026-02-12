import { ipcInvoke, ipcOn, ipcOff } from '@shared/lib/ipc'
import type { AIProviderInfo, AIUsage, AIUsageByProvider } from '../model/ai.types'

export async function getProviders(): Promise<AIProviderInfo[]> {
  return ipcInvoke<AIProviderInfo[]>('ai:getProviders')
}

export async function setDefaultProvider(providerId: string): Promise<void> {
  return ipcInvoke<void>('ai:setProvider', providerId)
}

export async function classifyItems(itemIds: string[]): Promise<void> {
  return ipcInvoke<void>('ai:classify', itemIds)
}

export async function summarizeItem(itemId: string): Promise<string> {
  return ipcInvoke<string>('ai:summarize', itemId)
}

export async function draftResponse(
  itemId: string,
  intent?: string
): Promise<string> {
  return ipcInvoke<string>('ai:draft', itemId, intent)
}

export async function complete(prompt: string): Promise<string> {
  return ipcInvoke<string>('ai:complete', prompt)
}

export async function getUsage(
  dateFrom?: number,
  dateTo?: number
): Promise<{ total: AIUsage; byProvider: AIUsageByProvider[] }> {
  return ipcInvoke<{ total: AIUsage; byProvider: AIUsageByProvider[] }>(
    'ai:getUsage',
    dateFrom,
    dateTo
  )
}

export function onPipelineProgress(
  callback: (data: { operationId: string; progress: number; status: string }) => void
): void {
  ipcOn('ai:pipeline-progress', callback as (...args: unknown[]) => void)
}

export function offPipelineProgress(
  callback: (data: { operationId: string; progress: number; status: string }) => void
): void {
  ipcOff('ai:pipeline-progress', callback as (...args: unknown[]) => void)
}
