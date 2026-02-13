import { ipcInvoke } from '@shared/lib/ipc'
import type { OAuthStartResult, OAuthPollResult, OAuthStatusResult } from './oauth-types'

export function oauthSupports(pluginId: string): Promise<boolean> {
  return ipcInvoke<boolean>('oauth:supports', pluginId)
}

export function oauthStart(pluginId: string): Promise<OAuthStartResult> {
  return ipcInvoke<OAuthStartResult>('oauth:start', pluginId)
}

export function oauthPoll(pluginId: string): Promise<OAuthPollResult> {
  return ipcInvoke<OAuthPollResult>('oauth:poll', pluginId)
}

export function oauthStatus(pluginId: string): Promise<OAuthStatusResult> {
  return ipcInvoke<OAuthStatusResult>('oauth:status', pluginId)
}

export function oauthDisconnect(pluginId: string): Promise<void> {
  return ipcInvoke<void>('oauth:disconnect', pluginId)
}
