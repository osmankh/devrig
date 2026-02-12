import type { ActionResult } from './index'
import type { PluginManager } from '../../plugins/plugin-manager'

let _pluginManager: PluginManager | null = null

/** Set the PluginManager instance. Call once during app init. */
export function setPluginManager(pm: PluginManager): void {
  _pluginManager = pm
}

export interface PluginActionConfig {
  pluginId: string
  actionId: string
  params?: Record<string, unknown>
}

export async function executePluginAction(config: Record<string, unknown>): Promise<ActionResult> {
  if (!_pluginManager) {
    return { success: false, output: { error: 'Plugin manager not initialized' } }
  }

  const pluginId = config.pluginId as string
  const actionId = config.actionId as string
  const params = config.params as Record<string, unknown> | undefined

  if (!pluginId || !actionId) {
    return { success: false, output: { error: 'Missing pluginId or actionId' } }
  }

  try {
    const result = await _pluginManager.callAction(
      pluginId,
      actionId,
      params ? [params] : undefined,
    )
    return { success: true, output: result }
  } catch (error) {
    return {
      success: false,
      output: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}
