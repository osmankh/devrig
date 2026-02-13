import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { OAuthOrchestrator } from '../auth/oauth-orchestrator'

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerOAuthHandlers(orchestrator: OAuthOrchestrator): void {
  secureHandle('oauth:supports', (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    return ok(orchestrator.supportsOAuth(parsed.data))
  })

  secureHandle('oauth:start', async (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    try {
      const result = await orchestrator.startFlow(parsed.data)
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'OAuth flow failed', 'OAUTH_FAILED')
    }
  })

  secureHandle('oauth:poll', async (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    try {
      const result = await orchestrator.pollDeviceFlow(parsed.data)
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Poll failed', 'POLL_FAILED')
    }
  })

  secureHandle('oauth:status', (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    return ok(orchestrator.getStatus(parsed.data))
  })

  secureHandle('oauth:disconnect', async (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    try {
      await orchestrator.disconnect(parsed.data)
      return ok(true)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Disconnect failed', 'DISCONNECT_FAILED')
    }
  })

  secureHandle('oauth:refresh', async (_e, pluginId: unknown) => {
    const parsed = z.string().safeParse(pluginId)
    if (!parsed.success) return err('Invalid plugin id', 'VALIDATION')
    try {
      const result = await orchestrator.refreshToken(parsed.data)
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Refresh failed', 'REFRESH_FAILED')
    }
  })
}
