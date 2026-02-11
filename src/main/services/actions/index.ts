import { executeShell } from './shell-executor'
import { executeHttp } from './http-executor'
import { executeFileRead } from './file-executor'

export interface ActionResult {
  success: boolean
  output: unknown
}

type ActionExecutor = (config: Record<string, unknown>) => Promise<ActionResult>

const registry: Record<string, ActionExecutor> = {
  'shell.exec': (config) => executeShell({
    command: config.command as string,
    workingDirectory: config.workingDirectory as string | undefined,
    timeout: config.timeout as number | undefined,
  }),
  'http.request': (config) => executeHttp({
    method: (config.method as string ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: config.url as string,
    headers: config.headers as Record<string, string> | undefined,
    body: config.body as string | undefined,
    timeout: config.timeout as number | undefined,
  }),
  'file.read': (config) => executeFileRead({
    path: config.path as string,
    encoding: config.encoding as BufferEncoding | undefined,
  }),
}

export function executeAction(type: string, config: Record<string, unknown>): Promise<ActionResult> {
  const executor = registry[type]
  if (!executor) {
    return Promise.resolve({
      success: false,
      output: { error: `Unknown action type: ${type}` },
    })
  }
  return executor(config)
}

export function getRegisteredActions(): string[] {
  return Object.keys(registry)
}
